# C:\AI\gw\energy.ps1 - dot-sourced by C:\AI\gateway.ps1 at this point (shares its variables and functions).
# ---------------- electricity cost tracker ----------------
# Samples the desktop's power draw every 2 s, turns it into watt-hours, and charges each interval to whatever
# Lumen was doing then: a Studio job (image/video/voice/song/upscale), a Chat thread, the Code workspace, a model
# load, or nothing ("idle": the PC is on and Lumen is waiting). Cost = energy x the rate in
# C:\AI\config\electricity.json (editable from the page), so changing the rate re-prices all history.
# Power: GPU = nvidia-smi power.draw (measured by the card itself). CPU = estimated from CPU load between the
# 3700X's idle and full-load package power. Rest of the PC (board, RAM, drives, fans) = a fixed estimate.
# The sum is divided by the power supply's efficiency to get watts at the wall. The monitor is not counted.
# Ledger: C:\AI\energy\ledger.json (only watt-hours are stored; written every minute).
$EnergyDir  = "$Root\energy"
$EnergyFile = "$EnergyDir\ledger.json"
$RateFile   = "$Root\config\electricity.json"
New-Item -ItemType Directory -Force -Path $EnergyDir, "$Root\config" | Out-Null
$RateDefaults = [ordered]@{
    # Placeholders: set your own rate from the page (Cost > rate) or in C:\AI\config\electricity.json.
    utility = 'Your electric utility'; town = ''
    supply_c = 15.0; supply_note = 'Supply / generation cents per kWh (from your bill)'
    delivery_c = 10.0; delivery_note = 'Delivery / distribution cents per kWh (from your bill)'
    customer_charge = 0; customer_note = 'Fixed monthly charge; not counted (you pay it whether Lumen runs or not)'
    sources = @()
    updated = ''
    # Power model for the rest of the PC (watts). The GPU is measured; these are rough estimates for an 8-core desktop.
    cpu_idle_w = 22; cpu_max_w = 88; rest_w = 30; psu_eff = 0.88; gpu_fallback_w = 30
}
function Load-Rate {
    $r = [ordered]@{}; foreach ($k in $RateDefaults.Keys) { $r[$k] = $RateDefaults[$k] }
    if (Test-Path $RateFile) {
        try { $f = $Json.DeserializeObject([IO.File]::ReadAllText($RateFile, $Utf8)); foreach ($k in @($f.Keys)) { $r[$k] = $f[$k] } } catch { Log "bad $RateFile : $_" }
    } else { try { [IO.File]::WriteAllText($RateFile, $Json.Serialize($r), $Utf8) } catch {} }
    return $r
}
$Rate = Load-Rate
function Rate-C { return [double]$Rate['supply_c'] + [double]$Rate['delivery_c'] }   # cents per kWh
function Cents($wh) { return [Math]::Round([double]$wh / 1000.0 * (Rate-C), 4) }

$Energy = @{ items = @{}; days = @{}; lastT = 0; now = $null; dirty = $false; saveAt = (Get-Date).AddMinutes(1); state = $null; stateAt = [DateTime]::MinValue }
if (Test-Path $EnergyFile) {
    try {
        $l = $Json.DeserializeObject([IO.File]::ReadAllText($EnergyFile, $Utf8))
        foreach ($k in @($l['items'].Keys)) { $Energy.items[$k] = $l['items'][$k] }
        foreach ($k in @($l['days'].Keys)) { $Energy.days[$k] = $l['days'][$k] }
    } catch { Log "energy ledger unreadable, starting fresh: $_"; try { Copy-Item $EnergyFile "$EnergyFile.bad" -Force } catch {} }
}
function Save-Energy {
    try {
        [IO.File]::WriteAllText("$EnergyFile.tmp", $Json.Serialize(@{ v = 1; items = $Energy.items; days = $Energy.days }), $Utf8)
        Move-Item -Force "$EnergyFile.tmp" $EnergyFile
        $Energy.dirty = $false
    } catch { Log "energy save failed: $_" }
}

