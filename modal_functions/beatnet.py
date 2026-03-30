"""
Driftwave downbeat detector — Modal serverless endpoint.

Uses beat_this (CPJKU, ISMIR 2024) for beat + downbeat detection.
Returns raw detection results only — no Everysong priors or key data.

Deploy:
  modal deploy modal_functions/beatnet.py
"""

import modal

app = modal.App("driftwave-downbeat")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install("numpy<2.0", "scipy")
    .pip_install("torch==2.2.2", "torchaudio==2.2.2", extra_options="--index-url https://download.pytorch.org/whl/cpu")
    .pip_install("https://github.com/CPJKU/beat_this/archive/main.zip", "requests", "fastapi[standard]")
)

model_volume = modal.Volume.from_name("beat-this-models", create_if_missing=True)


@app.function(image=image, timeout=180, memory=4096, min_containers=1, volumes={"/models": model_volume})
@modal.fastapi_endpoint(method="POST")
def detect_downbeat(item: dict) -> dict:
    """
    POST body:
      {
        "audio_url": "https://..."
      }

    Returns:
      {
        "first_downbeat_ms": 1234,
        "downbeats_ms": [...],
        "beats_ms": [...],
        "bpm": 108.123
      }
    """
    import os, tempfile
    import numpy as np
    import requests as req_lib
    from beat_this.inference import File2Beats

    audio_url = item.get("audio_url")
    if not audio_url:
        return {"error": "No audio_url provided"}

    x_run = item.get("x_run")
    download_headers = {"X-RUN": x_run} if x_run else {}

    try:
        r = req_lib.get(audio_url, headers=download_headers, timeout=60)
        r.raise_for_status()
    except Exception as e:
        return {"error": f"Download failed: {e}"}

    url_lower = audio_url.lower()
    suffix = ".wav" if ".wav" in url_lower else ".flac" if ".flac" in url_lower else ".mp3"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(r.content)
        tmp = f.name

    try:
        model = File2Beats(checkpoint_path="final0", device="cpu", float16=False, dbn=False)
        downbeats, beats = model(tmp)

        downbeat_times = downbeats.tolist()
        beat_times = beats.tolist()

        if len(beat_times) == 0:
            return {"error": "No beats detected"}

        first_downbeat_ms = round(downbeat_times[0] * 1000) if downbeat_times else round(beat_times[0] * 1000)

        if len(beat_times) >= 2:
            intervals = np.diff(beat_times)
            raw_bpm = 60.0 / float(np.median(intervals))
            # Fold into 60–180 BPM range to handle 2x/0.5x detection errors
            while raw_bpm > 180:
                raw_bpm /= 2
            while raw_bpm < 60:
                raw_bpm *= 2
            detected_bpm = round(raw_bpm, 3)
        else:
            detected_bpm = 0.0

        return {
            "first_downbeat_ms": first_downbeat_ms,
            "downbeats_ms":      [round(t * 1000) for t in downbeat_times[:50]],
            "beats_ms":          [round(t * 1000) for t in beat_times[:200]],
            "bpm":               detected_bpm,
        }

    except Exception as e:
        return {"error": str(e)}
    finally:
        os.unlink(tmp)
