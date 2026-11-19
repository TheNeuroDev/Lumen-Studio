# One-off (2026-11-15): convert archived FLAC songs to MP3 and point gallery.jsonl at the MP3s.
# Originals move to outputs\.trash. Run with any Python 3 on the desktop; needs C:\AI\tools\ffmpeg.
# Stop or restart the Lumen Gateway afterwards so it reloads gallery.jsonl.
import json, os, shutil, subprocess

OUT = r"C:\AI\outputs"
INDEX = os.path.join(OUT, "gallery.jsonl")
FFMPEG = r"C:\AI\tools\ffmpeg\bin\ffmpeg.exe"
TRASH = os.path.join(OUT, ".trash")
os.makedirs(TRASH, exist_ok=True)

lines = open(INDEX, encoding="utf-8").read().splitlines()
out, n = [], 0
for line in lines:
    if not line.strip():
        continue
    e = json.loads(line)
    f = e.get("file", "")
    if f.lower().endswith(".flac"):
        src = os.path.join(OUT, f.replace("/", os.sep))
        rel = f[:-5] + ".mp3"
        dst = os.path.join(OUT, rel.replace("/", os.sep))
        if os.path.exists(src):
            subprocess.run([FFMPEG, "-v", "error", "-y", "-i", src, "-codec:a", "libmp3lame", "-q:a", "2", dst], check=True)
            shutil.move(src, os.path.join(TRASH, os.path.basename(src)))
            e.update(file=rel, mime="audio/mpeg", format="mp3", bytes=os.path.getsize(dst))
            n += 1
            print("converted", f, "->", rel, e["bytes"], "bytes")
    out.append(json.dumps(e, ensure_ascii=False))
shutil.copy(INDEX, INDEX + ".bak-flac")
open(INDEX, "w", encoding="utf-8", newline="\r\n").write("\n".join(out) + "\n")
print(n, "songs converted")
