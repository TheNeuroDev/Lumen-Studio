# Sets up Lumen's Code mode on the desktop (run once, as the Windows user that runs the gateway):
#   - OpenCode (MIT) in C:\AI\tools\opencode
#   - its config, pointing at the local llama-server (model alias "lumen-chat")
#   - a random password for its web UI in C:\AI\secrets\opencode-password.txt
#   - the projects folder C:\Lumen\Code
#   - tailscale serve: https://<desktop>.ts.net:8443 -> Lumen's sign-in gate 127.0.0.1:4097 -> OpenCode 4096
#   powershell -ExecutionPolicy Bypass -File C:\AI\tools\setup-code.ps1
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Dir = 'C:\AI\tools\opencode'
New-Item -ItemType Directory -Force -Path $Dir, 'C:\AI\secrets', 'C:\Lumen\Code' | Out-Null

if (-not (Test-Path "$Dir\opencode.exe")) {
    $zip = Join-Path $env:TEMP 'opencode-windows-x64.zip'
    & curl.exe -L --fail -s -S -o $zip 'https://github.com/sst/opencode/releases/latest/download/opencode-windows-x64.zip'
    if ($LASTEXITCODE) { throw "OpenCode download failed (curl exit $LASTEXITCODE)" }
    Expand-Archive -Path $zip -DestinationPath $Dir -Force
    $exe = Get-ChildItem $Dir -Recurse -Filter opencode.exe | Select-Object -First 1
    if (-not $exe) { throw 'opencode.exe not found in the download' }
    if ($exe.DirectoryName -ne $Dir) { Move-Item $exe.FullName "$Dir\opencode.exe" -Force }
}
Write-Output ("opencode " + (& "$Dir\opencode.exe" --version))

$pwFile = 'C:\AI\secrets\opencode-password.txt'
if (-not (Test-Path $pwFile)) {
    $chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
    $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    $b = New-Object byte[] 20; $rng.GetBytes($b)
    Set-Content -Path $pwFile -Value (-join ($b | ForEach-Object { $chars[$_ % $chars.Length] })) -NoNewline
}

$cfgDir = Join-Path $env:USERPROFILE '.config\opencode'
New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
$cfg = @'
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "lumen": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Lumen desktop",
      "options": { "baseURL": "http://127.0.0.1:8099/v1" },
      "models": {
        "lumen-chat": {
          "name": "Lumen local model",
          "limit": { "context": 131072, "output": 16384 }
        }
      }
    }
  },
  "enabled_providers": ["lumen"],
  "model": "lumen/lumen-chat",
  "small_model": "lumen/lumen-chat",
  "autoupdate": false,
  "share": "disabled",
  "permission": { "edit": "allow", "bash": "ask" }
}
'@
$cfgFile = Join-Path $cfgDir 'opencode.json'
if (-not (Test-Path $cfgFile)) { [IO.File]::WriteAllText($cfgFile, $cfg) ; Write-Output "wrote $cfgFile" }
else { Write-Output "kept existing $cfgFile" }

$ts = 'C:\Program Files\Tailscale\tailscale.exe'
& $ts serve --bg --https=8443 http://127.0.0.1:4097 | Out-Null   # the gate (mode.ps1 code/gate starts it)
Write-Output 'ok code workspace set up (https port 8443)'
