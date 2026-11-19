# Downloads the uncensored chat/code model into C:\AI\models: Qwen3.6-35B-A3B "uncensored Heretic"
# (llmfan46, Native-MTP-Preserved, Q4_K_M 21.8 GB) + its vision projector (0.9 GB).
# Re-runnable: finished files are skipped, partial files resume. mode.ps1 switches to it once both
# files have their .done marker. Progress: C:\AI\logs\chat-model-download.log
#   powershell -ExecutionPolicy Bypass -File C:\AI\tools\download-chat-model.ps1
$ErrorActionPreference = 'Continue'
$Dir  = 'C:\AI\models'
$Log  = 'C:\AI\logs\chat-model-download.log'
$Repo = 'https://huggingface.co/llmfan46/Qwen3.6-35B-A3B-uncensored-heretic-Native-MTP-Preserved-GGUF/resolve/main'
$Files = @(
    'Qwen3.6-35B-A3B-uncensored-heretic-Native-MTP-Preserved-mmproj-BF16.gguf',
    'Qwen3.6-35B-A3B-uncensored-heretic-Native-MTP-Preserved-Q4_K_M.gguf'
)

function Log($m) { Add-Content -Path $Log -Value "$(Get-Date -Format 'HH:mm:ss') $m" }
New-Item -ItemType Directory -Force -Path $Dir, (Split-Path $Log) | Out-Null
Log '=== chat model download started ==='
foreach ($f in $Files) {
    $dest = Join-Path $Dir $f
    if (Test-Path "$dest.done") { Log "skip $f (done)"; continue }
    Log "get  $f"
    # Abort any connection slower than 2 MB/s for 30 s and resume on a fresh one (curl exit 28 = too slow).
    for ($try = 1; $try -le 300; $try++) {
        & curl.exe -L --fail --speed-limit 2000000 --speed-time 30 -C - -s -S -o "$dest" "$Repo/$f" 2>&1 | ForEach-Object { Log "     $_" }
        if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 22) { break }
        Start-Sleep -Seconds 2
    }
    if ($LASTEXITCODE -eq 0) { New-Item -ItemType File -Force "$dest.done" | Out-Null; Log "ok   $f $([math]::Round((Get-Item $dest).Length / 1GB, 2)) GB" }
    else { Log "FAIL $f (curl exit $LASTEXITCODE)" }
}
Log '=== chat model download finished ==='
