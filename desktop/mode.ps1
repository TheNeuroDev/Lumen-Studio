# C:\AI\mode.ps1 - switch the desktop's GPU between its engines (one at a time).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File C:\AI\mode.ps1 llm|code|image|voice|music|stop|gate
# Prints one line starting with "ok" or "error". Exit code 0 = ok.
#   llm    llama-server with the model named in chat-model.json                      127.0.0.1:8099   (Chat)
#   code   llm + OpenCode web workspace (thread folders: paths.json 'code')                        127.0.0.1:4096
#   image  sd-server (preloads the model in $ImgArgs; Lumen loads other profiles on demand)       127.0.0.1:1234
#   voice  voice server (desktop\audio\voice_server.py)  127.0.0.1:8002
#   music  music engine REST API (setup-audio.ps1)      127.0.0.1:8001
param([Parameter(Mandatory = $true)][ValidateSet('llm', 'code', 'image', 'voice', 'music', 'stop', 'gate')][string]$Mode)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = 'C:\AI'
$logs = "$root\logs"

# Chat and Code models: C:\AI\config\chat-model.json / code-model.json (see llm-config.ps1 and docs/INSTALL-MODELS.md).
# You choose the model (gguf), context size, KV-cache type and how many MoE expert layers stay on the CPU.
# Model ids: Chat asks for "lumen-chat", OpenCode for "lumen-code".
. "$root\llm-config.ps1"
$LlmPort  = 8099   # not 8080: other vendors' services often take that one

# Code workspace: OpenCode's web UI (tools\setup-code.ps1 installs it), password in C:\AI\secrets.
$CodeExe  = "$root\tools\opencode\opencode.exe"
$CodePort = 4096
$CodeRoot = (Get-LumenPaths).code   # C:\AI\config\paths.json; one folder per Lumen Code thread
$CodePass = "$root\secrets\opencode-password.txt"
$CodeUser = "$root\secrets\opencode-username.txt"
$OcConfig = Join-Path $env:USERPROFILE '.config\opencode\opencode.json'

$ImgExe   = "$root\sd\sd-server.exe"
$ImgPort  = 1234
$ImgDir   = "$root\image-models"
# EDIT FOR YOUR MODELS: the image model sd-server preloads at start (the author's choice; use files you have, see
# docs/INSTALL-MODELS.md). --model-dir lets the Lumen gateway load other recipes at runtime;
# --hires-upscalers-dir provides the ESRGAN upscaler for /sdcpp/v1/upscale.
$ImgArgs  = "--model-dir `"$ImgDir`" --hires-upscalers-dir `"$ImgDir\upscale_models`" " +
            "--diffusion-model `"$ImgDir\diffusion_models\z_image_turbo-Q8_0.gguf`" " +
            "--vae `"$ImgDir\vae\ae.safetensors`" " +
            "--llm `"$ImgDir\text_encoders\Qwen3-4B-Instruct-2507-Q4_K_M.gguf`" " +
            "--cfg-scale 1.0 --listen-ip 127.0.0.1 --listen-port $ImgPort --offload-to-cpu --flash-attn off,diffusion=on " +
            "--completed-ttl-seconds 1800"

$Uv        = "$root\tools\uv\uv.exe"
$VoiceDir  = "$root\audio\voice"
$VoicePy   = "$VoiceDir\.venv\Scripts\python.exe"
$VoicePort = 8002
$AceDir    = "$root\audio\ace-step"
$AcePort   = 8001

function Fail($msg) { Write-Output "error: $msg"; exit 1 }

function Test-Listening($port) {
    [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

# Python engines are matched by their folder, since they are all python.exe.
function Get-Engine($name) {
    switch ($name) {
        'llm'   { return @(Get-Process llama-server -ErrorAction SilentlyContinue) }
        'image' { return @(Get-Process sd-server -ErrorAction SilentlyContinue) }
        'code'  { return @(Get-Process opencode -ErrorAction SilentlyContinue) }
        'voice' { $dir = $VoiceDir }
        'music' { $dir = $AceDir }
    }
    return @(Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='uv.exe'" |
        Where-Object { $_.ExecutablePath -like "$dir\*" -or $_.CommandLine -like "*$dir*" } |
        ForEach-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue })
}

function Stop-Others($keep) {
    $any = $false
    foreach ($e in 'llm', 'image', 'voice', 'music') {
        if ($e -eq $keep) { continue }
        $p = Get-Engine $e
        if ($p) { $p | Stop-Process -Force -ErrorAction SilentlyContinue; $any = $true }
    }
    if ($any) { Start-Sleep -Seconds 3 }
}

# Start detached from this SSH session (Windows kills ordinary children when the session closes).
function Start-Detached($cmdline, $log, $cwd) {
    New-Item -ItemType Directory -Force -Path $logs | Out-Null
    # UTF-8 for Python's stdio: output goes to a log file, and the default cp1252 makes ACE-Step fail on
    # the first non-ASCII character it prints ("'charmap' codec can't encode characters").
    # ffmpeg (tools\install-ffmpeg.ps1) on the PATH: ACE-Step needs it to write MP3s.
    $cmd = "cmd.exe /c `"set PYTHONUTF8=1&& set PYTHONIOENCODING=utf-8&& set PATH=$root\tools\ffmpeg\bin;%PATH%&& $cmdline > `"$log`" 2>&1`""
    $cim = @{ CommandLine = $cmd }
    if ($cwd) { $cim.CurrentDirectory = $cwd }
    $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments $cim
    if ($r.ReturnValue -ne 0) { Fail "could not start $cmdline (code $($r.ReturnValue))" }
}

