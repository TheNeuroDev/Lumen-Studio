"""Lumen voice server: Chatterbox-Turbo text-to-speech with optional voice cloning.

Runs on the desktop in C:\\AI\\audio\\voice\\.venv, listening on 127.0.0.1:8002 (the Lumen gateway
proxies to it). Started and stopped by C:\\AI\\mode.ps1 voice|stop.

  GET  /health                 {"ok": true, "sr": 24000, "device": "cuda"}
  GET  /voices                 {"voices": [{"name": ..., "seconds": ...}]}
  POST /voices                 {"name": str, "wav": base64 WAV}       save a reference voice (5-20 s)
  POST /voices/delete          {"name": str}
  POST /tts                    {"text": str, "voice": str|"", "temperature": float?}
                               -> {"wav": base64 WAV, "sr": int, "seconds": float, "ms": int}
"""
import base64
import io
import json
import os
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import soundfile as sf
import torch

HOST, PORT = "127.0.0.1", 8002
VOICES_DIR = r"C:\AI\audio\voices"
MAX_CHARS = 280            # Turbo is happiest with sentence-sized chunks
GAP_S = 0.12               # silence between chunks

os.makedirs(VOICES_DIR, exist_ok=True)
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"loading Chatterbox-Turbo on {DEVICE} ...", flush=True)
from chatterbox.tts_turbo import ChatterboxTurboTTS  # noqa: E402

MODEL = ChatterboxTurboTTS.from_pretrained(device=DEVICE)
SR = MODEL.sr
DEFAULT_CONDS = getattr(MODEL, "conds", None)  # the built-in voice; cloning replaces model.conds
LOCK = threading.Lock()
print(f"ready, sample rate {SR}", flush=True)


def safe_name(name):
    name = re.sub(r"[^A-Za-z0-9 _\-]", "", str(name)).strip()[:40]
    return name or None


def voice_path(name):
    n = safe_name(name)
    return os.path.join(VOICES_DIR, n + ".wav") if n else None


def chunks(text):
    """Split text into sentence-sized pieces, keeping [tags] attached."""
    text = re.sub(r"\s+", " ", text).strip()
    parts = re.split(r"(?<=[.!?…])\s+", text)
    out, cur = [], ""
    for p in parts:
        while len(p) > MAX_CHARS:  # very long sentence: break at a comma or space
            cut = max(p.rfind(", ", 0, MAX_CHARS), p.rfind(" ", 0, MAX_CHARS))
            cut = cut if cut > 40 else MAX_CHARS
            if cur:
                out.append(cur); cur = ""
            out.append(p[:cut + 1].strip()); p = p[cut + 1:].strip()
        if len(cur) + len(p) + 1 <= MAX_CHARS:
            cur = (cur + " " + p).strip()
        else:
            if cur:
                out.append(cur)
            cur = p
    if cur:
        out.append(cur)
    return [c for c in out if c]


def synthesize(text, voice, temperature):
    ref = voice_path(voice) if voice else None
    if ref and not os.path.exists(ref):
        raise ValueError(f"voice '{voice}' not found")
    kwargs = {}
    if ref:
        MODEL.prepare_conditionals(ref)          # clone once per request; reused for every chunk
    elif DEFAULT_CONDS is not None:
        MODEL.conds = DEFAULT_CONDS              # back to the built-in voice
    if temperature is not None:
        kwargs["temperature"] = float(temperature)
    pieces = []
    gap = np.zeros(int(SR * GAP_S), dtype=np.float32)
    for c in chunks(text):
        try:
            wav = MODEL.generate(c, **kwargs)
        except TypeError:  # signature without temperature
            kwargs.pop("temperature", None)
            wav = MODEL.generate(c, **kwargs)
        pieces.append(wav.squeeze().detach().float().cpu().numpy())
        pieces.append(gap)
    audio = np.concatenate(pieces) if pieces else np.zeros(1, dtype=np.float32)
    buf = io.BytesIO()
    sf.write(buf, audio, SR, format="WAV", subtype="PCM_16")
    return buf.getvalue(), len(audio) / SR


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stdout.write("%s %s\n" % (time.strftime("%H:%M:%S"), fmt % args))
        sys.stdout.flush()

    def send_json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        if self.path == "/health":
            return self.send_json(200, {"ok": True, "sr": SR, "device": DEVICE})
        if self.path == "/voices":
            out = []
            for f in sorted(os.listdir(VOICES_DIR)):
                if f.lower().endswith(".wav"):
                    try:
                        info = sf.info(os.path.join(VOICES_DIR, f))
                        out.append({"name": f[:-4], "seconds": round(info.duration, 1)})
                    except Exception:
                        pass
            return self.send_json(200, {"voices": out})
        self.send_json(404, {"error": "not found"})

    def do_POST(self):
        try:
            data = self.body()
        except Exception:
            return self.send_json(400, {"error": "invalid JSON"})
        try:
            if self.path == "/voices":
                path = voice_path(data.get("name"))
                if not path:
                    return self.send_json(400, {"error": "give the voice a name"})
                raw = base64.b64decode(str(data.get("wav", "")).split(",")[-1])
                audio, sr = sf.read(io.BytesIO(raw), dtype="float32", always_2d=True)
                audio = audio.mean(axis=1)
                secs = len(audio) / sr
                if secs < 3:
                    return self.send_json(400, {"error": "the sample is too short; use 5-20 seconds"})
                audio = audio[: int(sr * 30)]
                sf.write(path, audio, sr, subtype="PCM_16")
                return self.send_json(200, {"ok": True, "name": os.path.basename(path)[:-4], "seconds": round(min(secs, 30), 1)})
            if self.path == "/voices/delete":
                path = voice_path(data.get("name"))
                if path and os.path.exists(path):
                    os.remove(path)
                return self.send_json(200, {"ok": True})
            if self.path == "/tts":
                text = str(data.get("text", "")).strip()
                if not text:
                    return self.send_json(400, {"error": "nothing to say"})
                if len(text) > 6000:
                    return self.send_json(400, {"error": "keep it under 6000 characters"})
                t0 = time.time()
                with LOCK:
                    wav, secs = synthesize(text, data.get("voice") or "", data.get("temperature"))
                return self.send_json(200, {"wav": base64.b64encode(wav).decode("ascii"), "sr": SR,
                                            "seconds": round(secs, 2), "ms": int((time.time() - t0) * 1000)})
        except ValueError as e:
            return self.send_json(400, {"error": str(e)})
        except Exception as e:  # keep the server alive on model errors
            return self.send_json(500, {"error": f"{type(e).__name__}: {e}"})
        self.send_json(404, {"error": "not found"})


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
