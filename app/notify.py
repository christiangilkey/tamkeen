"""The computer's own notifications (a friend's chat message while Tamkeen isn't on screen; the page
decides when, web/js/chatnotify.js, and asks through POST /api/notify).

The app's window can't show web notifications itself, so they are the system's:
  - Windows: a toast through PowerShell's built-in Windows Runtime access (nothing to install).
    Clicking it opens tamkeen://chat/<friend id>: Windows starts Tamkeen with that link, which hands
    it to the running app like any other tamkeen:// link (applink.py), and the page opens the chat.
    The installed app's Start-menu shortcut carries the app's ID (APP_ID, installer.iss), so the toast
    says "Tamkeen"; a copy run from the code has no shortcut and borrows PowerShell's ID.
  - Mac: AppleScript's `display notification` (a click opens nothing).
  - Linux: notify-send, when the desktop has it.
Nothing waits on them: each is started and left to run; a failure is only logged.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import sys
import threading
from xml.sax.saxutils import escape, quoteattr

log = logging.getLogger(__name__)

APP_ID = "io.github.christiangilkey.Tamkeen"  # Windows' AppUserModelID (also set on the installer's shortcut)
_POWERSHELL_ID = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe"

_TOAST_SCRIPT = (
    "$ErrorActionPreference = 'Stop';"
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null;"
    "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null;"
    "$x = New-Object Windows.Data.Xml.Dom.XmlDocument; $x.LoadXml($env:TAMKEEN_TOAST);"
    "$t = New-Object Windows.UI.Notifications.ToastNotification $x;"
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($env:TAMKEEN_TOAST_APP).Show($t)"
)


def set_app_id() -> None:
    """Windows, installed app: give this process the same ID as its Start-menu shortcut, so its
    notifications and its taskbar button belong to Tamkeen. A copy run from the code keeps Python's."""
    if sys.platform != "win32" or not getattr(sys, "frozen", False):
        return
    try:
        import ctypes

        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_ID)
    except Exception:
        log.exception("Couldn't set the app's ID")


def toast_xml(title: str, text: str, link: str = "") -> str:
    """The Windows toast for one notification (clicking it opens `link`, a tamkeen:// address)."""
    launch = f" activationType=\"protocol\" launch={quoteattr(link)}" if link else ""
    return (f"<toast{launch}><visual><binding template=\"ToastGeneric\">"
            f"<text>{escape(title)}</text><text>{escape(text)}</text>"
            f"</binding></visual><audio src=\"ms-winsoundevent:Notification.IM\"/></toast>")


def _run(cmd: list[str], env: dict[str, str] | None = None) -> None:
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        r = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=20, creationflags=flags)
        if r.returncode:
            log.warning("Notification failed (%s): %s", r.returncode, (r.stderr or r.stdout).strip()[:300])
    except Exception:
        log.exception("Couldn't show a notification")


def show(title: str, text: str, link: str = "") -> bool:
    """Show a notification (in the background); False when this system has no way to."""
    title, text = (title or "Tamkeen")[:120], (text or "")[:300]
    if sys.platform == "win32":
        app_id = APP_ID if getattr(sys, "frozen", False) else _POWERSHELL_ID
        env = {**os.environ, "TAMKEEN_TOAST": toast_xml(title, text, link), "TAMKEEN_TOAST_APP": app_id}
        cmd = ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", _TOAST_SCRIPT]
    elif sys.platform == "darwin":
        # The words go in as arguments, never inside the script, so nothing in them can run.
        script = "on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run"
        env, cmd = None, ["osascript", "-e", script, title, text]
    elif shutil.which("notify-send"):
        env, cmd = None, ["notify-send", "--app-name=Tamkeen", title, text]
    else:
        return False
    threading.Thread(target=_run, args=(cmd, env), daemon=True).start()
    return True
