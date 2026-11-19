# C:\AI\gateway.ps1 - always-on front door for Lumen Studio (images, edits, upscales, video, voice, music).
# Video is an experimental placeholder.
#
# Listens on port 1240 and only answers requests from this PC (tailscale serve and the laptop's
# SSH tunnel both arrive from 127.0.0.1). It:
#   - serves the studio page from C:\AI\web
#   - passes /sdcpp/*, /v1/*, /sdapi/* through to sd-server (127.0.0.1:1234)
#   - switches the GPU between engines (mode.ps1) and the image engine between model profiles
#   - runs slow work (upscale, voice, music) as background tasks the page polls
#   - saves everything to the Studio folder (C:\Lumen\Studio; + thumbnails/posters and a line in gallery.jsonl)
# Runs at boot as the scheduled task "Lumen Gateway". Log: C:\AI\logs\gateway.log
#
# Page-facing API (all JSON):
#   GET  /gw/status                      engine, profile, readiness, switching progress
#   POST /gw/use      {engine, profile, force}   switch engine/profile (async; watch /gw/status)
#   GET  /gw/gallery                     archive, newest first
#   GET  /gw/file/<path>                 archive file (supports Range for video/audio)
#   POST /gw/delete   {ids}              move to <Studio>\.trash
#   POST /gw/upscale  {id, repeats}      -> {task}
#   POST /gw/voice/tts {text, voice, temperature} -> {task}
#   GET  /gw/voice/voices, POST /gw/voice/voices {name, wav}, POST /gw/voice/delete {name}
#   POST /gw/music    {prompt, lyrics, duration, instrumental, auto_lyrics, seed} -> {task}
#   GET  /gw/task/<id>                   {status: running|done|failed, stage, elapsed, entry, error}
#   GET  /gw/chats, GET /gw/chats/<id>, POST /gw/chats/save {id, ...}, POST /gw/chats/delete {ids}
#   GET  /gw/code/projects, POST /gw/code/new {name}      Lumen Code thread folders ($CodeRoot, paths.json)
#   GET  /gw/code/models, POST /gw/code/model {gguf}     coding model (C:\AI\config\code-model.json; next Code load)
#   POST /gw/code/upload?project=<name>&path=<relative>    raw body streamed into the project (<= 2 GB)
#   POST /gw/code/import {url, name}  -> {task}            public GitHub repo (zip) into a new project
#   GET  /gw/code/tree|raw|zip|all, POST /gw/code/delete   Artifacts / Preview / Settings (gw\code.ps1)
#   GET  /gw/energy                     electricity: power now, rate, cost today/week/month/all time
#   GET  /gw/energy/details?range=today|week|month|all   cost per Studio item, per Chat thread, other
#   POST /gw/energy/rate {supply_c, delivery_c}           cents per kWh (C:\AI\config\electricity.json)
#   *    /llm/*                          streamed straight through to llama-server (127.0.0.1:8099),
#                                        on a background runspace so a long answer never blocks the gateway
# Header X-Lumen-Meta (JSON) on /sdcpp/v1/img_gen|vid_gen: {model, mode, parent} stored with the result.
# Header X-Lumen-Chat (chat id) on /llm/* lets the cost tracker charge that answer to its Chat thread.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Root   = 'C:\AI'
$Web    = "$Root\web"
. "$Root\llm-config.ps1"   # Chat / Code models (C:\AI\config\chat-model.json, code-model.json) + Get-LumenPaths
$LumenPaths = Get-LumenPaths   # C:\AI\config\paths.json: where Code, Studio and Chats live
$LumenCfg = Get-LumenCfg       # C:\AI\config\lumen.json: your public tailnet name etc. (see config\lumen.example.json)
$PublicHost = [string]$LumenCfg['publicHost']   # e.g. your-desktop.your-tailnet.ts.net
$OriginOk = '^https?://(' + $(if ($PublicHost) { [regex]::Escape($PublicHost) + '|' } else { '' }) + '127\.0\.0\.1|localhost)(:\d+)?$'
$Out    = $LumenPaths.studio
$Thumbs = "$Out\.thumbs"
$Trash  = "$Out\.trash"
$Index  = "$Out\gallery.jsonl"
$LogDir = "$Root\logs"
$Port   = 1240
$Sd     = 'http://127.0.0.1:1234'
$Voice  = 'http://127.0.0.1:8002'
$Music  = 'http://127.0.0.1:8001'
$Llm    = 'http://127.0.0.1:8099'
$Code   = 'http://127.0.0.1:4096'
$Chats  = $LumenPaths.chats
$CodeRoot = $LumenPaths.code
$UploadMax = 2GB   # per file, /gw/code/upload

# Image-engine model profiles: sd-server recipe + component files (relative to C:\AI\image-models).
# They come from C:\AI\config\models.json (copy desktop\config\models.example.json and edit it for the models you
# chose: docs/INSTALL-MODELS.md). The page gets its picker, labels and step ranges from the same file (the optional
# "ui" block) through /gw/ui.js; without a "ui" block they are built from the profiles.
$ModelsCfg = Get-ModelsCfg
$Profiles = $ModelsCfg.profiles

# What the page needs to know about your image models (served as /gw/ui.js). Built from the profiles, then overridden by
# the optional "ui" block of models.json. Profiles named 'edit' and 'video' are not offered in the image picker.
function Get-UiConfig {
    $labels = [ordered]@{}; $picker = New-Object System.Collections.Generic.List[object]; $steps = [ordered]@{}
    foreach ($k in $Profiles.Keys) {
        $labels[$k] = [string]$Profiles[$k].label
        if ($k -notin 'edit', 'video') { $picker.Add(@($k, $labels[$k], '')); $steps[$k] = @(4, 60, 20, '') }
    }
    $r = [ordered]@{ labels = $labels; picker = $picker; steps = $steps; alias = [ordered]@{}; sampler = [ordered]@{}; sizeMp = [ordered]@{}
                     engines = [ordered]@{}; defaultModel = ''; editProfile = ''; fallbackProfile = ''; preloadProfile = '' }
    $u = $ModelsCfg.ui
    if ($u) {
        foreach ($k in 'labels', 'steps', 'alias', 'sampler', 'sizeMp', 'engines') {
            if ($u.Contains($k) -and $u[$k]) { foreach ($kk in $u[$k].Keys) { $r[$k][$kk] = $u[$k][$kk] } }
        }
        if ($u.Contains('picker') -and $u['picker']) {
            # Windows PowerShell 5.1 unrolls a one-row array of arrays when it reads JSON: put the row back together.
            $rows = @($u['picker']); if ($rows.Count -and $rows[0] -isnot [array]) { $rows = , $rows }
            $picker.Clear(); foreach ($row in $rows) { $picker.Add(@($row)) }
        }
        foreach ($k in 'defaultModel', 'editProfile', 'fallbackProfile', 'preloadProfile') { if ($u.Contains($k) -and $u[$k]) { $r[$k] = [string]$u[$k] } }
    }
    $first = if ($picker.Count) { [string]$picker[0][0] } else { '' }
    if (-not $r.defaultModel) { $r.defaultModel = $first }
    if (-not $r.editProfile) { $r.editProfile = $first }
    if (-not $r.fallbackProfile) { $r.fallbackProfile = $first }
    if (-not $r.labels.Contains('edit') -and $r.labels.Contains($r.editProfile)) { $r.labels['edit'] = $r.labels[$r.editProfile] }
    return $r
}
$EngineTimeout = @{ image = 240; voice = 240; music = 600; llm = 300; code = 360 }   # seconds to become ready

foreach ($d in $Web, $Out, $Thumbs, $Trash, $LogDir, $Chats, "$Chats\.trash") { New-Item -ItemType Directory -Force -Path $d | Out-Null }
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.Web.Extensions
Add-Type -AssemblyName System.Web

$Utf8 = New-Object System.Text.UTF8Encoding($false)
$Json = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$Json.MaxJsonLength = [int]::MaxValue
$Json.RecursionLimit = 256

# .NET Framework allows only 2 connections per host by default, and a background call (upscale, model
# load) waiting behind proxied page requests can then hang forever. Also skip the 100-continue handshake.
[Net.ServicePointManager]::DefaultConnectionLimit = 64
[Net.ServicePointManager]::Expect100Continue = $false
$Http = New-Object System.Net.Http.HttpClient        # proxy + long background calls
$Http.Timeout = [TimeSpan]::FromMinutes(30)
$Http.DefaultRequestHeaders.ConnectionClose = $true  # fresh localhost connection per call; no stale keep-alives
$Page = New-Object System.Net.Http.HttpClient        # Proxy/Relay: the page is waiting and the main loop is blocked
$Page.Timeout = [TimeSpan]::FromSeconds(30)
$Quick = New-Object System.Net.Http.HttpClient       # readiness checks
$Quick.Timeout = [TimeSpan]::FromSeconds(2)

