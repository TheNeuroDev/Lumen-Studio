# Secrets, logins and personal values

**Rule:** nothing personal goes in git. This repo only ships placeholders (`YOUR-...`) and `*.example.json` files.

## Where each thing lives

| What | Where | Made by |
|---|---|---|
| Lumen Code (OpenCode) password | `C:\AI\secrets\opencode-password.txt` (desktop) | `setup-code.ps1` makes a random one |
| Lumen Code username (optional, default `opencode`) | `C:\AI\secrets\opencode-username.txt` | you, or `scripts\set-opencode-login.ps1` |
| Code sign-in sessions (hashes only) | `C:\AI\secrets\code-gate-sessions.txt` | the gate, automatically |
| Desktop tailnet name | `C:\AI\config\lumen.json` → `publicHost` | you (copy `desktop\config\lumen.example.json`) |
| Laptop settings: page URL, SSH target, laptop folder | `lumen.config.json` in the repo root (gitignored) | you (copy `lumen.config.example.json`) |
| SSH key (laptop → desktop) | your Windows user's `.ssh` + ssh-agent | `ssh-keygen`, then add the public key to the desktop's `authorized_keys` |
| Electricity rate (cost tracker) | `C:\AI\config\electricity.json` | the page (Cost panel) |
| Hugging Face / other API tokens | your user profile (for example `huggingface-cli login`) | you |

## Set up the Code login

1. On the desktop: `powershell -ExecutionPolicy Bypass -File C:\AI\tools\setup-code.ps1` (makes a random password).
2. To pick your own login from the laptop: `powershell -ExecutionPolicy Bypass -File scripts\set-opencode-login.ps1`.
   It asks for the username and password, sends them over SSH on stdin (never on a command line or in a laptop file), and restarts OpenCode.

## Lock down the secrets folder (recommended)

Only your Windows user should read it:
```powershell
icacls C:\AI\secrets /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" "SYSTEM:(OI)(CI)F"
```

## Before you push anything

Run a quick check from the repo root (Git Bash or WSL):
```bash
git grep -nIE "ts\.net|100\.[0-9]+\.[0-9]+\.[0-9]+|C:\\\\Users\\\\|password\s*[:=]|token|api[_-]?key" -- . ':!docs/SECRETS.md'
```
Anything that's not a placeholder or a variable name should not be committed. A tool like `gitleaks` or `trufflehog` is even better.

## For AI assistants

Never ask for, print, guess or store a password, token or key. Point the user to the files above and let them do it.
