# EXAMPLE SCRIPT: this downloads the models the original author chose for one 12 GB GPU. It is NOT a recommendation.
# Research current models for your own hardware first (docs/INSTALL-MODELS.md), then copy this file and edit the list.
# Pre-downloads ACE-Step 1.5's model weights into C:\AI\audio\ace-step\checkpoints with curl, because
# huggingface_hub's own first-run download crawls at ~1 MB/s on this connection. Re-runnable/resumable.
# Stop the music engine first (mode.ps1 stop). Log: C:\AI\logs\model-download.log
$ErrorActionPreference = 'Continue'
$Dir = 'C:\AI\audio\ace-step\checkpoints'
$Log = 'C:\AI\logs\model-download.log'
$Hf = 'https://huggingface.co'
# local path under checkpoints -> source URL. The 0.6B LM lives in its own repo; it is the one ACE-Step
# actually uses here, because its GPU tiers put 12 GB cards (3080 Ti) in "tier4", which allows only 0.6B.
$Files = [ordered]@{
    'acestep-v15-turbo/model.safetensors'       = "$Hf/ACE-Step/Ace-Step1.5/resolve/main/acestep-v15-turbo/model.safetensors"
    'acestep-5Hz-lm-0.6B/model.safetensors'     = "$Hf/ACE-Step/acestep-5Hz-lm-0.6B/resolve/main/model.safetensors"
    'acestep-5Hz-lm-1.7B/model.safetensors'     = "$Hf/ACE-Step/Ace-Step1.5/resolve/main/acestep-5Hz-lm-1.7B/model.safetensors"   # unused, but ACE-Step's startup check re-downloads it if missing
    'Qwen3-Embedding-0.6B/model.safetensors'    = "$Hf/ACE-Step/Ace-Step1.5/resolve/main/Qwen3-Embedding-0.6B/model.safetensors"
    'vae/diffusion_pytorch_model.safetensors'   = "$Hf/ACE-Step/Ace-Step1.5/resolve/main/vae/diffusion_pytorch_model.safetensors"
}
function Log($m) { Add-Content -Path $Log -Value "$(Get-Date -Format 'HH:mm:ss') $m" }
Log '=== ACE-Step prefetch started ==='
# Drop half-finished huggingface_hub downloads so it re-checks the files we fetch.
Get-ChildItem $Dir -Recurse -Force -Include *.incomplete, *.lock -ErrorAction SilentlyContinue | Remove-Item -Force
foreach ($f in $Files.Keys) {
    $dest = Join-Path $Dir ($f -replace '/', '\')
    if (Test-Path "$dest.done") { Log "skip $f (done)"; continue }
    New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
    Log "get  ace-step/$f"
    for ($try = 1; $try -le 300; $try++) {
        & curl.exe -L --fail --speed-limit 2000000 --speed-time 30 -C - -s -S -o "$dest" $Files[$f] 2>&1 | ForEach-Object { Log "     $_" }
        if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 22) { break }
        Start-Sleep -Seconds 2
    }
    if ($LASTEXITCODE -eq 0) { New-Item -ItemType File -Force "$dest.done" | Out-Null; Log "ok   ace-step/$f $([math]::Round((Get-Item $dest).Length / 1GB, 2)) GB" }
    else { Log "FAIL ace-step/$f (curl exit $LASTEXITCODE)" }
}
Log '=== ACE-Step prefetch finished ==='
