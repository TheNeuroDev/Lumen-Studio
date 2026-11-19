"""Lumen Studio launcher (laptop). No window, no tray icon: the Lumen app window is the app.

Double-click the "Lumen Studio" Desktop shortcut:
  1. Connects Tailscale if it is off (about half a second).
  2. Opens Lumen as an app window (no tabs, no address bar) in a private, portable
     ungoogled-chromium kept in app\\engine (no Google or Microsoft services, no sync, no
     accounts, no auto-update). Its profile lives in app\\profile. If app\\engine is missing,
     it falls back to a separate Firefox profile in browser-profile\\.
     The page (#launch) lands on whatever model the desktop already runs, or loads the
     Studio image model when nothing is running.
  3. Waits in the background. When you close the last Lumen window it wipes the session's
     history, cache and logs (settings and permissions stay), then disconnects this laptop
     from Tailscale (DISCONNECT_ON_CLOSE = False keeps it connected).
Clicking the shortcut again while Lumen is open opens another Lumen window.
Standard library only; the .pyw extension runs it with pythonw (no console).
"""

import ctypes
import glob
import json
import os
import shutil
import socket
import subprocess
import sys
import time
from ctypes import wintypes

HERE = os.path.dirname(os.path.abspath(__file__))
# Your values live in lumen.config.json next to this file (copy lumen.config.example.json; not in git).
try:
    with open(os.path.join(HERE, "lumen.config.json"), encoding="utf-8-sig") as _f:
        _CFG = json.load(_f)
except (OSError, ValueError):
    _CFG = {}
PAGE_URL = _CFG.get("publicUrl", "https://YOUR-DESKTOP.YOUR-TAILNET.ts.net").rstrip("/") + "/#launch"
DISCONNECT_ON_CLOSE = bool(_CFG.get("disconnectTailscaleOnClose", False))  # keep False if you run the Syncthing mirror
TAILSCALE = r"C:\Program Files\Tailscale\tailscale.exe"
CHROMIUM = os.path.join(HERE, "app", "engine", "chrome.exe")
CHROMIUM_PROFILE = os.path.join(HERE, "app", "profile")
FIREFOX = r"C:\Program Files\Mozilla Firefox\firefox.exe"
FIREFOX_PROFILE = os.path.join(HERE, "browser-profile")
LOG = os.path.join(HERE, "app", "launcher.log")
LOCK_PORT = 47113  # same port as the old tunnel app, so the two can never run together
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
USE_CHROMIUM = os.path.isfile(CHROMIUM)
PROFILE = CHROMIUM_PROFILE if USE_CHROMIUM else FIREFOX_PROFILE
LOCK_FILE = os.path.join(PROFILE, "lockfile" if USE_CHROMIUM else "parent.lock")

# ---------------- ungoogled-chromium: private app window ----------------
CHROMIUM_FLAGS = [
    "--user-data-dir=" + CHROMIUM_PROFILE,
    "--no-first-run", "--no-default-browser-check",
    "--disable-sync", "--disable-background-networking", "--disable-component-update",
    "--disable-domain-reliability", "--disable-breakpad", "--no-pings", "--no-report-upload",
    "--disable-client-side-phishing-detection", "--disable-logging",
    "--disable-features=Translate,MediaRouter,DialMediaRouteProvider,OptimizationHints,"
    "AutofillServerCommunication,InterestFeedContentSuggestions,SpareRendererForSitePerProcess,"
    "PrivacySandboxSettings4,BackgroundFetch",
]
# Written once, before the profile's first run.
LOCAL_STATE = {
    "background_mode": {"enabled": False},  # nothing keeps running after the window closes
    "user_experience_metrics": {"reporting_enabled": False},
    "browser": {"has_seen_welcome_page": True},
}
PREFERENCES = {
    # Password saving ON (for the Lumen Code login): kept on this laptop only, in the
    # profile's Login Data (encrypted with your Windows account), never synced, not wiped on close.
    "credentials_enable_service": True,
    "profile": {"password_manager_enabled": True,
                "default_content_setting_values": {"notifications": 2, "geolocation": 2}},
    "autofill": {"profile_enabled": False, "credit_card_enabled": False},
    "search": {"suggest_enabled": False},
    "alternate_error_pages": {"enabled": False},
    "net": {"network_prediction_options": 2},
    "safebrowsing": {"enabled": False},
    "translate": {"enabled": False},
    "spellcheck": {"use_spelling_service": False},
    "enable_do_not_track": True,
    "browser": {"has_seen_welcome_page": True, "check_default_browser": False},
    "download": {"prompt_for_download": True},
}
# Deleted after every session: browsing history, caches, session restore data, logs.
# Kept: Preferences (incl. mic permission), Local Storage / IndexedDB (the page's own settings).
WIPE = ["History*", "Visited Links", "Top Sites*", "Shortcuts*", "Network Action Predictor*",
        "Favicons*", "Sessions*", "Session Storage", "Cache", "Code Cache", "GPUCache", "DawnCache",
        "DawnGraphiteCache", "DawnWebGPUCache", "Reporting and NEL*", "*.log", "LOG", "LOG.old",
        "BrowsingTopics*", "Conversions*", "Shared Dictionary", "blob_storage"]
