# C:\AI\llm-config.ps1 - which model llama-server runs for Chat and for Code. Dot-sourced by mode.ps1 and gateway.ps1.
#
# C:\AI\config\chat-model.json and C:\AI\config\code-model.json (every field optional; a missing file or field
# means today's default, the uncensored Qwen3.6 35B Heretic build):
#   name        label shown in Lumen and OpenCode
#   gguf        model file;  mmproj  vision projector ("" = none; defaults to none when gguf is set)
#   ctx         context tokens;  cpu_moe  MoE expert layers kept on the CPU;  kv_type  KV-cache type (q8_0, f16, ...)
#   extra_args  appended to llama-server's command line (e.g. speculative-decoding flags)
#   server      llama-server.exe to use (e.g. a newer llama.cpp build)
# Chat and Code share one llama-server process (aliases lumen-chat,lumen-code) when all of these match, so switching
# between them is instant; otherwise switching reloads llama-server with the other model.
Add-Type -AssemblyName System.Web.Extensions
$LlmCfgDir = 'C:\AI\config'
$LlmModels = 'C:\AI\models'
$LlmStateFile = 'C:\AI\logs\llm-state.json'   # {sig, aliases, role, pid, oc} of the llama-server mode.ps1 started
$LlmSer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$LlmSer.MaxJsonLength = [int]::MaxValue

function Get-LlmDefault {
    $h = "$LlmModels\Qwen3.6-35B-A3B-uncensored-heretic-Native-MTP-Preserved-Q4_K_M.gguf"
    $hm = "$LlmModels\Qwen3.6-35B-A3B-uncensored-heretic-Native-MTP-Preserved-mmproj-BF16.gguf"
    $useH = Test-Path "$h.done"
    return [ordered]@{
        name = $(if ($useH) { 'Qwen3.6 35B uncensored' } else { 'Qwen3.6 35B' })
        gguf = $(if ($useH) { $h } else { "$LlmModels\Qwen3.6-35B-A3B-UD-Q4_K_M.gguf" })
        mmproj = $(if ($useH -and (Test-Path "$hm.done")) { $hm } else { '' })
        ctx = 131072; cpu_moe = 24; kv_type = 'q8_0'; extra_args = ''; server = 'C:\AI\llama.cpp\llama-server.exe'
    }
}
function Read-LlmFile($role) {
    $f = "$LlmCfgDir\$role-model.json"
    if (-not (Test-Path -LiteralPath $f)) { return $null }
    try { return $LlmSer.DeserializeObject([IO.File]::ReadAllText($f)) } catch { return $null }
}
function Get-LlmCfg($role) {   # 'chat' | 'code'
    $c = Get-LlmDefault
    $d = Read-LlmFile $role
    if ($d) {
        if ($d.ContainsKey('gguf') -and $d['gguf'] -and -not $d.ContainsKey('mmproj')) { $c.mmproj = '' }
        foreach ($k in @($c.Keys)) { if ($d.ContainsKey($k) -and $null -ne $d[$k]) { $c[$k] = $d[$k] } }
        if ($d.ContainsKey('gguf') -and $d['gguf'] -and -not $d['name']) { $c.name = [IO.Path]::GetFileNameWithoutExtension([string]$c.gguf) }
    }
    foreach ($k in 'name', 'gguf', 'mmproj', 'kv_type', 'extra_args', 'server') { $c[$k] = [string]$c[$k] }
    $c.ctx = [int]$c.ctx; $c.cpu_moe = [int]$c.cpu_moe
    return $c
}
# Everything that needs a different llama-server process.
function Get-LlmSig($c) { "$($c.server)|$($c.gguf)|$($c.mmproj)|$($c.ctx)|$($c.cpu_moe)|$($c.kv_type)|$($c.extra_args)" }
function Get-LlmArgs($c, $aliases, $port) {
    $a = "-m `"$($c.gguf)`" -a $aliases -ngl 99 --n-cpu-moe $($c.cpu_moe) -c $($c.ctx) -ctk $($c.kv_type) -ctv $($c.kv_type) --jinja -fa on " +
         "--parallel 1 --temp 0.6 --top-p 0.95 --top-k 20 --min-p 0 --host 127.0.0.1 --port $port"
    if ($c.mmproj) { $a += " --mmproj `"$($c.mmproj)`"" }
    if ($c.extra_args) { $a += " $($c.extra_args)" }
    return $a
}
# The running llama-server's state, or $null if mode.ps1 didn't start the one that's running (or none runs).
function Get-LlmState {
    if (-not (Test-Path -LiteralPath $LlmStateFile)) { return $null }
    try { $s = $LlmSer.DeserializeObject([IO.File]::ReadAllText($LlmStateFile)) } catch { return $null }
    $p = Get-Process -Id ([int]$s['pid']) -ErrorAction SilentlyContinue
    if (-not $p -or $p.ProcessName -ne 'llama-server') { return $null }
    return $s
}
function Save-LlmState($s) {
    New-Item -ItemType Directory -Force -Path (Split-Path $LlmStateFile) | Out-Null
    [IO.File]::WriteAllText($LlmStateFile, $LlmSer.Serialize($s))
}
function Set-LlmRole($role) { $s = Get-LlmState; if ($s) { $s['role'] = $role; Save-LlmState $s } }

# Where Lumen keeps its files: C:\AI\config\paths.json {code, studio, chats} (every field optional).
#   code    Lumen Code thread folders (one folder per thread; OpenCode is fenced to the open one)
#   studio  Studio outputs: images, video, voice, music, thumbnails, gallery.jsonl
#   chats   Chat history (c_*.json)
# Moving a folder = move it on disk, then point this file at the new place and restart the gateway.
function Get-LumenPaths {
    $p = [ordered]@{ code = 'C:\Lumen\Code'; studio = 'C:\Lumen\Studio'; chats = 'C:\Lumen\Chats' }   # since 2026-11-18 (everything Lumen lives in C:\Lumen)
    $f = "$LlmCfgDir\paths.json"
    if (Test-Path -LiteralPath $f) {
        try {
            $d = $LlmSer.DeserializeObject([IO.File]::ReadAllText($f))
            foreach ($k in @($p.Keys)) { if ($d -and $d.ContainsKey($k) -and [string]$d[$k]) { $p[$k] = ([string]$d[$k]).TrimEnd('\') } }
        } catch {}
    }
    return $p
}

# Your own settings: C:\AI\config\lumen.json (copy config\lumen.example.json). Not in git.
#   publicHost  the desktop's tailnet name (https://<publicHost>/ is the page)
#   opencodeDb  OpenCode's database, only needed when the gateway runs without a user profile
function Get-LumenCfg {
    $f = "$LlmCfgDir\lumen.json"
    if (Test-Path -LiteralPath $f) { try { $d = $LlmSer.DeserializeObject([IO.File]::ReadAllText($f)); if ($d) { return $d } } catch {} }
    return @{}
}
