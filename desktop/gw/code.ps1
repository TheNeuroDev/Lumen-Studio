# C:\AI\gw\code.ps1 - dot-sourced by C:\AI\gateway.ps1 at this point (shares its variables and functions).
# ---------------- Code: uploads and GitHub imports (background runspaces) ----------------
# Both can take minutes; the main loop keeps serving while they run.
$WorkPool = [RunspaceFactory]::CreateRunspacePool(1, 4)
$WorkPool.Open()
function Start-Work($script, $argList) {
    $ps = [PowerShell]::Create()
    $ps.RunspacePool = $WorkPool
    [void]$ps.AddScript($script)
    foreach ($a in $argList) { [void]$ps.AddArgument($a) }
    $job = @{ ps = $ps; handle = $ps.BeginInvoke() }
    [void]$LlmJobs.Add($job)
    return $job
}
function Project-Dir($name) {
    if (-not $name -or $name -match '[\\/:]' -or $name -in '.', '..' -or $name.StartsWith('.')) { return $null }
    $d = Join-Path $CodeRoot $name
    if (Test-Path -LiteralPath $d -PathType Container) { return $d }
    return $null
}
# Streams the request body to <file>.lumen-upload, then renames it over <file>. Never holds the file in memory.
$UploadScript = {
    param($ctx, $full, $limit)
    $res = $ctx.Response; $tmp = "$full.lumen-upload"; $code = 200; $msg = $null; $total = 0
    try {
        [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($full))
        $fs = [IO.File]::Create($tmp)
        try {
            $in = $ctx.Request.InputStream; $buf = New-Object byte[] 1048576
            while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
                $total += $n
                if ($total -gt $limit) { $code = 413; throw 'Files up to 2 GB.' }
                $fs.Write($buf, 0, $n)
            }
        } finally { $fs.Dispose() }
        if ([IO.File]::Exists($full)) { [IO.File]::Delete($full) }
        [IO.File]::Move($tmp, $full)
    } catch {
        if ($code -eq 200) { $code = 500 }
        $msg = "$($_.Exception.Message)"; try { [IO.File]::Delete($tmp) } catch {}
    }
    try {
        $body = if ($msg) { '{"error":"' + ($msg -replace '\\', '\\' -replace '"', '\"' -replace '[\r\n]+', ' ') + '"}' } else { '{"ok":true,"bytes":' + $total + '}' }
        $b = [Text.Encoding]::UTF8.GetBytes($body)
        $res.StatusCode = $code; $res.ContentType = 'application/json; charset=utf-8'; $res.ContentLength64 = $b.Length
        $res.OutputStream.Write($b, 0, $b.Length)
    } catch {} finally { try { $res.Close() } catch {} }
}
# Public GitHub repo -> zip from codeload.github.com -> unpacked into $dir (the zip's top folder stripped).
$ImportScript = {
    param($owner, $repo, $branch, $dir, $sync)
    $zip = Join-Path $env:TEMP "lumen-import-$([Guid]::NewGuid().ToString('N')).zip"
    $tmp = "$zip.d"; $c = $null
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Add-Type -AssemblyName System.Net.Http
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $c = New-Object System.Net.Http.HttpClient
        $c.Timeout = [TimeSpan]::FromMinutes(30)
        $c.DefaultRequestHeaders.UserAgent.ParseAdd('Lumen-Studio/1.0')
        if (-not $branch) {
            $sync.stage = 'finding the repository'
            $r = $c.GetAsync("https://api.github.com/repos/$owner/$repo").Result
            $code = [int]$r.StatusCode
            if ($code -eq 404) { throw "github.com/$owner/$repo was not found. It may be private: only public repositories can be imported for now." }
            if ($code -eq 403 -or $code -eq 429) { throw "GitHub's lookup limit was reached. Try again later, or add the branch to the link (e.g. github.com/$owner/$repo/tree/main)." }
            if (-not $r.IsSuccessStatusCode) { throw "GitHub answered HTTP $code." }
            $txt = $r.Content.ReadAsStringAsync().Result
            if ($txt -match '"default_branch"\s*:\s*"([^"]+)"') { $branch = $Matches[1] } else { $branch = 'main' }
        }
        $sync.stage = 'downloading'
        $r = $c.GetAsync("https://codeload.github.com/$owner/$repo/zip/refs/heads/$([Uri]::EscapeUriString($branch))", [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).Result
        if ([int]$r.StatusCode -eq 404) { throw "Branch '$branch' of github.com/$owner/$repo was not found (or the repository is private)." }
        if (-not $r.IsSuccessStatusCode) { throw "The download failed: HTTP $([int]$r.StatusCode)." }
        $src = $r.Content.ReadAsStreamAsync().Result
        $fs = [IO.File]::Create($zip)
        try { $buf = New-Object byte[] 1048576; while (($n = $src.Read($buf, 0, $buf.Length)) -gt 0) { $fs.Write($buf, 0, $n); $sync.bytes += $n } }
        finally { $fs.Dispose(); $src.Dispose() }
        $sync.stage = 'unpacking'
        [IO.Compression.ZipFile]::ExtractToDirectory($zip, $tmp)
        $top = @(Get-ChildItem -LiteralPath $tmp -Force)
        $from = if ($top.Count -eq 1 -and $top[0].PSIsContainer) { $top[0].FullName } else { $tmp }
        foreach ($it in @(Get-ChildItem -LiteralPath $from -Force)) { Move-Item -LiteralPath $it.FullName -Destination $dir }
        $sync.branch = $branch
        $sync.stage = 'done'
    } catch {
        $e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }
        $sync.error = "$($e.Message)"
    } finally {
        if ($c) { $c.Dispose() }
        Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
        $sync.finished = $true
    }
}
function Tick-Import($t) {
    $s = $t.sync
    if ($s.stage -eq 'downloading' -and $s.bytes) { $t.stage = "downloading ($([Math]::Round($s.bytes / 1MB, 1)) MB)" } else { $t.stage = [string]$s.stage }
    if (-not $s.finished) {
        if (((Get-Date) - $t.started).TotalMinutes -gt 40) { Fail-Task $t 'The import took too long.' }
        return
    }
    if ($s.error) {
        Fail-Task $t $s.error
        # Leave nothing half-made behind: remove the new folder if it is still empty.
        if (-not @(Get-ChildItem -LiteralPath $t.dir -Force -ErrorAction SilentlyContinue).Count) { Remove-Item -LiteralPath $t.dir -Force -ErrorAction SilentlyContinue }
        return
    }
    Done-Task $t ([ordered]@{ name = [string]$t.name; path = [string]$t.dir; repo = [string]$t.repo; branch = [string]$s.branch })
}

