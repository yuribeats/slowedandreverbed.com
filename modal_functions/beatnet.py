"""
Driftwave downbeat detector — Modal serverless endpoint.

Uses madmom DBNDownBeatTrackingProcessor (RNN + DBN, MIREX 2016 winner BK4).
F1: 0.908 on Ballroom, 0.97 on HJDB, 0.865 on Beatles.

Deploy:
  pip install modal
  modal setup
  modal deploy modal_functions/beatnet.py

Then add the returned URL as MODAL_DOWNBEAT_URL in Vercel env vars.
"""

import modal

app = modal.App("driftwave-downbeat")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install("madmom==0.16.1", "requests", "numpy")
)


@app.function(image=image, timeout=120, memory=2048)
@modal.web_endpoint(method="POST")
def detect_downbeat(item: dict) -> dict:
    """
    POST body: { "audio_url": "https://..." }
    Returns:
      {
        "first_downbeat_ms": int,        # milliseconds from start
        "downbeats_ms": [int, ...],      # first 50 downbeat positions
        "beats_ms": [int, ...],          # first 200 beat positions
        "beats_per_bar": int,            # detected time signature
      }
    """
    import tempfile
    import os
    import requests as req_lib

    audio_url = item.get("audio_url")
    if not audio_url:
        return {"error": "No audio_url provided"}

    try:
        r = req_lib.get(audio_url, timeout=60)
        r.raise_for_status()
    except Exception as e:
        return {"error": f"Download failed: {e}"}

    # Determine suffix from URL
    url_lower = audio_url.lower()
    if ".wav" in url_lower:
        suffix = ".wav"
    elif ".flac" in url_lower:
        suffix = ".flac"
    else:
        suffix = ".mp3"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(r.content)
        tmp = f.name

    try:
        from madmom.features.downbeats import RNNDownBeatProcessor, DBNDownBeatTrackingProcessor

        # RNNDownBeatProcessor: CRNN that outputs beat + downbeat activation frames at 100 fps
        # DBNDownBeatTrackingProcessor: DBN (Dynamic Bayesian Network) temporal decoding
        # beats_per_bar=[3, 4] handles both 3/4 and 4/4 time signatures
        proc = RNNDownBeatProcessor()
        dbn = DBNDownBeatTrackingProcessor(beats_per_bar=[3, 4], fps=100)

        acts = proc(tmp)
        beats = dbn(acts)
        # beats: numpy array of [time_seconds, beat_number]
        # beat_number == 1 means downbeat (beat 1 of bar)

        all_beats = [(float(b[0]), int(b[1])) for b in beats]
        downbeat_times = [b[0] for b in all_beats if b[1] == 1]
        beat_times = [b[0] for b in all_beats]

        # Infer beats per bar from the most common max beat number per bar
        beat_numbers = [b[1] for b in all_beats]
        detected_bpb = max(beat_numbers) if beat_numbers else 4

        return {
            "first_downbeat_ms": round(downbeat_times[0] * 1000) if downbeat_times else None,
            "downbeats_ms": [round(t * 1000) for t in downbeat_times[:50]],
            "beats_ms": [round(t * 1000) for t in beat_times[:200]],
            "beats_per_bar": detected_bpb,
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        os.unlink(tmp)