# Sampler: one long-lived "nvidia-smi -lms 2000" (cheaper than starting it every 2 s) + the CPU load counter,
# on its own runspace so a slow read never blocks the gateway. Leftover samplers from a previous gateway are stopped.
$Smi = @("$env:SystemRoot\System32\nvidia-smi.exe", 'C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
$SmiArgs = '--query-gpu=power.draw,utilization.gpu --format=csv,noheader,nounits -lms 2000'
try {
    Get-CimInstance Win32_Process -Filter "Name='nvidia-smi.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*power.draw,utilization.gpu*-lms 2000*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}
$EnergyQ = New-Object 'System.Collections.Concurrent.ConcurrentQueue[object]'
$EnergySync = [hashtable]::Synchronized(@{ q = $EnergyQ; smi = $Smi; args = $SmiArgs; gpuOk = $false; cpuOk = $false; err = $null })
$EnergySampler = {
    param($sync)
    $inv = [Globalization.CultureInfo]::InvariantCulture
    $cpu = $null
    try { $cpu = New-Object System.Diagnostics.PerformanceCounter('Processor', '% Processor Time', '_Total'); [void]$cpu.NextValue(); $sync.cpuOk = $true } catch { $sync.err = "cpu counter: $_" }
    function CpuNow { if ($cpu) { try { return [double]$cpu.NextValue() } catch {} }; return [double]-1 }
    while ($true) {
        if (-not $sync.smi) {
            Start-Sleep -Milliseconds 2000
            $sync.q.Enqueue(@{ t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); gpu = $null; gu = [double]-1; cpu = (CpuNow) })
            continue
        }
        $p = $null
        try {
            $psi = New-Object System.Diagnostics.ProcessStartInfo($sync.smi, $sync.args)
            $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.CreateNoWindow = $true
            $p = [System.Diagnostics.Process]::Start($psi)
            while ($true) {
                $line = $p.StandardOutput.ReadLine()
                if ($null -eq $line) { break }
                $parts = $line.Split(',')
                $gw = $null; $gu = [double]-1
                try { $gw = [double]::Parse($parts[0].Trim(), $inv) } catch {}
                try { $gu = [double]::Parse($parts[1].Trim(), $inv) } catch {}
                $sync.gpuOk = ($null -ne $gw)
                $sync.q.Enqueue(@{ t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); gpu = $gw; gu = $gu; cpu = (CpuNow) })
            }
        } catch { $sync.err = "nvidia-smi: $_" }
        finally { if ($p) { try { if (-not $p.HasExited) { $p.Kill() } } catch {}; try { $p.Dispose() } catch {} } }
        $sync.gpuOk = $false
        Start-Sleep -Seconds 5   # nvidia-smi ended (driver update, crash): restart it
    }
}
$EnergyPs = [PowerShell]::Create()
[void]$EnergyPs.AddScript($EnergySampler).AddArgument($EnergySync)
$EnergyHandle = $EnergyPs.BeginInvoke()

function Wall-Watts($s) {
    $gpu = if ($null -ne $s.gpu) { [double]$s.gpu } else { [double]$Rate['gpu_fallback_w'] }
    $load = [double]$s.cpu; if ($load -lt 0) { $load = 10 }; if ($load -gt 100) { $load = 100 }
    $cpu = [double]$Rate['cpu_idle_w'] + ([double]$Rate['cpu_max_w'] - [double]$Rate['cpu_idle_w']) * $load / 100.0
    $eff = [double]$Rate['psu_eff']; if ($eff -le 0.3 -or $eff -gt 1) { $eff = 0.88 }
    return @{ wall = ($gpu + $cpu + [double]$Rate['rest_w']) / $eff; gpu = $gpu; cpu = $cpu; gpuMeasured = ($null -ne $s.gpu) }
}

