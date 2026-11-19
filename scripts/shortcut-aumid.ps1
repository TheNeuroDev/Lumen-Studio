# Stamp a "Lumen Studio" shortcut with the Lumen window's AppUserModelID, so Windows shows the shortcut's
# Lumen icon for the window from the moment it opens. LumenLauncher.pyw calls this when the ID changes.
#   -Create: (re)write the shortcut's target, icon and name first (used for the Start menu entry).
param([string]$Lnk = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Lumen Studio.lnk'), [Parameter(Mandatory)][string]$Id, [switch]$Create)
$Here = Split-Path -Parent $PSScriptRoot
if ($Create) {
    $s = (New-Object -ComObject WScript.Shell).CreateShortcut($Lnk)
    $s.TargetPath = "$env:LOCALAPPDATA\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.11_qbz5n2kfra8p0\pythonw.exe"
    $s.Arguments = "`"$Here\LumenLauncher.pyw`""
    $s.WorkingDirectory = $Here
    $s.IconLocation = "$Here\lumen-icon.ico,0"
    $s.Description = 'Lumen Studio'
    $s.Save()
}
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential, Pack = 4)] public struct PK { public Guid fmtid; public uint pid; }
[StructLayout(LayoutKind.Explicit, Size = 24)] public struct PV { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; }
[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IPropertyStore {
  [PreserveSig] int GetCount(out uint c); [PreserveSig] int GetAt(uint i, out PK k);
  [PreserveSig] int GetValue(ref PK k, out PV v); [PreserveSig] int SetValue(ref PK k, ref PV v); [PreserveSig] int Commit(); }
public static class L {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHGetPropertyStoreFromParsingName(string path, IntPtr bc, int flags, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore s);
  public static string Set(string path, string id) {
    Guid iid = typeof(IPropertyStore).GUID; IPropertyStore s;
    int hr = SHGetPropertyStoreFromParsingName(path, IntPtr.Zero, 2, ref iid, out s); if (hr != 0) return "open hr=" + hr;
    PK k = new PK { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
    PV v = new PV { vt = 31, p = Marshal.StringToCoTaskMemUni(id) };
    hr = s.SetValue(ref k, ref v); int c = s.Commit(); Marshal.FreeCoTaskMem(v.p); Marshal.ReleaseComObject(s);
    return "set hr=" + hr + " commit hr=" + c;
  }
}
'@
[L]::Set($Lnk, $Id)
