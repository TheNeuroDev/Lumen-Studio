# AGENTS.md: guide for AI assistants working with Lumen Studio

Audience: any AI assistant (a local model inside Lumen Code / OpenCode, Lumen Chat, Claude Code, Copilot, etc.) that is reading this repo to explain, support, set up or change Lumen.

Markers:
- **[UNKNOWN]** = this guide can't know it (it depends on the user's setup). Ask or check; don't guess.
- **[STOP]** = don't do this, and don't tell the user to do it, without their explicit OK in this conversation.

---

## 0. Personalized help: look in the user's local `Lumen` folder

This repo is a **public template**. It contains no personal values: every hostname, IP, username, path, password and model choice that is specific to one person is a placeholder (`YOUR-...`) or lives in a gitignored file.

**If the user needs help with their own, personalized implementation** (their hostnames, hardware, paths, which models they run, their deploy setup, their notes), **reference the `Lumen` folder on the user's local machine.** Usually that's `C:\Lumen` on the desktop (with `C:\AI` as a junction to `C:\Lumen\Engine`), or a mirrored copy on their laptop. Ask the user where it is if you can't tell. Look there for:
- `Engine\config\lumen.json`, `paths.json`, `chat-model.json`, `code-model.json`, `electricity.json` (their real settings)
- `lumen.config.json` next to their copy of this repo (laptop settings)
- any notes, support guide or `AGENTS.md` of their own in that folder (these win over this file where they differ)
- `Engine\logs\` for what actually happened

Rules for that folder:
- Read only what the task needs. If you're fenced to a project folder (Lumen Code), you **can't** read it: give the user short read-only commands to run and paste back instead (section 12).
- Never copy anything from it into this repo, a commit, an issue, a chat log or any public place.
- Never open, print or move anything under `secrets\`.

## 1. Your role and limits

1. Be a **support assistant first**. Explain, diagnose, suggest. The user decides and runs things.
2. **The fence.** In Lumen Code you may only read and write inside the current project folder. Don't try to get around it, and don't suggest loosening it.
3. **Secrets.** Never ask for a password, token or key; never print, guess, store or send one. Never say a secret's value. Point to `docs/SECRETS.md` and let the user act.
4. **No GUIs.** Don't run `start`, `explorer`, `Invoke-Item` or open browsers on the desktop. Nobody may be looking at its screen. Use Lumen's Artifacts / Preview tabs.
5. Shell commands always ask first. Keep them few and say why.
6. For big or risky changes (gateway code, Windows/network changes, anything in section 13), say so and suggest a careful, reviewed change with a backup.
7. For model or software recommendations, **search the web first**. Your training data is older than the user's setup.

## 2. Defaults this project was built around

- **Privacy first.** Everything runs locally. No cloud services for content, no telemetry. Lumen data never goes in OneDrive or other synced cloud folders.
- **Unrestricted open-weight models** with permissive licenses, where there's a choice. Say so when an option trades this off.
- **Recommend-only checks.** Reports never install, update or delete on their own.
- **Reversible changes.** Back up first; say how to roll back.
- **Confirm first** before anything destructive, permanent or outward-facing.
- **Plain, short answers.** Lead with the answer or next step, one action at a time.
- Page design bar: polished, professional, dark, great on a phone.

The user's own preferences (in their `Lumen` folder or the conversation) override these.

## 3. What Lumen is

A self-hosted AI studio. Prompts come from a laptop or phone; one **desktop PC ("Data Center")** does all compute and storage; results are viewed over a private **Tailscale** network (tailnet).

Modes (left rail; bottom tab bar on phones):
- **Studio**: Image, Edit, Video (experimental placeholder), Voice, Music, plus an archive.
- **Chat**: private chat with the local LLM (history on the desktop, Think toggle, image attach, "To Studio").
- **Code**: OpenCode embedded in the page, one folder per project.

Page address: `https://<publicHost>/` (from `C:\AI\config\lumen.json`). **[UNKNOWN]** the user's actual name.

## 4. Network

- Tailscale is the only way in. Nothing is port-forwarded.
- `tailscale serve` on the desktop:
  - `https://<publicHost>/` (443) → `127.0.0.1:1240` (gateway)
  - `https://<publicHost>:8443/` → `127.0.0.1:4097` (Code sign-in gate) → `127.0.0.1:4096` (OpenCode)
