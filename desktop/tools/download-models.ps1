# Downloads the Lumen Studio model files into C:\AI\image-models (sd-server's --model-dir layout).
# Re-runnable: finished files are skipped, partial files resume. Progress: C:\AI\logs\model-download.log
#   powershell -ExecutionPolicy Bypass -File C:\AI\tools\download-models.ps1
$ErrorActionPreference = 'Continue'
$Dir = 'C:\AI\image-models'
$Log = 'C:\AI\logs\model-download.log'
$HF = 'https://huggingface.co'

# folder, file name, url
$Files = @(
    # Qwen-Image 2512's text encoder + VAE (2512 stays for archive rerolls). Qwen-Image-Edit 2511 and its mmproj
    # were dropped 2026-11-17: Edit uses Qwen-Image 2.1 (below) since then.
    @('text_encoders',    'Qwen2.5-VL-7B-Instruct-Q6_K.gguf', "$HF/unsloth/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/Qwen2.5-VL-7B-Instruct-Q6_K.gguf"),
    @('vae',              'qwen_image_vae.safetensors',       "$HF/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors"),
    # Upscaling: Real-ESRGAN x4plus (photo)
    @('upscale_models',   'RealESRGAN_x4plus.pth',            'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth'),
    # Video: Wan 2.2 TI2V 5B (Apache 2.0) + UMT5-XXL + Wan 2.2 VAE
    @('diffusion_models', 'Wan2.2-TI2V-5B-Q8_0.gguf',         "$HF/QuantStack/Wan2.2-TI2V-5B-GGUF/resolve/main/Wan2.2-TI2V-5B-Q8_0.gguf"),
    @('text_encoders',    'umt5-xxl-encoder-Q8_0.gguf',       "$HF/city96/umt5-xxl-encoder-gguf/resolve/main/umt5-xxl-encoder-Q8_0.gguf"),
    @('vae',              'wan2.2_vae.safetensors',           "$HF/QuantStack/Wan2.2-TI2V-5B-GGUF/resolve/main/VAE/Wan2.2_VAE.safetensors"),
    # Quality realism: Qwen-Image 2512 (Apache 2.0), uses the same encoder + VAE as the editor
    @('diffusion_models', 'qwen-image-2512-Q4_K_M.gguf',      "$HF/unsloth/Qwen-Image-2512-GGUF/resolve/main/qwen-image-2512-Q4_K_M.gguf"),
    # Realistic (since 2026-11-15): Qwen-Image 2.1 (7B, Qwen Research License: non-commercial, no content
    # rules) + its Qwen3-VL-8B text encoder + its own VAE. Q8_0 keeps it close to full quality.
    @('diffusion_models', 'qwen-image-2.1-Q8_0.gguf',         "$HF/unsloth/Qwen-Image-2.1-GGUF/resolve/main/qwen-image-2.1-Q8_0.gguf"),
    @('text_encoders',    'Qwen3-VL-8B-Instruct-Q8_0.gguf',   "$HF/unsloth/Qwen3-VL-8B-Instruct-GGUF/resolve/main/Qwen3-VL-8B-Instruct-Q8_0.gguf"),
    @('vae',              'qwen_image_2.1_vae_bf16.safetensors', "$HF/Comfy-Org/Qwen-Image-2.1/resolve/main/vae/qwen_image_2.1_vae_bf16.safetensors"),
    # Edit (since 2026-11-17): Qwen3-VL-8B's vision projector lets Qwen-Image 2.1 take the source image as a reference.
    @('text_encoders',    'Qwen3-VL-8B-mmproj-F16.gguf',      "$HF/unsloth/Qwen3-VL-8B-Instruct-GGUF/resolve/main/mmproj-F16.gguf")
)

function Log($m) { Add-Content -Path $Log -Value "$(Get-Date -Format 'HH:mm:ss') $m" }
New-Item -ItemType Directory -Force -Path (Split-Path $Log) | Out-Null
Log '=== download run started ==='
foreach ($f in $Files) {
    $folder = Join-Path $Dir $f[0]; New-Item -ItemType Directory -Force -Path $folder | Out-Null
    $dest = Join-Path $folder $f[1]
    if (Test-Path "$dest.done") { Log "skip $($f[1]) (done)"; continue }
    Log "get  $($f[1])"
    # Hugging Face's CDN sometimes stalls or slows a single long connection to a crawl. Abort any
    # connection slower than 2 MB/s for 30 s and resume on a fresh one (curl exit 28 = too slow).
    for ($try = 1; $try -le 300; $try++) {
        & curl.exe -L --fail --speed-limit 2000000 --speed-time 30 -C - -s -S -o "$dest" $f[2] 2>&1 | ForEach-Object { Log "     $_" }
        if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 22) { break }
        Start-Sleep -Seconds 2
    }
    if ($LASTEXITCODE -eq 0) { New-Item -ItemType File -Force "$dest.done" | Out-Null; Log "ok   $($f[1]) $([math]::Round((Get-Item $dest).Length / 1GB, 2)) GB" }
    else { Log "FAIL $($f[1]) (curl exit $LASTEXITCODE)" }
}
Log '=== download run finished ==='
