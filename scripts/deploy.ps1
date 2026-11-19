# Push Lumen Studio from this project folder to the desktop (C:\AI) over SSH.
#
#   powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1            # deploy everything
#   powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 -WebOnly   # just the page (no restart)
#
# The page (desktop\web) is read fresh on every request, so page changes are live immediately.
# If gateway.ps1 changed, the "Lumen Gateway" scheduled task is restarted so it picks it up.
param([switch]$WebOnly)

$ErrorActionPreference = 'Stop'
$Lumen = . (Join-Path $PSScriptRoot 'lumen-config.ps1')   # lumen.config.json (your values; not in git)
$DesktopHost = $Lumen.desktopSsh                 # you@<desktop Tailscale IP or name>
$Ssh = 'C:\Windows\System32\OpenSSH\ssh.exe'   # Windows OpenSSH (uses the ssh-agent key)
$Scp = 'C:\Windows\System32\OpenSSH\scp.exe'
$Src = Join-Path (Split-Path -Parent $PSScriptRoot) 'desktop'

function Remote($script) {
    $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes("`$ProgressPreference='SilentlyContinue'; $script"))
    & $Ssh -o BatchMode=yes -o ConnectTimeout=8 $DesktopHost "powershell -NoProfile -EncodedCommand $enc" 2>$null |
        Where-Object { $_ -notmatch '#< CLIXML|<Objs' }
}
function Push($local, $remoteDir) {
    & $Scp -q -o BatchMode=yes $local "${DesktopHost}:$($remoteDir -replace '\\', '/')"
    if ($LASTEXITCODE) { throw "copy failed: $local" }
    Write-Host "  pushed $(Split-Path -Leaf $local) -> $remoteDir"
}

Write-Host "Deploying Lumen Studio to $DesktopHost ..."
# The Lumen launcher disconnects this laptop from Tailscale when the Lumen window closes: reconnect first.
$Ts = 'C:\Program Files\Tailscale\tailscale.exe'
if ((Test-Path $Ts) -and -not ((& $Ts status --json 2>$null) -match '"BackendState": "Running"')) {
    & $Ts up | Out-Null; Start-Sleep -Seconds 2; Write-Host '  connected Tailscale'
}
# Refuse to deploy PowerShell that doesn't parse: a broken gateway.ps1 takes the live site down.
foreach ($f in Get-ChildItem $Src -Recurse -File -Filter *.ps1) {
    $errs = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$null, [ref]$errs)
    if ($errs) { $errs | ForEach-Object { Write-Host "  $($f.Name) line $($_.Extent.StartLineNumber): $($_.Message)" }; throw "$($f.Name) has syntax errors; nothing deployed" }
}
# Keep the live files before overwriting them. Roll back = copy this folder's files back over C:\AI.
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Remote @"
New-Item -ItemType Directory -Force C:\AI\web, C:\AI\audio, C:\AI\gw, C:\AI\archive\deploy-$stamp\web, C:\AI\archive\deploy-$stamp\gw | Out-Null
Copy-Item C:\AI\*.ps1 C:\AI\archive\deploy-$stamp\ -ErrorAction SilentlyContinue
Copy-Item C:\AI\web\* C:\AI\archive\deploy-$stamp\web\ -ErrorAction SilentlyContinue
Copy-Item C:\AI\gw\* C:\AI\archive\deploy-$stamp\gw\ -ErrorAction SilentlyContinue
"@ | Out-Null
Write-Host "  backup of the live files: C:\AI\archive\deploy-$stamp"

Get-ChildItem "$Src\web" -File | ForEach-Object { Push $_.FullName 'C:/AI/web/' }
if ($WebOnly) { Write-Host 'Done (page only).'; return }

# The gateway reads gateway.ps1, llm-config.ps1 and gw\*.ps1 at start: restart it when any of them changes.
$hashCmd = '(Get-FileHash C:\AI\gateway.ps1, C:\AI\llm-config.ps1, C:\AI\gw\*.ps1 -ErrorAction SilentlyContinue).Hash -join ","'
$before = Remote $hashCmd
foreach ($f in 'llm-config.ps1', 'mode.ps1') { Push "$Src\$f" 'C:/AI/' }
Get-ChildItem "$Src\gw" -File -Filter *.ps1 | ForEach-Object { Push $_.FullName 'C:/AI/gw/' }
Push "$Src\gateway.ps1" 'C:/AI/'   # last: it needs the gw\ files above
Remote 'New-Item -ItemType Directory -Force C:\AI\tools | Out-Null' | Out-Null
Get-ChildItem "$Src\tools" -File | Where-Object { $_.Extension -in '.ps1', '.js' } | ForEach-Object { Push $_.FullName 'C:/AI/tools/' }
if (Test-Path "$Src\audio") {
    Get-ChildItem "$Src\audio" -File | ForEach-Object { Push $_.FullName 'C:/AI/audio/' }
}
$after = Remote $hashCmd

if ($before -ne $after) {
    Write-Host '  gateway changed: restarting the Lumen Gateway task...'
    Remote @'
Stop-ScheduledTask -TaskName 'Lumen Gateway'
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*gateway.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName 'Lumen Gateway'
Start-Sleep -Seconds 4
"  gateway listening: " + [bool](Get-NetTCPConnection -LocalPort 1240 -State Listen -ErrorAction SilentlyContinue)
'@
}
Write-Host 'Done.'
