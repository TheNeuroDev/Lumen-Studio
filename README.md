# Lumen Studio

**Your Private, Self hosted AI Dashboard - Chat, Code, Image, Video, Music, and Voice**

You type on your laptop or phone. Your own desktop GPU does the work.
Everything stays on your machines: models, outputs, chats, logins.

Three modes in one dark, phone-friendly web page:

- **Studio**: images, image edits, upscales, (experimental) video, voice cloning, music.
- **Chat**: a private chat with your local LLM. History is saved on your desktop.
- **Code**: an AI coding workspace (OpenCode) with one folder per project, fenced so the model can only touch that folder.

This repo is a **template**. It holds the code only. You bring your own models, secrets, API keys and network names.

---

## How it fits together

```
 laptop / phone  ──(Tailscale, private)──►  desktop PC ("Data Center")
   browser or                                 gateway.ps1  :1240  (serves the page, switches engines)
   LumenLauncher.pyw                           ├─ sd-server   :1234  images / video  (stable-diffusion.cpp)
                                               ├─ llama-server:8099  chat + code LLM (llama.cpp)
                                               ├─ voice       :8002  Chatterbox-Turbo
                                               ├─ music       :8001  ACE-Step 1.5
                                               └─ OpenCode    :4096  behind the sign-in gate :4097
```

- One GPU engine runs at a time. The page switches them for you.
- The gateway only answers `127.0.0.1`. `tailscale serve` publishes it to your tailnet over HTTPS. Nothing is open to the internet.

## What you need

- **Desktop**: Windows 10/11, NVIDIA GPU, ~150 GB free disk for models.
- **Tailscale** on every device (free personal plan is fine), with MagicDNS and HTTPS certificates turned on.
- **OpenSSH Server** on the desktop (only for deploying from a laptop).
- Optional laptop: Windows + Python 3.11 for the launcher app.

## Setup (about an hour, mostly downloads)

> An AI assistant can do this for you: point it at [AGENTS.md](AGENTS.md) section 16, a step-by-step runbook with a check after each step.

Do these in order. Each step is one thing.

### 1. Desktop folders
1. Make `C:\Lumen\Engine`, then a link so the scripts' `C:\AI` paths work:
   `cmd /c mklink /J C:\AI C:\Lumen\Engine`
2. Copy this repo's `desktop\` contents into `C:\AI` (or use `scripts\deploy.ps1` from a laptop, step 6).
3. Copy `desktop\config\lumen.example.json` to `C:\AI\config\lumen.json` and set `publicHost` to your desktop's tailnet name.

### 2. Engines
Download the release builds into these folders:
- llama.cpp (CUDA build) → `C:\AI\llama.cpp\` (needs `llama-server.exe`)
- stable-diffusion.cpp (CUDA build) → `C:\AI\sd\` (needs `sd-server.exe`)

### 3. Models
Lumen ships no models and recommends none. Pick the ones that suit your hardware: see **[docs/INSTALL-MODELS.md](docs/INSTALL-MODELS.md)** (how to research, filter and wire them in). Then point `C:\AI\config\chat-model.json` / `code-model.json` at your chosen GGUF (copy the `*.example.json` files).
Optional: `C:\AI\tools\setup-audio.ps1` and `install-ffmpeg.ps1` install the voice and music engines. The `download-*.ps1` scripts are examples of how to script a download, not a model list to follow.

### 4. Secrets and logins
See **[docs/SECRETS.md](docs/SECRETS.md)**. Secrets live in `C:\AI\secrets\` on the desktop. They are never in this repo.

### 5. Start the gateway and publish it
1. Register a scheduled task **"Lumen Gateway"** that runs at startup:
   `powershell -NoProfile -ExecutionPolicy Bypass -File C:\AI\gateway.ps1`
2. Publish it to your tailnet: `tailscale serve --bg --https=443 http://127.0.0.1:1240`
3. Code workspace (optional): `powershell -ExecutionPolicy Bypass -File C:\AI\tools\setup-code.ps1`
4. Open `https://<your-desktop>.<your-tailnet>.ts.net/` from any device on your tailnet.

### 6. Laptop (optional)
1. Copy `lumen.config.example.json` to `lumen.config.json` and fill it in. (It's in `.gitignore`.)
2. Deploy changes: `powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1` (`-WebOnly` for page-only).
   It refuses PowerShell that doesn't parse and backs up the live files to `C:\AI\archive\deploy-<time>\` first.
3. Check it: `powershell -ExecutionPolicy Bypass -File tests\smoke.ps1`
4. App window: run `LumenLauncher.pyw` with pythonw. Put a portable ungoogled-chromium in `app\engine\` for a private app window (Firefox is the fallback).

Optional extras: `scripts\setup-syncthing.ps1` + `scripts\setup-mirror.ps1` (two-way mirror of `C:\Lumen` over Tailscale), `scripts\backup-datacenter.ps1` + `scripts\register-backup-task.ps1` (pull-only versioned backup to the laptop).

## Your personal setup stays local

Keep a **`Lumen` folder on your own machine** (for example `C:\Lumen` on the desktop, or a mirror on your laptop) for everything that's yours: config, secrets, models, outputs, chats, notes about your hardware and network.
Nothing in that folder belongs in git. `.gitignore` already blocks the usual suspects (`lumen.config.json`, `secrets/`, model files, media).

## Repo layout

| Path | What |
|---|---|
| `desktop/` | Everything that runs on the desktop. Mirrors `C:\AI`. |
| `desktop/gateway.ps1`, `desktop/gw/*.ps1` | The web server + API (PowerShell 5.1). |
| `desktop/mode.ps1`, `desktop/llm-config.ps1` | Engine switching and LLM settings. |
| `desktop/web/` | The page: `index.html`, `app.css`, `app.js`. |
| `desktop/tools/` | Setup and download scripts, Code sign-in gate. |
| `desktop/config/` | Model settings + `*.example.json` templates. |
| `scripts/` | Laptop-side: deploy, login change, mirror, backup, and `check-before-push.ps1` (run before every push). |
| `tests/` | Smoke test + Playwright end-to-end tests (`LUMEN_URL` must be set). |
| `LumenLauncher.pyw` | Laptop launcher (private app window). |
| `laptop/code/opencode.json` | Example OpenCode client config pointing at your desktop's model. |
| `AGENTS.md` | Guide for AI assistants working on or supporting Lumen. |

## Security notes

- The tailnet is the lock. Don't publish the gateway with `tailscale funnel` or port forwarding.
- POSTs from foreign web origins are refused (`publicHost` in `lumen.json` is the allowed one).
- Lumen Code's model can only touch its own project folder, and every shell command asks first.
- Never commit `lumen.config.json`, `C:\AI\config\lumen.json`, anything in `secrets\`, or model files.

## Models and licenses

You choose the models; this repo ships none. Each model has its own license (some are non-commercial or research-only). Check it before you use a model's output commercially.
