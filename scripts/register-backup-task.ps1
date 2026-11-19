# Registers "Lumen Backup" on this laptop: hourly while logged on (runs hidden), catches up after sleep/off.
# backup-datacenter.ps1 itself skips the run if the last good backup is under 20 h old.
$script = Join-Path $PSScriptRoot 'backup-datacenter.ps1'
$a = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$script`""
$t = @((New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME),
       (New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Hours 1)))
$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
     -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 4)
$p = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
Register-ScheduledTask 'Lumen Backup' -Action $a -Trigger $t -Settings $s -Principal $p -Force | Out-Null
Get-ScheduledTask 'Lumen Backup' | Select-Object TaskName, State
