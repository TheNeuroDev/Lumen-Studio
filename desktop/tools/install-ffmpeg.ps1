# Installs a portable ffmpeg into C:\AI\tools\ffmpeg (ACE-Step needs it to write MP3s; mode.ps1 puts
# C:\AI\tools\ffmpeg\bin on the PATH of the engines it starts). Re-runnable. Log: C:\AI\logs\audio-setup.log
$ErrorActionPreference = 'Stop'
$Dest = 'C:\AI\tools\ffmpeg'
$Log = 'C:\AI\logs\audio-setup.log'
function Log($m) { $l = "$(Get-Date -Format 'HH:mm:ss') $m"; $l; Add-Content -Path $Log -Value $l }
if (Test-Path "$Dest\bin\ffmpeg.exe") { Log "ffmpeg already installed: $(& "$Dest\bin\ffmpeg.exe" -version | Select-Object -First 1)"; return }
$zip = "$env:TEMP\ffmpeg-essentials.zip"
Log 'downloading ffmpeg (gyan.dev release essentials build)'
& curl.exe -L --fail -s -S -o $zip 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
if ($LASTEXITCODE) { throw "ffmpeg download failed (curl exit $LASTEXITCODE)" }
$tmp = "$env:TEMP\ffmpeg-unpack"
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive $zip $tmp
$inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Copy-Item "$($inner.FullName)\*" $Dest -Recurse -Force
Remove-Item $tmp, $zip -Recurse -Force -ErrorAction SilentlyContinue
Log "ffmpeg installed: $(& "$Dest\bin\ffmpeg.exe" -version | Select-Object -First 1)"
