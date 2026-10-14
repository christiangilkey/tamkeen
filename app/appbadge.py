"""The number of review cards left today on the app's icon while it is open: a small badge on the
taskbar button (Windows) or on the Dock icon (macOS). No notification is involved. Elsewhere
(Linux, browser mode) it does nothing.

Windows has no ready-made "number" badge, so a 32 x 32 icon with the number is drawn here, pixel by
pixel (no image library in the app), and set with ITaskbarList3.SetOverlayIcon through ctypes.
"""

from __future__ import annotations

import logging
import os
import sys

from .version import APP_NAME

log = logging.getLogger(__name__)

# 5 x 7 pixel digits (and "+"), one string per row, "#" = ink.
GLYPHS = {
    "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
    "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
}
SIZE = 32
BADGE = (0xBD, 0x3F, 0xBA)  # the brand purple (r, g, b)


def label(count: int) -> str:
    """What the badge says: nothing at 0, "99+" past 99."""
    return "" if count <= 0 else str(count) if count < 100 else "99+"


def draw(text: str) -> bytes:
    """A SIZE x SIZE picture of `text` in white on a purple circle, as top-down BGRA bytes with the
    colours premultiplied by alpha (what Windows expects for an icon with soft edges)."""
    px = bytearray(SIZE * SIZE * 4)
    c = (SIZE - 1) / 2
    for y in range(SIZE):
        for x in range(SIZE):
            d = ((x - c) ** 2 + (y - c) ** 2) ** 0.5
            a = max(0.0, min(1.0, SIZE / 2 - d))  # a one-pixel soft edge
            i = (y * SIZE + x) * 4
            px[i:i + 4] = bytes((round(BADGE[2] * a), round(BADGE[1] * a), round(BADGE[0] * a), round(255 * a)))
    scale = 3 if len(text) == 1 else 2 if len(text) == 2 else 1
    width = len(text) * 5 * scale + (len(text) - 1) * scale
    left, top = (SIZE - width) // 2, (SIZE - 7 * scale) // 2
    for n, ch in enumerate(text):
        for row, line in enumerate(GLYPHS[ch]):
            for col, ink in enumerate(line):
                if ink != "#":
                    continue
                for dy in range(scale):
                    for dx in range(scale):
                        x = left + n * 6 * scale + col * scale + dx
                        y = top + row * scale + dy
                        if 0 <= x < SIZE and 0 <= y < SIZE:
                            i = (y * SIZE + x) * 4
                            px[i:i + 4] = b"\xff\xff\xff\xff"
    return bytes(px)


def set_count(count: int) -> bool:
    """Show `count` on the app's icon (0 clears it). True when the system took it."""
    if os.environ.get("APS_DESKTOP") != "1":
        return False
    try:
        if sys.platform == "win32":
            return _windows(label(count))
        if sys.platform == "darwin":
            return _mac(label(count))
    except Exception:
        log.exception("Couldn't set the icon's number")
    return False


def _mac(text: str) -> bool:
    from AppKit import NSApplication
    from PyObjCTools import AppHelper

    AppHelper.callAfter(lambda: NSApplication.sharedApplication().dockTile().setBadgeLabel_(text or None))
    return True


def _windows(text: str) -> bool:
    import ctypes
    from ctypes import wintypes

    # Own copies of the libraries, so the argument types set here don't change them for other code.
    user32, gdi32, ole32 = ctypes.WinDLL("user32"), ctypes.WinDLL("gdi32"), ctypes.WinDLL("ole32")
    user32.DestroyIcon.argtypes = [wintypes.HICON]
    gdi32.DeleteObject.argtypes = [wintypes.HGDIOBJ]
    user32.FindWindowW.restype = wintypes.HWND
    hwnd = user32.FindWindowW(None, APP_NAME)  # the main window (browser windows are "… · Tamkeen")
    if not hwnd:
        return False

    class GUID(ctypes.Structure):
        _fields_ = [("a", ctypes.c_ulong), ("b", ctypes.c_ushort), ("c", ctypes.c_ushort), ("d", ctypes.c_ubyte * 8)]

    def guid(s: str) -> GUID:
        g = GUID()
        ole32.CLSIDFromString(ctypes.c_wchar_p(s), ctypes.byref(g))
        return g

    ole32.CoInitializeEx(None, 0x2)  # this thread's COM, single-threaded; "already done" is fine
    taskbar = ctypes.c_void_p()
    hr = ole32.CoCreateInstance(ctypes.byref(guid("{56FDF344-FD6D-11d0-958A-006097C9A090}")), None, 1,
                                ctypes.byref(guid("{EA1AFB91-9E28-4B86-90E9-9E9F8A5EEFAF}")), ctypes.byref(taskbar))
    if hr != 0 or not taskbar:
        return False
    vtbl = ctypes.cast(taskbar, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
    method = lambda i, *args: ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, *args)(vtbl[i])  # noqa: E731
    try:
        method(3)(taskbar)  # HrInit
        icon = _icon(text, user32, gdi32) if text else None
        method(18, wintypes.HWND, wintypes.HICON, wintypes.LPCWSTR)(
            taskbar, hwnd, icon, f"{text} cards to review today" if text else None)  # SetOverlayIcon
        if icon:
            user32.DestroyIcon(icon)  # the taskbar keeps its own copy
        return True
    finally:
        method(2)(taskbar)  # Release


def _icon(text: str, user32, gdi32):
    import ctypes
    from ctypes import wintypes

    class BITMAPINFOHEADER(ctypes.Structure):
        _fields_ = [("biSize", wintypes.DWORD), ("biWidth", wintypes.LONG), ("biHeight", wintypes.LONG),
                    ("biPlanes", wintypes.WORD), ("biBitCount", wintypes.WORD), ("biCompression", wintypes.DWORD),
                    ("biSizeImage", wintypes.DWORD), ("biXPelsPerMeter", wintypes.LONG),
                    ("biYPelsPerMeter", wintypes.LONG), ("biClrUsed", wintypes.DWORD), ("biClrImportant", wintypes.DWORD)]

    class ICONINFO(ctypes.Structure):
        _fields_ = [("fIcon", wintypes.BOOL), ("xHotspot", wintypes.DWORD), ("yHotspot", wintypes.DWORD),
                    ("hbmMask", wintypes.HBITMAP), ("hbmColor", wintypes.HBITMAP)]

    header = BITMAPINFOHEADER(ctypes.sizeof(BITMAPINFOHEADER), SIZE, -SIZE, 1, 32, 0, 0, 0, 0, 0, 0)
    bits = ctypes.c_void_p()
    gdi32.CreateDIBSection.restype = wintypes.HBITMAP
    gdi32.CreateBitmap.restype = wintypes.HBITMAP
    user32.CreateIconIndirect.restype = wintypes.HICON
    color = gdi32.CreateDIBSection(None, ctypes.byref(header), 0, ctypes.byref(bits), None, 0)
    pixels = draw(text)
    ctypes.memmove(bits, pixels, len(pixels))
    mask = gdi32.CreateBitmap(SIZE, SIZE, 1, 1, bytes(SIZE * SIZE // 8))
    try:
        return user32.CreateIconIndirect(ctypes.byref(ICONINFO(True, 0, 0, mask, color)))
    finally:
        gdi32.DeleteObject(color)
        gdi32.DeleteObject(mask)
