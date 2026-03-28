"""
Driftwave downbeat detector — Modal serverless endpoint.

Uses beat_this (CPJKU, ISMIR 2024) for beat + downbeat detection.
If a confirmed BPM is supplied (from Everysong), it is passed through
but beat_this runs its own detection independently.

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
        "audio_url":  "https://...",
        "bpm":        120.5,      # optional — confirmed BPM from Everysong
        "note_index": 7,          # optional — 0-11 (C=0…B=11)
        "mode":       "major"     # optional
      }
    """
    import os, tempfile
    import requests as req_lib
    from beat_this.inference import File2Beats

    NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    audio_url      = item.get("audio_url")
    confirmed_bpm  = item.get("bpm")
    confirmed_ni   = item.get("note_index")
    confirmed_mode = item.get("mode")

    if not audio_url:
        return {"error": "No audio_url provided"}

    # ── Download ────────────────────────────────────────────────────────────
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
        # ── Beat + downbeat detection ────────────────────────────────────────
        model = File2Beats(checkpoint_path="final0", device="cpu", float16=False, dbn=False)
        downbeats, beats = model(tmp)

        downbeat_times = downbeats.tolist()
        beat_times = beats.tolist()

        if len(beat_times) == 0:
            return {"error": "No beats detected"}

        first_downbeat_ms = round(downbeat_times[0] * 1000) if downbeat_times else round(beat_times[0] * 1000)

        # ── Derive BPM from beat intervals ──────────────────────────────────
        if confirmed_bpm and confirmed_bpm > 0:
            detected_bpm = float(confirmed_bpm)
        elif len(beat_times) >= 2:
            import numpy as np
            intervals = np.diff(beat_times)
            detected_bpm = round(60.0 / float(np.median(intervals)), 2)
        else:
            detected_bpm = 0.0

        # ── Key: use Everysong if provided ──────────────────────────────────
        if confirmed_ni is not None and confirmed_mode:
            key_str = f"{NOTE_NAMES[confirmed_ni]} {confirmed_mode}"
            note_index = confirmed_ni
            mode = confirmed_mode
        else:
            key_str = None
            note_index = None
            mode = None

        return {
            "first_downbeat_ms": first_downbeat_ms,
            "downbeats_ms":      [round(t * 1000) for t in downbeat_times[:50]],
            "beats_ms":          [round(t * 1000) for t in beat_times[:200]],
            "bpm":               detected_bpm,
            "key":               key_str,
            "note_index":        note_index,
            "mode":              mode,
        }

    except Exception as e:
        return {"error": str(e)}
    finally:
        os.unlink(tmp)