# Lumen's sign-in gate in front of OpenCode: tailscale serve :8443 -> gate 4097 -> OpenCode 4096.
# The page signs in with its own form; the gate adds OpenCode's password, so the browser never asks.
# It runs tools\code-gate.js on OpenCode's own binary in Bun mode, copied under another name so
# Get-Engine 'code' (and the gateway's status) never count it as OpenCode. Uses no GPU.
$GateExe  = "$root\tools\code-gate\lumen-gate.exe"
$GatePort = 4097
function Ensure-CodeGate {
    if (Test-Listening $GatePort) { return 'gate-running' }
    Get-Process lumen-gate -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    $src = Get-Item -LiteralPath $CodeExe
    if (-not (Test-Path $GateExe) -or (Get-Item $GateExe).Length -ne $src.Length) {
        New-Item -ItemType Directory -Force -Path (Split-Path $GateExe) | Out-Null
        Copy-Item -LiteralPath $src.FullName $GateExe -Force
    }
    Start-Detached "set BUN_BE_BUN=1&& `"$GateExe`" `"$root\tools\code-gate.js`"" "$logs\code-gate.log"
    for ($i = 0; $i -lt 20 -and -not (Test-Listening $GatePort); $i++) { Start-Sleep -Milliseconds 250 }
    if (Test-Listening $GatePort) { 'gate-started' } else { 'gate-failed' }
}

