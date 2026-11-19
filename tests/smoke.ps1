# Quick post-deploy check of the live gateway (no GPU work): each read-only endpoint must answer 200.
#   powershell -ExecutionPolicy Bypass -File tests\smoke.ps1
param([string]$Base = $(if ($env:LUMEN_URL) { $env:LUMEN_URL.TrimEnd('/') } else { (. (Join-Path $PSScriptRoot '..\scripts\lumen-config.ps1')).publicUrl.TrimEnd('/') }))
$ErrorActionPreference = 'Stop'
$fail = 0
$checks = [ordered]@{
    '/'                              = 'Lumen Studio'
    '/gw/status'                     = '"engine"'
    '/gw/gallery'                    = '"items"'
    '/gw/chats'                      = '"chats"'
    '/gw/code/projects'              = '"projects"'
    '/gw/energy'                     = '"rate"'
    '/gw/energy/details?range=today' = '"studio"'
}
foreach ($p in $checks.Keys) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 15 "$Base$p"
        $ok = $r.StatusCode -eq 200 -and $r.Content.Contains($checks[$p])
    } catch { $ok = $false }
    Write-Host ("{0} {1}" -f $(if ($ok) { 'ok  ' } else { 'FAIL' }), $p)
    if (-not $ok) { $fail++ }
}
if ($fail) { Write-Host "$fail check(s) failed"; exit 1 }
Write-Host 'all ok'