WIPE_ROOT = ["Crashpad", "GrShaderCache", "ShaderCache", "GraphiteDawnCache", "*.log", "BrowserMetrics*"]


def _merge(dst, src):
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            _merge(dst[k], v)
        else:
            dst[k] = v


def seed_chromium_profile():
    default = os.path.join(CHROMIUM_PROFILE, "Default")
    prefs = os.path.join(default, "Preferences")
    if os.path.exists(prefs):
        # Re-apply our settings on every start (only while the browser is closed: it rewrites the file on exit).
        if not browser_open():
            try:
                with open(prefs, encoding="utf-8") as f:
                    cur = json.load(f)
                _merge(cur, PREFERENCES)
                with open(prefs, "w", encoding="utf-8") as f:
                    json.dump(cur, f)
            except (OSError, ValueError) as e:
                log(f"prefs not updated: {e}")
        return
    os.makedirs(default, exist_ok=True)
    with open(os.path.join(CHROMIUM_PROFILE, "Local State"), "w", encoding="utf-8") as f:
        json.dump(LOCAL_STATE, f)
    with open(os.path.join(default, "Preferences"), "w", encoding="utf-8") as f:
        json.dump(PREFERENCES, f)
    open(os.path.join(CHROMIUM_PROFILE, "First Run"), "w").close()


def wipe_chromium_session():
    for base, pats in ((os.path.join(CHROMIUM_PROFILE, "Default"), WIPE), (CHROMIUM_PROFILE, WIPE_ROOT)):
        for pat in pats:
            for p in glob.glob(os.path.join(base, pat)):
                try:
                    shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
                except OSError as e:
                    log(f"wipe skipped {p}: {e}")

# ---------------- Firefox fallback (only when app\engine is missing) ----------------
USER_JS = """\
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.aboutwelcome.enabled", false);
user_pref("trailhead.firstrun.didSeeAboutWelcome", true);
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("startup.homepage_welcome_url", "");
user_pref("startup.homepage_welcome_url.additional", "");
user_pref("browser.startup.page", 0);
user_pref("browser.startup.homepage", "about:blank");
user_pref("browser.newtabpage.enabled", false);
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("browser.tabs.warnOnClose", false);
user_pref("browser.warnOnQuit", false);
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
user_pref("datareporting.healthreport.uploadEnabled", false);
user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);
user_pref("signon.rememberSignons", false);
"""


# ---------------- common ----------------
def log(msg):
    try:
        os.makedirs(os.path.dirname(LOG), exist_ok=True)
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n")
    except OSError:
        pass


def run(args, timeout=20):
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=timeout,
                           creationflags=NO_WINDOW)
        return r.returncode, (r.stdout + r.stderr).strip()
    except (OSError, subprocess.SubprocessError) as e:
        return -1, str(e)


def tailscale_running():
    rc, out = run([TAILSCALE, "status", "--json"], timeout=10)
    return '"BackendState": "Running"' in out


_k32 = ctypes.WinDLL("kernel32", use_last_error=True)
_k32.CreateFileW.restype = wintypes.HANDLE
_k32.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID,
                             wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
_k32.CloseHandle.argtypes = [wintypes.HANDLE]


_k32.OpenProcess.restype = wintypes.HANDLE
_k32.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR,
                                            ctypes.POINTER(wintypes.DWORD)]
_psapi = ctypes.WinDLL("psapi")


def profile_locked():
    """The browser keeps its profile's lock file open, so an exclusive (share mode 0) open fails
    with a sharing violation. Read-only probe, changes nothing."""
    h = _k32.CreateFileW(LOCK_FILE, 0x80000000, 0, None, 3, 0, None)
    if h == wintypes.HANDLE(-1).value:
        return ctypes.get_last_error() == 32  # ERROR_SHARING_VIOLATION; 2 = no lock file = closed
    _k32.CloseHandle(h)
    return False


def engine_running():
    """Any process running our own chrome.exe (by full path)? Not used for the Firefox fallback."""
    if not USE_CHROMIUM:
        return False
    pids = (wintypes.DWORD * 4096)()
    needed = wintypes.DWORD()
    if not _psapi.EnumProcesses(pids, ctypes.sizeof(pids), ctypes.byref(needed)):
        return False
    want = os.path.normcase(CHROMIUM)
    buf = ctypes.create_unicode_buffer(1024)
    for pid in pids[:needed.value // ctypes.sizeof(wintypes.DWORD)]:
        h = _k32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            continue
        n = wintypes.DWORD(len(buf))
        ok = _k32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(n))
        _k32.CloseHandle(h)
        if ok and os.path.normcase(buf.value) == want:
            return True
    return False


