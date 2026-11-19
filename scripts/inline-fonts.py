"""Self-host the page's fonts: fetch the Google Fonts CSS once (here, on the laptop), keep only the
latin / latin-ext faces, embed each woff2 as a data: URI, and write the @font-face block between
markers at the top of desktop/web/app.css. After this the page makes no requests to Google.
    python scripts/inline-fonts.py
"""
import base64, os, re, urllib.request

FAMILIES = ("family=Inter+Tight:wght@400;500;600;700&family=Instrument+Serif:ital@0;1"
            "&family=JetBrains+Mono:wght@400;500&display=swap")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
CSS = os.path.join(os.path.dirname(__file__), "..", "desktop", "web", "app.css")
START, END = "/* fonts:start (scripts/inline-fonts.py) */", "/* fonts:end */"
KEEP = ("latin", "latin-ext")


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
        return r.read()


src = get("https://fonts.googleapis.com/css2?" + FAMILIES).decode()
blocks = re.findall(r"/\* ([\w-]+) \*/\s*(@font-face\s*{[^}]*})", src)
# Variable fonts come back as one file repeated per weight: merge those into one face with a weight range.
faces = {}
for subset, face in blocks:
    if subset not in KEEP:
        continue
    url = re.search(r"url\((https://[^)]+)\)", face).group(1)
    weight = int(re.search(r"font-weight:\s*(\d+)", face).group(1))
    key = (url, re.search(r"font-style:\s*(\w+)", face).group(1))
    if key in faces:
        faces[key][2].append(weight)
    else:
        faces[key] = [subset, face, [weight]]
out = []
for (url, _), (subset, face, weights) in faces.items():
    data = base64.b64encode(get(url)).decode()
    wr = f"{min(weights)} {max(weights)}" if len(weights) > 1 else str(weights[0])
    face = re.sub(r"font-weight:\s*\d+", "font-weight: " + wr, face)
    out.append(f"/* {subset} */ " + face.replace(url, "data:font/woff2;base64," + data).replace("\n", " "))
block = START + "\n" + "\n".join(out) + "\n" + END + "\n"

with open(CSS, encoding="utf-8") as f:
    css = f.read()
css = re.sub(re.escape(START) + r".*?" + re.escape(END) + r"\n", "", css, flags=re.S)
with open(CSS, "w", encoding="utf-8", newline="") as f:
    f.write(block + css)
print(f"{len(out)} faces embedded, app.css now {len(block + css) // 1024} KB")
