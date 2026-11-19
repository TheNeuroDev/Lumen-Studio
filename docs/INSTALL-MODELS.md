# Installing models

Models are **not** in this repo. They're big, they change often, and which ones you run is your choice.
All download scripts are re-runnable: finished files are skipped, partial files resume, and each finished file gets a `<file>.done` marker.

## Where files go (on the desktop)

| Folder | What goes there |
|---|---|
| `C:\AI\models\` | Chat / Code LLM (GGUF) + optional vision projector (mmproj) |
| `C:\AI\image-models\diffusion_models\` | Image and video diffusion models |
| `C:\AI\image-models\text_encoders\` | Text encoders (and the Edit vision projector) |
| `C:\AI\image-models\vae\` | VAEs |
| `C:\AI\image-models\upscale_models\` | Upscalers |
| `C:\AI\audio\ace-step\checkpoints\` | Music (ACE-Step 1.5) |
| `C:\AI\audio\voice\.venv\` | Voice (Chatterbox-Turbo, installed by `setup-audio.ps1`) |

## 1. Chat and Code LLM

```powershell
powershell -ExecutionPolicy Bypass -File C:\AI\tools\download-chat-model.ps1
```
Default: Qwen3.6-35B-A3B "uncensored Heretic" Q4_K_M (~22 GB) + vision projector. Tuned for 12 GB VRAM: 128K context, q8_0 KV cache, 24 MoE expert layers on the CPU.

**Use your own model:** create `C:\AI\config\chat-model.json` and/or `code-model.json`. Every field is optional:

```json
{
  "name": "My model",
  "gguf": "C:\\AI\\models\\my-model-Q4_K_M.gguf",
  "mmproj": "",
  "ctx": 32768,
  "cpu_moe": 0,
  "kv_type": "q8_0",
  "extra_args": "",
  "server": "C:\\AI\\llama.cpp\\llama-server.exe"
}
```
- Less VRAM? Lower `ctx`, raise `cpu_moe` (MoE models), or pick a smaller quant.
- The repo's `chat-model.json` / `code-model.json` only add MTP speculative decoding (`--spec-type draft-mtp`). Remove `extra_args` if your model has no MTP head.
- If Chat and Code use identical settings they share one llama-server, so switching is instant.

## 2. Image, edit, upscale, video

```powershell
powershell -ExecutionPolicy Bypass -File C:\AI\tools\download-models.ps1
```
Downloads Qwen-Image 2.1 (Standard / Realistic / Edit), Qwen-Image 2512, Real-ESRGAN x4plus and Wan 2.2 TI2V 5B with their encoders and VAEs. Progress: `C:\AI\logs\model-download.log`.

Not covered by the script (get them from Hugging Face yourself if you want those profiles; file names must match `$Profiles` in `desktop\gateway.ps1`):
- `turbo21` (the page's fast image mode): `diffusion_models\qwen-image-2.1-turbo-Q8_0.gguf`
- `turbo` (sd-server's preloaded model, see `mode.ps1`): `diffusion_models\z_image_turbo-Q8_0.gguf`, `text_encoders\Qwen3-4B-Instruct-2507-Q4_K_M.gguf`, `vae\ae.safetensors`

**Use your own image models:** add or edit a profile in `$Profiles` in `desktop\gateway.ps1` (an sd-server recipe + component file paths relative to `C:\AI\image-models`).

## 3. Voice and music (optional)

```powershell
powershell -ExecutionPolicy Bypass -File C:\AI\tools\setup-audio.ps1           # uv, Chatterbox-Turbo venv, ACE-Step 1.5
powershell -ExecutionPolicy Bypass -File C:\AI\tools\prefetch-music-models.ps1 # faster ACE-Step weights download
powershell -ExecutionPolicy Bypass -File C:\AI\tools\install-ffmpeg.ps1        # ACE-Step needs ffmpeg for MP3
```
Stop the music engine first (`C:\AI\mode.ps1 stop`) before prefetching. Keep ACE-Step's 1.7B LM on disk even if unused: its startup check re-downloads it when missing.

## Hugging Face tokens

The default models are public, so no token is needed. If you add a gated model, download it with your own token on the desktop (for example `huggingface-cli login`, which stores it in your user profile). Never put a token in a script in this repo.

## Licenses

Check each model's license. Some defaults are non-commercial (Qwen-Image 2.1 uses the Qwen Research License).
