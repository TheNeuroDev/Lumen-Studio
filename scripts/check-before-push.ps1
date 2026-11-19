# Run before every commit/push of this PUBLIC repo. Fails (exit 1) if anything personal or broken is staged/tracked.
#   powershell -ExecutionPolicy Bypass -File scripts\check-before-push.ps1
# Checks: PowerShell parses, JSON parses, generic secret/PII patterns, and YOUR personal terms.
# Your personal terms (name, tailnet name, device names, town, ...) go one-per-line (regex) in
# .pii-patterns.local at the repo root. That file is gitignored: never commit it.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$bad = 0
function Bad($m) { Write-Host "FAIL $m" -ForegroundColor Red; $script:bad++ }

$files = @(git ls-files) + @(git ls-files --others --exclude-standard) | Sort-Object -Unique | Where-Object { Test-Path -LiteralPath $_ }
foreach ($f in $files) {
    if ($f -like '*.ps1') {
        $e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $f), [ref]$null, [ref]$e)
        if ($e) { Bad "$f does not parse: $($e[0].Message) (line $($e[0].Extent.StartLineNumber))" }
    }
    if ($f -like '*.json') { try { Get-Content -LiteralPath $f -Raw | ConvertFrom-Json | Out-Null } catch { Bad "$f is not valid JSON" } }
}

$generic = @(
    '[A-Za-z0-9-]+\.tail[a-z0-9]+\.ts\.net',            # a real tailnet hostname
    '\b100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.(?!0\.0\b)\d+\.\d+\b', # a real Tailscale IP (the 100.64.0.0/10 range itself is fine)
    'C:\\Users\\(?!YOU|<)[A-Za-z0-9._-]+',              # a real user profile path
    '\bhf_[A-Za-z0-9]{20,}', '\bghp_[A-Za-z0-9]{20,}', '\bsk-[A-Za-z0-9]{20,}', 'tskey-[A-Za-z0-9-]{10,}',
    '-----BEGIN [A-Z ]*PRIVATE KEY-----',
    '[A-Za-z0-9._%+-]+@(?!users\.noreply\.github\.com)[A-Za-z0-9.-]+\.(com|net|org|io|me)\b'
)
$mine = if (Test-Path .pii-patterns.local) { @(Get-Content .pii-patterns.local | Where-Object { $_.Trim() -and -not $_.StartsWith('#') }) } else { Write-Host 'note: no .pii-patterns.local, only generic patterns are checked'; @() }
foreach ($f in $files) {
    if ($f -match '\.(png|ico|woff2?)$' -or $f -in 'scripts/check-before-push.ps1', 'LICENSE') { continue }
    $t = Get-Content -LiteralPath $f -Raw -ErrorAction SilentlyContinue; if (-not $t) { continue }
    foreach ($p in $generic + $mine) { $m = [regex]::Match($t, $p, 'IgnoreCase'); if ($m.Success) { Bad "$f matches '$p': $($m.Value.Substring(0, [Math]::Min(40, $m.Value.Length)))" } }
}
if (Get-Command gitleaks -ErrorAction SilentlyContinue) { gitleaks dir . --no-banner 2>&1 | Out-Host; if ($LASTEXITCODE) { Bad 'gitleaks found something' } } else { Write-Host 'note: gitleaks not installed (winget install gitleaks.gitleaks) - recommended' }
if ($bad) { Write-Host "$bad problem(s). Do not push." -ForegroundColor Red; exit 1 }
Write-Host 'OK: clean. Safe to push.' -ForegroundColor Green