# Which engine holds the GPU right now (re-checked every 10 s; the process query isn't free).
function Energy-Engine {
    if (((Get-Date) - $Energy.stateAt).TotalSeconds -lt 10) { return $Energy.state }
    $run = Engine-Running; $e = 'off'
    foreach ($x in 'image', 'voice', 'music', 'llm') { if ($run[$x]) { $e = $x; break } }
    if ($e -eq 'llm') { try { $lst = Get-LlmState; if ($lst -and $lst['role'] -eq 'code') { $e = 'code' } } catch {} }
    $Energy.state = $e; $Energy.stateAt = Get-Date
    return $e
}
function Day-Key($ms) { return [DateTimeOffset]::FromUnixTimeMilliseconds([long]$ms).LocalDateTime.ToString('yyyy-MM-dd') }
function Energy-Item($key, $fields) {
    $it = $Energy.items[$key]
    if (-not $it) {
        $it = @{ key = $key; wh = 0.0; start = NowMs; end = NowMs; status = 'running' }
        foreach ($k in $fields.Keys) { $it[$k] = $fields[$k] }
        $Energy.items[$key] = $it
    }
    return $it
}
function Energy-Keys($s) {
    $eng = Energy-Engine
    # 1. image / video jobs (sd-server runs one at a time; queued ones wait). Only jobs sd-server answered about in
    #    the last 10 s count, so a job left behind by a crashed engine doesn't soak up idle power.
    $live = @($Pending.Keys | Where-Object { (NowMs) - [long]$Pending[$_]['seen'] -lt 10000 -or (NowMs) - [long]$Pending[$_]['submitted'] -lt 10000 })
    if ($live.Count) {
        $id = $null
        foreach ($k in $live) { $st = [string]$Pending[$k]['status']; if ($st -and $st -notin 'queued', 'pending') { $id = $k; break } }
        if (-not $id) { $id = [string](@($live | Sort-Object { [long]$Pending[$_]['submitted'] })[0]) }
        $p = $Pending[$id]
        $kind = if ($p['gen'] -eq 'vid_gen') { 'video' } else { 'image' }
        [void](Energy-Item "job:$id" @{ kind = $kind; sub = [string](Meta-Value $p['meta'] 'mode' $(if ($kind -eq 'video') { 'video' } else { 'create' }))
                                       label = [string]$p['request']['prompt']; model = [string](Meta-Value $p['meta'] 'model' '') })
        return @("job:$id")
    }
    # 2. gateway tasks: upscale, voice, music
    foreach ($t in @($Tasks.Values)) {
        if ($t.status -ne 'running' -or $t.kind -eq 'import') { continue }
        $kind = switch ($t.kind) { 'upscale' { 'image' } 'voice' { 'voice' } 'music' { 'music' } default { 'other' } }
        $label = if ($t.kind -eq 'voice') { [string]$t.text } elseif ($t.kind -eq 'upscale' -and $t.source) { [string]$t.source['prompt'] } elseif ($t.prompt) { [string]$t.prompt } else { '' }
        [void](Energy-Item "task:$($t.id)" @{ kind = $kind; sub = $(if ($t.kind -eq 'upscale') { 'upscale' } else { $t.kind }); label = $label })
        return @("task:$($t.id)")
    }
    $day = Day-Key $s.t
    # 3. loading a model (engine switch)
    $cur = $script:Switch
    if ($cur -and $cur.stage -notin 'done', 'error') {
        [void](Energy-Item "load:$day" @{ kind = 'load'; label = 'Loading models' }); return @("load:$day")
    }
    # 4. Chat threads answering (split evenly if several stream at once)
    # (an answer that ended within the last 2.5 s still counts, so short replies between two samples aren't missed)
    $talking = @(@($LlmJobs | Where-Object { $_.chat -and -not $_.handle.IsCompleted } | ForEach-Object { [string]$_.chat }) +
               @($RecentChats.Keys | Where-Object { [long]$s.t - [long]$RecentChats[$_] -lt 2500 }) | Select-Object -Unique)
    if ($talking.Count) {
        foreach ($c in $talking) { [void](Energy-Item "chat:$c" @{ kind = 'chat'; chat = [string]$c; label = '' }) }
        return @($talking | ForEach-Object { "chat:$_" })
    }
    # 5. GPU busy with something the gateway didn't start
    if ($s.gu -ge 15) {
        switch ($eng) {
            'code' { [void](Energy-Item "code:$day" @{ kind = 'code'; label = 'Code workspace' }); return @("code:$day") }
            'llm'  { [void](Energy-Item "llm:$day" @{ kind = 'llm'; label = 'Chat model, outside Lumen Chat' }); return @("llm:$day") }
        }
    }
    return @('idle')
}
function Energy-Add($keys, $wh, $ms) {
    $day = Day-Key $ms
    $d = $Energy.days[$day]
    if (-not $d) { $d = @{ wh = 0.0; idle = 0.0; jobs = 0.0 }; $Energy.days[$day] = $d }
    $d['wh'] = [double]$d['wh'] + $wh
    if ($keys[0] -eq 'idle') { $d['idle'] = [double]$d['idle'] + $wh }
    else {
        $d['jobs'] = [double]$d['jobs'] + $wh
        $part = $wh / $keys.Count
        foreach ($k in $keys) {
            $it = $Energy.items[$k]; if (-not $it) { continue }
            $it['wh'] = [double]$it['wh'] + $part; $it['end'] = [long]$ms
            $kk = [string]$it['kind']; $d[$kk] = [double]$d[$kk] + $part
        }
    }
    $Energy.dirty = $true
}
$RecentChats = @{}   # chat id -> when its last answer ended (ms)
function Tick-Energy {
    $s = $null
    while ($EnergyQ.TryDequeue([ref]$s)) {
        $t = [long]$s.t
        $dt = if ($Energy.lastT) { $t - $Energy.lastT } else { 2000 }
        $Energy.lastT = $t
        if ($dt -le 0) { continue }
        if ($dt -gt 10000) { $dt = 2000 }   # a gap (gateway restart, PC asleep): count one normal interval only
        $w = Wall-Watts $s
        $Energy.now = @{ w = [Math]::Round($w.wall, 1); gpu = [Math]::Round($w.gpu, 1); cpu = [Math]::Round($w.cpu, 1); gu = $s.gu; cpuLoad = [Math]::Round([double]$s.cpu, 1); at = $t; gpuMeasured = $w.gpuMeasured }
        $keys = @(Energy-Keys $s)
        Energy-Add $keys ($w.wall * $dt / 3600000.0) $t
        $Energy.now.doing = $keys[0]
    }
    foreach ($c in @($RecentChats.Keys)) { if ((NowMs) - [long]$RecentChats[$c] -gt 60000) { $RecentChats.Remove($c) } }
    if ($Energy.dirty -and (Get-Date) -ge $Energy.saveAt) { Save-Energy; $Energy.saveAt = (Get-Date).AddMinutes(1) }
}
# A job/task finished: record its outcome and which archive entries it made.
function Energy-Close($key, $status, $entryIds) {
    $it = $Energy.items[$key]; if (-not $it) { return }
    $it['status'] = $status
    if ($entryIds) { $it['entries'] = [string[]]@($entryIds) }
    $Energy.dirty = $true
}

