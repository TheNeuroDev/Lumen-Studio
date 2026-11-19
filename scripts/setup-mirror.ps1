# Lumen mirror: Syncthing folder "lumen" = desktop C:\Lumen <-> laptop <laptopRoot> (e.g. D:\Lumen), both ways.
# Run on each machine (desktop first): powershell -ExecutionPolicy Bypass -File setup-mirror.ps1 -Path C:\Lumen
# Assumes setup-syncthing.ps1 already ran on both machines (Syncthing installed, autostart task, firewall rule, peer paired).
param([Parameter(Mandatory)][string]$Path)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Path)) { throw "$Path missing" }

# Ignores first, so the first scan never sees model weights, secrets or Python environments.
@'
// Lumen mirror ignores: the same file on desktop C:\Lumen and the laptop copy.
// Ignored files are never sent, changed or deleted on either side.
/Engine/secrets
/Engine/models
/Engine/image-models
/Engine/audio/*/.venv
/Engine/audio/**.safetensors
/Engine/audio/**.bin
/Engine/audio/**.pt
/Engine/audio/**.pth
/Engine/audio/**.ckpt
/Engine/audio/**.gguf
/Engine/audio/**.onnx
/Engine/audio/**/models--*
/Engine/tools/python
/Engine/tools/uv-cache
(?d)__pycache__
.env
.env.*
// laptop-only: the backup (so a delete on the desktop can't reach it) and the launcher's private browser data
/Backups
/Source/Lumen Studio/app
/Source/Lumen Studio/browser-profile
/Source/Lumen Studio/lumen.config.json
(?d)**/.git/*.lock
(?d)**/.git/refs/**/*.lock
(?d)~$*
(?d)Thumbs.db
(?d)desktop.ini
'@ | Set-Content -Encoding UTF8 (Join-Path $Path '.stignore')

$cfg = "$env:LOCALAPPDATA\Syncthing\config.xml"
$h = @{ 'X-API-Key' = ([xml](Get-Content $cfg)).configuration.gui.apikey }; $b = 'http://127.0.0.1:8384/rest'
function J($m, $p, $o) { Invoke-RestMethod -Method $m "$b$p" -Headers $h -ContentType 'application/json' -Body ($o | ConvertTo-Json -Depth 10) }
$me = (Invoke-RestMethod "$b/system/status" -Headers $h).myID
$peer = @((Invoke-RestMethod "$b/config/devices" -Headers $h) | Where-Object deviceID -ne $me)
if ($peer.Count -ne 1) { throw "expected exactly one paired peer, found $($peer.Count)" }
J PUT '/config/folders/lumen' @{ id = 'lumen'; label = 'Lumen'; path = $Path; type = 'sendreceive'
    devices = @(@{ deviceID = $me }, @{ deviceID = $peer[0].deviceID }); fsWatcherEnabled = $true; fsWatcherDelayS = 2
    rescanIntervalS = 3600; ignorePerms = $true; maxConflicts = 10
    versioning = @{ type = 'trashcan'; params = @{ cleanoutDays = '30' } } } | Out-Null
$o = Invoke-RestMethod "$b/config/options" -Headers $h
$g = Invoke-RestMethod "$b/config/gui" -Headers $h
"OK folder lumen at $Path, shared with $($peer[0].name) ($($peer[0].addresses -join ',')); relays=$($o.relaysEnabled) globalDiscovery=$($o.globalAnnounceEnabled) gui=$($g.address)"