def browser_open():
    return profile_locked() or engine_running()


# ---------------- taskbar identity ----------------
# Chromium gives each app window an AppUserModelID but no icon of its own, so the taskbar shows Chromium's
# blue icon. Windows takes a group's icon from a shortcut carrying the same ID, so the Desktop and Start menu
# "Lumen Studio" shortcuts get the window's ID (sync_shortcut_ids). Each window also gets this launcher as
# its relaunch command, with the Lumen icon, so pinning it pins Lumen.
ICON = os.path.join(HERE, "lumen-icon.ico")
# The Store Python's app-execution alias (sys.executable points inside WindowsApps, which can't be launched).
PYTHONW = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WindowsApps",
                       "PythonSoftwareFoundation.Python.3.11_qbz5n2kfra8p0", "pythonw.exe")
if not os.path.exists(PYTHONW):
    PYTHONW = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")


class _PK(ctypes.Structure):
    _fields_ = [("fmtid", ctypes.c_byte * 16), ("pid", wintypes.DWORD)]


class _PV(ctypes.Structure):
    _fields_ = [("vt", ctypes.c_ushort), ("r1", ctypes.c_ushort), ("r2", ctypes.c_ushort),
                ("r3", ctypes.c_ushort), ("p", ctypes.c_void_p), ("pad", ctypes.c_void_p)]


_APPUSERMODEL = bytes.fromhex("55284C9F799F394BA8D0E1D42DE1D5F3")  # {9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}
_IID_PROPSTORE = bytes.fromhex("EB8E6D88F28C46448D02CDBA1DBDCF99")  # {886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99}
_u32 = ctypes.WinDLL("user32")
_shell32 = ctypes.WinDLL("shell32")
_ole32 = ctypes.WinDLL("ole32")
_WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
_u32.EnumWindows.argtypes = [_WNDENUMPROC, wintypes.LPARAM]
_u32.IsWindowVisible.argtypes = [wintypes.HWND]
_u32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
_u32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
_shell32.SHGetPropertyStoreForWindow.argtypes = [wintypes.HWND, ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
_GetValue = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, ctypes.POINTER(_PK), ctypes.POINTER(_PV))
_ole32.CoTaskMemFree.argtypes = [ctypes.c_void_p]
_SetValue = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, ctypes.POINTER(_PK), ctypes.POINTER(_PV))
_Commit = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p)
_Release = ctypes.WINFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p)
_stamped = set()


def _stamp(hwnd):
    store = ctypes.c_void_p()
    iid = (ctypes.c_byte * 16).from_buffer_copy(_IID_PROPSTORE)
    if _shell32.SHGetPropertyStoreForWindow(wintypes.HWND(hwnd), ctypes.byref(iid), ctypes.byref(store)) != 0:
        return False
    vtbl = ctypes.cast(ctypes.cast(store, ctypes.POINTER(ctypes.c_void_p))[0], ctypes.POINTER(ctypes.c_void_p))
    get_value, set_value = _GetValue(vtbl[5]), _SetValue(vtbl[6])
    commit, release = _Commit(vtbl[7]), _Release(vtbl[2])
    # Read the window's own ID (Chromium's). We keep it: changing it makes the taskbar regroup the window,
    # which shows Chromium's icon for a moment. Instead the Lumen shortcuts carry this same ID.
    key = _PK((ctypes.c_byte * 16).from_buffer_copy(_APPUSERMODEL), 5)
    pv = _PV()
    app_id = None
    if get_value(store, ctypes.byref(key), ctypes.byref(pv)) == 0 and pv.vt == 31 and pv.p:
        app_id = ctypes.wstring_at(pv.p)
        _ole32.CoTaskMemFree(ctypes.c_void_p(pv.p))
    relaunch = f'"{PYTHONW}" "{os.path.abspath(__file__)}"'
    for pid, val in ((2, relaunch), (3, ICON + ",0"), (4, "Lumen Studio")):
        key = _PK((ctypes.c_byte * 16).from_buffer_copy(_APPUSERMODEL), pid)
        buf = ctypes.create_unicode_buffer(val)
        pv = _PV(31, 0, 0, 0, ctypes.cast(buf, ctypes.c_void_p), None)  # VT_LPWSTR
        set_value(store, ctypes.byref(key), ctypes.byref(pv))
    commit(store)
    release(store)
    return app_id


