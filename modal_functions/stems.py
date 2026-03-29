"""
Driftwave stem separator — Modal serverless endpoint.
Demucs htdemucs_ft on A10G GPU. Stems encoded to 192kbps MP3 and
uploaded directly to Pinata. Pinata credentials passed in request body.

Deploy: modal deploy modal_functions/stems.py
"""

import modal

app = modal.App("driftwave-stems")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install("numpy<2.0")
    .pip_install(
        "torch==2.2.2",
        "torchaudio==2.2.2",
        extra_options="--index-url https://download.pytorch.org/whl/cu118",
    )
    .pip_install("demucs", "requests", "fastapi[standard]")
    .run_commands(
        "TORCH_HOME=/root/.cache/torch python -c \""
        "from demucs.pretrained import get_model; get_model('htdemucs_ft')"
        "\""
    )
)


@app.function(
    image=image,
    timeout=300,
    memory=8192,
    gpu="a10g",
)
@modal.fastapi_endpoint(method="POST")
def separate_stems(item: dict) -> dict:
    import os
    import subprocess
    import tempfile
    from concurrent.futures import ThreadPoolExecutor, as_completed

    import requests as req_lib

    os.environ["TORCH_HOME"] = "/root/.cache/torch"

    audio_url  = item.get("audio_url")
    x_run      = item.get("x_run")
    pinata_jwt = item.get("pinata_jwt")
    pinata_gw  = item.get("pinata_gateway", "")

    if not audio_url:
        return {"error": "No audio_url provided"}
    if not pinata_jwt or not pinata_gw:
        return {"error": "Missing Pinata credentials"}

    if not pinata_gw.startswith("http"):
        pinata_gw = f"https://{pinata_gw}"

    # ── Download audio ───────────────────────────────────────────────────────
    dl_headers = {"X-RUN": x_run} if x_run else {}
    try:
        r = req_lib.get(audio_url, headers=dl_headers, timeout=60)
        r.raise_for_status()
    except Exception as e:
        return {"error": f"Download failed: {e}"}

    print(f"[stems] downloaded {len(r.content)} bytes")

    url_stem = audio_url.lower().split("?")[0]
    suffix = (
        ".wav"  if url_stem.endswith(".wav")  else
        ".flac" if url_stem.endswith(".flac") else
        ".mp3"
    )

    with tempfile.TemporaryDirectory() as tmp:
        in_path = os.path.join(tmp, f"input{suffix}")
        with open(in_path, "wb") as f:
            f.write(r.content)

        # ── Run Demucs ───────────────────────────────────────────────────────
        print("[stems] running demucs...")
        proc = subprocess.run(
            [
                "python", "-m", "demucs",
                "--name", "htdemucs_ft",
                "--device", "cuda",
                "-o", tmp,
                in_path,
            ],
            capture_output=True,
            text=True,
            timeout=240,
            env={**os.environ},
        )
        print(f"[stems] demucs exit={proc.returncode}")
        if proc.returncode != 0:
            return {"error": f"Demucs failed: {proc.stderr[-600:]}"}

        stem_dir = os.path.join(tmp, "htdemucs_ft", "input")
        if not os.path.isdir(stem_dir):
            return {"error": f"No demucs output dir. stderr: {proc.stderr[-300:]}"}

        print(f"[stems] stem_dir={stem_dir}, files={os.listdir(stem_dir)}")

        # ── Encode + upload all stems in parallel ─────────────────────────
        def process_stem(stem):
            wav = os.path.join(stem_dir, f"{stem}.wav")
            if not os.path.exists(wav):
                return stem, None, "wav not found"

            mp3 = os.path.join(tmp, f"{stem}.mp3")
            subprocess.run(
                ["ffmpeg", "-i", wav, "-b:a", "192k", "-y", mp3],
                capture_output=True,
                timeout=60,
            )
            upload_path = mp3 if os.path.exists(mp3) else wav
            mime = "audio/mpeg" if upload_path.endswith(".mp3") else "audio/wav"
            size = os.path.getsize(upload_path)
            print(f"[stems] uploading {stem} ({size} bytes) to Pinata...")

            with open(upload_path, "rb") as f:
                data = f.read()

            try:
                up = req_lib.post(
                    "https://api.pinata.cloud/pinning/pinFileToIPFS",
                    headers={"Authorization": f"Bearer {pinata_jwt}"},
                    files={"file": (f"{stem}.mp3", data, mime)},
                    timeout=120,
                )
                print(f"[stems] Pinata {stem}: HTTP {up.status_code} — {up.text[:300]}")
                up.raise_for_status()
                cid = up.json()["IpfsHash"]
                url = f"https://gateway.pinata.cloud/ipfs/{cid}"
                print(f"[stems] {stem} uploaded: {url}")
                return stem, url, None
            except Exception as e:
                print(f"[stems] {stem} upload failed: {e}")
                return stem, None, str(e)

        urls: dict = {}
        upload_errors: dict = {}

        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {executor.submit(process_stem, s): s for s in ["vocals", "drums", "bass", "other"]}
            for future in as_completed(futures):
                stem, url, error = future.result()
                urls[stem] = url
                if error:
                    upload_errors[stem] = error

        if upload_errors:
            print(f"[stems] upload_errors: {upload_errors}")
            if all(v is None for v in urls.values()):
                return {"error": f"All Pinata uploads failed: {upload_errors}"}

        return urls
