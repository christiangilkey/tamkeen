"""Ready-made limits for what the local server accepts: pydantic types for the request models.

In plain words: each name below is a kind of input (a short text, a web address, a list of ids)
together with the most it may hold. FastAPI checks a request against them before the route runs, and
answers 422 with the reason when something doesn't fit. The limits are generous on purpose: they stop
nonsense (a megabyte "title", a javascript: address), never what the app's own page sends.
"""

from __future__ import annotations

import ipaddress
import re
from typing import Annotated, Any
from urllib.parse import urlsplit

from pydantic import AfterValidator, Field, StringConstraints

MAX_URL = 8_000


def _no_controls(value: str) -> str:
    if any(ord(c) < 32 and c not in "\t\n\r" for c in value):
        raise ValueError("contains control characters")
    return value


def web_url(value: str) -> str:
    """An http(s) address with a host name, no spaces or control characters, no user:password@."""
    v = value.strip()
    if any(c.isspace() or ord(c) < 32 for c in v):
        raise ValueError("a web address can't contain spaces")
    try:
        parts = urlsplit(v)
        port = parts.port  # (raises on a port that isn't a number)
    except ValueError as exc:
        raise ValueError("that isn't a web address") from exc
    if parts.scheme.lower() not in ("http", "https") or not parts.hostname:
        raise ValueError("only web addresses (http:// or https://) can be used here")
    if parts.username is not None or parts.password is not None or (port is not None and not 0 < port < 65536):
        raise ValueError("that isn't a web address")
    return v


def _web_url_or_empty(value: str) -> str:
    return "" if not value.strip() else web_url(value)


def is_local_address(url: str) -> bool:
    """Does this address name this computer or the home network by itself (localhost, 127.0.0.1,
    192.168.x.x, 10.x, [::1], a link-local or reserved address)? For addresses a friend sent: the app
    shouldn't be made to reach the user's router or its own server for them. Names are not looked up
    (a public name is taken as public)."""
    try:
        host = (urlsplit(url.strip()).hostname or "").lower().rstrip(".")
    except ValueError:
        return True
    if not host or host == "localhost" or host.endswith((".localhost", ".local", ".internal", ".home.arpa", ".lan")):
        return True
    try:
        ip = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        # 2130706433, 0x7f000001, 127.1: other ways of writing an address that some programs accept
        return bool(re.fullmatch(r"(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+)){0,3}", host))
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return not ip.is_global


def friend_url(value: str) -> str:
    """A web address that came from a friend: http(s) only, and not this computer or the home network."""
    v = web_url(value)
    if is_local_address(v):
        raise ValueError("an address on this computer or the home network can't be used here")
    return v


def _friend_url_or_empty(value: str) -> str:
    return "" if not value.strip() else friend_url(value)


ShortText = Annotated[str, StringConstraints(max_length=500), AfterValidator(_no_controls)]
Name = Annotated[str, StringConstraints(max_length=200), AfterValidator(_no_controls)]
Title = Annotated[str, StringConstraints(max_length=2_000)]
Text = Annotated[str, StringConstraints(max_length=50_000)]
Code = Annotated[str, StringConstraints(max_length=64, pattern=r"^[A-Za-z0-9_.:+|-]*$")]  # ids, languages, models
Secret = Annotated[str, StringConstraints(max_length=2_000)]  # an API key as pasted (it is trimmed where used)
WebUrl = Annotated[str, StringConstraints(max_length=MAX_URL), AfterValidator(web_url)]
WebUrlOrEmpty = Annotated[str, StringConstraints(max_length=MAX_URL), AfterValidator(_web_url_or_empty)]
FriendUrl = Annotated[str, StringConstraints(max_length=MAX_URL), AfterValidator(friend_url)]
FriendUrlOrEmpty = Annotated[str, StringConstraints(max_length=MAX_URL), AfterValidator(_friend_url_or_empty)]
AnyUrlText = Annotated[str, StringConstraints(max_length=MAX_URL), AfterValidator(_no_controls)]  # as typed: checked by the route
IdList = Annotated[list[int], Field(max_length=10_000)]
CodeList = Annotated[list[Code], Field(max_length=10_000)]


# ---------------------------------------------------------------- settings (PATCH /api/settings)

SECRET_KEYS = ("llm_key_claude", "llm_key_gemini", "llm_key_openai", "llm_key_grok", "stt_key_groq",
               "stt_key_openai", "tts_key_azure")
MAX_SETTING_BYTES = 2_000_000  # the largest a single setting may be once written as JSON (the game's state is the biggest)
MAX_SETTING_TEXT = 100_000


def _number(lo: float, hi: float):  # noqa: ANN202
    def check(v: Any) -> str | None:
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not lo <= v <= hi:
            return f"must be a number from {lo:g} to {hi:g}"
        return None
    return check


def _choice(*allowed: str):  # noqa: ANN202
    def check(v: Any) -> str | None:
        return None if v in allowed else f"must be one of: {', '.join(allowed)}"
    return check


def _text(most: int, nullable: bool = False):  # noqa: ANN202
    def check(v: Any) -> str | None:
        if v is None and nullable:
            return None
        if not isinstance(v, str) or len(v) > most:
            return f"must be text of at most {most} characters"
        if any(ord(c) < 32 and c not in "\t\n\r" for c in v):
            return "can't contain control characters"
        return None
    return check


# The settings whose kind of value is fixed; every other allowed setting is only held to the size limits.
SETTING_RULES = {
    "theme": _choice("system", "light", "dark"),
    "font_size": _number(8, 120),
    "page_font_size": _number(8, 120),
    "beam_size": _number(1, 20),
    "tts_region_azure": _text(64, nullable=True),
    "ui_language": _text(64, nullable=True),
    "study_language": _text(64, nullable=True),
    "definer_provider": _text(32, nullable=True),
    "stt_provider": _text(32, nullable=True),
    **{k: _text(2_000, nullable=True) for k in SECRET_KEYS},
}


def setting_problem(key: str, value: Any) -> str | None:
    """Why `value` can't be stored as setting `key` (None when it can)."""
    import json

    rule = SETTING_RULES.get(key)
    if rule is not None and (problem := rule(value)):
        return f"{key} {problem}"
    if isinstance(value, str) and len(value) > MAX_SETTING_TEXT:
        return f"{key} is too long"
    try:
        size = len(json.dumps(value, ensure_ascii=False).encode("utf-8"))
    except (TypeError, ValueError):
        return f"{key} can't be stored"
    if size > MAX_SETTING_BYTES:
        return f"{key} is too big"
    return None
