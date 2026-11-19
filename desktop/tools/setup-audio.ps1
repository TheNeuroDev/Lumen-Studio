# One-time setup of the audio engines on the desktop. Re-runnable. Log: C:\AI\logs\audio-setup.log
#   uv (Python manager)  -> C:\AI\tools\uv\uv.exe
#   ACE-Step 1.5 (music) -> C:\AI\audio\ace-step   (its own .venv, REST API on 127.0.0.1:8001)
#   Chatterbox-Turbo     -> C:\AI\audio\voice\.venv (served by C:\AI\audio\voice_server.py on 127.0.0.1:8002)
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$Log = 'C:\AI\logs\audio-setup.log'
$UvDir = 'C:\AI\tools\uv'
$Uv = "$UvDir\uv.exe"
$Ace = 'C:\AI\audio\ace-step'
$VoiceVenv = 'C:\AI\audio\voice\.venv'
$env:UV_PYTHON_INSTALL_DIR = 'C:\AI\tools\python'   # keep everything under C:\AI
$env:UV_CACHE_DIR = 'C:\AI\tools\uv-cache'
$env:UV_LINK_MODE = 'copy'

function Log($m) { Add-Content -Path $Log -Value "$(Get-Date -Format 'HH:mm:ss') $m" }
function Run($exe, [string[]]$a, $cwd) {
    Log "> $exe $($a -join ' ')"
    $p = Start-Process -FilePath $exe -ArgumentList $a -WorkingDirectory $cwd -NoNewWindow -Wait -PassThru `
        -RedirectStandardOutput "$Log.out" -RedirectStandardError "$Log.err"
    Get-Content "$Log.out", "$Log.err" -ErrorAction SilentlyContinue | Select-Object -Last 15 | ForEach-Object { Log "  $_" }
    if ($p.ExitCode) { Log "  exit $($p.ExitCode)" }
    return $p.ExitCode
}
New-Item -ItemType Directory -Force -Path (Split-Path $Log), $UvDir, 'C:\AI\audio\voice', 'C:\AI\audio\voices' | Out-Null
Log '=== audio setup started ==='

# 1. uv
if (-not (Test-Path $Uv)) {
    Log 'downloading uv'
    $zip = "$env:TEMP\uv.zip"
    & curl.exe -L --fail -s -S -o $zip 'https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip'
    Expand-Archive -Force $zip $UvDir
    Remove-Item $zip -Force
}
Log ("uv: " + (& $Uv --version))

# 2. ACE-Step 1.5
if (-not (Test-Path "$Ace\pyproject.toml")) {
    Log 'downloading ACE-Step 1.5 source'
    $zip = "$env:TEMP\acestep.zip"
    & curl.exe -L --fail -s -S -o $zip 'https://codeload.github.com/ace-step/ACE-Step-1.5/zip/refs/heads/main'
    Expand-Archive -Force $zip 'C:\AI\audio\_ace_tmp'
    Move-Item (Get-ChildItem 'C:\AI\audio\_ace_tmp' -Directory | Select-Object -First 1).FullName $Ace
    Remove-Item 'C:\AI\audio\_ace_tmp', $zip -Recurse -Force -ErrorAction SilentlyContinue
}
@'
ACESTEP_CONFIG_PATH=acestep-v15-turbo
ACESTEP_LM_MODEL_PATH=acestep-5Hz-lm-0.6B
ACESTEP_LM_BACKEND=pt
ACESTEP_INIT_LLM=true
ACESTEP_DOWNLOAD_SOURCE=huggingface
'@ | Set-Content -Encoding ascii "$Ace\.env"
Run $Uv @('sync') $Ace | Out-Null

# 3. Chatterbox-Turbo (Python 3.11, torch 2.6 + CUDA 12.4). setuptools<81: resemble-perth (watermarker)
#    imports pkg_resources; without it the model fails to load with "NoneType is not callable".
if (-not (Test-Path "$VoiceVenv\Scripts\python.exe")) { Run $Uv @('venv', $VoiceVenv, '--python', '3.11') 'C:\AI\audio\voice' | Out-Null }
$py = "$VoiceVenv\Scripts\python.exe"
Run $Uv @('pip', 'install', '--python', $py, 'torch==2.6.0', 'torchaudio==2.6.0', '--index-url', 'https://download.pytorch.org/whl/cu124') 'C:\AI\audio\voice' | Out-Null
Run $Uv @('pip', 'install', '--python', $py, 'chatterbox-tts', 'soundfile', '"setuptools<81"') 'C:\AI\audio\voice' | Out-Null

# 4. Pre-fetch Chatterbox-Turbo weights so the first request is fast
Run $py @('-c', '"from chatterbox.tts_turbo import ChatterboxTurboTTS; m = ChatterboxTurboTTS.from_pretrained(device=''cuda''); print(''chatterbox ok'', m.sr)"') 'C:\AI\audio\voice' | Out-Null
Log '=== audio setup finished ==='
