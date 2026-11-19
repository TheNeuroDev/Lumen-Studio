# Changelog

One line per push, newest first. AI assistants: read this to see what changed since you last looked (see `AGENTS.md` section 18).

- 2026-11-19: `docs/INSTALL-MODELS.md` now documents how to swap the voice or music engine: the HTTP contracts the gateway expects and the files to change.
- 2026-11-19: Image profiles and the preloaded image model now come from `C:\AI\config\models.json` (`desktop\config\models.example.json`) instead of being hard-coded in `gateway.ps1` / `mode.ps1`. **Breaking for existing installs:** create `models.json` or image mode will not start. The page's image picker, labels, step ranges, sampler settings and sizes now come from the same file (optional `ui` block) via `/gw/ui.js`; the model names in the page are no longer hard-coded. Voice and music engines are still code-defined.
- 2026-11-19: README reworded around one PC (remote access optional); repo now lives at TheNeuroDev/Lumen-Studio.
- 2026-11-19: Added the personalization protocol to `AGENTS.md` section 0 (read template + the user's local configs + their goals) and `docs/MY-LUMEN.example.md`, a local notes template.
- 2026-11-19: Every file is now either working code or a guide: no "standard" or "default" models. `docs/INSTALL-MODELS.md` is a research-first guide; the LLM has no built-in model (create `chat-model.json` / `code-model.json` from the `*.example.json` files); download scripts are labelled examples. Added "How to push a change" and "Staying up to date" to `AGENTS.md`.
- 2026-11-19: `AGENTS.md` reframed around a single PC; remote access, a second machine and a dedicated data-center PC are optional extras.
- 2026-11-19: Added the fresh-install runbook (`AGENTS.md` section 16) and `scripts/check-before-push.ps1`.
- 2026-11-19: Initial public template.
