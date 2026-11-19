# Choosing and installing models

**Lumen ships no models and recommends none.** Which models you run is your decision, and the best ones change every month. This is a guide to *choosing and wiring in* models for your own hardware. It names no preferred model on purpose.

If you are an AI assistant: do **not** steer the user toward a particular model, and do **not** answer from memory. Research the current options (section 2), present a few with trade-offs, and let the user choose.

## 1. Slots: what Lumen needs, and how each is wired

| Slot | What the code expects | Swapping it |
|---|---|---|
| **Chat** and **Code** LLM | Any GGUF that [llama.cpp](https://github.com/ggml-org/llama.cpp) can run, served by `llama-server` | Edit `C:\AI\config\chat-model.json` / `code-model.json` (section 3). No code change. |
| **Image, Edit, Upscale, Video** | Any model [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) supports, served by `sd-server` | Describe it in `C:\AI\config\models.json` (section 3). No gateway or page code change. |
| **Voice** and **Music** | Lumen integrates a specific voice engine (`desktop\audio\voice_server.py`) and music engine (`setup-audio.ps1`, `mode.ps1`) | Swapping the *engine* needs code changes; section 3 lists the HTTP contract to match and the files to touch. Swapping its *weights* may not. |

Only one engine holds the GPU at a time, so each slot only has to fit in VRAM on its own.

## 2. How to research models (for you or your AI)

1. **Ask the user** (hardware first): GPU model and VRAM (`nvidia-smi`), system RAM, free disk. Then what they care about: quality vs speed, license terms (commercial use?), content policy (filtered or unfiltered), languages, context length.
2. **Search the web for the current options, per slot.** Read recent sources: model cards, release notes, community benchmarks, the runtime's own supported-model list. Note each source's date. Anything older than a few months is probably not the best available.
3. **Filter hard:**
   - **Runtime support.** The LLM must run in llama.cpp (GGUF). Image/video models must be on stable-diffusion.cpp's supported list. A great model with no support in these runtimes is not usable here.
   - **Fit.** Weights at the chosen quantization, plus context/KV cache, plus text encoder and VAE (image models), must fit in VRAM, or offload to RAM at acceptable speed. Mixture-of-experts LLMs can keep some experts on the CPU (`cpu_moe`).
   - **License.** Read it. Some are research or non-commercial only.
   - **Maintenance and trust.** Prefer official or well-known quantizers. Check the repo's activity and recent community reports.
4. **Present 2-3 candidates per slot** with size, expected speed on this hardware, license and trade-offs. Say what you could not verify. Let the user pick.
5. **Download from the model's official or trusted repository.** Check the file size against the listing before and after. Never run a download script you haven't read.
6. **Wire it in** (section 3), **test** it (Lumen's page, then `tests\smoke.ps1`), and record the choice in the user's *local* notes, not in this repo.
7. Re-check periodically: the field moves fast.

## 3. Wiring a model in

### Chat / Code LLM
Copy `desktop\config\chat-model.example.json` to `C:\AI\config\chat-model.json` (and `code-model.example.json` to `code-model.json`) and set at least `gguf`:

```json
{
  "name": "My chat model",
  "gguf": "C:\\AI\\models\\YOUR-MODEL.gguf",
  "mmproj": "",
  "ctx": 32768,
  "cpu_moe": 0,
  "kv_type": "q8_0",
  "extra_args": "",
  "server": "C:\\AI\\llama.cpp\\llama-server.exe"
}
```
- `mmproj`: the vision projector, if the model has one and you want image input.
- `ctx`, `cpu_moe`, `kv_type`: tune to your VRAM. Less VRAM: lower `ctx`, raise `cpu_moe` (MoE models), or pick a smaller quantization.
- `extra_args`: any extra `llama-server` flags the model's card recommends.
- If Chat and Code have identical settings they share one llama-server, so switching is instant.
- **Without these files the code falls back to a placeholder path that won't exist on your machine, and the LLM will fail to start.** Create them before first use.

### Image / video
Put the files under `C:\AI\image-models\` in sd-server's layout: `diffusion_models\`, `text_encoders\`, `vae\`, `upscale_models\`. Then copy `desktop\config\models.example.json` to `C:\AI\config\models.json` and describe them: each entry under `profiles` has a `label`, an sd-server `recipe` name and the component file paths relative to `C:\AI\image-models` (use the recipe and files the model's stable-diffusion.cpp docs give). `preload` names the model sd-server loads at start; without it, image mode will not start. Profile keys are yours to choose, except that a profile named `video` is used for video and one named `edit` for image edits. The page builds its image picker from your profiles. To control it (button labels and notes, step ranges, sampler settings such as guidance, size, which profile edits use), add an optional `ui` block; `models.example.json` explains each field. Setting up a new model family usually means reading its stable-diffusion.cpp recipe for the right `recipe`, files and sampler settings.

### Voice and music: swapping weights vs swapping the engine

These two slots are the part of Lumen that is **code-defined, not config-defined.** `desktop\audio\voice_server.py` is a small server around one voice engine, and the music engine is installed by `desktop\tools\setup-audio.ps1` and driven by the music task in `desktop\gateway.ps1`. The names the page shows can be changed under `ui.engines` in `models.json`, but the engine itself needs a code change. `install-ffmpeg.ps1` is needed for MP3 output.

**Swapping weights inside the same engine** (a different checkpoint of the engine already installed) usually needs no Lumen change. Follow that engine's own docs, and copy/edit `prefetch-music-models.ps1` if you want it downloaded the same way.

**Swapping the engine itself.** Research current options first (section 2; do not default to one). Then the cleanest route is to leave the gateway and page alone and make the new engine **speak the same small HTTP contract** the old one does, on the same loopback port. Then change only the install and start steps. The gateway handles tasks, progress, saving and the gallery.

*Voice contract* (a server on `127.0.0.1:8002`; `voice_server.py` is the reference implementation):

| Route | Gateway sends | Server answers |
|---|---|---|
| `GET /health` | | `200` once the model is loaded |
| `GET /voices` | | `{"voices":[{"name","seconds"}]}`, the saved voice samples |
| `POST /voices` | `{"name","wav"}` (base64 WAV, 5-20 s) | `{"ok":true,"name","seconds"}` |
| `POST /voices/delete` | `{"name"}` | `{"ok":true}` |
| `POST /tts` | `{"text","voice","temperature"}` (`voice` empty = built-in voice) | `{"wav": <base64 WAV>, "sr","seconds","ms"}`, or `{"error"}` with a 4xx |

*Music contract* (a server on `127.0.0.1:8001`; the gateway's music task in `gateway.ps1` talks to ACE-Step's REST API this way):

| Route | Gateway sends | Server answers |
|---|---|---|
| `GET /health` | | any status below 500 means "up" |
| `POST /release_task` | `{"prompt","lyrics","duration",...}` plus optional `bpm`, `key_scale`, `time_signature` | `{"data":{"task_id"}}` |
| `POST /query_result` | `{"task_id_list":[id]}` | `{"data":[{"status": 0 working, 1 done, 2 failed, "progress_text","result"}]}`; on done, `result` lists items whose `file` is a URL path |
| `GET <that file path>` | | the audio bytes (the gateway saves them, as MP3 when ffmpeg is present) |
| `POST /v1/create_sample` | `{"query","instrumental","vocal_language"}` | the engine's own lyric/caption helper (used by "auto lyrics"; skip it if your engine has none) |

Music is more tightly tied to its engine than voice is (lyric writing, tempo and key fields). Expect to adapt the music task stages (`starting`, `composing`, `downloading` in `gateway.ps1`) rather than only wrap a server.

**Files to touch when you swap an engine:**

1. `desktop\tools\setup-audio.ps1`: create the new engine's environment and download its weights.
2. `desktop\audio\voice_server.py` (voice) or your own adapter server (music): serve the contract above.
3. `desktop\mode.ps1`: the `'voice'` / `'music'` start blocks (`$VoiceDir`, `$VoicePy`, `$VoicePort`, `$AceDir`, `$AcePort`, and the `Start-Detached` line). Keep the port, or change it here and in `$Voice` / `$Music` in `gateway.ps1`.
4. `desktop\gateway.ps1`: only if the contract differs. The readiness check (`Engine-Ready`) and the task code are the places.
5. `models.json`, `ui.engines`: the names the page displays.

**Check it:** run `tests\smoke.ps1`, switch to Voice or Music in the page and make one clip, and read `C:\AI\logs\voice-server.log` / `music-server.log` if it does not come up. The engine must free the GPU when `mode.ps1` stops it, because only one engine holds the GPU at a time. Record your choice in your own local notes (`MY-LUMEN.md`), not in this repo.

## 4. Where files go

| Folder | What goes there |
|---|---|
| `C:\AI\models\` | LLM GGUFs and vision projectors |
| `C:\AI\image-models\diffusion_models\`, `text_encoders\`, `vae\`, `upscale_models\` | Image and video components |
| `C:\AI\audio\...` | Voice and music engines and weights (created by `setup-audio.ps1`) |

If you use the example download scripts, a finished file gets a `<file>.done` marker so reruns skip it.

## 5. Example scripts and the author's picks (history, not advice)

`desktop\tools\download-chat-model.ps1`, `download-models.ps1` and `prefetch-music-models.ps1` are **examples**. They download the models the original author chose for one 12 GB GPU in late 2026. Read them to see how downloads are scripted (resume, slow-connection retry, `.done` markers), then copy and edit them with the list *you* chose. They are not kept up to date.

For the record, that setup used a Qwen3.6-family mixture-of-experts LLM, Qwen-Image 2.1-family image models, Real-ESRGAN for upscaling, Wan 2.2 for experimental video, Chatterbox-Turbo for voice and ACE-Step 1.5 for music. That was one person's pick at one moment. Research again before copying any of it.

## 6. Hugging Face tokens

Most open models need no token. For a gated model, download it with your own token on the host PC (for example `huggingface-cli login`, which stores it in your user profile). Never put a token in a script in this repo.

## 7. Licenses

Check each model's license before you use its output. Some are non-commercial or research-only.