function Log($msg) {
    try { [IO.File]::AppendAllText("$LogDir\gateway.log", "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg`r`n", $Utf8) } catch {}
}
if ($ModelsCfg.error) { Log "models: $($ModelsCfg.error)" }
function NowMs { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
function NewId($prefix) { "$prefix" + '_' + [Guid]::NewGuid().ToString('N').Substring(0, 12) }
function JsonBody($obj) {
    $c = New-Object System.Net.Http.StringContent($Json.Serialize($obj), $Utf8, 'application/json')
    return $c
}

# ---------------- gallery ----------------
$Gallery = New-Object System.Collections.Generic.List[object]
if (Test-Path $Index) {
    foreach ($line in [IO.File]::ReadAllLines($Index, $Utf8)) {
        if ($line.Trim()) { try { $Gallery.Add($Json.DeserializeObject($line)) } catch {} }
    }
}
$Pending = @{}   # sd-server job id -> @{ submitted; request; meta; kind; preview }
$Saved = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($g in $Gallery) { if ($g['job']) { [void]$Saved.Add([string]$g['job']) } }
$Tasks = @{}     # gateway task id -> hashtable (see New-Task)

function Rewrite-Index {
    $lines = foreach ($g in $Gallery) { $Json.Serialize($g) }
    [IO.File]::WriteAllLines("$Index.tmp", [string[]]@($lines), $Utf8)
    Move-Item -Force "$Index.tmp" $Index
}
function Add-Entry($entry) {
    $Gallery.Add($entry)
    [IO.File]::AppendAllText($Index, $Json.Serialize($entry) + "`r`n", $Utf8)
    return $entry
}
function Find-Entry($id) { foreach ($g in $Gallery) { if ([string]$g['id'] -eq [string]$id) { return $g } }; return $null }

# Writes bytes into outputs/<yyyy-MM>/<stamp>-<tag>.<ext>; returns the relative path.
function Save-Bytes([byte[]]$bytes, $tag, $ext) {
    $month = Get-Date -Format 'yyyy-MM'
    New-Item -ItemType Directory -Force -Path "$Out\$month", "$Thumbs\$month" | Out-Null
    $name = "$(Get-Date -Format 'yyyyMMdd-HHmmss')-$($tag -replace '[^A-Za-z0-9_-]', '').$ext"
    [IO.File]::WriteAllBytes("$Out\$month\$name", $bytes)
    return "$month/$name"
}

# JPEG thumbnail (long edge 640) from image bytes; returns the relative path or $null.
function Make-Thumb([byte[]]$bytes, $rel) {
    try {
        $ms = New-Object IO.MemoryStream(, $bytes)
        $img = [Drawing.Image]::FromStream($ms)
        try {
            $scale = [Math]::Min(1.0, 640.0 / [Math]::Max($img.Width, $img.Height))
            $w = [int][Math]::Max(1, $img.Width * $scale); $h = [int][Math]::Max(1, $img.Height * $scale)
            $bmp = New-Object Drawing.Bitmap($w, $h)
            $gfx = [Drawing.Graphics]::FromImage($bmp)
            $gfx.InterpolationMode = 'HighQualityBicubic'; $gfx.SmoothingMode = 'HighQuality'; $gfx.PixelOffsetMode = 'HighQuality'
            $gfx.DrawImage($img, 0, 0, $w, $h)
            $enc = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
            $p = New-Object Drawing.Imaging.EncoderParameters(1)
            $p.Param[0] = New-Object Drawing.Imaging.EncoderParameter([Drawing.Imaging.Encoder]::Quality, [long]84)
            $thumbRel = ".thumbs/$rel.jpg"
            New-Item -ItemType Directory -Force -Path (Split-Path "$Out\$($thumbRel -replace '/', '\')") | Out-Null
            $bmp.Save("$Out\$($thumbRel -replace '/', '\')", $enc, $p)
            $gfx.Dispose(); $bmp.Dispose()
            return $thumbRel
        } finally { $img.Dispose(); $ms.Dispose() }
    } catch { Log "thumb failed: $_"; return $null }
}

function Meta-Value($meta, $key, $fallback) {
    if ($meta -and $meta[$key]) { return $meta[$key] }
    return $fallback
}

# Save the result of a finished sd-server job (img_gen or vid_gen), once.
function Save-Job($job) {
    $id = [string]$job['id']
    $p = if ($Pending.ContainsKey($id)) { $Pending[$id] } else { @{ request = @{}; meta = @{} } }
    $Pending.Remove($id)
    if ($Saved.Contains($id)) { return }
    [void]$Saved.Add($id)
    $result = $job['result']
    if (-not $result) { return }
    $req = $p['request']; $meta = $p['meta']
    $dur = 0; try { $dur = [long]$job['completed'] - [long]$job['started'] } catch {}
    $short = ($id -replace '^job_', '') -replace '[^A-Za-z0-9_]', ''
    $sp = $req['sample_params']; if (-not $sp) { $sp = @{} }

    if ([string]$job['kind'] -eq 'vid_gen') {
        try {
            $fmt = [string]$result['output_format']; if (-not $fmt) { $fmt = 'webm' }
            $bytes = [Convert]::FromBase64String([string]$result['b64_json'])
            $rel = Save-Bytes $bytes $short $fmt
            $poster = $null
            if ($p['preview']) { $poster = Make-Thumb ([Convert]::FromBase64String($p['preview'])) $rel }
            $fps = [double]$result['fps']; $frames = [int]$result['frame_count']
            $entry = [ordered]@{
                id = "$id-0"; job = $id; kind = 'video'; file = $rel; thumb = $poster
                mime = [string]$result['mime_type']; prompt = [string]$req['prompt']
                width = [int]$req['width']; height = [int]$req['height']; seed = [string]$req['seed']
                steps = [int]$sp['sample_steps']; fps = $fps; frames = $frames
                duration = $(if ($fps -gt 0) { [Math]::Round($frames / $fps, 2) } else { 0 })
                model = (Meta-Value $meta 'model' 'Wan 2.2 5B'); parent = (Meta-Value $meta 'parent' $null)
                format = $fmt; bytes = $bytes.Length; ms = $dur; created = NowMs
            }
            [void](Add-Entry $entry)
        } catch { Log "video save failed for ${id}: $_" }
        Energy-Close "job:$id" 'done' @("$id-0")
        Log "saved video $id"; return
    }

    if (-not $result['images']) { return }
    $fmt = [string]$result['output_format']; if (-not $fmt) { $fmt = 'png' }
    $ext = @{ png = 'png'; jpeg = 'jpg'; webp = 'webp' }[$fmt]; if (-not $ext) { $ext = 'png' }
    foreach ($im in $result['images']) {
        try {
            $idx = [int]$im['index']
            $bytes = [Convert]::FromBase64String([string]$im['b64_json'])
            $rel = Save-Bytes $bytes "$short-$idx" $ext
            $thumb = if ($ext -ne 'webp') { Make-Thumb $bytes $rel } else { $null }
            $info = $im['generation_info']; if (-not $info) { $info = @{} }
            $isp = $info['sample_params']; if (-not $isp) { $isp = @{} }
            $entry = [ordered]@{
                id = "$id-$idx"; job = $id; kind = 'image'; file = $rel; thumb = $(if ($thumb) { $thumb } else { $rel })
                prompt = $(if ($info['prompt']) { [string]$info['prompt'] } else { [string]$req['prompt'] })
                width = $(if ($info['width']) { [int]$info['width'] } else { [int]$req['width'] })
                height = $(if ($info['height']) { [int]$info['height'] } else { [int]$req['height'] })
                seed = [string]$info['seed']
                steps = $(if ($isp['sample_steps']) { [int]$isp['sample_steps'] } else { [int]$sp['sample_steps'] })
                sampler = [string]$isp['sample_method']
                model = (Meta-Value $meta 'model' $(if ($info['models']) { [string]$info['models']['diffusion_model'] } else { '' }))
                mode = (Meta-Value $meta 'mode' 'create'); parent = (Meta-Value $meta 'parent' $null)
                format = $fmt; bytes = $bytes.Length; ms = $dur; created = NowMs
            }
            [void](Add-Entry $entry)
        } catch { Log "save failed for ${id}: $_" }
    }
    $made = New-Object System.Collections.Generic.List[string]
    foreach ($im in $result['images']) { $eid = "$id-$([int]$im['index'])"; if (Find-Entry $eid) { $made.Add($eid) } }
    Energy-Close "job:$id" 'done' $made.ToArray()
    Log "saved $id ($($result['images'].Count) image(s))"
}

# Check jobs submitted through us, so results are saved even if the page was closed mid-run.
function Poll-Pending {
    foreach ($id in @($Pending.Keys)) {
        try {
            $r = $Quick.GetAsync("$Sd/sdcpp/v1/jobs/$id").Result
            if ([int]$r.StatusCode -eq 404) { $Pending.Remove($id); continue }
            $job = $Json.DeserializeObject($r.Content.ReadAsStringAsync().Result)
            Note-Preview $id $job
            $Pending[$id]['status'] = [string]$job['status']; $Pending[$id]['seen'] = NowMs
            switch ([string]$job['status']) {
                'completed' { Save-Job $job }
                { $_ -in 'failed', 'cancelled' } { $Pending.Remove($id); Energy-Close "job:$id" ([string]$job['status']) $null }
            }
        } catch {
            if ((NowMs) - $Pending[$id]['submitted'] -gt 3600000) { $Pending.Remove($id); Energy-Close "job:$id" 'lost' $null }
        }
    }
}
# Keep the latest preview frame of a video job: it becomes the archive poster.
function Note-Preview($id, $job) {
    if ($Pending.ContainsKey($id) -and $job['preview'] -and $job['preview']['b64_json']) {
        $Pending[$id]['preview'] = [string]$job['preview']['b64_json']
    }
}

# ---------------- engines ----------------
$EngineCache = @{ at = [DateTime]::MinValue; value = $null }
function Engine-Running {
    if (((Get-Date) - $EngineCache.at).TotalSeconds -lt 1.5 -and $EngineCache.value) { return $EngineCache.value }
    $py = @(Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='uv.exe'" -ErrorAction SilentlyContinue)
    $v = [ordered]@{
        llm   = [bool](Get-Process llama-server -ErrorAction SilentlyContinue)
        image = [bool](Get-Process sd-server -ErrorAction SilentlyContinue)
        voice = [bool]($py | Where-Object { $_.ExecutablePath -like "$Root\audio\voice\*" -or $_.CommandLine -like '*voice_server.py*' })
        music = [bool]($py | Where-Object { $_.ExecutablePath -like "$Root\audio\ace-step\*" -or $_.CommandLine -like '*acestep-api*' })
        code  = [bool](Get-Process opencode -ErrorAction SilentlyContinue)
    }
    $EngineCache.at = Get-Date; $EngineCache.value = $v
    return $v
}
function Ping($url) {
    try { $r = $Quick.GetAsync($url).Result; return [int]$r.StatusCode } catch { return 0 }
}
$ReadyCache = @{}   # engine -> @{ at; value }: many open tabs poll /gw/status, and each ping can take up to 2 s
function Engine-Ready($engine) {
    $c = $ReadyCache[$engine]
    if ($c -and ((Get-Date) - $c.at).TotalSeconds -lt 2) { return $c.value }
    $v = Engine-ReadyNow $engine
    $ReadyCache[$engine] = @{ at = Get-Date; value = $v }
    return $v
}
function Engine-ReadyNow($engine) {
    switch ($engine) {
        'image' { return (Ping "$Sd/v1/models") -eq 200 }
        'voice' { return (Ping "$Voice/health") -eq 200 }
        'music' { $c = Ping "$Music/health"; return ($c -ge 200 -and $c -lt 500) }
        'llm'   { return (Ping "$Llm/health") -eq 200 }
        'code'  { return ((Ping "$Llm/health") -eq 200) -and ((Ping "$Code/") -gt 0) }   # 401 = up, behind its password
    }
    return $false
}
function Image-Profile {
    try {
        $r = $Quick.GetAsync("$Sd/sdcpp/v1/models/status").Result
        $s = $Json.DeserializeObject($r.Content.ReadAsStringAsync().Result)
        if ([string]$s['state'] -eq 'loading') { return 'loading' }
        if ($s['origin'] -eq 'command_line') { return 'turbo' }
        foreach ($k in $Profiles.Keys) { if ($Profiles[$k].recipe -eq [string]$s['recipe']) { return $k } }
        if ([string]$s['state'] -eq 'empty') { return 'none' }
        return [string]$s['recipe']
    } catch { return $null }
}

# Chat / Code model names for the page (config files re-read at most every 5 s).
$ModelCache = @{ at = [DateTime]::MinValue; value = $null }
function Model-Names {
    if (((Get-Date) - $ModelCache.at).TotalSeconds -lt 5 -and $ModelCache.value) { return $ModelCache.value }
    $ch = Get-LlmCfg 'chat'; $co = Get-LlmCfg 'code'
    $ModelCache.value = @{ chat = [string]$ch.name; code = [string]$co.name; same = [bool]((Get-LlmSig $ch) -eq (Get-LlmSig $co)) }
    $ModelCache.at = Get-Date
    return $ModelCache.value
}

# What's on disk (download .done markers). Only changes after a download, so re-checked at most every 30 s.
$InstalledCache = @{ at = [DateTime]::MinValue; value = $null }
function Installed {
    if (((Get-Date) - $InstalledCache.at).TotalSeconds -lt 30 -and $InstalledCache.value) { return $InstalledCache.value }
    $v = @{}
    foreach ($k in $Profiles.Keys) {
        $ok = $true
        foreach ($f in $Profiles[$k].models.Values) { if (-not (Test-Path "$Root\image-models\$($f -replace '/', '\').done")) { $ok = $false; break } }
        $v[$k] = [bool]$ok
    }
    $v['edit'] = [bool]$v['real']   # Edit runs on the 'real' profile since 2026-11-17
    $v['upscale'] = [bool](Test-Path "$Root\image-models\upscale_models\RealESRGAN_x4plus.pth.done")
    $v['voice'] = [bool](Test-Path "$Root\audio\voice\.venv\Scripts\python.exe")
    $v['music'] = [bool](Test-Path "$Root\audio\ace-step\.venv")
    $v['code'] = [bool](Test-Path "$Root\tools\opencode\opencode.exe")
    $InstalledCache.value = $v; $InstalledCache.at = Get-Date
    return $v
}

$Switch = $null   # @{ engine; profile; stage; started; proc; task; outFile; error; retryAt }
function Status {
    $run = Engine-Running
    $engine = 'off'
    foreach ($e in 'image', 'voice', 'music', 'llm') { if ($run[$e]) { $engine = $e; break } }
    # llama-server serves Chat or Code: the role mode.ps1 (or an instant hand-off) last gave it.
    $lst = if ($engine -eq 'llm') { Get-LlmState } else { $null }
    if ($lst -and $lst['role'] -eq 'code') { $engine = 'code' }
    $ready = if ($engine -ne 'off') { Engine-Ready $engine } else { $false }
    $models = Model-Names
    $profile = if ($engine -eq 'image' -and $ready) { Image-Profile } else { $null }
    $sw = $null
    if ($script:Switch) {
        $sw = [ordered]@{ engine = $script:Switch.engine; profile = $script:Switch.profile; stage = $script:Switch.stage
                          elapsed = [int](((Get-Date) - $script:Switch.started).TotalSeconds); error = $script:Switch.error }
    }
    return [ordered]@{
        engine = $engine; ready = $ready; profile = $profile
        profile_label = $(if ($profile -and $Profiles.Contains($profile)) { $Profiles[$profile].label } else { $null })
        image = $(if ($engine -eq 'image') { if ($ready) { 'ready' } else { 'starting' } } else { 'off' })
        llm = [bool]$run['llm']; code = [bool]($run['code'] -and $run['llm'] -and (Ping "$Code/") -gt 0)
        chat_model = $models.chat; code_model = $models.code; same_model = $models.same
        busy = [int]($Pending.Count + @($Tasks.Values | Where-Object { $_.status -eq 'running' -and $_.kind -ne 'import' }).Count)   # imports use no GPU
        switching = $sw; pending = $Pending.Count; tasks = $Tasks.Count; saved = $Gallery.Count; cost = (Energy-Brief)
        installed = (Installed)
    }
}

function Start-Switch($engine, $profile) {
    $outFile = Join-Path $env:TEMP "lumen-mode-$engine.txt"
    $proc = Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -PassThru -RedirectStandardOutput $outFile `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "$Root\mode.ps1", $engine)
    $script:Switch = @{ engine = $engine; profile = $profile; stage = 'engine'; started = Get-Date; proc = $proc
                        outFile = $outFile; task = $null; error = $null; retryAt = [DateTime]::MinValue }
    $EngineCache.at = [DateTime]::MinValue; $ReadyCache.Clear()
    Log "switch -> $engine $profile"
}
function Start-ProfileLoad {
    $prof = $Profiles[$script:Switch.profile]
    $models = [ordered]@{}
    foreach ($k in $prof.models.Keys) { $models[$k] = $prof.models[$k] }
    $script:Switch.task = $Http.PostAsync("$Sd/sdcpp/v1/models/load", (JsonBody @{ recipe = $prof.recipe; models = $models }))
    $script:Switch.stage = 'load'; $script:Switch.loadAt = Get-Date
}
function Tick-Switch {
    # Note: inside a switch statement $switch is PowerShell's automatic enumerator (names are
    # case-insensitive), so the script's $Switch state must not be referenced by that name in here.
    $cur = $script:Switch
    if (-not $cur -or $cur.stage -in 'done', 'error') {
        if ($cur -and ((Get-Date) - $cur.started).TotalSeconds -gt 600) { $script:Switch = $null }
        return
    }
    $age = ((Get-Date) - $cur.started).TotalSeconds
    switch ($cur.stage) {
        'engine' {
            if (-not $cur.proc.HasExited) { return }
            $txt = (Get-Content $cur.outFile -ErrorAction SilentlyContinue | Out-String).Trim()
            if ($txt -notmatch '(?m)^ok') { $cur.stage = 'error'; $cur.error = $(if ($txt) { $txt -replace '^error:\s*', '' } else { 'could not start the engine' }); Log "switch failed: $txt"; return }
            $cur.stage = 'wait'; $EngineCache.at = [DateTime]::MinValue
        }
        'wait' {
            if (Engine-Ready $cur.engine) {
                if ($cur.engine -eq 'image' -and $cur.profile -and (Image-Profile) -ne $cur.profile) { Start-ProfileLoad }
                else { $cur.stage = 'done'; Log "switch done: $($cur.engine) $($cur.profile) in $([int]$age)s" }
            } elseif ($age -gt $EngineTimeout[$cur.engine]) {
                $cur.stage = 'error'; $cur.error = "the $($cur.engine) engine did not start in time (see C:\AI\logs)"
            }
        }
        'load' {
            if ($cur.task -and -not $cur.task.IsCompleted) {
                # models/load answers in seconds (weights load lazily on the first job) but waits for a running
                # job to finish. With nothing running, don't wait forever.
                if ($Pending.Count -gt 0) { $cur.loadAt = Get-Date }
                if ($cur.loadAt -and ((Get-Date) - $cur.loadAt).TotalSeconds -gt 120) {
                    $cur.stage = 'error'; $cur.error = 'the image engine did not answer the model switch; try again'
                    Log "profile load timed out: $($cur.profile)"
                }
                return
            }
            if ((Get-Date) -lt $cur.retryAt) { return }
            if (-not $cur.task) { Start-ProfileLoad; return }
            try {
                $r = $cur.task.Result
                $code = [int]$r.StatusCode
                if ($code -eq 200) { $cur.stage = 'done'; Log "profile $($cur.profile) loaded in $([int]$age)s"; return }
                $body = $r.Content.ReadAsStringAsync().Result
                if ($code -eq 409 -and $age -lt 900) { $cur.task = $null; $cur.retryAt = (Get-Date).AddSeconds(3); return }  # jobs still running
                $msg = try { ($Json.DeserializeObject($body))['error'] } catch { $body }
                $cur.stage = 'error'; $cur.error = "model load failed: $msg"; Log "profile load failed ($code): $body"
            } catch { $cur.stage = 'error'; $cur.error = "model load failed: $($_.Exception.InnerException.Message)" }
        }
    }
}

# ---------------- background tasks (upscale, voice, music) ----------------
function New-Task($kind, $extra) {
    $t = @{ id = (NewId $kind); kind = $kind; status = 'running'; stage = 'starting'; started = Get-Date
            http = $null; entry = $null; error = $null; nextPoll = [DateTime]::MinValue }
    foreach ($k in $extra.Keys) { $t[$k] = $extra[$k] }
    $Tasks[$t.id] = $t
    return $t
}
function Fail-Task($t, $msg) { $t.status = 'failed'; $t.error = [string]$msg; $t.finished = Get-Date; Log "task $($t.id) failed: $msg"; Energy-Close "task:$($t.id)" 'failed' $null }
function Done-Task($t, $entry) {
    $t.status = 'done'; $t.entry = $entry; $t.finished = Get-Date; Log "task $($t.id) done"
    if ($t.kind -ne 'import' -and $entry -and $entry['id']) { Energy-Close "task:$($t.id)" 'done' @([string]$entry['id']) }
}
function Http-Error($r) {
    $body = $r.Content.ReadAsStringAsync().Result
    try { $d = $Json.DeserializeObject($body); if ($d['error']) { return [string]$d['error'] } } catch {}
    return "HTTP $([int]$r.StatusCode) $body"
}

function Tick-Tasks {
    foreach ($id in @($Tasks.Keys)) {
        $t = $Tasks[$id]
        if ($t.status -ne 'running') {
            if (((Get-Date) - $t.finished).TotalMinutes -gt 30) { $Tasks.Remove($id) }
            continue
        }
        try {
            switch ($t.kind) {
                'upscale' { Tick-Upscale $t }
                'voice'   { Tick-Voice $t }
                'music'   { Tick-Music $t }
                'import'  { Tick-Import $t }
            }
        } catch { Fail-Task $t "$($_.Exception.Message)" }
    }
}

function Tick-Upscale($t) {
    if (-not $t.http.IsCompleted) { return }
    $r = $t.http.Result
    if (-not $r.IsSuccessStatusCode) { Fail-Task $t (Http-Error $r); return }
    $d = $Json.DeserializeObject($r.Content.ReadAsStringAsync().Result)
    $bytes = [Convert]::FromBase64String([string]$d['images'][0]['b64_json'])
    $src = $t.source
    $rel = Save-Bytes $bytes "up-$($d['scale'] * $d['repeats'])x" 'png'
    $entry = [ordered]@{
        id = (NewId 'up'); job = $null; kind = 'image'; file = $rel; thumb = (Make-Thumb $bytes $rel)
        prompt = [string]$src['prompt']; width = [int]$d['width']; height = [int]$d['height']; seed = [string]$src['seed']
        steps = $src['steps']; model = "Real-ESRGAN $([int]$d['scale'] * [int]$d['repeats'])x"; mode = 'upscale'
        parent = [string]$src['id']; format = 'png'; bytes = $bytes.Length
        ms = [int](((Get-Date) - $t.started).TotalMilliseconds); created = NowMs
    }
    Done-Task $t (Add-Entry $entry)
}

function Tick-Voice($t) {
    if (-not $t.http.IsCompleted) { return }
    $r = $t.http.Result
    if (-not $r.IsSuccessStatusCode) { Fail-Task $t (Http-Error $r); return }
    $d = $Json.DeserializeObject($r.Content.ReadAsStringAsync().Result)
    $bytes = [Convert]::FromBase64String([string]$d['wav'])
    $rel = Save-Bytes $bytes 'voice' 'wav'
    $entry = [ordered]@{
        id = (NewId 'voice'); kind = 'voice'; file = $rel; mime = 'audio/wav'; prompt = [string]$t.text
        voice = $(if ($t.voice) { [string]$t.voice } else { 'Default' }); duration = [double]$d['seconds']
        model = 'Chatterbox Turbo'; format = 'wav'; bytes = $bytes.Length; ms = [int]$d['ms']; created = NowMs
    }
    Done-Task $t (Add-Entry $entry)
}

function Tick-Music($t) {
    if ($t.http -and -not $t.http.IsCompleted) { return }
    if ((Get-Date) -lt $t.nextPoll) { return }
    switch ($t.stage) {
        'writing' {    # create_sample answered: generate with the LM's caption, lyrics and metas
            $r = $t.http.Result
            if (-not $r.IsSuccessStatusCode) { Fail-Task $t "could not write lyrics: $(Http-Error $r)"; return }
            $d = $Json.DeserializeObject($r.Content.ReadAsStringAsync().Result)
            $s = $d['data']
            if (-not $s -or -not $s['lyrics']) { Fail-Task $t "could not write lyrics: $($d['error'])"; return }
            $body = $t.body
            if ($s['caption']) { $body['prompt'] = [string]$s['caption'] }
            $body['lyrics'] = [string]$s['lyrics']; $t.lyrics = $body['lyrics']
            if ($s['bpm']) { $body['bpm'] = [int]$s['bpm'] }
            if ($s['keyscale']) { $body['key_scale'] = [string]$s['keyscale'] }
            if ($s['timesignature']) { $body['time_signature'] = [string]$s['timesignature'] }
            $t.stage = 'starting'
            $t.http = $Http.PostAsync("$Music/release_task", (JsonBody $body))
        }
        'starting' {   # release_task answered
            $r = $t.http.Result
            if (-not $r.IsSuccessStatusCode) { Fail-Task $t (Http-Error $r); return }
            $d = $Json.DeserializeObject($r.Content.ReadAsStringAsync().Result)
            $t.aceId = [string]$d['data']['task_id']
            if (-not $t.aceId) { Fail-Task $t "ACE-Step did not return a task id: $($d['error'])"; return }
            $t.stage = 'composing'; $t.http = $null
        }
        'composing' {
            if (-not $t.http) {
                $t.http = $Http.PostAsync("$Music/query_result", (JsonBody @{ task_id_list = @($t.aceId) })); return
            }
            $r = $t.http.Result; $t.http = $null; $t.nextPoll = (Get-Date).AddSeconds(2)
            if (-not $r.IsSuccessStatusCode) { return }   # transient; poll again
            $d = $Json.DeserializeObject($r.Content.ReadAsStringAsync().Result)
            $item = @($d['data'])[0]
            if (-not $item) { return }
            if ([int]$item['status'] -eq 2) { Fail-Task $t "music generation failed: $($item['result'])"; return }
            if ([int]$item['status'] -ne 1) { if ($item['progress_text']) { $t.progress = [string]$item['progress_text'] }; return }
            $res = $item['result']; if ($res -is [string]) { $res = $Json.DeserializeObject($res) }
            $first = @($res)[0]
            $t.result = $first
            $t.audioUrl = [string]$first['file']
            if (-not $t.audioUrl) { Fail-Task $t 'ACE-Step finished but saved no audio file (see C:\AI\logs\music-server.log)'; return }
            $t.stage = 'downloading'
            $t.http = $Http.GetAsync("$Music$($t.audioUrl)")
        }
        'downloading' {
            $r = $t.http.Result
            if (-not $r.IsSuccessStatusCode) { Fail-Task $t "could not fetch the song: HTTP $([int]$r.StatusCode)"; return }
            $bytes = $r.Content.ReadAsByteArrayAsync().Result
            $ext = 'mp3'; if ($t.audioUrl -match '\.(\w{3,4})(?:$|&)') { $ext = $Matches[1].ToLower() }
            $rel = Save-Bytes $bytes 'song' $ext
            $res = $t.result; $metas = $res['metas']; if (-not $metas) { $metas = @{} }
            $entry = [ordered]@{
                id = (NewId 'song'); kind = 'music'; file = $rel; mime = $(if ($ext -eq 'mp3') { 'audio/mpeg' } else { "audio/$ext" })
                prompt = [string]$t.prompt; caption = [string]$res['prompt']
                lyrics = $(if ($res['lyrics']) { [string]$res['lyrics'] } else { [string]$t.lyrics })
                duration = $(if ($metas['duration']) { [double]$metas['duration'] } else { [double]$t.duration })
                bpm = $metas['bpm']; key = [string]$metas['keyscale']; seed = [string]$res['seed_value']
                model = 'ACE-Step 1.5'; format = $ext; bytes = $bytes.Length
                ms = [int](((Get-Date) - $t.started).TotalMilliseconds); created = NowMs
            }
            Done-Task $t (Add-Entry $entry)
        }
    }
}

# ---------------- icons (drawn once) ----------------
function Make-Icon($size, $path) {
    $bmp = New-Object Drawing.Bitmap($size, $size)
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.Clear([Drawing.Color]::FromArgb(255, 9, 9, 14))
    $rect = New-Object Drawing.RectangleF(0, 0, $size, $size)
    $path1 = New-Object Drawing.Drawing2D.GraphicsPath
    $path1.AddEllipse([float]($size * -0.15), [float]($size * -0.1), [float]($size * 1.0), [float]($size * 0.95))
    $glow = New-Object Drawing.Drawing2D.PathGradientBrush($path1)
    $glow.CenterColor = [Drawing.Color]::FromArgb(230, 255, 140, 90)
    $glow.SurroundColors = @([Drawing.Color]::FromArgb(0, 120, 70, 240))
    $g.FillRectangle($glow, $rect)
    $path2 = New-Object Drawing.Drawing2D.GraphicsPath
    $path2.AddEllipse([float]($size * 0.25), [float]($size * 0.3), [float]($size * 0.95), [float]($size * 0.9))
    $glow2 = New-Object Drawing.Drawing2D.PathGradientBrush($path2)
    $glow2.CenterColor = [Drawing.Color]::FromArgb(200, 139, 92, 246)
    $glow2.SurroundColors = @([Drawing.Color]::FromArgb(0, 139, 92, 246))
    $g.FillRectangle($glow2, $rect)
    $c = $size / 2.0; $r = $size * 0.30; $t = $size * 0.055
    $pts = @(
        (New-Object Drawing.PointF($c, ($c - $r))), (New-Object Drawing.PointF(($c + $t), ($c - $t))),
        (New-Object Drawing.PointF(($c + $r), $c)), (New-Object Drawing.PointF(($c + $t), ($c + $t))),
        (New-Object Drawing.PointF($c, ($c + $r))), (New-Object Drawing.PointF(($c - $t), ($c + $t))),
        (New-Object Drawing.PointF(($c - $r), $c)), (New-Object Drawing.PointF(($c - $t), ($c - $t))))
    $g.FillPolygon([Drawing.Brushes]::White, [Drawing.PointF[]]$pts)
    $bmp.Save($path, [Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}
foreach ($s in 180, 192, 512) {
    $f = if ($s -eq 180) { "$Web\apple-touch-icon.png" } else { "$Web\icon-$s.png" }
    if (-not (Test-Path $f)) { try { Make-Icon $s $f } catch { Log "icon failed: $_" } }
}

# ---------------- HTTP helpers ----------------
$Mime = @{ '.html' = 'text/html; charset=utf-8'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'
           '.webp' = 'image/webp'; '.webmanifest' = 'application/manifest+json'; '.json' = 'application/json'
           '.svg' = 'image/svg+xml'; '.js' = 'text/javascript'; '.css' = 'text/css'
           '.webm' = 'video/webm'; '.mp4' = 'video/mp4'; '.avi' = 'video/x-msvideo'
           '.mp3' = 'audio/mpeg'; '.wav' = 'audio/wav'; '.flac' = 'audio/flac'; '.ogg' = 'audio/ogg'; '.opus' = 'audio/ogg' }

function Send($ctx, [int]$code, [byte[]]$bytes, $type, $cache = 'no-store') {
    $res = $ctx.Response
    try {
        $res.StatusCode = $code
        if ($type) { $res.ContentType = $type }
        $res.Headers['Cache-Control'] = $cache
        $res.Headers['X-Content-Type-Options'] = 'nosniff'
        $res.ContentLength64 = $bytes.Length
        if ($bytes.Length) { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
    } catch {} finally { try { $res.Close() } catch {} }
}
function Send-Json($ctx, [int]$code, $obj) { Send $ctx $code ($Utf8.GetBytes($Json.Serialize($obj))) 'application/json; charset=utf-8' }
# Files, with byte ranges (iPhone Safari will not play video/audio without them) and ETags.
function Send-File($ctx, $path, $cache) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Send-Json $ctx 404 @{ error = 'not found' }; return }
    $ext = [IO.Path]::GetExtension($path).ToLower()
    $type = $Mime[$ext]; if (-not $type) { $type = 'application/octet-stream' }
    $res = $ctx.Response
    $fs = [IO.File]::Open($path, 'Open', 'Read', 'ReadWrite')
    try {
        $len = $fs.Length
        # ETag: file size + last write time (UTC ticks). Changes on every deploy, no hashing needed.
        $fw = [IO.File]::GetLastWriteTimeUtc($path).Ticks
        $etag = '"' + (($len -bxor $fw).ToString('x8') + '-' + $len.ToString('x8')) + '"'
        $res.Headers['ETag'] = $etag
        # Conditional request: answer 304 if the client already has this version.
        $ifNoneMatch = $ctx.Request.Headers['If-None-Match']
        if ($ifNoneMatch -and -not $ctx.Request.Headers['Range'] -and ($ifNoneMatch -split ',' | ForEach-Object { $_.Trim() }) -contains $etag) {
            $res.StatusCode = 304; $res.Headers['Cache-Control'] = $cache; $res.Close(); return
        }
        $start = 0; $end = $len - 1; $code = 200
        $range = $ctx.Request.Headers['Range']
        if ($range -match '^bytes=(\d*)-(\d*)$') {
            if ($Matches[1] -ne '') { $start = [long]$Matches[1]; if ($Matches[2] -ne '') { $end = [Math]::Min([long]$Matches[2], $len - 1) } }
            elseif ($Matches[2] -ne '') { $start = [Math]::Max(0, $len - [long]$Matches[2]) }
            if ($start -gt $end -or $start -ge $len) {
                $res.StatusCode = 416; $res.Headers['Content-Range'] = "bytes */$len"; $res.Close(); return
            }
            $code = 206; $res.Headers['Content-Range'] = "bytes $start-$end/$len"
        }
        $res.StatusCode = $code; $res.ContentType = $type
        $res.Headers['Accept-Ranges'] = 'bytes'; $res.Headers['Cache-Control'] = $cache
        $count = $end - $start + 1
        $res.ContentLength64 = $count
        if ($ctx.Request.HttpMethod -ne 'HEAD') {
            [void]$fs.Seek($start, 'Begin')
            $buf = New-Object byte[] 262144
            while ($count -gt 0) {
                $n = $fs.Read($buf, 0, [int][Math]::Min($buf.Length, $count))
                if ($n -le 0) { break }
                $res.OutputStream.Write($buf, 0, $n); $count -= $n
            }
        }
    } catch {} finally { $fs.Dispose(); try { $res.Close() } catch {} }
}
function Read-Body($ctx) {
    # The leading comma stops PowerShell from unrolling the byte array into the pipeline.
    if (-not $ctx.Request.HasEntityBody) { return , ([byte[]]@()) }
    $ms = New-Object IO.MemoryStream
    $ctx.Request.InputStream.CopyTo($ms)
    return , $ms.ToArray()
}
function Read-Json($ctx) {
    $b = Read-Body $ctx
    if ($b.Length -eq 0) { return @{} }
    return $Json.DeserializeObject($Utf8.GetString($b))
}
function Inside($base, $rel) {
    $full = [IO.Path]::GetFullPath((Join-Path $base ($rel -replace '/', '\')))
    if ($full.StartsWith($base + '\', [StringComparison]::OrdinalIgnoreCase)) { return $full }
    return $null
}

# Pass a request through to sd-server and return the response.
function Proxy($ctx, $pathAndQuery) {
    $req = $ctx.Request
    $body = Read-Body $ctx
    $msg = New-Object System.Net.Http.HttpRequestMessage((New-Object System.Net.Http.HttpMethod($req.HttpMethod)), "$Sd$pathAndQuery")
    if ($body.Length -gt 0 -or $req.HttpMethod -eq 'POST') {
        $msg.Content = New-Object System.Net.Http.ByteArrayContent(, $body)
        $ct = if ($req.ContentType) { $req.ContentType } else { 'application/json' }
        $msg.Content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse($ct)
    }
    # With sd-server down, .Result sometimes yields $null instead of throwing (seen in PS 5.1), so check both.
    $r = $null
    try { $r = $Page.SendAsync($msg).Result } catch {}
    if (-not $r) { Send-Json $ctx 503 @{ error = 'The image engine is not running.'; engine = 'off' }; return }
    $bytes = $r.Content.ReadAsByteArrayAsync().Result
    $type = if ($r.Content.Headers.ContentType) { $r.Content.Headers.ContentType.ToString() } else { 'application/json' }
    $code = [int]$r.StatusCode

    # Remember new jobs so we can save their results.
    if ($req.HttpMethod -eq 'POST' -and $pathAndQuery -match '^/sdcpp/v1/(img_gen|vid_gen)' -and $r.IsSuccessStatusCode) {
        $gen = $Matches[1]
        try {
            $job = $Json.DeserializeObject($Utf8.GetString($bytes))
            $request = @{}; try { $request = $Json.DeserializeObject($Utf8.GetString($body)) } catch {}
            $sp = $request['sample_params']
            $slim = @{ prompt = $request['prompt']; width = $request['width']; height = $request['height']; seed = $request['seed']
                       sample_params = @{ sample_steps = $(if ($sp) { $sp['sample_steps'] } else { $null }) } }
            $meta = @{}; try { if ($req.Headers['X-Lumen-Meta']) { $meta = $Json.DeserializeObject($req.Headers['X-Lumen-Meta']) } } catch {}
            $Pending[[string]$job['id']] = @{ submitted = NowMs; request = $slim; meta = $meta; preview = $null; gen = $gen; status = 'queued' }
        } catch { Log "could not track job: $_" }
    }
    # A job passing by: keep its preview; save it when finished, before the page asks for the gallery.
    if ($req.HttpMethod -eq 'GET' -and $pathAndQuery -match '^/sdcpp/v1/jobs/([^/?]+)$' -and $code -eq 200 -and $Pending.ContainsKey($Matches[1])) {
        try {
            $job = $Json.DeserializeObject($Utf8.GetString($bytes))
            Note-Preview ([string]$job['id']) $job
            if ([string]$job['status'] -eq 'completed') { Save-Job $job }
        } catch { Log "intercept save failed: $_" }
    }
    Send $ctx $code $bytes $type
}

# Forward to one of the audio engines and relay the JSON answer.
function Relay($ctx, $url, $method, $obj) {
    try {
        $r = if ($method -eq 'GET') { $Page.GetAsync($url).Result } else { $Page.PostAsync($url, (JsonBody $obj)).Result }
        Send $ctx ([int]$r.StatusCode) ($r.Content.ReadAsByteArrayAsync().Result) 'application/json; charset=utf-8'
    } catch { Send-Json $ctx 503 @{ error = 'The voice engine is not running.'; engine = 'off' } }
}

function Handle($ctx) {
    $req = $ctx.Request
    if (-not [Net.IPAddress]::IsLoopback($req.RemoteEndPoint.Address)) { Send-Json $ctx 403 @{ error = 'local only' }; return }
    $path = $req.Url.AbsolutePath
    $pq = $req.Url.PathAndQuery
    $m = $req.HttpMethod
    # Changes only from Lumen's own page: a page from elsewhere (or one the model wrote, previewed with an opaque
    # "null" origin) can't post to the gateway. Requests without an Origin (scripts, curl) are unaffected.
    if ($m -notin 'GET', 'HEAD', 'OPTIONS') {
        $o = $req.Headers['Origin']
        if ($o -and $o -notmatch $OriginOk) { Send-Json $ctx 403 @{ error = 'cross-origin request refused' }; return }
    }
    if ($path -like '/gw/code/*' -and ((Handle-CodeChats $ctx $m $path) -or (Handle-CodeFiles $ctx $m $path))) { return }

    if ($m -eq 'GET' -and ($path -eq '/' -or $path -eq '/index.html')) { Send-File $ctx "$Web\index.html" 'no-cache'; return }
    if ($m -eq 'GET' -and $path -in '/app.css', '/app.js') { Send-File $ctx "$Web$($path -replace '/', '\')" 'no-cache'; return }   # no-cache: a deploy is seen on the next load
    if ($m -eq 'GET' -and $path -match '^/(manifest\.webmanifest|apple-touch-icon\.png|icon-\d+\.png|favicon\.ico)$') {
        $f = if ($path -eq '/favicon.ico') { "$Web\icon-192.png" } else { "$Web$($path -replace '/', '\')" }
        Send-File $ctx $f 'public, max-age=86400'; return
    }
    if ($m -eq 'GET' -and $path -eq '/gw/ui.js') { Send $ctx 200 ($Utf8.GetBytes('window.LUMEN_UI = ' + (ConvertTo-Json -InputObject (Get-UiConfig) -Depth 12 -Compress) + ';')) 'text/javascript; charset=utf-8'; return }
    if ($path -eq '/gw/status') { Send-Json $ctx 200 (Status); return }
    if ($path -eq '/gw/gallery') {
        $items = New-Object System.Collections.Generic.List[object]
        for ($i = $Gallery.Count - 1; $i -ge 0; $i--) { $items.Add($Gallery[$i]) }
        Send-Json $ctx 200 @{ items = $items.ToArray(); count = $Gallery.Count }; return
    }
    if ($m -in 'GET', 'HEAD' -and $path -like '/gw/file/*') {
        $rel = [Uri]::UnescapeDataString($path.Substring(9))
        $full = Inside $Out $rel
        if (-not $full -or $full.StartsWith($Trash + '\', [StringComparison]::OrdinalIgnoreCase)) { Send-Json $ctx 404 @{ error = 'not found' }; return }
        Send-File $ctx $full 'private, max-age=31536000, immutable'; return
    }
    if ($m -eq 'POST' -and $path -eq '/gw/delete') {
        $data = Read-Json $ctx
        $removed = 0
        foreach ($id in @($data['ids'])) {
            for ($i = $Gallery.Count - 1; $i -ge 0; $i--) {
                if ([string]$Gallery[$i]['id'] -ne [string]$id) { continue }
                $e = $Gallery[$i]
                foreach ($rel in @($e['file'], $e['thumb']) | Where-Object { $_ } | Select-Object -Unique) {
                    $full = Inside $Out $rel
                    if ($full -and (Test-Path -LiteralPath $full)) {
                        Move-Item -LiteralPath $full -Destination (Join-Path $Trash ($rel -replace '[\\/]', '_')) -Force
                    }
                }
                $Gallery.RemoveAt($i); $removed++
            }
        }
        if ($removed) { Rewrite-Index }
        Send-Json $ctx 200 @{ removed = $removed }; return
    }
    if ($m -eq 'POST' -and $path -eq '/gw/use') {
        $data = Read-Json $ctx
        $engine = [string]$data['engine']; $profile = [string]$data['profile']
        if ($engine -notin 'image', 'voice', 'music', 'llm', 'code') { Send-Json $ctx 400 @{ error = 'unknown engine' }; return }
        if ($engine -ne 'image') { $profile = $null } elseif (-not $profile) { $profile = 'turbo' }
        if ($profile -eq 'edit') { $profile = 'real' }   # Edit runs on Qwen-Image 2.1 since 2026-11-17 (older pages ask for 'edit')
        if ($profile -and -not $Profiles.Contains($profile)) { Send-Json $ctx 400 @{ error = 'unknown profile' }; return }
        $st = Status
        $toLlm = $engine -in 'llm', 'code'
        if ($st.llm -and -not $toLlm -and -not $data['force']) { Send-Json $ctx 409 @{ error = 'llm-busy'; status = $st }; return }
        if ($toLlm -and $st.busy -gt 0 -and $st.engine -notin 'llm', 'code' -and -not $data['force']) { Send-Json $ctx 409 @{ error = 'media-busy'; status = $st }; return }
        $busySwitch = $script:Switch -and $script:Switch.stage -notin 'done', 'error'
        if ($toLlm -and -not $busySwitch -and $st.engine -in 'llm', 'code' -and (Engine-Ready 'llm')) {
            # Chat <-> Code on the same llama-server settings: just hand it over (no reload).
            $role = if ($engine -eq 'code') { 'code' } else { 'chat' }
            $cfg = Get-LlmCfg $role; $sig = Get-LlmSig $cfg; $lst = Get-LlmState
            if ($lst -and $lst['sig'] -eq $sig -and ($role -eq 'chat' -or ($st.code -and $lst['oc'] -eq $sig))) {
                Set-LlmRole $role; $EngineCache.at = [DateTime]::MinValue
                Log "hand-off -> $role (same model)"
                Send-Json $ctx 200 @{ ok = $true; ready = $true }; return
            }
        }
        if ($busySwitch) {
            if ($script:Switch.engine -eq $engine -and $script:Switch.profile -eq $profile) { Send-Json $ctx 202 @{ ok = $true; switching = $true }; return }
            Send-Json $ctx 409 @{ error = "Still switching to $($script:Switch.engine). Try again in a moment." }; return
        }
        if (-not $toLlm -and $st.engine -eq $engine -and $st.ready -and (-not $profile -or $st.profile -eq $profile)) { Send-Json $ctx 200 @{ ok = $true; ready = $true }; return }
        if ($st.engine -eq $engine -and $st.ready -and $profile) {
            $script:Switch = @{ engine = $engine; profile = $profile; stage = 'load'; started = Get-Date; proc = $null; task = $null
                                outFile = $null; error = $null; retryAt = [DateTime]::MinValue }
            Log "profile -> $profile"
        } else { Start-Switch $engine $profile }
        Send-Json $ctx 202 @{ ok = $true; switching = $true }; return
    }
    if ($m -eq 'POST' -and $path -eq '/gw/upscale') {
        $data = Read-Json $ctx
        $src = Find-Entry $data['id']
        if (-not $src -or $src['kind'] -eq 'video' -or $src['kind'] -eq 'voice' -or $src['kind'] -eq 'music') { Send-Json $ctx 404 @{ error = 'image not found' }; return }
        $st = Status
        if ($st.engine -ne 'image' -or -not $st.ready) { Send-Json $ctx 409 @{ error = 'needs-image-engine' }; return }
        $repeats = [Math]::Max(1, [Math]::Min(2, [int]$(if ($data['repeats']) { $data['repeats'] } else { 1 })))
        $full = Inside $Out $src['file']
        $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($full))
        $mime = $Mime[[IO.Path]::GetExtension($full).ToLower()]
        $t = New-Task 'upscale' @{ source = $src }
        $t.stage = 'upscaling'
        $t.http = $Http.PostAsync("$Sd/sdcpp/v1/upscale", (JsonBody @{ image = "data:$mime;base64,$b64"; repeats = $repeats; output_format = 'png' }))
        Send-Json $ctx 202 @{ task = $t.id }; return
    }
    if ($path -eq '/gw/voice/voices') {
        if ($m -eq 'GET') { Relay $ctx "$Voice/voices" 'GET' $null } else { Relay $ctx "$Voice/voices" 'POST' (Read-Json $ctx) }
        return
    }
    if ($m -eq 'POST' -and $path -eq '/gw/voice/delete') { Relay $ctx "$Voice/voices/delete" 'POST' (Read-Json $ctx); return }
    if ($m -eq 'POST' -and $path -eq '/gw/voice/tts') {
        $data = Read-Json $ctx
        if (-not (Engine-Ready 'voice')) { Send-Json $ctx 409 @{ error = 'needs-voice-engine' }; return }
        $t = New-Task 'voice' @{ text = [string]$data['text']; voice = [string]$data['voice'] }
        $t.stage = 'speaking'
        $t.http = $Http.PostAsync("$Voice/tts", (JsonBody @{ text = $t.text; voice = $t.voice; temperature = $data['temperature'] }))
        Send-Json $ctx 202 @{ task = $t.id }; return
    }
    if ($m -eq 'POST' -and $path -eq '/gw/music') {
        $data = Read-Json $ctx
        if (-not (Engine-Ready 'music')) { Send-Json $ctx 409 @{ error = 'needs-music-engine' }; return }
        $duration = [Math]::Max(10, [Math]::Min(300, [double]$(if ($data['duration']) { $data['duration'] } else { 60 })))
        $lyrics = [string]$data['lyrics']
        if ($data['instrumental']) { $lyrics = '[Instrumental]' }
        # MP3 needs ffmpeg on ACE-Step's PATH (tools\install-ffmpeg.ps1; mode.ps1 adds C:\AI\tools\ffmpeg\bin).
        $body = [ordered]@{
            prompt = [string]$data['prompt']; lyrics = $lyrics; audio_duration = $duration; batch_size = 1
            audio_format = 'mp3'; inference_steps = 8; thinking = $true; vocal_language = 'en'
            use_random_seed = -not $data['seed']; seed = $(if ($data['seed']) { [int]$data['seed'] } else { -1 })
        }
        $t = New-Task 'music' @{ prompt = $body.prompt; lyrics = $lyrics; duration = $duration; body = $body }
        if ($data['auto_lyrics'] -and -not $data['instrumental']) {
            # "Write the lyrics for me": first have ACE-Step's LM turn the style into a caption, lyrics, BPM
            # and key (/v1/create_sample), then generate with those and the user's length. (use_format
            # only polishes given text: with empty lyrics the small LM drifted genre and wrote none.
            # release_task's own sample mode would also replace the user's length with the LM's.)
            $t.stage = 'writing'
            $t.http = $Http.PostAsync("$Music/v1/create_sample", (JsonBody @{ query = "$($body.prompt) (a $([int]$duration)-second song)"; instrumental = $false; vocal_language = 'en' }))
        } else {
            $t.http = $Http.PostAsync("$Music/release_task", (JsonBody $body))
        }
        Send-Json $ctx 202 @{ task = $t.id }; return
    }
    if ($path -like '/llm/*') {
        $chat = [string]$req.Headers['X-Lumen-Chat']; if ($chat -notmatch '^c_[A-Za-z0-9]{6,40}$') { $chat = $null }
        Start-LlmProxy $ctx ($Llm + $pq.Substring(4)) $chat; return
    }
    if ($m -eq 'GET' -and $path -eq '/gw/energy') { Send-Json $ctx 200 (Energy-Summary); return }
    if ($m -eq 'GET' -and $path -eq '/gw/energy/details') {
        $range = [string]$req.QueryString['range']; if ($range -notin 'today', 'week', 'month', 'all') { $range = 'month' }
        Send-Json $ctx 200 (Energy-Details $range); return
    }
    if ($m -eq 'POST' -and $path -eq '/gw/energy/rate') {
        $d = Read-Json $ctx
        $sup = 0.0; $del = 0.0
        if (-not [double]::TryParse([string]$d['supply_c'], [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$sup) -or
            -not [double]::TryParse([string]$d['delivery_c'], [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$del) -or
            $sup -lt 0 -or $sup -gt 200 -or $del -lt 0 -or $del -gt 200) { Send-Json $ctx 400 @{ error = 'Rates must be numbers of cents per kWh between 0 and 200.' }; return }
        $Rate['supply_c'] = $sup; $Rate['delivery_c'] = $del; $Rate['updated'] = (Get-Date).ToString('yyyy-MM-dd'); $Rate['edited'] = $true
        [IO.File]::WriteAllText($RateFile, $Json.Serialize($Rate), $Utf8)
        Log "electricity rate set: supply $sup + delivery $del c/kWh"
        Send-Json $ctx 200 (Energy-Summary); return
    }
    if ($m -eq 'GET' -and $path -eq '/gw/chats') {
        # Sort the ids, then add the plain dictionaries: piping the values through Sort-Object wraps
        # them in PSObjects, which $Json.Serialize rejects ("circular reference ... PSParameterizedProperty").
        $list = New-Object System.Collections.ArrayList
        foreach ($id in @($ChatIndex.Keys | Sort-Object { -[double]$ChatIndex[$_]['updated'] })) {
            [void]$list.Add($ChatIndex[[string]$id].PSObject.BaseObject)
        }
        Send-Json $ctx 200 @{ chats = $list.ToArray() }; return
    }
    if ($m -eq 'GET' -and $path -match '^/gw/chats/(c_[A-Za-z0-9]{6,40})$') {
        $f = "$Chats\$($Matches[1]).json"
        if (-not (Test-Path -LiteralPath $f)) { Send-Json $ctx 404 @{ error = 'not found' }; return }
        Send $ctx 200 ([IO.File]::ReadAllBytes($f)) 'application/json; charset=utf-8'; return
    }
    if ($m -eq 'POST' -and $path -eq '/gw/chats/save') {
        $b = Read-Body $ctx
        $c = $null; try { $c = $Json.DeserializeObject($Utf8.GetString($b)) } catch {}
        if (-not $c -or [string]$c['id'] -notmatch '^c_[A-Za-z0-9]{6,40}$') { Send-Json $ctx 400 @{ error = 'bad chat' }; return }
        [IO.File]::WriteAllBytes("$Chats\$($c['id']).json", $b)
        $ChatIndex[[string]$c['id']] = Chat-Meta $c
        Send-Json $ctx 200 @{ ok = $true }; return
    }
    if ($m -eq 'POST' -and $path -eq '/gw/chats/delete') {
        $data = Read-Json $ctx
        foreach ($id in @($data['ids'])) {
            $id = [string]$id; if ($id -notmatch '^c_[A-Za-z0-9]{6,40}$') { continue }
            $f = "$Chats\$id.json"
            if (Test-Path -LiteralPath $f) { Move-Item -LiteralPath $f "$Chats\.trash\$id.json" -Force }
            $ChatIndex.Remove($id)
        }
        Send-Json $ctx 200 @{ ok = $true }; return
    }
    if ($m -eq 'GET' -and $path -eq '/gw/code/projects') {
        # Built with a foreach statement + ArrayList: dictionaries emitted from a pipeline come out
        # PSObject-wrapped, which $Json.Serialize rejects.
        $list = New-Object System.Collections.ArrayList
        if (Test-Path $CodeRoot) {
            $dirs = @(Get-ChildItem -LiteralPath $CodeRoot -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike '.*' } |
                Sort-Object LastWriteTime -Descending)
            foreach ($d in $dirs) {
                [void]$list.Add([ordered]@{ name = [string]$d.Name; path = [string]$d.FullName; git = [bool](Test-Path -LiteralPath (Join-Path $d.FullName '.git'))
                                            modified = [long]([DateTimeOffset]$d.LastWriteTimeUtc).ToUnixTimeMilliseconds() })
            }
        }
        Send-Json $ctx 200 ([ordered]@{ root = $CodeRoot; port = 8443; publicHost = $PublicHost; projects = $list.ToArray() }); return
    }
    if ($m -eq 'POST' -and $path -eq '/gw/code/new') {
        $data = Read-Json $ctx
        $name = ([string]$data['name']).Trim() -replace '[^\w .\-]', '' -replace '\s+', ' '
        $name = $name.Trim(' ', '.')
        if (-not $name -or $name.Length -gt 60) { Send-Json $ctx 400 @{ error = 'Use letters, numbers, spaces, dots or dashes.' }; return }
        $dir = Join-Path $CodeRoot $name
        if (Test-Path -LiteralPath $dir) { Send-Json $ctx 409 @{ error = 'A project with that name already exists.' }; return }
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        if (Get-Command git -ErrorAction SilentlyContinue) {
            try { Start-Process git -ArgumentList @('init', '-q') -WorkingDirectory $dir -WindowStyle Hidden -Wait } catch { Log "git init failed: $_" }
        }
        Log "code project created: $dir"
        Send-Json $ctx 200 ([ordered]@{ ok = $true; name = $name; path = [string]$dir }); return
    }
    if ($m -eq 'GET' -and $path -eq '/gw/code/models') {
        $cur = Get-LlmCfg 'code'; $chat = Get-LlmCfg 'chat'
        $list = New-Object System.Collections.ArrayList
        foreach ($f in @(Get-ChildItem -LiteralPath $LlmModels -Filter '*.gguf' -File -ErrorAction SilentlyContinue | Sort-Object Name)) {
            if ($f.Name -like '*mmproj*') { continue }
            # Our downloads leave a .done marker; a file without one may still be downloading.
            [void]$list.Add([ordered]@{ file = [string]$f.Name; name = [string]$f.BaseName; bytes = [long]$f.Length
                                        complete = [bool](Test-Path -LiteralPath "$($f.FullName).done") })
        }
        Send-Json $ctx 200 ([ordered]@{ models = $list.ToArray(); current = [string](Split-Path -Leaf $cur.gguf); current_name = [string]$cur.name
                                        chat = [string](Split-Path -Leaf $chat.gguf); chat_name = [string]$chat.name }); return
    }
    if ($m -eq 'POST' -and $path -eq '/gw/code/model') {
        $data = Read-Json $ctx
        $file = Split-Path -Leaf ([string]$data['gguf'])
        $full = Join-Path $LlmModels $file
        if (-not $file -or $file -notlike '*.gguf' -or $file -like '*mmproj*' -or -not (Test-Path -LiteralPath $full -PathType Leaf)) { Send-Json $ctx 404 @{ error = 'No such model in C:\AI\models.' }; return }
        $d = Read-LlmFile 'code'
        $cfg = [ordered]@{}
        if ($d) { foreach ($k in $d.Keys) { $cfg[$k] = $d[$k] } }
        $def = Get-LlmDefault
        if ($full -eq $def.gguf) {
            # Back to the default model: its own name and vision projector.
            $cfg.Remove('gguf'); $cfg.Remove('name'); $cfg.Remove('mmproj')
        } else {
            $cfg['gguf'] = $full; $cfg['name'] = [IO.Path]::GetFileNameWithoutExtension($file)
            # A vision projector that belongs to this model: the mmproj file sharing the longest name prefix (>= 16 chars).
            $best = ''; $bestLen = 15
            foreach ($mp in @(Get-ChildItem -LiteralPath $LlmModels -Filter '*mmproj*.gguf' -File -ErrorAction SilentlyContinue)) {
                $n = 0; while ($n -lt [Math]::Min($mp.Name.Length, $file.Length) -and $mp.Name[$n] -eq $file[$n]) { $n++ }
                if ($n -gt $bestLen) { $bestLen = $n; $best = $mp.FullName }
            }
            $cfg['mmproj'] = $best
        }
        $prev = (Get-LlmCfg 'code').gguf
        if ($prev -ne $full -and $cfg.Contains('extra_args')) { $cfg.Remove('extra_args') }   # flags tuned for the old model
        New-Item -ItemType Directory -Force -Path $LlmCfgDir | Out-Null
        [IO.File]::WriteAllText("$LlmCfgDir\code-model.json", ($cfg | ConvertTo-Json -Depth 5), $Utf8)
        $ModelCache.at = [DateTime]::MinValue
        Log "code model -> $file"
        $now = Get-LlmCfg 'code'
        Send-Json $ctx 200 ([ordered]@{ ok = $true; current = [string](Split-Path -Leaf $now.gguf); current_name = [string]$now.name }); return
    }
    if ($m -eq 'POST' -and $path -eq '/gw/code/upload') {
        $q = [Web.HttpUtility]::ParseQueryString($req.Url.Query)
        $dir = Project-Dir ([string]$q['project'])
        if (-not $dir) { Send-Json $ctx 404 @{ error = 'No such project.' }; return }
        $rel = ([string]$q['path']) -replace '\\', '/'
        if (-not $rel -or $rel.StartsWith('/') -or $rel -match '^[A-Za-z]:' -or $rel -match '(^|/)\.\.?(/|$)' -or $rel -match '[<>:"|?*\x00-\x1f]' -or $rel.Length -gt 400) {
            Send-Json $ctx 400 @{ error = "Bad file path: $rel" }; return
        }
        $full = Inside $dir $rel
        if (-not $full) { Send-Json $ctx 400 @{ error = "Bad file path: $rel" }; return }
        if ($req.ContentLength64 -gt $UploadMax) { Send-Json $ctx 413 @{ error = 'Files up to 2 GB.' }; return }
        Start-Work $UploadScript @($ctx, $full, [long]$UploadMax); return
    }
    if ($m -eq 'POST' -and $path -eq '/gw/code/import') {
        $data = Read-Json $ctx
        $u = ([string]$data['url']).Trim() -replace '[?#].*$', '' -replace '^(https?://)?(www\.)?github\.com/', '' -replace '/+$', ''
        if ($u -notmatch '^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))/([A-Za-z0-9._-]{1,100})(?:/tree/(.+))?$') {
            Send-Json $ctx 400 @{ error = 'Use owner/repo or a github.com link (optionally ending in /tree/<branch>).' }; return
        }
        $owner = $Matches[1]; $repo = $Matches[2] -replace '\.git$', ''; $branch = [string]$Matches[3]
        if ($branch -match '[^\w./-]' -or $branch -match '\.\.') { Send-Json $ctx 400 @{ error = 'That branch name is not supported.' }; return }
        $base = (([string]$data['name']).Trim() -replace '[^\w .\-]', '' -replace '\s+', ' ').Trim(' ', '.')
        if (-not $base) { $base = $repo }
        if ($base.Length -gt 60) { $base = $base.Substring(0, 60) }
        $name = $base; $n = 2
        while (Test-Path -LiteralPath (Join-Path $CodeRoot $name)) { $name = "$base-$n"; $n++ }
        $dir = Join-Path $CodeRoot $name
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        $sync = [hashtable]::Synchronized(@{ stage = 'starting'; error = $null; bytes = 0 })
        $t = New-Task 'import' @{ sync = $sync; dir = $dir; name = $name; repo = "$owner/$repo" }
        $t.stage = 'starting'
        $t.job = Start-Work $ImportScript @($owner, $repo, $branch, $dir, $sync)
        Log "import github.com/$owner/$repo$(if ($branch) { " ($branch)" }) -> $dir"
        Send-Json $ctx 202 ([ordered]@{ task = $t.id; name = $name; path = [string]$dir }); return
    }
    if ($m -eq 'GET' -and $path -like '/gw/task/*') {
        $t = $Tasks[$path.Substring(9)]
        if (-not $t) { Send-Json $ctx 404 @{ error = 'unknown task' }; return }
        Send-Json $ctx 200 ([ordered]@{ id = $t.id; kind = $t.kind; status = $t.status; stage = $t.stage; progress = $t.progress
            elapsed = [int](((Get-Date) - $t.started).TotalSeconds); entry = $t.entry; error = $t.error }); return
    }
    if ($path -like '/sdcpp/*' -or $path -like '/v1/*' -or $path -like '/sdapi/*') { Proxy $ctx $pq; return }
    Send-Json $ctx 404 @{ error = 'not found' }
}

# ---------------- chats (C:\Lumen\Chats\<id>.json, written by the page) ----------------
function Chat-Meta($c) {
    $msgs = @(if ($c['messages']) { $c['messages'] })   # @($null) would count as 1 message
    $first = ''
    foreach ($mm in $msgs) { if ($mm -and $mm['role'] -eq 'user') { $first = [string]$mm['text']; break } }
    if ($first.Length -gt 120) { $first = $first.Substring(0, 120) }
    return [ordered]@{ id = [string]$c['id']; title = [string]$c['title']; created = $c['created']; updated = $c['updated']
                       count = $msgs.Count; preview = $first }
}
$ChatIndex = @{}
foreach ($f in (Get-ChildItem -LiteralPath $Chats -Filter 'c_*.json' -File -ErrorAction SilentlyContinue)) {
    try { $c = $Json.DeserializeObject([IO.File]::ReadAllText($f.FullName, $Utf8)); $ChatIndex[[string]$c['id']] = Chat-Meta $c } catch { Log "bad chat file $($f.Name): $_" }
}

# ---------------- /llm/* streaming proxy ----------------
# Runs on a small runspace pool: chat answers stream for a minute or more, and the main loop must keep
# serving status, archive and media while they do. Closing the browser request aborts the upstream call,
# which makes llama-server stop generating (that is how the page's Stop button works).
$LlmPool = [RunspaceFactory]::CreateRunspacePool(1, 6)
$LlmPool.Open()
$LlmJobs = New-Object System.Collections.ArrayList
$LlmScript = {
    param($ctx, $target)
    $res = $ctx.Response; $client = $null; $up = $null
    try {
        $req = $ctx.Request
        $client = New-Object System.Net.Http.HttpClient
        $client.Timeout = [TimeSpan]::FromHours(3)
        $msg = New-Object System.Net.Http.HttpRequestMessage((New-Object System.Net.Http.HttpMethod($req.HttpMethod)), $target)
        if ($req.HasEntityBody) {
            $ms = New-Object IO.MemoryStream; $req.InputStream.CopyTo($ms)
            $msg.Content = New-Object System.Net.Http.ByteArrayContent(, $ms.ToArray())
            $ct = if ($req.ContentType) { $req.ContentType } else { 'application/json' }
            $msg.Content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse($ct)
        }
        $r = $client.SendAsync($msg, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).Result
        $res.StatusCode = [int]$r.StatusCode
        $res.ContentType = $(if ($r.Content.Headers.ContentType) { $r.Content.Headers.ContentType.ToString() } else { 'application/json' })
        $res.Headers['Cache-Control'] = 'no-store'
        $res.Headers['X-Accel-Buffering'] = 'no'
        $res.SendChunked = $true
        $up = $r.Content.ReadAsStreamAsync().Result
        $buf = New-Object byte[] 8192
        while (($n = $up.Read($buf, 0, $buf.Length)) -gt 0) { $res.OutputStream.Write($buf, 0, $n); $res.OutputStream.Flush() }
    } catch {
        try {
            $b = [Text.Encoding]::UTF8.GetBytes('{"error":"The chat model is not running."}')
            $res.StatusCode = 503; $res.ContentType = 'application/json'; $res.OutputStream.Write($b, 0, $b.Length)
        } catch {}
    } finally {
        if ($up) { try { $up.Dispose() } catch {} }
        if ($client) { $client.Dispose() }
        try { $res.Close() } catch {}
    }
}
function Start-LlmProxy($ctx, $target, $chat) {
    $ps = [PowerShell]::Create()
    $ps.RunspacePool = $LlmPool
    [void]$ps.AddScript($LlmScript).AddArgument($ctx).AddArgument($target)
    [void]$LlmJobs.Add(@{ ps = $ps; handle = $ps.BeginInvoke(); chat = $chat })
}
# Code: uploads and GitHub imports (background runspaces).
. "$Root\gw\code.ps1"

function Reap-LlmJobs {
    for ($i = $LlmJobs.Count - 1; $i -ge 0; $i--) {
        $j = $LlmJobs[$i]
        if ($j.handle.IsCompleted) {
            try { [void]$j.ps.EndInvoke($j.handle) } catch {}; $j.ps.Dispose(); $LlmJobs.RemoveAt($i)
            if ($j.chat) { $RecentChats[[string]$j.chat] = NowMs }
        }
    }
}

# Electricity cost tracker (power sampler, ledger, /gw/energy data).
. "$Root\gw\energy.ps1"

# ---------------- main loop ----------------
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$Port/")   # any Host header; non-local callers are refused in Handle
$listener.IgnoreWriteExceptions = $true
$listener.Start()
Log "gateway listening on $Port ($($Gallery.Count) saved items)"
$task = $listener.GetContextAsync()
$nextPoll = Get-Date
while ($listener.IsListening) {
    if ($task.Wait(250)) {
        $ctx = $task.Result
        $task = $listener.GetContextAsync()
        try { Handle $ctx } catch {
            Log "error on $($ctx.Request.HttpMethod) $($ctx.Request.Url.PathAndQuery): $_"
            try { Send-Json $ctx 500 @{ error = "$_" } } catch {}
        }
    }
    try { Tick-Switch } catch { Log "switch error: $_"; if ($script:Switch) { $script:Switch.stage = 'error'; $script:Switch.error = "$_" } }
    try { Tick-Tasks } catch { Log "task error: $_" }
    try { Tick-Energy } catch { Log "energy error: $_" }
    if ($LlmJobs.Count) { try { Reap-LlmJobs } catch { Log "llm proxy error: $_" } }
    if ((Get-Date) -ge $nextPoll) {
        if ($Pending.Count) { try { Poll-Pending } catch { Log "poll error: $_" } }
        $nextPoll = (Get-Date).AddSeconds(1)
    }
}
