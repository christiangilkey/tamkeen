"""Check GitHub Releases for a newer version, and install it from inside the app.

Installing: the new release's installer for this computer is downloaded (and checked against the
size and SHA-256 GitHub lists for it), then a small helper script is started that waits for this
app to close, puts the new version in place and opens it again. The app then closes itself.
  Windows  Tamkeen-<v>-Windows-Setup.exe, run silently (it installs over the old version, per user)
  macOS    Tamkeen-<v>-macOS-AppleSilicon.dmg, whose Tamkeen.app replaces the one running
  Linux    Tamkeen-<v>-Linux-x86_64.AppImage, which replaces the AppImage running
Only a packaged build can do this; run from source, the release page is offered instead.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import shlex
import subprocess
import sys
import threading
import time
from pathlib import Path, PurePosixPath
from typing import Any

import httpx

from . import events, paths
from .version import GITHUB_REPO, __version__

log = logging.getLogger(__name__)


def parse_version(v: str) -> tuple[int, ...]:
    nums = re.findall(r"\d+", v.split("-", 1)[0])
    return tuple(int(n) for n in nums[:3]) or (0,)


def is_newer(latest: str, current: str = __version__) -> bool:
    return parse_version(latest) > parse_version(current)


def _latest_release() -> httpx.Response:
    url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
    return httpx.get(url, timeout=15, follow_redirects=True, headers={"Accept": "application/vnd.github+json"})


def asset_suffix(platform: str = sys.platform) -> str | None:
    """The end of the release file name that installs on this kind of computer."""
    if platform == "win32":
        return "-Windows-Setup.exe"
    if platform == "darwin":
        return ".dmg"
    if platform.startswith("linux"):
        return ".AppImage"
    return None


def pick_asset(release: dict[str, Any], platform: str = sys.platform) -> dict[str, Any] | None:
    """This computer's installer among a release's files, if it is one of the app's own downloads."""
    suffix = asset_suffix(platform)
    prefix = f"https://github.com/{GITHUB_REPO}/releases/download/"
    for asset in release.get("assets") or []:
        name = str(asset.get("name") or "")
        url = str(asset.get("browser_download_url") or "")
        if suffix and name.startswith("Tamkeen-") and name.endswith(suffix) and url.startswith(prefix):
            return asset
    return None


def can_install(platform: str = sys.platform) -> bool:
    """Whether this copy of the app can replace itself (a packaged build, not run from source)."""
    if not getattr(sys, "frozen", False):
        return False
    if platform == "win32":
        return True
    if platform == "darwin":
        return _mac_app() is not None
    if platform.startswith("linux"):
        return bool(os.environ.get("APPIMAGE"))
    return False


def _mac_app() -> Path | None:
    """The Tamkeen.app this build runs from (…/Tamkeen.app/Contents/MacOS/Tamkeen)."""
    app = Path(sys.executable).resolve().parents[2]
    return app if app.suffix == ".app" else None


def check() -> dict[str, Any]:
    try:
        resp = _latest_release()
    except httpx.HTTPError as exc:
        return {"ok": False, "error": f"Couldn't reach GitHub: {exc}", "current": __version__}
    if resp.status_code == 404:
        return {"ok": True, "current": __version__, "latest": None, "update_available": False,
                "message": "No releases published yet."}
    if resp.status_code >= 400:
        return {"ok": False, "error": f"GitHub returned HTTP {resp.status_code}.", "current": __version__}
    data = resp.json()
    latest = str(data.get("tag_name", "")).lstrip("v")
    return {"ok": True, "current": __version__, "latest": latest, "update_available": is_newer(latest),
            "url": data.get("html_url"), "notes": (data.get("body") or "")[:2000],
            "can_install": can_install() and pick_asset(data) is not None}


# ---------- installing ----------

_lock = threading.Lock()
_state: dict[str, Any] = {"stage": "idle"}


def status() -> dict[str, Any]:
    return dict(_state)


def _set(**state: Any) -> None:
    _state.clear()
    _state.update(state)
    events.publish("update", dict(_state))


def start_install() -> dict[str, Any]:
    """Download and install the newest release in the background; progress goes out as "update"
    events: downloading (done/total bytes), installing (the app is about to close), error."""
    if not can_install():
        return {"ok": False, "error": "This copy of Tamkeen can't update itself. Download the new version from GitHub."}
    if not _lock.acquire(blocking=False):
        return {"ok": True, "already": True}
    _set(stage="downloading", done=0, total=0)
    threading.Thread(target=_install, name="update", daemon=True).start()
    return {"ok": True}


def _install() -> None:
    try:
        resp = _latest_release()
        resp.raise_for_status()
        release = resp.json()
        latest = str(release.get("tag_name", "")).lstrip("v")
        if not is_newer(latest):
            raise RuntimeError(f"You already have the newest version ({__version__}).")
        asset = pick_asset(release)
        if not asset:
            raise RuntimeError("This release has no installer for this computer.")
        file = download(asset)
        _set(stage="installing", version=latest)
        launch_helper(file)
        threading.Thread(target=_quit, name="update-quit", daemon=False).start()
    except Exception as exc:
        log.exception("Update failed")
        _set(stage="error", error=str(exc) or "The update failed.")
        _lock.release()


