"""The open-source licences on the computer's About page and in Settings come from licenses/index.json,
the list the phone and web app show too (mobile/scripts/build-www.mjs copies their part of it)."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]


def test_about_lists_the_computers_licences_from_the_shared_list(fresh_db):
    from app.main import create_app

    listed = json.loads((ROOT / "licenses" / "index.json").read_text(encoding="utf-8"))
    with TestClient(create_app(start_worker=False)) as client:
        about = client.get("/api/about").json()
        names = [x["file"] for x in about["licenses"]]
        # Everything not marked for the phones only, in the list's order.
        assert names == [x["file"] for x in listed if "desktop" in x.get("on", ["desktop"])]
        assert "capacitor.txt" not in names  # the phones' frame
        assert {"whisper.txt", "supabase-js.txt", "pdfjs.txt"} <= set(names)
        text = client.get("/api/licenses/supabase-js.txt")
        assert text.status_code == 200 and "MIT License" in text.text
        assert client.get("/api/licenses/index.json").status_code == 200  # (a plain file there, harmless)
        assert client.get("/api/licenses/..%2Fapp%2Fmain.py").status_code == 404