- Laptop → desktop uses Windows OpenSSH (`C:\Windows\System32\OpenSSH\ssh.exe`); the remote shell is Windows PowerShell 5.1. The SSH target is in the user's `lumen.config.json` (`desktopSsh`). Don't ask for it or store it elsewhere.
- VPN apps on a client must exclude Tailscale (`100.64.0.0/10`) via split tunneling, or traffic falls back to slow relays.
- Breaking Tailscale or SSH on a remote desktop can lock everyone out until someone is physically there: anything touching Tailscale, SSH, firewall, network adapters, power/sleep or boot is **[STOP]**.

## 5. Folder layout on the desktop

| Path | What |
|---|---|
| `C:\Lumen\Engine\` | Engine: gateway, scripts, models, venvs, config, logs, energy ledger, deploy backups. |
| `C:\AI` | Junction to `C:\Lumen\Engine`. Scripts use `C:\AI\...` paths. **Never delete it** (a recursive delete of a junction can delete the real Engine). |
| `C:\Lumen\Studio\` | Generated media: `<yyyy-MM>\`, `.thumbs\`, `gallery.jsonl`, deletes go to `.trash\`. |
| `C:\Lumen\Chats\` | Chat history (`c_*.json`), `.trash\`. |
| `C:\Lumen\Code\<project>\` | One folder per Lumen Code project. |
| `C:\AI\config\` | `lumen.json`, `paths.json`, `chat-model.json`, `code-model.json`, `electricity.json`. |
| `C:\AI\secrets\` | Logins. Off limits (section 1). |
| `C:\AI\logs\` | `gateway.log`, `llama-server.log`, `sd-server.log`, `voice-server.log`, `music-server.log`, `opencode.log`, `code-gate.log`, `llm-state.json`. |
| `C:\AI\models\`, `C:\AI\image-models\` | Model files. |
| `C:\AI\archive\deploy-<stamp>\` | Live files saved before each deploy (rollback source). |
| `C:\AI\code-home\` | Empty on purpose: OpenCode starts here so a session without a project sees nothing. |
| `%USERPROFILE%\.config\opencode\` | OpenCode config + global AGENTS.md. **Rewritten by `mode.ps1 code`**: change `mode.ps1`, not these files. |

Data folders can be moved with `C:\AI\config\paths.json` (see `desktop\config\paths.example.json`).

## 6. Services and ports (all loopback)

| Thing | How it runs | Port |
|---|---|---|
| Gateway (`C:\AI\gateway.ps1`, PowerShell 5.1 HttpListener) | Scheduled task "Lumen Gateway", at boot | 1240 |
| sd-server (stable-diffusion.cpp) | `mode.ps1 image` | 1234 |
| llama-server (llama.cpp) | `mode.ps1 llm` / `code` | 8099 |
| OpenCode web | `mode.ps1 code` | 4096 |
| Code sign-in gate (`tools\code-gate.js` on Bun) | `mode.ps1 code` / `gate` | 4097 |
| Voice (Chatterbox-Turbo) | `mode.ps1 voice` | 8002 |
| Music (ACE-Step 1.5) | `mode.ps1 music` | 8001 |

Avoid port 8080 (often taken by other vendors' services). Models don't start at boot; the page starts them on demand.

## 7. Engines and the one-GPU rule

One GPU engine at a time; switching stops the others. Chat and Code share one llama-server when their settings match.

| Page choice | Default model | Notes (on a 12 GB card) |
|---|---|---|
| Image fast (`turbo21`) | Qwen-Image 2.1 Turbo Q8_0, 8 steps | ~15 s |
| Image Standard (`real`) | Qwen-Image 2.1 Q8_0, 40 steps | ~70 s |
| Image Realistic (`max`, uses `real`) | Qwen-Image 2.1 at 2K, 50 steps | minutes |
| Edit | Qwen-Image 2.1 + Qwen3-VL vision projector | ~60-80 s |
| Upscale 4x | Real-ESRGAN x4plus | 15-30 s |
| Video (experimental) | Wan 2.2 TI2V 5B | placeholder quality |
| Voice | Chatterbox-Turbo (cloning) | ~45 s engine start |
| Music | ACE-Step 1.5 turbo + 0.6B LM, MP3 | ~1 min per 30 s |
| Chat / Code | Qwen3.6-35B-A3B uncensored Q4_K_M + mmproj, 128K ctx | ~35-45 tok/s |

- Model ids: Chat asks llama-server for `lumen-chat`, OpenCode for `lumen-code`.
- LLM settings: `C:\AI\config\chat-model.json` / `code-model.json` (see `desktop\llm-config.ps1` and `docs/INSTALL-MODELS.md`).
- Image profiles: `$Profiles` in `desktop\gateway.ps1`.
- Manual switch: `powershell -NoProfile -ExecutionPolicy Bypass -File C:\AI\mode.ps1 llm|code|image|voice|music|stop|gate` (prints one line starting `ok` or `error`). Prefer the page.
- **[UNKNOWN]** which models the user actually runs: check their config files.

## 8. Gateway API

Loopback only; the tailnet reaches it via `tailscale serve`. POSTs with a foreign or `null` Origin get 403 (only `publicHost`, `localhost`, `127.0.0.1` are allowed).

- `GET /gw/status`: engine, ready, profile, switching {engine, profile, stage, elapsed, error}, busy, tasks, chat_model, code_model, cost, installed.
- `POST /gw/use {engine, profile, force}`: switch the GPU. 409 `media-busy` if a job runs, unless `force`.
- Studio: `/gw/gallery`, `/gw/delete`, `/gw/upscale`, `/gw/voice/*`, `/gw/music`, `/gw/task/<id>`; `/sdcpp/*`, `/v1/*` → sd-server.
- Chat: `/gw/chats`, `/gw/chats/save`, `/gw/chats/delete`; `/llm/*` streams to llama-server (OpenAI- and Anthropic-style endpoints).
- Code: `/gw/code/projects|new|rename|tree|raw|zip|all|delete|upload|import|model|models|chats`.
- Cost: `/gw/energy`, `/gw/energy/details?range=`, `POST /gw/energy/rate`.

The full list is in the header comment of `desktop\gateway.ps1`.

## 9. The page

- `desktop\web\index.html` (markup), `app.css` (styles; fonts embedded by `scripts\inline-fonts.py`, so no Google requests), `app.js` (behaviour), `manifest.webmanifest`. Served no-cache: a deploy is live on the next load.
- Edit `app.js` / `app.css`, not inline tags.
- `#launch` lands on whatever the GPU runs, else Studio Image.

## 10. Lumen Code

- Page → `https://<publicHost>:8443/` → gate (4097) → OpenCode (4096) → llama-server (`lumen-code`).
- Projects: one folder each under the Code root. New = blank, upload (≤2 GB/file), or public GitHub import (zip). Rename moves OpenCode's sessions too. Several chats per project.
- Tabs: Workspace, Artifacts (file tree + zip download), Preview (sandboxed HTML/media/PDF/Markdown/text), Settings (multi-select download or **permanent** delete: warn first).
- Fence (`opencode.json`, written by `mode.ps1`): `external_directory: deny`, `bash: ask`, `edit: allow`, `webfetch: allow`.
- Sign-in: the page's own form; the gate checks `secrets\opencode-*.txt`, sets a 30-day HttpOnly cookie, and adds OpenCode's Basic auth itself. Change the login with `scripts\set-opencode-login.ps1`. Rollback of the gate (brings back the browser pop-up; ask first): `tailscale serve --bg --https=8443 http://127.0.0.1:4096`.

## 11. Cost tracker, launcher, deploy, tests

- **Cost**: GPU measured by `nvidia-smi` every 2 s + CPU estimated from load + rest-of-PC watts, divided by PSU efficiency (`desktop\gw\energy.ps1`). Rate in `C:\AI\config\electricity.json` (set from the page). Ledger stores Wh, so a new rate re-prices history. Rough accuracy ±15-20%.
- **Launcher** (`LumenLauncher.pyw`, laptop): connects Tailscale if off, opens `publicUrl/#launch` (from `lumen.config.json`) as a private app window in portable ungoogled-chromium (`app\engine\`, gitignored) or a Firefox fallback, wipes history/cache on close. No auto-update for the browser engine.
- **Deploy** (laptop): `scripts\deploy.ps1` (`-WebOnly` for the page). Refuses `.ps1` that doesn't parse, backs up live files to `C:\AI\archive\deploy-<stamp>\`, copies over SSH, restarts the gateway task if gateway files changed. `config\*.json` are not deployed.
- **After every deploy**: `tests\smoke.ps1` (read-only). Playwright tests in `tests\*.js` need `LUMEN_URL`.
- **PowerShell 5.1 gotchas** (gateway): return byte arrays as `, $bytes`; cast cmdlet results to plain types (`[bool](Test-Path ...)`) before `$Json.Serialize`; never read `$Switch` inside a `switch` block (use `$script:Switch`); processes started inside SSH die when it closes (use `Start-Detached` in `mode.ps1`).
- A broken `gateway.ps1` takes the whole site down. Test parsing before deploying.

## 12. Troubleshooting

Read-only checks to give the user (PowerShell on the desktop):

```powershell
Get-ScheduledTask 'Lumen Gateway' | Select-Object TaskName, State
Get-NetTCPConnection -State Listen -LocalPort 1240,1234,8099,4096,4097,8001,8002 -ErrorAction SilentlyContinue |
  Select-Object LocalPort, @{n='Process';e={(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName}}
Invoke-RestMethod http://127.0.0.1:1240/gw/status | ConvertTo-Json -Depth 4
& 'C:\Program Files\Tailscale\tailscale.exe' status
& 'C:\Program Files\Tailscale\tailscale.exe' serve status
nvidia-smi --query-gpu=memory.used,memory.total,power.draw,utilization.gpu --format=csv
Get-ChildItem C:\AI\logs -File | Sort-Object LastWriteTime -Descending | Select-Object -First 8 Name, LastWriteTime, Length
Get-Content C:\AI\logs\gateway.log -Tail 40
```

| Symptom | Likely cause | Check / do |
|---|---|---|
| Page won't load | Client's Tailscale off, VPN in the way, desktop offline, gateway down | Tailscale on; VPN split tunnel; `tailscale status`; then the checks above. Restart the gateway (below) only with OK. |
| Broke right after a deploy | Bad deploy | Roll back from the newest `C:\AI\archive\deploy-*` (below). |
| Page unstyled | Extension rewriting CSS, stale cache | Clean app window, hard refresh. |
| Stuck loading a mode | Engine slow/failed, VRAM held | `/gw/status` → `switching`; tail the engine log; `nvidia-smi`. `mode.ps1 stop`, then pick the mode again. |
| 409 `media-busy` | A Studio job is running | Wait, or force (the job is lost). |
| Task result missing after a restart | Gateway restart forgets running tasks | Re-run. |
| Code sign-in fails | Wrong login, gate down | Reset with `set-opencode-login.ps1`; `mode.ps1 gate`; `code-gate.log`. |
| Code workspace blank | GPU not in Code mode, OpenCode down | `/gw/status` engine = `code`; click Code again; `opencode.log`. |
| "Open from the tailnet address" | Opened via localhost | Use `https://<publicHost>/`; check `lumen.json`. |

Reversible fixes (still ask first):

```powershell
# Restart the gateway
Stop-ScheduledTask -TaskName 'Lumen Gateway'
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*gateway.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep 2; Start-ScheduledTask -TaskName 'Lumen Gateway'; Start-Sleep 4
[bool](Get-NetTCPConnection -LocalPort 1240 -State Listen -ErrorAction SilentlyContinue)

# Stop all GPU engines
powershell -NoProfile -ExecutionPolicy Bypass -File C:\AI\mode.ps1 stop

# Roll back the last deploy (confirm the folder first), then restart the gateway
$b = Get-ChildItem C:\AI\archive -Directory -Filter 'deploy-*' | Sort-Object Name -Descending | Select-Object -First 1
$b.FullName
Copy-Item "$($b.FullName)\*.ps1" C:\AI\ -Force; Copy-Item "$($b.FullName)\web\*" C:\AI\web\ -Force; Copy-Item "$($b.FullName)\gw\*" C:\AI\gw\ -Force
```

## 13. Do-not-touch (unless the user explicitly says so)

- `C:\Lumen\` and everything in it, and the `C:\AI` junction.
- `C:\AI\secrets\`, SSH folders, `C:\AI\code-home`, the OpenCode config folder.
- Tailscale and its `serve` config; OpenSSH Server; the "Lumen Gateway" task.
- Power settings that keep a remote desktop awake (sleep/hibernate off).
- GPU drivers, CUDA DLLs, the Python venvs for voice/music (absolute paths baked in).
- Model files (ACE-Step's unused-looking 1.7B LM included) and the newest deploy backups.
- Never move Lumen into OneDrive or any synced cloud folder.

## 14. Contributing to this template

- Keep it generic: no real hostnames, IPs, usernames, user paths, passwords, tokens, device names, locations or personal content. Use `YOUR-...` placeholders or read from `lumen.json` / `lumen.config.json`.
- New personal settings go in those config files plus their `*.example.json`, never hard-coded.
- Scan before every commit (see `docs/SECRETS.md`).

## 15. Glossary

- **Data Center**: the desktop PC that runs Lumen.
- **Engine**: `C:\Lumen\Engine` (= `C:\AI`), or one GPU program (image, voice, music, llm).
- **Gateway**: `gateway.ps1`, the web server that serves the page and controls the engines.
- **Mode**: which engine holds the GPU.
- **Profile**: which image model sd-server has loaded (`turbo21`, `real`, `video`, ...).
- **Fence**: Lumen Code's rule that a session only touches its own project folder.
- **Gate**: the sign-in proxy in front of OpenCode.
- **Tailnet**: the user's private Tailscale network.
- **publicHost**: the desktop's tailnet name, set in `C:\AI\config\lumen.json`.
