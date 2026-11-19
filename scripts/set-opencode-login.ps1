# Change the OpenCode (Lumen Code) login on the desktop, from this laptop.
#   Right-click > Run with PowerShell, or:  powershell -ExecutionPolicy Bypass -File scripts\set-opencode-login.ps1
# Asks for the new username and password here, sends them over SSH on stdin (never on a command line or
# in a file on this laptop), writes C:\AI\secrets\opencode-username.txt / opencode-password.txt on the
# desktop, and restarts OpenCode so the new login takes effect. -Check only tests the connection.
param([switch]$Check)
$ErrorActionPreference = 'Stop'
$Ssh = 'C:\Windows\System32\OpenSSH\ssh.exe'   # Windows OpenSSH: uses this laptop's ssh-agent key
$Lumen = . (Join-Path $PSScriptRoot 'lumen-config.ps1')   # lumen.config.json (your values; not in git)
$DesktopHost = $Lumen.desktopSsh
$Ts = 'C:\Program Files\Tailscale\tailscale.exe'
if ((Test-Path $Ts) -and -not ((& $Ts status --json 2>$null) -match '"BackendState": "Running"')) { & $Ts up | Out-Null; Start-Sleep 2 }

$remote = @'
$ErrorActionPreference = 'Stop'
$u = [Console]::In.ReadLine(); $p = [Console]::In.ReadLine()
if ($u -eq '__check__') { 'connected to ' + $env:COMPUTERNAME; exit 0 }
if (-not $u -or -not $p) { 'username or password was empty: nothing changed'; exit 1 }
$enc = New-Object System.Text.UTF8Encoding $false
[IO.File]::WriteAllText('C:\AI\secrets\opencode-username.txt', $u, $enc)
[IO.File]::WriteAllText('C:\AI\secrets\opencode-password.txt', $p, $enc)
Get-Process opencode -ErrorAction SilentlyContinue | Stop-Process -Force
powershell -NoProfile -ExecutionPolicy Bypass -File C:\AI\mode.ps1 code   # scripts are blocked by default over SSH
'OpenCode login changed.'
'@
$enc64 = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remote))

if ($Check) { $u = '__check__'; $p = 'x' } else {
    $u = Read-Host 'New OpenCode username'
    $s = Read-Host 'New OpenCode password' -AsSecureString
    $s2 = Read-Host 'Type the password again' -AsSecureString
    $p = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
    $p2 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s2))
    if ($p -ne $p2) { Write-Host 'The passwords did not match. Nothing changed.'; Read-Host 'Press Enter to close'; exit 1 }
    if ($u -match '[:\s]') { Write-Host 'The username cannot contain spaces or a colon. Nothing changed.'; Read-Host 'Press Enter to close'; exit 1 }
}
"$u`n$p`n" | & $Ssh -o ConnectTimeout=10 $DesktopHost "powershell -NoProfile -EncodedCommand $enc64" 2>&1 |
    Where-Object { "$_" -notmatch '#< CLIXML|<Objs' } | ForEach-Object { Write-Host $_ }
Remove-Variable p, p2 -ErrorAction SilentlyContinue
if (-not $Check) { Read-Host 'Done. Press Enter to close' }