# ---------------- Code: Artifacts, Preview and Settings (2026-11-18) ----------------
#   GET  /gw/code/tree?project=<name>            files in one thread folder (no .git), newest first
#   GET  /gw/code/raw/<project>/<path>[?download=1]  one file, typed for in-page preview (sandboxed: see below)
#   GET  /gw/code/zip?projects=<a>|<b>           zip of one or more thread folders (no .git)
#   GET  /gw/code/all                            every thread folder: size, files, last change, OpenCode sessions
#   POST /gw/code/delete {names}                 delete thread folders for good (no trash)
#   POST /gw/code/rename {from, to}              rename a thread folder; its OpenCode sessions move with it
foreach ($kv in @{ '.md' = 'text/plain; charset=utf-8'; '.markdown' = 'text/plain; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
                   '.csv' = 'text/plain; charset=utf-8'; '.tsv' = 'text/plain; charset=utf-8'; '.log' = 'text/plain; charset=utf-8'
                   '.py' = 'text/plain; charset=utf-8'; '.ts' = 'text/plain; charset=utf-8'; '.tsx' = 'text/plain; charset=utf-8'
                   '.jsx' = 'text/plain; charset=utf-8'; '.mjs' = 'text/javascript'; '.xml' = 'text/xml; charset=utf-8'
                   '.yml' = 'text/plain; charset=utf-8'; '.yaml' = 'text/plain; charset=utf-8'; '.toml' = 'text/plain; charset=utf-8'
                   '.ps1' = 'text/plain; charset=utf-8'; '.sh' = 'text/plain; charset=utf-8'; '.bat' = 'text/plain; charset=utf-8'
                   '.c' = 'text/plain; charset=utf-8'; '.h' = 'text/plain; charset=utf-8'; '.cpp' = 'text/plain; charset=utf-8'
                   '.cs' = 'text/plain; charset=utf-8'; '.java' = 'text/plain; charset=utf-8'; '.go' = 'text/plain; charset=utf-8'
                   '.rs' = 'text/plain; charset=utf-8'; '.rb' = 'text/plain; charset=utf-8'; '.php' = 'text/plain; charset=utf-8'
                   '.sql' = 'text/plain; charset=utf-8'; '.ini' = 'text/plain; charset=utf-8'; '.env' = 'text/plain; charset=utf-8'
                   '.htm' = 'text/html; charset=utf-8'; '.gif' = 'image/gif'; '.ico' = 'image/x-icon'; '.bmp' = 'image/bmp'; '.avif' = 'image/avif'
                   '.pdf' = 'application/pdf'; '.woff' = 'font/woff'; '.woff2' = 'font/woff2'; '.ttf' = 'font/ttf'; '.otf' = 'font/otf'
                   '.wasm' = 'application/wasm'; '.mov' = 'video/quicktime'; '.m4a' = 'audio/mp4'; '.glb' = 'model/gltf-binary'; '.gltf' = 'model/gltf+json' }.GetEnumerator()) {
    if (-not $Mime.ContainsKey($kv.Key)) { $Mime[$kv.Key] = $kv.Value }
}
$CodeFileCap = 5000   # entries listed per folder
function Code-Files($dir, $cap) {
    # Files under $dir (skips .git); [ordered] rows the page turns into a tree.
    $rows = New-Object System.Collections.ArrayList; $bytes = [long]0; $count = 0; $last = [long]0
    $stack = New-Object System.Collections.Stack; $stack.Push($dir)
    while ($stack.Count) {
        $d = $stack.Pop()
        try { $subs = [IO.Directory]::GetDirectories($d) } catch { $subs = @() }
        foreach ($s in $subs) { if ([IO.Path]::GetFileName($s) -ne '.git') { $stack.Push($s) } }
        try { $files = [IO.Directory]::GetFiles($d) } catch { $files = @() }
        foreach ($f in $files) {
            try { $fi = New-Object IO.FileInfo($f) } catch { continue }
            if ($fi.Name -like '*.lumen-upload') { continue }
            $count++; $bytes += $fi.Length
            $ms = [long]([DateTimeOffset]$fi.LastWriteTimeUtc).ToUnixTimeMilliseconds(); if ($ms -gt $last) { $last = $ms }
            if ($cap -and $rows.Count -lt $cap) {
                [void]$rows.Add([ordered]@{ p = [string]($f.Substring($dir.Length + 1) -replace '\\', '/'); s = [long]$fi.Length; m = $ms })
            }
        }
    }
    return @{ rows = $rows; bytes = $bytes; count = $count; last = $last }
}
# OpenCode sessions for one folder (titles for Settings). Only asks when the workspace is up; 2 s at most.
$OcClient = New-Object System.Net.Http.HttpClient; $OcClient.Timeout = [TimeSpan]::FromSeconds(2)
# One request to OpenCode with its login (secrets\opencode-*.txt). Returns the response, or $null.
function Oc-Send($method, $pathAndQuery, $body = $null) {
    try {
        $pw = ''; $pf = "$Root\secrets\opencode-password.txt"; if (Test-Path -LiteralPath $pf) { $pw = ([IO.File]::ReadAllText($pf)).Trim() }
        $un = 'opencode'; $uf = "$Root\secrets\opencode-username.txt"; if (Test-Path -LiteralPath $uf) { $t = ([IO.File]::ReadAllText($uf)).Trim(); if ($t) { $un = $t } }
        $msg = New-Object System.Net.Http.HttpRequestMessage((New-Object System.Net.Http.HttpMethod($method)), "$Code$pathAndQuery")
        if ($pw) { $msg.Headers.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Basic', [Convert]::ToBase64String($Utf8.GetBytes("${un}:$pw"))) }
        if ($null -ne $body) { $msg.Content = New-Object System.Net.Http.StringContent($Json.Serialize($body), $Utf8, 'application/json') }
        return $OcClient.SendAsync($msg).Result
    } catch { return $null }
}
function Oc-Sessions($dir) {
    $list = New-Object System.Collections.ArrayList
    try {
        $r = Oc-Send 'GET' "/session?directory=$([Uri]::EscapeDataString($dir))"
        if (-not $r -or -not $r.IsSuccessStatusCode) { return , $list }
        $arr = $Json.DeserializeObject($r.Content.ReadAsStringAsync().Result)
        foreach ($x in @($arr)) {
            if (-not $x -or -not $x.ContainsKey('id')) { continue }
            if ($x['directory'] -and ([string]$x['directory']).TrimEnd('\') -ne $dir.TrimEnd('\')) { continue }
            if ($x['parentID']) { continue }   # sub-agent runs, not chats
            $up = 0; $cr = 0; $ar = 0; try { $up = [long]$x['time']['updated']; $cr = [long]$x['time']['created']; $ar = [long]$x['time']['archived'] } catch {}
            if ($ar) { continue }
            [void]$list.Add([ordered]@{ id = [string]$x['id']; title = [string]$x['title']; updated = $up; created = $cr })
        }
    } catch {}
    return , $list   # the comma keeps PowerShell from unrolling the list
}
# ---------------- Code: chats (OpenCode sessions) per project (2026-11-19) ----------------
#   GET  /gw/code/chats?project=<name>           the project's chats, newest first
#   POST /gw/code/chats/new {project}             start a chat in that folder (fenced to it like every session)
#   POST /gw/code/chats/rename {project, id, title}
#   POST /gw/code/chats/delete {project, id}      for good; the project's files stay
# Rename/delete only touch a chat that belongs to that project's folder.
function Handle-CodeChats($ctx, $m, $path) {
    if ($path -ne '/gw/code/chats' -and $path -notlike '/gw/code/chats/*') { return $false }
    $data = if ($m -eq 'POST') { Read-Json $ctx } else { , [Web.HttpUtility]::ParseQueryString($ctx.Request.Url.Query) }   # comma: don't unroll it into its keys
    $dir = Project-Dir ([string]$data['project'])
    if (-not $dir) { Send-Json $ctx 404 @{ error = 'No such project.' }; return $true }
    if ((Ping "$Code/") -le 0) { Send-Json $ctx 503 @{ error = "The coding workspace isn't running." }; return $true }
    $q = "?directory=$([Uri]::EscapeDataString($dir))"
    $sorted = { param($l) $a = $l.ToArray(); $k = New-Object 'long[]' $a.Length; for ($i = 0; $i -lt $a.Length; $i++) { $k[$i] = -[long]$a[$i]['updated'] }; [Array]::Sort($k, $a); , $a }
    if ($m -eq 'GET' -and $path -eq '/gw/code/chats') {
        Send-Json $ctx 200 ([ordered]@{ project = [string](Split-Path -Leaf $dir); chats = (& $sorted (Oc-Sessions $dir)) }); return $true
    }
    if ($m -ne 'POST') { Send-Json $ctx 405 @{ error = 'method' }; return $true }
    if ($path -eq '/gw/code/chats/new') {
        $r = Oc-Send 'POST' "/session$q" @{}
        if (-not $r -or -not $r.IsSuccessStatusCode) { Send-Json $ctx 502 @{ error = "Couldn't start a chat." }; return $true }
        $s = $Json.DeserializeObject($r.Content.ReadAsStringAsync().Result)
        Log "code chat started: $dir $($s['id'])"
        Send-Json $ctx 200 ([ordered]@{ id = [string]$s['id']; title = [string]$s['title'] }); return $true
    }
    $id = [string]$data['id']
    if ($id -notmatch '^ses_?[A-Za-z0-9]+$' -or -not @((Oc-Sessions $dir) | Where-Object { $_['id'] -ceq $id }).Count) { Send-Json $ctx 404 @{ error = 'That chat is not in this project.' }; return $true }
    if ($path -eq '/gw/code/chats/rename') {
        $title = (([string]$data['title']) -replace '[\x00-\x1f\x7f]', ' ' -replace '\s+', ' ').Trim()
        if (-not $title -or $title.Length -gt 100) { Send-Json $ctx 400 @{ error = 'Use 1 to 100 characters.' }; return $true }
        $r = Oc-Send 'PATCH' "/session/$id$q" @{ title = $title }
        if (-not $r -or -not $r.IsSuccessStatusCode) { Send-Json $ctx 502 @{ error = "Couldn't rename the chat." }; return $true }
        Send-Json $ctx 200 ([ordered]@{ ok = $true; id = $id; title = $title }); return $true
    }
    if ($path -eq '/gw/code/chats/delete') {
        $st = Oc-Send 'GET' "/session/status$q"
        if ($st -and $st.IsSuccessStatusCode) {
            $map = $Json.DeserializeObject($st.Content.ReadAsStringAsync().Result)
            if ($map -is [Collections.IDictionary] -and $map.ContainsKey($id)) {
                $v = $map[$id]; $ty = if ($v -is [Collections.IDictionary]) { [string]$v['type'] } else { [string]$v }
                if ($ty -and $ty -ne 'idle') { Send-Json $ctx 409 @{ error = 'The agent is still working in this chat. Stop it first.' }; return $true }
            }
        }
        $r = Oc-Send 'DELETE' "/session/$id$q"
        if (-not $r -or -not $r.IsSuccessStatusCode) { Send-Json $ctx 502 @{ error = "Couldn't delete the chat." }; return $true }
        Log "code chat deleted: $dir $id"
        Send-Json $ctx 200 ([ordered]@{ ok = $true; id = $id }); return $true
    }
    Send-Json $ctx 404 @{ error = 'not found' }; return $true
}
# Streams a zip of $dirs (each as its own top folder, .git left out) from a temp file, on a work runspace.
$ZipScript = {
    param($ctx, $dirs, $name)
    $res = $ctx.Response
    $tmp = Join-Path $env:TEMP ("lumen-zip-" + [Guid]::NewGuid().ToString('N') + '.zip')
    try {
        Add-Type -AssemblyName System.IO.Compression
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $fs = [IO.File]::Create($tmp)
        $za = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Create)
        try {
            foreach ($d in $dirs) {
                $base = [IO.Path]::GetDirectoryName($d)
                foreach ($f in [IO.Directory]::EnumerateFiles($d, '*', 'AllDirectories')) {
                    $rel = $f.Substring($base.Length + 1) -replace '\\', '/'
                    if ($rel -match '(^|/)\.git/' -or $rel -like '*.lumen-upload') { continue }
                    try { [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($za, $f, $rel) } catch {}
                }
            }
        } finally { $za.Dispose(); $fs.Dispose() }
        $in = [IO.File]::OpenRead($tmp)
        try {
            $res.StatusCode = 200; $res.ContentType = 'application/zip'
            $res.Headers['Content-Disposition'] = "attachment; filename=`"$name`""; $res.Headers['Cache-Control'] = 'no-store'
            $res.ContentLength64 = $in.Length
            $in.CopyTo($res.OutputStream, 1048576)
        } finally { $in.Dispose() }
    } catch { try { $res.StatusCode = 500 } catch {} }
    finally { try { $res.Close() } catch {}; Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
}
$PreviewShim = '<script>(function(){function m(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}["localStorage","sessionStorage"].forEach(function(n){try{window[n].length}catch(e){try{Object.defineProperty(window,n,{value:m(),configurable:true})}catch(_){}}})})();</script>'
# Returns $true when it answered the request.
function Handle-CodeFiles($ctx, $m, $path) {
    $req = $ctx.Request
    if ($m -eq 'GET' -and $path -eq '/gw/code/tree') {
        $q = [Web.HttpUtility]::ParseQueryString($req.Url.Query)
        $dir = Project-Dir ([string]$q['project'])
        if (-not $dir) { Send-Json $ctx 404 @{ error = 'No such project.' }; return $true }
        $r = Code-Files $dir $CodeFileCap
        # Newest first, sorted with .NET (rows from a pipeline come out PSObject-wrapped, which $Json.Serialize rejects).
        $rows = $r.rows.ToArray(); $keys = New-Object 'long[]' $rows.Length
        for ($k = 0; $k -lt $rows.Length; $k++) { $keys[$k] = -[long]$rows[$k]['m'] }
        [Array]::Sort($keys, $rows)
        Send-Json $ctx 200 ([ordered]@{ project = [string](Split-Path -Leaf $dir); path = [string]$dir; files = $rows; count = $r.count; bytes = $r.bytes
                                        last = $r.last; truncated = [bool]($r.count -gt $CodeFileCap) }); return $true
    }
    if ($m -in 'GET', 'HEAD' -and $path -like '/gw/code/raw/*') {
        $rest = $path.Substring(13); $i = $rest.IndexOf('/')
        if ($i -lt 1) { Send-Json $ctx 404 @{ error = 'not found' }; return $true }
        $dir = Project-Dir ([Uri]::UnescapeDataString($rest.Substring(0, $i)))
        $rel = [Uri]::UnescapeDataString($rest.Substring($i + 1))
        $full = if ($dir -and $rel -and $rel -notmatch '(^|/)\.git(/|$)') { Inside $dir $rel } else { $null }
        if (-not $full) { Send-Json $ctx 404 @{ error = 'not found' }; return $true }
        if ((Test-Path -LiteralPath $full -PathType Container)) { $full = Join-Path $full 'index.html' }
        # Pages the model wrote run with an opaque origin: they can't read Lumen's data or call its API.
        $ctx.Response.Headers['Content-Security-Policy'] = 'sandbox allow-scripts allow-forms allow-modals allow-popups allow-downloads'
        $q = [Web.HttpUtility]::ParseQueryString($req.Url.Query)
        if ($q['download']) { $ctx.Response.Headers['Content-Disposition'] = "attachment; filename=`"$([IO.Path]::GetFileName($full) -replace '"', '')`"" }
        # HTML previews get a tiny shim: in the sandbox, localStorage/sessionStorage throw, which breaks many pages
        # (saved scores, settings). The shim swaps in an in-memory store (kept until the preview reloads).
        if (-not $q['download'] -and [IO.Path]::GetExtension($full).ToLower() -in '.html', '.htm' -and (Test-Path -LiteralPath $full -PathType Leaf)) {
            $fi = New-Object IO.FileInfo($full)
            if ($fi.Length -lt 20MB) {
                $html = [IO.File]::ReadAllText($full)
                $at = 0; $mm = [regex]::Match($html, '<head\b[^>]*>', 'IgnoreCase'); if ($mm.Success) { $at = $mm.Index + $mm.Length }
                $html = $html.Insert($at, $PreviewShim)
                Send $ctx 200 ($Utf8.GetBytes($html)) 'text/html; charset=utf-8' 'no-cache'; return $true
            }
        }
        Send-File $ctx $full 'no-cache'; return $true
    }
    if ($m -eq 'GET' -and $path -eq '/gw/code/zip') {
        $q = [Web.HttpUtility]::ParseQueryString($req.Url.Query)
        $dirs = @(); foreach ($n in ([string]$q['projects']).Split('|')) { $d = Project-Dir $n; if ($d) { $dirs += $d } }
        if (-not $dirs.Count) { Send-Json $ctx 404 @{ error = 'No such project.' }; return $true }
        $name = if ($dirs.Count -eq 1) { (Split-Path -Leaf $dirs[0]) + '.zip' } else { "lumen-code-$($dirs.Count)-projects-$(Get-Date -Format 'yyyy-MM-dd').zip" }
        $name = $name -replace '[^\w .\-]', '_'
        Start-Work $ZipScript @($ctx, $dirs, $name) | Out-Null; return $true
    }
    if ($m -eq 'GET' -and $path -eq '/gw/code/all') {
        $list = New-Object System.Collections.ArrayList; $total = [long]0
        $ocUp = (Ping "$Code/") -gt 0
        if (Test-Path -LiteralPath $CodeRoot) {
            foreach ($d in @(Get-ChildItem -LiteralPath $CodeRoot -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike '.*' })) {
                $r = Code-Files $d.FullName 0; $total += $r.bytes
                $last = if ($r.last) { $r.last } else { [long]([DateTimeOffset]$d.LastWriteTimeUtc).ToUnixTimeMilliseconds() }
                $ses = New-Object System.Collections.ArrayList; if ($ocUp) { $ses = Oc-Sessions $d.FullName }
                [void]$list.Add([ordered]@{ name = [string]$d.Name; path = [string]$d.FullName; bytes = $r.bytes; files = $r.count; modified = $last
                                            created = [long]([DateTimeOffset]$d.CreationTimeUtc).ToUnixTimeMilliseconds()
                                            git = [bool](Test-Path -LiteralPath (Join-Path $d.FullName '.git')); sessions = $ses.ToArray() })
            }
        }
        $free = $null; try { $free = [long](New-Object IO.DriveInfo ([IO.Path]::GetPathRoot($CodeRoot))).AvailableFreeSpace } catch {}
        Send-Json $ctx 200 ([ordered]@{ root = $CodeRoot; projects = $list.ToArray(); bytes = $total; free = $free; sessions_known = [bool]$ocUp }); return $true
    }
    if ($m -eq 'POST' -and $path -eq '/gw/code/delete') {
        $data = Read-Json $ctx
        $gone = New-Object System.Collections.ArrayList; $failed = New-Object System.Collections.ArrayList
        foreach ($n in @($data['names'])) {
            $d = Project-Dir ([string]$n)
            if (-not $d) { continue }
            try { Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction Stop; [void]$gone.Add([string]$n); Log "code project deleted: $d" }
            catch { [void]$failed.Add([ordered]@{ name = [string]$n; error = "$($_.Exception.Message)" }) }
        }
        Send-Json $ctx 200 ([ordered]@{ ok = ($failed.Count -eq 0); deleted = $gone.ToArray(); failed = $failed.ToArray() }); return $true
    }
    if ($m -eq 'POST' -and $path -eq '/gw/code/rename') {
        $data = Read-Json $ctx
        $r = Rename-CodeProject ([string]$data['from']) ([string]$data['to'])
        Send-Json $ctx $r.code $r.body; return $true
    }
    return $false
}
# Renames a project folder and re-points OpenCode's saved sessions at the new folder (tools\oc-rename.js),
# so the project's chats stay with it. Refuses while the agent is working there or files are still arriving.
function Rename-CodeProject($from, $to) {
    $fail = { param($c, $e) @{ code = $c; body = @{ error = $e } } }
    $old = Project-Dir $from
    if (-not $old) { return & $fail 404 'No such project.' }
    # Same rules as New project.
    $name = ($to.Trim() -replace '[^\w .\-]', '' -replace '\s+', ' ').Trim(' ', '.')
    if (-not $name -or $name.Length -gt 60) { return & $fail 400 'Use letters, numbers, spaces, dots or dashes (up to 60).' }
    if ($name -ne $to.Trim()) { return & $fail 400 "Names can only use letters, numbers, spaces, dots and dashes. Try `"$name`"." }
    if (($name -replace '\..*$', '') -match '^(con|prn|aux|nul|com\d|lpt\d)$') { return & $fail 400 "Windows doesn't allow a folder called $name." }
    $oldName = Split-Path -Leaf $old
    if ($name -ceq $oldName) { return @{ code = 200; body = [ordered]@{ ok = $true; name = $name; path = [string]$old; sessions = 0 } } }
    $new = Join-Path $CodeRoot $name
    $caseOnly = $name -eq $oldName   # -eq ignores case: Windows sees the same folder
    if (-not $caseOnly -and (Test-Path -LiteralPath $new)) { return & $fail 409 "There's already a project called $name." }
    # Busy checks: a GitHub import still unpacking, an upload still streaming in, or the agent mid-answer.
    foreach ($t in @($Tasks.Values)) {
        if ($t.kind -eq 'import' -and $t.status -eq 'running' -and [string]$t.dir -eq $old) { return & $fail 409 'This project is still being imported. Rename it when that finishes.' }
    }
    if (@(Get-ChildItem -LiteralPath $old -Recurse -Force -Filter '*.lumen-upload' -ErrorAction SilentlyContinue | Select-Object -First 1).Count) {
        return & $fail 409 'Files are still uploading into this project. Rename it when they finish.'
    }
    $ocUp = (Ping "$Code/") -gt 0
    $q = "?directory=$([Uri]::EscapeDataString($old))"
    if ($ocUp) {
        $st = Oc-Send 'GET' "/session/status$q"
        if ($st -and $st.IsSuccessStatusCode) {
            $map = $Json.DeserializeObject($st.Content.ReadAsStringAsync().Result)
            if ($map -is [Collections.IDictionary]) {
                foreach ($v in $map.Values) {
                    $ty = if ($v -is [Collections.IDictionary]) { [string]$v['type'] } else { [string]$v }
                    if ($ty -and $ty -ne 'idle') { return & $fail 409 'Lumen Code is working in this project right now. Let it finish (or stop it), then rename.' }
                }
            }
        }
        # Let go of the folder: OpenCode watches the files of every project it has open.
        [void](Oc-Send 'POST' "/instance/dispose$q")
    }
    # Rename the folder (a case-only change goes through a temporary name). Retries while file watchers let go.
    $moved = $false; $err = $null
    for ($i = 0; $i -lt 6 -and -not $moved; $i++) {
        try {
            if ($caseOnly) { $tmp = "$old.lumen-rename"; [IO.Directory]::Move($old, $tmp); [IO.Directory]::Move($tmp, $new) }
            else { [IO.Directory]::Move($old, $new) }
            $moved = $true
        } catch { $err = $_.Exception.Message; Start-Sleep -Milliseconds 500 }
    }
    if (-not $moved) {
        if ($caseOnly -and (Test-Path -LiteralPath "$old.lumen-rename")) { try { [IO.Directory]::Move("$old.lumen-rename", $old) } catch {} }
        Log "code project rename failed: $old -> $new : $err"
        return & $fail 409 'A program on the desktop has a file in this project open, so it could not be renamed. Close it and try again.'
    }
    # Re-point OpenCode's sessions (its database, backed up first). On failure, put the folder back.
    $sessions = 0
    $db = "$env:USERPROFILE\.local\share\opencode\opencode.db"
    if ((-not $env:USERPROFILE -or -not (Test-Path -LiteralPath $db)) -and $LumenCfg['opencodeDb']) { $db = [string]$LumenCfg['opencodeDb'] }   # S4U task: USERPROFILE may be unset
    if (Test-Path -LiteralPath $db) {
        $exe = "$Root\tools\code-gate\lumen-gate.exe"; if (-not (Test-Path -LiteralPath $exe)) { $exe = "$Root\tools\opencode\opencode.exe" }
        $out = ''; $ok = $false
        try {
            $psi = New-Object Diagnostics.ProcessStartInfo $exe
            $psi.Arguments = '"{0}" "{1}" "{2}" "{3}" "{4}"' -f "$Root\tools\oc-rename.js", $db, $old, $new, "$Root\archive\opencode-db"
            $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true; $psi.CreateNoWindow = $true
            $psi.EnvironmentVariables['BUN_BE_BUN'] = '1'
            $p = [Diagnostics.Process]::Start($psi)
            $out = $p.StandardOutput.ReadToEnd(); $errTxt = $p.StandardError.ReadToEnd()
            if (-not $p.WaitForExit(30000)) { try { $p.Kill() } catch {} }
            $res = $null; try { $res = $Json.DeserializeObject(($out.Trim() -split "`n")[-1]) } catch {}
            if ($res -and $res['ok']) { $ok = $true; $sessions = [int]$res['sessions'] } else { $out = "$out $errTxt".Trim() }
        } catch { $out = $_.Exception.Message }
        if (-not $ok) {
            try {
                if ($caseOnly) { [IO.Directory]::Move($new, "$old.lumen-rename"); [IO.Directory]::Move("$old.lumen-rename", $old) }
                else { [IO.Directory]::Move($new, $old) }
            } catch { Log "code project rename: could not move $new back: $($_.Exception.Message)" }
            Log "code project rename undone (OpenCode sessions not updated): $old -> $new : $out"
            return & $fail 500 "Couldn't move the project's chats, so nothing was renamed. ($out)"
        }
    }
    Log "code project renamed: $old -> $new ($sessions OpenCode sessions moved)"
    return @{ code = 200; body = [ordered]@{ ok = $true; name = $name; path = [string]$new; sessions = $sessions } }
}
