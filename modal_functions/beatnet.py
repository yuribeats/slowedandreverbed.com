"""
Driftwave downbeat + BPM + key detector — Modal serverless endpoint.

Uses allin1 (Kim & Won, ISMIR 2023) — transformer trained on Demucs-separated
features for joint beat, downbeat, BPM, key, and chord analysis.

Downbeat F1 ~0.76 on GTZAN vs ~0.64 for madmom BK4 (2016).
Single inference pass replaces both beat detection and key/BPM lookup.

GitHub: https://github.com/mir-aidj/all-in-one

Deploy:
  pip install modal
  modal setup
  modal deploy modal_functions/beatnet.py

Add returned URL to Vercel as MODAL_DOWNBEAT_URL.
"""

import modal

app = modal.App("driftwave-downbeat")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install("allin1", "requests")
)


@app.function(image=image, timeout=180, memory=8192, gpu="any")
@modal.web_endpoint(method="POST")
def detect_downbeat(item: dict) -> dict:
    """
    POST body: { "audio_url": "https://..." }
    Returns:
      {
        "first_downbeat_ms": int,        # milliseconds from start
        "downbeats_ms":      [int, ...], # all downbeat positions (first 50)
        "beats_ms":          [int, ...], # all beat positions (first 200)
        "bpm":               float,      # detected BPM
        "key":               str,        # e.g. "C major", "D# minor"
        "note_index":        int | None, # 0–11 (C=0 … B=11)
        "mode":              str | None, # "major" | "minor"
      }
    """
    import tempfile
    import os
    import requests as req_lib
    import allin1

    KEY_MAP = {
        "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3,
        "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8,
        "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11,
    }

    def parse_key(key_str: str):
        if not key_str:
            return None, None
        # allin1 returns e.g. "C major", "D# minor"
        parts = key_str.strip().split()
        if len(parts) < 2:
            return None, None
        note = parts[0]
        mode = "major" if parts[1].lower() == "major" else "minor"
        note_index = KEY_MAP.get(note)
        return note_index, mode

    audio_url = item.get("audio_url")
    if not audio_url:
        return {"error": "No audio_url provided"}

    try:
        r = req_lib.get(audio_url, timeout=60)
        r.raise_for_status()
    except Exception as e:
        return {"error": f"Download failed: {e}"}

    url_lower = audio_url.lower()
    suffix = ".wav" if ".wav" in url_lower else ".flac" if ".flac" in url_lower else ".mp3"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(r.content)
        tmp = f.name

    try:
        # allin1.analyze returns a AnalysisResult with:
        #   .beats          list[float]  — beat positions in seconds
        #   .downbeats      list[float]  — downbeat positions in seconds
        #   .bpm            float        — estimated BPM
        #   .key            str          — e.g. "C major"
        #   .chords         list[str]    — chord labels per segment
        #   .segments       list[Segment]
        result = allin1.analyze(tmp)

        downbeats = [float(t) for t in (result.downbeats or [])]
        beats = [float(t) for t in (result.beats or [])]
        bpm = float(result.bpm) if result.bpm else None
        key_str = result.key or ""
        note_index, mode = parse_key(key_str)

        return {
            "first_downbeat_ms": round(downbeats[0] * 1000) if downbeats else None,
            "downbeats_ms": [round(t * 1000) for t in downbeats[:50]],
            "beats_ms": [round(t * 1000) for t in beats[:200]],
            "bpm": round(bpm, 2) if bpm else None,
            "key": key_str,
            "note_index": note_index,
            "mode": mode,
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        os.unlink(tmp)
