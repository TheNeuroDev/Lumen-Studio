# Loads your personal settings for the laptop-side scripts from lumen.config.json (repo root).
# lumen.config.json is in .gitignore: copy lumen.config.example.json to lumen.config.json and fill it in.
#   $Lumen = . (Join-Path $PSScriptRoot 'lumen-config.ps1')
$f = Join-Path (Split-Path -Parent $PSScriptRoot) 'lumen.config.json'
if (-not (Test-Path -LiteralPath $f)) {
    throw "lumen.config.json not found next to README.md. Copy lumen.config.example.json to lumen.config.json and fill in your values."
}
$c = Get-Content -LiteralPath $f -Raw | ConvertFrom-Json
foreach ($k in 'desktopSsh', 'publicUrl') {
    if (-not $c.$k -or "$($c.$k)" -match 'YOUR-') { throw "lumen.config.json: set '$k' to your own value first." }
}
if (-not $c.laptopRoot) { $c | Add-Member -NotePropertyName laptopRoot -NotePropertyValue 'D:\Lumen' -Force }
return $c