# Returns 'already-running' or 'started'. Exits with an error line if the check fails.
function Start-Engine($name, $port, [scriptblock]$check, [scriptblock]$start) {
    & $check
    if ((Get-Engine $name) -and (Test-Listening $port)) { return 'already-running' }
    Stop-Others $name
    if (Get-Engine $name) { Get-Engine $name | Stop-Process -Force; Start-Sleep -Seconds 2 }  # half-started: restart
    & $start
    return 'started'
}
function Ensure($name, $port, [scriptblock]$check, [scriptblock]$start) {
    $r = Start-Engine $name $port $check $start
    Write-Output "ok $name $r"
    if ($r -eq 'already-running') { exit 0 }
}
# llama-server for Chat ('chat') or Code ('code'). Keeps the running one when its settings already match
# (then only the active role changes); otherwise stops every engine and starts it with this role's model.
function Start-Llm($role) {
    $cfg = Get-LlmCfg $role; $sig = Get-LlmSig $cfg
    if (-not (Test-Path -LiteralPath $cfg.server)) { Fail "llama-server not found at $($cfg.server)" }
    if (-not $cfg.gguf) { Fail "no model configured: copy desktop\config\$role-model.example.json to C:\AI\config\$role-model.json and set gguf (docs/INSTALL-MODELS.md)" }
    if (-not (Test-Path -LiteralPath $cfg.gguf)) { Fail "model file missing: $($cfg.gguf)" }
    $st = Get-LlmState
    if ($st -and $st['sig'] -eq $sig -and (Test-Listening $LlmPort)) { Set-LlmRole $role; return 'already-running' }
    Stop-Others ''
    # Wait until the old llama-server is really gone: while it exits it still holds llama-server.log, the new
    # one's log redirect fails, and the dying process would be mistaken for the new one.
    for ($i = 0; $i -lt 30 -and (Get-Process llama-server -ErrorAction SilentlyContinue); $i++) {
        Get-Process llama-server -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500
    }
    if (Get-Process llama-server -ErrorAction SilentlyContinue) { Fail 'the previous llama-server did not exit' }
    $other = Get-LlmCfg $(if ($role -eq 'chat') { 'code' } else { 'chat' })
    $aliases = if ((Get-LlmSig $other) -eq $sig) { 'lumen-chat,lumen-code' } else { "lumen-$role" }
    $launched = Get-Date
    Start-Detached "`"$($cfg.server)`" $(Get-LlmArgs $cfg $aliases $LlmPort)" "$logs\llama-server.log"
    $p = $null
    for ($i = 0; $i -lt 20 -and -not $p; $i++) {
        Start-Sleep -Milliseconds 500
        $p = Get-Process llama-server -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -ge $launched.AddSeconds(-1) } | Select-Object -First 1
    }
    if (-not $p) { Fail "llama-server did not start (see $logs\llama-server.log)" }
    Save-LlmState @{ sig = $sig; aliases = $aliases; role = $role; pid = $p.Id; oc = '' }
    return 'started'
}
# House rules for the agent, read by OpenCode from its global config folder (AGENTS.md).
function Sync-AgentRules {
    $rules = @"
# Lumen Code rules

You run on the user's desktop PC, but the user is usually on another device (laptop or phone) looking at
the Lumen page. Everything you make must be reachable from there.

- Work only inside the current project folder (the folder this session was opened in). Create every file
  there, in sub-folders if useful. Never read, write or list anything outside it.
- Never try to open a browser, a file viewer or any GUI program (no ``start``, ``explorer``, ``Invoke-Item``,
  ``open``, ``xdg-open``). Nobody is looking at the desktop's screen.
- When you make something viewable (an HTML page, an image, a PDF, a Markdown file), tell the user its path
  relative to the project folder and that they can open it from Lumen's **Artifacts** or **Preview** tab.
- Prefer self-contained static files for previews (an index.html with its CSS/JS next to it, relative paths),
  because the Preview tab serves the folder as static files. It cannot run a server.
- Shell commands ask the user first. Keep them few and say why each is needed.
"@
    $f = Join-Path (Split-Path $OcConfig) 'AGENTS.md'
    $cur = if (Test-Path -LiteralPath $f) { [IO.File]::ReadAllText($f) } else { '' }
    if ($cur -ne $rules) { [IO.File]::WriteAllText($f, $rules, (New-Object Text.UTF8Encoding $false)) }
}
# OpenCode's provider entry follows code-model.json. Returns $true when opencode.json changed.
function Sync-OpenCodeConfig {
    $cfg = Get-LlmCfg 'code'
    $oc = $null
    if (Test-Path -LiteralPath $OcConfig) { try { $oc = $LlmSer.DeserializeObject([IO.File]::ReadAllText($OcConfig)) } catch {} }
    if (-not $oc) { $oc = New-Object 'System.Collections.Generic.Dictionary[string,object]'; $oc['$schema'] = 'https://opencode.ai/config.json' }
    $before = $LlmSer.Serialize($oc)
    if (-not $oc.ContainsKey('provider') -or -not $oc['provider']) { $oc['provider'] = @{} }
    $oc['provider']['lumen'] = [ordered]@{
        npm = '@ai-sdk/openai-compatible'; name = 'Lumen desktop'; options = @{ baseURL = "http://127.0.0.1:$LlmPort/v1" }
        models = @{ 'lumen-code' = [ordered]@{ name = $cfg.name; limit = [ordered]@{ context = $cfg.ctx; output = 16384 } } }
    }
    $oc['enabled_providers'] = @('lumen'); $oc['model'] = 'lumen/lumen-code'; $oc['small_model'] = 'lumen/lumen-code'
    if (-not $oc.ContainsKey('permission') -or -not $oc['permission']) { $oc['permission'] = @{} }
    $oc['permission']['webfetch'] = 'allow'   # lets the agent read GitHub (and other) links pasted into a chat
    # The fence: the agent's file tools stay inside the thread's own folder, and every
    # shell command asks first. Keep it unless you have a reason to loosen it.
    $oc['permission']['external_directory'] = 'deny'
    $oc['permission']['bash'] = 'ask'
    $oc['permission']['edit'] = 'allow'
    $after = $LlmSer.Serialize($oc)
    Sync-AgentRules
    if ($after -eq $before) { return $false }
    if (Test-Path -LiteralPath $OcConfig) { Copy-Item -LiteralPath $OcConfig "$OcConfig.bak" -Force }
    [IO.File]::WriteAllText($OcConfig, ($oc | ConvertTo-Json -Depth 20), (New-Object Text.UTF8Encoding $false))
    return $true
}

switch ($Mode) {
    'stop' {
        Stop-Others ''
        Write-Output 'ok stopped'
    }
    'llm' { Write-Output "ok llm $(Start-Llm 'chat')" }
    'gate' {
        # Only the sign-in gate (no GPU change).
        if (-not (Test-Path $CodeExe)) { Fail 'the code workspace is not installed yet' }
        $g = Ensure-CodeGate; if ($g -eq 'gate-failed') { Fail "the sign-in gate did not start (see $logs\code-gate.log)" }
        Write-Output "ok $g"
    }
    'code' {
        # The code model plus OpenCode. OpenCode uses no GPU, so it is left running when other engines start.
        if (-not (Test-Path $CodeExe)) { Fail 'the code workspace is not installed yet (run C:\AI\tools\setup-code.ps1)' }
        $r = Start-Llm 'code'
        $changed = Sync-OpenCodeConfig
        $s = Get-LlmState; if ($s) { $s['oc'] = Get-LlmSig (Get-LlmCfg 'code'); Save-LlmState $s }
        $g = Ensure-CodeGate
        if (-not $changed -and (Get-Engine 'code') -and (Test-Listening $CodePort)) { Write-Output "ok code llm-$r workspace-already-running $g"; exit 0 }
        Get-Engine 'code' | Stop-Process -Force -ErrorAction SilentlyContinue
        # OpenCode itself starts in an empty folder: a session opened without a project then sees nothing.
        # Every real session is opened on one project folder in $CodeRoot and fenced to it.
        $CodeHome = "$root\code-home"
        New-Item -ItemType Directory -Force -Path $CodeRoot, $CodeHome | Out-Null
        # cmd reads the password from its file, so it never appears on a process command line ("&", not "&&": set /p fails on an empty file).
        $envs = if (Test-Path $CodePass) { "set /p OPENCODE_SERVER_PASSWORD=<`"$CodePass`"& " } else { '' }
        # Optional custom login name (default 'opencode'): one line in secrets\opencode-username.txt.
        if (Test-Path $CodeUser) { $envs += "set /p OPENCODE_SERVER_USERNAME=<`"$CodeUser`"& " }
        Start-Detached "$envs`"$CodeExe`" web --hostname 127.0.0.1 --port $CodePort" "$logs\opencode.log" $CodeHome
        Write-Output "ok code llm-$r workspace-started $g$(if ($changed) { ' (config updated)' })"
    }
    'image' {
        Ensure 'image' $ImgPort {
            if (-not (Test-Path $ImgExe)) { Fail "sd-server not found at $ImgExe" }
        } { Start-Detached "`"$ImgExe`" $ImgArgs" "$logs\sd-server.log" }
    }
    'voice' {
        Ensure 'voice' $VoicePort {
            if (-not (Test-Path $VoicePy)) { Fail 'the voice engine is not installed yet (run C:\AI\tools\setup-audio.ps1)' }
        } { Start-Detached "`"$VoicePy`" -u `"$root\audio\voice_server.py`"" "$logs\voice-server.log" $VoiceDir }
    }
    'music' {
        Ensure 'music' $AcePort {
            if (-not (Test-Path "$AceDir\.venv")) { Fail 'the music engine is not installed yet (run C:\AI\tools\setup-audio.ps1)' }
        } {
            $env:UV_PYTHON_INSTALL_DIR = "$root\tools\python"; $env:UV_CACHE_DIR = "$root\tools\uv-cache"
            Start-Detached "set UV_PYTHON_INSTALL_DIR=$root\tools\python&& set UV_CACHE_DIR=$root\tools\uv-cache&& `"$Uv`" run --no-sync acestep-api --host 127.0.0.1 --port $AcePort" "$logs\music-server.log" $AceDir
        }
    }
}
