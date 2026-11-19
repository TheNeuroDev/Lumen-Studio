# Give the Lumen app window its own taskbar identity, so it groups with (and pins as) the Lumen Studio
# shortcut, with the Lumen icon, instead of Chromium's. Run by LumenLauncher.pyw once the window is up.
#   powershell -File scripts\window-aumid.ps1 [-Show]
param([switch]$Show)
$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $PSScriptRoot
$Id = 'LumenStudio.App'
$Icon = Join-Path $Here 'lumen-icon.ico'
$Py = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source   # set your own path here if pythonw is not on PATH
if (-not $Py) { throw 'pythonw.exe not found: install Python 3.11+ or set $Py' }
$Relaunch = "`"$Py`" `"$(Join-Path $Here 'LumenLauncher.pyw')`""
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential, Pack = 4)] public struct PK { public Guid fmtid; public uint pid; }
[StructLayout(LayoutKind.Explicit, Size = 24)] public struct PV { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; }
[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IPropertyStore {
  [PreserveSig] int GetCount(out uint c); [PreserveSig] int GetAt(uint i, out PK k);
  [PreserveSig] int GetValue(ref PK k, out PV v); [PreserveSig] int SetValue(ref PK k, ref PV v); [PreserveSig] int Commit(); }
public static class A {
  [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr h, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore s);
  static IPropertyStore Store(IntPtr h) { Guid iid = typeof(IPropertyStore).GUID; IPropertyStore s; int hr = SHGetPropertyStoreForWindow(h, ref iid, out s); if (hr != 0) throw new Exception("store hr=" + hr); return s; }
  static PK Key(uint pid) { return new PK { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = pid }; }
  public static string Get(IntPtr h, uint pid) { PK k = Key(pid); PV v; Store(h).GetValue(ref k, out v); return v.vt == 31 ? Marshal.PtrToStringUni(v.p) : "(vt " + v.vt + ")"; }
  public static void Set(IntPtr h, uint pid, string val) {
    IPropertyStore s = Store(h); PK k = Key(pid); PV v = new PV { vt = 31, p = Marshal.StringToCoTaskMemUni(val) };
    int hr = s.SetValue(ref k, ref v); if (hr != 0) throw new Exception("set hr=" + hr); s.Commit(); Marshal.FreeCoTaskMem(v.p); }
}
'@
$wins = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.Path -like "$Here\app\engine\*" }
if (-not $wins) { 'no Lumen window'; exit 1 }
foreach ($w in $wins) {
  $h = $w.MainWindowHandle
  if (-not $Show) {
    # Relaunch props first, the ID last (changing the ID re-registers the window with the taskbar).
    [A]::Set($h, 2, $Relaunch); [A]::Set($h, 3, "$Icon,0"); [A]::Set($h, 4, 'Lumen Studio'); [A]::Set($h, 5, $Id)
  }
  "window $h ID=$([A]::Get($h, 5)) icon=$([A]::Get($h, 3)) name=$([A]::Get($h, 4))"
}