function Range-Days($range) {
    $today = (Get-Date).Date
    switch ($range) {
        'today' { return @($today.ToString('yyyy-MM-dd')) }
        'week'  { return @(0..6 | ForEach-Object { $today.AddDays(-$_).ToString('yyyy-MM-dd') }) }
        'month' { $first = $today.AddDays(1 - $today.Day); return @(0..($today.Day - 1) | ForEach-Object { $first.AddDays($_).ToString('yyyy-MM-dd') }) }
    }
    return $null   # all time
}
function Range-Total($range) {
    $days = Range-Days $range
    $wh = 0.0; $idle = 0.0; $jobs = 0.0; $by = @{}
    foreach ($k in @($Energy.days.Keys)) {
        if ($days -and $k -notin $days) { continue }
        $d = $Energy.days[$k]
        $wh += [double]$d['wh']; $idle += [double]$d['idle']; $jobs += [double]$d['jobs']
        foreach ($x in 'image', 'video', 'voice', 'music', 'chat', 'code', 'llm', 'load') { if ($d[$x]) { $by[$x] = [double]$by[$x] + [double]$d[$x] } }
    }
    $byc = [ordered]@{}; foreach ($x in $by.Keys) { $byc[$x] = Cents $by[$x] }
    return [ordered]@{ wh = [Math]::Round($wh, 2); cents = Cents $wh; jobs_wh = [Math]::Round($jobs, 2); jobs_c = Cents $jobs
                       idle_wh = [Math]::Round($idle, 2); idle_c = Cents $idle; by_kind = $byc }
}
function Energy-Brief {
    $d = $Energy.days[(Get-Date).ToString('yyyy-MM-dd')]
    $jobs = if ($d) { [double]$d['jobs'] } else { 0 }; $idle = if ($d) { [double]$d['idle'] } else { 0 }
    return [ordered]@{ today_c = Cents $jobs; idle_c = Cents $idle; w = $(if ($Energy.now) { $Energy.now.w } else { $null }) }
}
function Energy-Summary {
    $n = $Energy.now
    # (not named $rate: PowerShell names are case-insensitive, and Rate-C would then see this copy instead of $Rate)
    $rv = [ordered]@{}; foreach ($k in $Rate.Keys) { $rv[$k] = $Rate[$k] }
    $rv['total_c'] = Rate-C
    return [ordered]@{
        rate = $rv
        power = [ordered]@{ w = $(if ($n) { $n.w } else { $null }); gpu_w = $(if ($n) { $n.gpu } else { $null }); cpu_w = $(if ($n) { $n.cpu } else { $null })
                            gpu_util = $(if ($n) { $n.gu } else { $null }); cpu_load = $(if ($n) { $n.cpuLoad } else { $null })
                            gpu_measured = [bool]$EnergySync.gpuOk; cpu_counter = [bool]$EnergySync.cpuOk; doing = $(if ($n) { [string]$n.doing } else { '' }); error = $EnergySync.err }
        today = Range-Total 'today'; week = Range-Total 'week'; month = Range-Total 'month'; all = Range-Total 'all'
        since = $(if ($Energy.days.Count) { [string](@($Energy.days.Keys | Sort-Object)[0]) } else { (Get-Date).ToString('yyyy-MM-dd') })
    }
}
# Newest first, without a pipeline (Sort-Object would wrap the dictionaries in PSObjects, which $Json.Serialize rejects).
function Sort-NewestFirst($list) {
    $arr = $list.ToArray()
    $keys = New-Object 'double[]' $arr.Length
    for ($i = 0; $i -lt $arr.Length; $i++) { $keys[$i] = -[double]$arr[$i]['at'] }
    [Array]::Sort($keys, $arr)
    return , $arr
}
function Energy-Details($range) {
    $days = Range-Days $range
    $gal = @{}; foreach ($g in $Gallery) { $gal[[string]$g['id']] = $g }
    $studio = New-Object System.Collections.ArrayList
    $chatRows = New-Object System.Collections.ArrayList
    $other = @{}
    foreach ($key in @($Energy.items.Keys)) {
        $it = $Energy.items[$key]
        if ($days -and (Day-Key $it['end']) -notin $days) { continue }
        $kind = [string]$it['kind']; $wh = [double]$it['wh']
        if ($kind -in 'image', 'video', 'voice', 'music') {
            $ents = @($it['entries'] | Where-Object { $_ })
            if (-not $ents.Count) {
                [void]$studio.Add([ordered]@{ key = $key; kind = $kind; sub = [string]$it['sub']; label = [string]$it['label']; wh = [Math]::Round($wh, 3)
                    cents = Cents $wh; at = $it['end']; secs = [int](([long]$it['end'] - [long]$it['start']) / 1000); status = [string]$it['status']; thumb = $null; entry = $null })
                continue
            }
            $share = $wh / $ents.Count
            foreach ($eid in $ents) {
                $g = $gal[[string]$eid]
                [void]$studio.Add([ordered]@{ key = $key; kind = $(if ($g -and $g['kind']) { [string]$g['kind'] } else { $kind }); sub = [string]$it['sub']
                    label = $(if ($g) { [string]$g['prompt'] } else { [string]$it['label'] }); wh = [Math]::Round($share, 3); cents = Cents $share
                    at = $it['end']; secs = [int](([long]$it['end'] - [long]$it['start']) / 1000); status = $(if ($g) { [string]$it['status'] } else { 'deleted' })
                    thumb = $(if ($g) { [string]$g['thumb'] } else { $null }); entry = [string]$eid; batch = $ents.Count })
            }
        } elseif ($kind -eq 'chat') {
            $cid = [string]$it['chat']; $meta = $ChatIndex[$cid]
            [void]$chatRows.Add([ordered]@{ key = $key; chat = $cid; label = $(if ($meta -and $meta['title']) { [string]$meta['title'] } elseif ($meta) { [string]$meta['preview'] } else { '' })
                exists = [bool]$meta; messages = $(if ($meta) { [int]$meta['count'] } else { 0 }); wh = [Math]::Round($wh, 3); cents = Cents $wh; at = $it['end'] })
        } else {
            $o = $other[$kind]; if (-not $o) { $o = @{ wh = 0.0; days = 0; at = 0; label = [string]$it['label'] }; $other[$kind] = $o }
            $o.wh += $wh; $o.days++; if ([long]$it['end'] -gt $o.at) { $o.at = [long]$it['end'] }
        }
    }
    $olist = New-Object System.Collections.ArrayList
    foreach ($k in $other.Keys) { $o = $other[$k]; [void]$olist.Add([ordered]@{ kind = $k; label = $o.label; days = $o.days; wh = [Math]::Round($o.wh, 3); cents = Cents $o.wh; at = $o.at }) }
    $t = Range-Total $range
    return [ordered]@{ range = $range; rate_c = Rate-C; total = $t
                       studio = (Sort-NewestFirst $studio); chats = (Sort-NewestFirst $chatRows); other = (Sort-NewestFirst $olist) }
}