def stamp_lumen_windows():
    """Give every new top-level Lumen window our taskbar identity."""
    if not USE_CHROMIUM:
        return
    want = os.path.normcase(CHROMIUM)
    buf = ctypes.create_unicode_buffer(1024)

    def each(hwnd, _):
        if hwnd in _stamped or not _u32.IsWindowVisible(hwnd) or _u32.GetWindowTextLengthW(hwnd) == 0:
            return True
        pid = wintypes.DWORD()
        _u32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        h = _k32.OpenProcess(0x1000, False, pid.value)
        if h:
            n = wintypes.DWORD(len(buf))
            ok = _k32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(n))
            _k32.CloseHandle(h)
            if ok and os.path.normcase(buf.value) == want:
                app_id = _stamp(hwnd)
                _stamped.add(hwnd)
                if app_id:
                    sync_shortcut_ids(app_id)
        return True

    _u32.EnumWindows(_WNDENUMPROC(each), 0)


AUMID_FILE = os.path.join(HERE, "app", "aumid.txt")
START_MENU_LNK = os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu",
                              "Programs", "Lumen Studio.lnk")
DESKTOP_LNK = os.path.join(os.path.expanduser("~"), "OneDrive", "Desktop", "Lumen Studio.lnk")


def sync_shortcut_ids(app_id):
    """Give the Lumen shortcuts (Desktop + Start menu) the window's own ID, so Windows shows the
    shortcut's Lumen icon for the window from the moment it opens. Only does work when the ID changes."""
    try:
        with open(AUMID_FILE, encoding="utf-8") as f:
            if f.read().strip() == app_id:
                return
    except OSError:
        pass
    script = os.path.join(HERE, "scripts", "shortcut-aumid.ps1")
    for lnk in (DESKTOP_LNK, START_MENU_LNK):
        rc, out = run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script,
                       "-Lnk", lnk, "-Id", app_id, "-Create"], timeout=60)
        log(f"shortcut id {lnk}: {out}")
    with open(AUMID_FILE, "w", encoding="utf-8") as f:
        f.write(app_id)


def browser_closed_for_good():
    """Closed and still closed 4 s later (rides out the browser restarting itself)."""
    for _ in range(3):
        if browser_open():
            return False
        time.sleep(2)
    return not browser_open()  # re-check after the last wait, or a window opened in it is missed


def open_page(first):
    if USE_CHROMIUM:
        args = [CHROMIUM] + CHROMIUM_FLAGS + ["--app=" + PAGE_URL]
    else:
        args = [FIREFOX, "-profile", FIREFOX_PROFILE, "--new-instance" if first else "--new-tab", PAGE_URL]
    subprocess.Popen(args, creationflags=NO_WINDOW, close_fds=True)


def main():
    os.makedirs(PROFILE, exist_ok=True)
    lock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        lock.bind(("127.0.0.1", LOCK_PORT))
    except OSError:  # already running: open another Lumen window
        open_page(False)
        # The running launcher may be mid-shutdown (window just closed) and about to turn Tailscale off.
        # If it exits within 15 s, take over: reconnect and watch this window instead.
        for _ in range(15):
            time.sleep(1)
            try:
                lock.bind(("127.0.0.1", LOCK_PORT))
                break
            except OSError:
                pass
        else:
            return
        log("took over from a launcher that was closing")
        time.sleep(2)  # let its `tailscale down` finish before we bring it back up
        took_over = True
    else:
        took_over = False
    if USE_CHROMIUM:
        seed_chromium_profile()
    elif not os.path.exists(os.path.join(PROFILE, "user.js")):
        with open(os.path.join(PROFILE, "user.js"), "w", encoding="utf-8") as f:
            f.write(USER_JS)

    if not tailscale_running():
        rc, out = run([TAILSCALE, "up"], timeout=30)
        log(f"tailscale up rc={rc} {out}")
    if not took_over:
        open_page(not browser_open())
        log(("chromium" if USE_CHROMIUM else "firefox") + " opened " + PAGE_URL)

    # Give the browser time to take the profile lock, then wait for the last Lumen window to close.
    # Stamp the new window as soon as it appears (polled fast for the first 15 s).
    for _ in range(60):
        stamp_lumen_windows()
        if _stamped or (not USE_CHROMIUM and browser_open()):
            break
        time.sleep(0.25)
    while not browser_closed_for_good():
        stamp_lumen_windows()  # windows opened later (another click of the shortcut)
        time.sleep(1)
    log("Lumen window closed")
    if USE_CHROMIUM:
        wipe_chromium_session()
    if DISCONNECT_ON_CLOSE:
        rc, out = run([TAILSCALE, "down"])
        log(f"tailscale down rc={rc} {out}")
    lock.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # never fail silently: leave a trace in the log
        log(f"error: {e!r}")
        sys.exit(1)
