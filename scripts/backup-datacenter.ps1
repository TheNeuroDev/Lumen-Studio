# Pull-only, versioned backup of the Data Center's C:\Lumen\{Studio,Chats,Code} to this laptop.
# Only two things run on the Data Center, both read-only: a file listing and `tar -c` (stdout).
# Layout: <laptopRoot>\Backups\DataCenter\current\  = latest copy
#         <laptopRoot>\Backups\DataCenter\versions\<stamp>\  = files that were changed or deleted at that run
# Backups is laptop-only: the Syncthing mirror ignores it, so a delete on the desktop can't reach it.
# Scheduled hourly by register-backup-task.ps1; does real work at most once per 20 h unless -Force.
param([switch]$Force, [int]$KeepDays = 180)
$ErrorActionPreference = 'Continue'   # native ssh/tar stderr must not throw in PS 5.1; moves use -ErrorAction Stop
$Lumen = . (Join-Path $PSScriptRoot 'lumen-config.ps1')   # lumen.config.json (your values; not in git)
$Root = Join-Path $Lumen.laptopRoot 'Backups\DataCenter'
$Cur = "$Root\current"; $Ver = "$Root\versions"; $Manifest = "$Root\manifest.tsv"; $Log = "$Root\backup.log"
$Ssh = 'C:\Windows\System32\OpenSSH\ssh.exe'; $Tar = 'C:\Windows\System32\tar.exe'
$Host_ = $Lumen.desktopSsh
$Ts = 'C:\Program Files\Tailscale\tailscale.exe'
New-Item -ItemType Directory -Force $Cur, $Ver | Out-Null
function Log($m) { $l = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m"; Add-Content $Log $l -Encoding UTF8; Write-Host $l }

$mutex = New-Object Threading.Mutex($false, 'LumenBackup')
if (-not $mutex.WaitOne(0)) { exit 0 }   # another run is in progress
$okFile = "$Root\last-success.txt"
if (-not $Force -and (Test-Path $okFile) -and ((Get-Date) - (Get-Item $okFile).LastWriteTime).TotalHours -lt 20) { exit 0 }

# The Lumen launcher turns Tailscale off when its window closes; connect for the run, then put it back.
$weUpped = $false
if ((Test-Path $Ts) -and -not ((& $Ts status --json 2>$null) -match '"BackendState": "Running"')) {
    & $Ts up 2>$null | Out-Null; Start-Sleep -Seconds 5; $weUpped = $true
}
try {
    # 1. Listing (read-only). Base64 of UTF-8 so non-ASCII names survive the console.
    $remote = @'
$ErrorActionPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'
$sb = New-Object Text.StringBuilder
foreach ($d in 'Studio','Chats','Code') {
  Get-ChildItem "C:\Lumen\$d" -Recurse -File -Force | ForEach-Object {
    $rel = $_.FullName.Substring(9)   # strip 'C:\Lumen\'
    if ($rel -match '(^|\\)secrets(\\|$)' -or $_.Name -like '.env*') { return }
    [void]$sb.Append($rel).Append("`t").Append($_.Length).Append("`t").Append([long]($_.LastWriteTimeUtc - [datetime]'1970-01-01').TotalSeconds).Append("`n")
  }
}
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($sb.ToString()))
'@
    $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remote))
    $b64 = (& $Ssh -o BatchMode=yes -o ConnectTimeout=15 $Host_ "powershell -NoProfile -EncodedCommand $enc" 2>$null) -join ''
    if ($LASTEXITCODE -ne 0 -or -not $b64) { Log 'Data Center not reachable; will retry next hour.'; exit 0 }
    $now = @{}
    foreach ($line in [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) -split "`n") {
        if ($line) { $p = $line -split "`t"; $now[$p[0]] = "$($p[1])`t$($p[2])" }
    }
    if ($now.Count -eq 0) { Log 'Listing came back empty; refusing to treat everything as deleted.'; exit 1 }

    $old = @{}
    if (Test-Path $Manifest) { foreach ($l in Get-Content $Manifest -Encoding UTF8) { $p = $l -split "`t", 2; $old[$p[0]] = $p[1] } }
    $changed = @($now.Keys | Where-Object { $old[$_] -ne $now[$_] -or -not (Test-Path -LiteralPath "$Cur\$_") })
    $deleted = @($old.Keys | Where-Object { -not $now.ContainsKey($_) })
    $stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
    $failed = @()

    # 2. Pull changed files into staging with one tar stream (cmd pipes are binary-safe; PS 5.1 pipes are not).
    if ($changed.Count) {
        $stage = "$Root\staging"; Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
        New-Item -ItemType Directory $stage | Out-Null
        # Paths go on the remote command line in batches (feeding tar a list on stdin over ssh stalls).
        # Start-Process redirects stdout straight to a file, so the tar bytes stay binary.
        $batches = @(); $batch = @(); $len = 0
        foreach ($rel in $changed) {
            $q = '\"' + ($rel -replace '\\', '/') + '\"'
            if ($len + $q.Length -gt 6000 -and $batch.Count) { $batches += , $batch; $batch = @(); $len = 0 }
            $batch += $q; $len += $q.Length + 1
        }
        if ($batch.Count) { $batches += , $batch }   # not $cur: PowerShell names are case-insensitive ($Cur)
        $tarFile = "$Root\pull.tar"
        foreach ($b in $batches) {
            $args_ = "-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=30 $Host_ `"$Tar -cf - -C C:/Lumen $($b -join ' ')`""
            Start-Process $Ssh -ArgumentList $args_ -RedirectStandardOutput $tarFile -RedirectStandardError "$Root\pull.err" -NoNewWindow -Wait | Out-Null
            & $Tar -xf $tarFile -C $stage 2>$null
        }
        Remove-Item $tarFile, "$Root\pull.err" -ErrorAction SilentlyContinue
        foreach ($rel in $changed) {
            $src = "$stage\$rel"
            if (-not (Test-Path -LiteralPath $src) -or (Get-Item -LiteralPath $src).Length -ne [long]($now[$rel] -split "`t")[0]) { $failed += $rel; continue }
            $dst = "$Cur\$rel"
            if (Test-Path -LiteralPath $dst) { $v = "$Ver\$stamp\$rel"; New-Item -ItemType Directory -Force (Split-Path $v) | Out-Null; Move-Item -LiteralPath $dst $v -ErrorAction Stop }
            New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null
            Move-Item -LiteralPath $src $dst -ErrorAction Stop
        }
        Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
    }
    # 3. Deleted on the Data Center: keep the last copy under versions\<stamp>\.
    foreach ($rel in $deleted) {
        $dst = "$Cur\$rel"
        if (Test-Path -LiteralPath $dst) { $v = "$Ver\$stamp\$rel"; New-Item -ItemType Directory -Force (Split-Path $v) | Out-Null; Move-Item -LiteralPath $dst $v -ErrorAction Stop }
    }
    # 4. Manifest = what current\ now holds (failed files are left out, so they retry next run).
    $lines = foreach ($k in $now.Keys) { if ($failed -notcontains $k) { "$k`t$($now[$k])" } elseif ($old.ContainsKey($k)) { "$k`t$($old[$k])" } }
    [IO.File]::WriteAllLines($Manifest, [string[]]$lines, (New-Object Text.UTF8Encoding $false))
    # 5. Retention.
    Get-ChildItem $Ver -Directory | Where-Object { $_.CreationTime -lt (Get-Date).AddDays(-$KeepDays) } | Remove-Item -Recurse -Force

    $mb = '{0:N0}' -f ((Get-ChildItem $Cur -Recurse -File -Force | Measure-Object Length -Sum).Sum / 1MB)
    Log "OK: $($now.Count) files ($mb MB), pulled $($changed.Count - $failed.Count), deleted-upstream $($deleted.Count), failed $($failed.Count)"
    foreach ($f in $failed) { Log "  failed: $f" }
    if ($failed.Count) { exit 1 }
    Set-Content $okFile $stamp
} finally {
    # Put Tailscale back off, unless the Lumen window was opened meanwhile.
    if ($weUpped -and -not (Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*Lumen Studio\app\engine\*' })) { & $Ts down 2>$null | Out-Null }
}
