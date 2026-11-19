# Lumen: Syncthing state of the "lumen" mirror folder on this machine (read-only).
$h = @{ 'X-API-Key' = ([xml](Get-Content "$env:LOCALAPPDATA\Syncthing\config.xml")).configuration.gui.apikey }; $b = 'http://127.0.0.1:8384/rest'
foreach ($p in (Invoke-RestMethod "$b/system/connections" -Headers $h).connections.PSObject.Properties) {
    '{0} connected={1} addr={2} type={3}' -f $p.Name.Substring(0, 7), $p.Value.connected, $p.Value.address, $p.Value.type }
$f = Invoke-RestMethod "$b/db/status?folder=lumen" -Headers $h
'state={0} local={1} files global={2} needFiles={3} needMB={4:N0} errors={5} pullErrors={6}' -f $f.state, $f.localFiles, $f.globalFiles, $f.needFiles, ($f.needBytes / 1MB), $f.errors, $f.pullErrors
