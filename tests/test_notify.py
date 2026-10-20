"""Chat notifications on the computer: app/notify.py, POST /api/notify and tamkeen://chat links."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app import applink, notify

FRIEND = "0a1b2c3d-1111-2222-3333-444455556666"


def test_the_toast_is_escaped_and_clicks_open_the_chat():
    xml = notify.toast_xml('Asaad <3 & "co"', "Sent you a web page: <b>x</b>", f"tamkeen://chat/{FRIEND}")
    assert f'launch="tamkeen://chat/{FRIEND}"' in xml and 'activationType="protocol"' in xml
    assert "<b>" not in xml and "&lt;b&gt;" in xml and "&lt;3 &amp;" in xml
    assert "launch" not in notify.toast_xml("A", "B"), "no link: clicking only dismisses it"


def test_chat_links_are_read_like_the_phone_reads_them():
    assert applink.parse_chat(f"tamkeen://chat/{FRIEND}") == FRIEND
    assert applink.parse_chat(f"tamkeen://chat/{FRIEND.upper()}/") == FRIEND
    for bad in ("tamkeen://chat/", "tamkeen://chat/../settings", f"https://chat/{FRIEND}", "tamkeen://watch?v=dQw4w9WgXcQ"):
        assert applink.parse_chat(bad) is None, bad
    assert applink.parse_any(f"tamkeen://chat/{FRIEND}") == {"chat": FRIEND}
    assert applink.parse_any("tamkeen://watch?v=dQw4w9WgXcQ")["video_id"] == "dQw4w9WgXcQ"


def test_the_page_asks_the_server_for_a_notification(monkeypatch):
    from app.main import create_app

    shown = []
    monkeypatch.setattr(notify, "show", lambda title, text, link="": shown.append((title, text, link)) or True)
    with TestClient(create_app(start_worker=False)) as client:
        r = client.post("/api/notify", json={"title": "Asaad", "text": "Hola", "friend": FRIEND})
        assert r.json() == {"shown": True}
        assert shown[-1] == ("Asaad", "Hola", f"tamkeen://chat/{FRIEND}")
        client.post("/api/notify", json={"title": "Asaad", "text": "Hola", "friend": "../../x"})
        assert shown[-1][2] == "", "a friend id that isn't one: no link"