def download(asset: dict[str, Any]) -> Path:
    """Fetch a release file into the app's temporary folder and check it is the file GitHub lists."""
    folder = paths.tmp_dir() / "update"
    folder.mkdir(parents=True, exist_ok=True)
    name = Path(str(asset["name"])).name
    target = folder / name
    part = folder / (name + ".part")
    total = int(asset.get("size") or 0)
    digest = hashlib.sha256()
    done = 0
    last = 0.0
    with httpx.stream("GET", str(asset["browser_download_url"]), timeout=60, follow_redirects=True) as resp:
        resp.raise_for_status()
        total = total or int(resp.headers.get("content-length") or 0)
        with open(part, "wb") as fh:
            for chunk in resp.iter_bytes(1 << 16):
                fh.write(chunk)
                digest.update(chunk)
                done += len(chunk)
                if time.monotonic() - last > 0.25:
                    last = time.monotonic()
                    _set(stage="downloading", done=done, total=total)
    _set(stage="downloading", done=done, total=total)
    expected = str(asset.get("digest") or "")
    if (total and done != total) or (expected.startswith("sha256:") and expected[7:].lower() != digest.hexdigest()):
        part.unlink(missing_ok=True)
        raise RuntimeError("The download didn't match the release file. Please try again.")
    os.replace(part, target)
    return target


def helper_script(file: Path, platform: str = sys.platform, pid: int | None = None,
                  exe: str | None = None) -> tuple[str, str]:
    """(file name, text) of the script that waits for the app to close, installs `file`, and
    opens the app again."""
    pid = pid or os.getpid()
    exe = exe or sys.executable
    if platform == "win32":
        return "install-update.cmd", "\r\n".join([
            "@echo off",
            ":wait",
            # Full paths: a PATH with other tools first (Git's find, say) must not change the meaning.
            rf'"%SystemRoot%\System32\tasklist.exe" /FI "PID eq {pid}" 2>NUL | "%SystemRoot%\System32\find.exe" "{pid}" >NUL',
            r'if not errorlevel 1 ("%SystemRoot%\System32\PING.EXE" -n 2 127.0.0.1 >NUL & goto wait)',
            f'call "{file}" /SILENT /SUPPRESSMSGBOXES /NORESTART /SP- /NOCANCEL',
            f'start "" "{exe}"',
            f'del "{file}"',
            "",
        ])
    q = shlex.quote
    new = file.as_posix()
    if platform == "darwin":
        app = str(PurePosixPath(exe).parents[2])
        return "install-update.sh", "\n".join([
            "#!/bin/sh",
            f"while kill -0 {pid} 2>/dev/null; do sleep 1; done",
            f"APP={q(app)}",
            'MNT="$(mktemp -d)"',
            f'hdiutil attach -nobrowse -noautoopen -quiet -mountpoint "$MNT" {q(new)} || {{ open "$APP"; exit 1; }}',
            'rm -rf "$APP.new" "$APP.old"',
            'if ditto "$MNT/Tamkeen.app" "$APP.new" && mv "$APP" "$APP.old" && mv "$APP.new" "$APP"; then rm -rf "$APP.old";',
            'else [ -d "$APP" ] || mv "$APP.old" "$APP"; rm -rf "$APP.new"; fi',
            'hdiutil detach -quiet "$MNT"',
            'xattr -dr com.apple.quarantine "$APP" 2>/dev/null',
            'open "$APP"',
            f"rm -f {q(new)}",
            "",
        ])
    appimage = os.environ.get("APPIMAGE", exe)
    return "install-update.sh", "\n".join([
        "#!/bin/sh",
        f"while kill -0 {pid} 2>/dev/null; do sleep 1; done",
        f"chmod +x {q(new)} && mv -f {q(new)} {q(appimage)}",
        f"nohup {q(appimage)} >/dev/null 2>&1 &",
        "",
    ])


def launch_helper(file: Path) -> None:
    name, text = helper_script(file)
    script = file.parent / name
    script.write_text(text, encoding="utf-8", newline="")
    if sys.platform == "win32":
        flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
        subprocess.Popen(["cmd.exe", "/c", str(script)], creationflags=flags, close_fds=True,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        script.chmod(0o755)
        subprocess.Popen(["/bin/sh", str(script)], start_new_session=True, close_fds=True,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _quit() -> None:
    """Close the app so the helper can put the new version in place."""
    time.sleep(1.5)  # let the page show "Restarting…"
    try:
        import webview

        for window in list(webview.windows):
            window.destroy()
    except Exception:
        log.debug("No windows to close", exc_info=True)
    time.sleep(5)
    os._exit(0)
