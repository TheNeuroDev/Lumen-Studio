# Optional: installs the Syncthing autostart task, a tailnet-only firewall rule, and pairs this PC with ONE peer.
# Run once on each machine (as the user that should own the sync), then run setup-mirror.ps1 on each.
#   powershell -ExecutionPolicy Bypass -File setup-syncthing.ps1 -PeerId <other device's Syncthing ID> -PeerName laptop -PeerIp <other device's Tailscale IP>
# Install Syncthing first: winget install Syncthing.Syncthing
param([Parameter(Mandatory)][string]$PeerId, [Parameter(Mandatory)][string]$PeerName, [Parameter(Mandatory)][string]$PeerIp)
$ErrorActionPreference = 'Stop'
$exe = (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter syncthing.exe -EA 0 | Select-Object -First 1).FullName
if (-not $exe) { throw 'syncthing.exe not found (winget install Syncthing.Syncthing)' }

# Firewall: allow the sync port from the tailnet only (Tailscale's CGNAT range). Needs admin; best effort.
try { if (-not (Get-NetFirewallRule -DisplayName 'Syncthing (Tailscale)' -EA 0)) {
  New-NetFirewallRule -DisplayName 'Syncthing (Tailscale)' -Direction Inbound -Protocol TCP -LocalPort 22000 -RemoteAddress 100.64.0.0/10 -Action Allow | Out-Null }; 'firewall ok' } catch { "firewall FAILED: $($_.Exception.Message)" }

# Autostart task (S4U = runs at boot without a window; falls back to Interactive at logon).
$act = New-ScheduledTaskAction -Execute $exe -Argument 'serve --no-browser --no-console'
$set = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$u = "$env:USERDOMAIN\$env:USERNAME"
try {
  Register-ScheduledTask -TaskName 'Syncthing' -Force -Action $act -Settings $set -Trigger @((New-ScheduledTaskTrigger -AtStartup), (New-ScheduledTaskTrigger -AtLogOn -User $u)) -Principal (New-ScheduledTaskPrincipal -UserId $u -LogonType S4U) | Out-Null; 'task S4U'
} catch {
  Register-ScheduledTask -TaskName 'Syncthing' -Force -Action $act -Settings $set -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $u) -Principal (New-ScheduledTaskPrincipal -UserId $u -LogonType Interactive) | Out-Null; 'task Interactive (logon)'
}
if (-not (Get-Process syncthing -EA 0)) { Start-ScheduledTask -TaskName 'Syncthing' }

$cfg = "$env:LOCALAPPDATA\Syncthing\config.xml"
for ($i = 0; $i -lt 60 -and -not (Test-Path $cfg); $i++) { Start-Sleep 1 }
$h = @{ 'X-API-Key' = ([xml](Get-Content $cfg)).configuration.gui.apikey }; $b = 'http://127.0.0.1:8384/rest'
for ($i = 0; $i -lt 60; $i++) { try { $me = (Invoke-RestMethod "$b/system/status" -Headers $h).myID; break } catch { Start-Sleep 1 } }
if (-not $me) { throw 'Syncthing API did not come up' }
function J($m, $p, $o) { Invoke-RestMethod -Method $m "$b$p" -Headers $h -ContentType 'application/json' -Body ($o | ConvertTo-Json -Depth 10) | Out-Null }
# Tailnet only: no relays, no global/local discovery, no usage reporting.
J PATCH '/config/options' @{ globalAnnounceEnabled = $false; localAnnounceEnabled = $false; relaysEnabled = $false; natEnabled = $false; urAccepted = -1; startBrowser = $false; listenAddresses = @('tcp://0.0.0.0:22000'); crashReportingEnabled = $false }
J PUT "/config/devices/$PeerId" @{ deviceID = $PeerId; name = $PeerName; addresses = @("tcp://${PeerIp}:22000"); autoAcceptFolders = $false }
"OK this device's ID = $me (give it to the other machine's -PeerId); paired with $PeerName"
