"""The in-app updater (app/updates.py): which file it picks, how it checks it, and the helper
script that swaps the new version in after the app closes."""

import hashlib
from pathlib import Path

import httpx
import pytest

from app import updates

REPO = updates.GITHUB_REPO


def release(*names):
    return {"tag_name": "v9.0.0", "assets": [
        {"name": n, "size": 3, "browser_download_url": f"https://github.com/{REPO}/releases/download/v9.0.0/{n}"}
        for n in names]}


ALL = ("Tamkeen-9.0.0-Android.apk", "Tamkeen-9.0.0-Linux-x86_64.AppImage",
       "Tamkeen-9.0.0-macOS-AppleSilicon.dmg", "Tamkeen-9.0.0-Windows-Setup.exe")


def test_each_computer_gets_its_own_installer():
    r = release(*ALL)
    assert updates.pick_asset(r, "win32")["name"].endswith("-Windows-Setup.exe")
    assert updates.pick_asset(r, "darwin")["name"].endswith(".dmg")
    assert updates.pick_asset(r, "linux")["name"].endswith(".AppImage")
    assert updates.pick_asset(release("Tamkeen-9.0.0-Android.apk"), "win32") is None


def test_only_files_from_the_apps_own_releases_are_taken():
    r = release(*ALL)
    for a in r["assets"]:
        a["browser_download_url"] = a["browser_download_url"].replace(REPO, "someone/else")
    assert updates.pick_asset(r, "win32") is None


def test_run_from_source_it_cannot_replace_itself(monkeypatch):
    monkeypatch.delattr("sys.frozen", raising=False)
    assert updates.can_install("win32") is False
    out = updates.start_install()
    assert out["ok"] is False and "GitHub" in out["error"]


class FakeStream:
    def __init__(self, data):
        self.data = data
        self.headers = {"content-length": str(len(data))}

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def raise_for_status(self):
        pass

    def iter_bytes(self, n):
        yield self.data


def test_download_is_checked_against_the_listed_sha256(monkeypatch, tmp_path):
    from app import paths

    monkeypatch.setattr(paths, "tmp_dir", lambda: tmp_path)
    monkeypatch.setattr(updates.events, "publish", lambda *a: None)
    monkeypatch.setattr(httpx, "stream", lambda *a, **k: FakeStream(b"abc"))
    asset = release("Tamkeen-9.0.0-Windows-Setup.exe")["assets"][0]
    asset["digest"] = "sha256:" + hashlib.sha256(b"abc").hexdigest()
    file = updates.download(asset)
    assert file.read_bytes() == b"abc" and file.name == "Tamkeen-9.0.0-Windows-Setup.exe"

    asset["digest"] = "sha256:" + "0" * 64
    with pytest.raises(RuntimeError, match="didn't match"):
        updates.download(asset)
    assert not list(tmp_path.glob("update/*.part")), "a bad download is not left behind"


def test_a_short_download_is_refused(monkeypatch, tmp_path):
    from app import paths

    monkeypatch.setattr(paths, "tmp_dir", lambda: tmp_path)
    monkeypatch.setattr(updates.events, "publish", lambda *a: None)
    monkeypatch.setattr(httpx, "stream", lambda *a, **k: FakeStream(b"ab"))
    asset = release("Tamkeen-9.0.0-Windows-Setup.exe")["assets"][0]  # GitHub lists 3 bytes
    with pytest.raises(RuntimeError):
        updates.download(asset)


def test_windows_helper_waits_installs_silently_and_reopens():
    name, text = updates.helper_script(Path(r"C:\t\Tamkeen-9.0.0-Windows-Setup.exe"), "win32", 4242,
                                       r"C:\Apps\ArabicPodcastStudio.exe")
    assert name.endswith(".cmd")
    assert 'PID eq 4242' in text
    assert r'"C:\t\Tamkeen-9.0.0-Windows-Setup.exe" /SILENT' in text
    assert text.index("/SILENT") < text.index(r'start "" "C:\Apps\ArabicPodcastStudio.exe"')


def test_mac_helper_swaps_the_app_bundle_and_keeps_the_old_one_if_that_fails():
    name, text = updates.helper_script(Path("/tmp/u/Tamkeen-9.0.0-macOS-AppleSilicon.dmg"), "darwin", 7,
                                       "/Applications/Tamkeen.app/Contents/MacOS/Tamkeen")
    assert "kill -0 7" in text
    assert "APP=/Applications/Tamkeen.app" in text
    assert 'mv "$APP.old" "$APP"' in text
    assert text.rstrip().splitlines()[-2] == 'open "$APP"'


def test_linux_helper_replaces_the_running_appimage(monkeypatch):
    monkeypatch.setenv("APPIMAGE", "/home/u/Apps/Tamkeen.AppImage")
    _, text = updates.helper_script(Path("/tmp/u/new.AppImage"), "linux", 9, "/tmp/.mount/AppRun")
    assert "mv -f /tmp/u/new.AppImage /home/u/Apps/Tamkeen.AppImage" in text
    assert "nohup /home/u/Apps/Tamkeen.AppImage" in text
