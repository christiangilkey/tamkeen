import os
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Isolate every test session from the real user data folder.
os.environ["APS_DATA_DIR"] = tempfile.mkdtemp(prefix="aps-test-")

FIXTURES = ROOT / "tests" / "fixtures"


def _act_as_the_apps_page() -> None:
    """The local server only takes changes from Tamkeen's own page, which carries this run's session
    token (app/guard.py). A test client stands in for that page: it sends the app's token unless the
    test gives its own X-Tamkeen-Session header (an empty one to act as a stranger; tests/test_security.py)."""
    from starlette.testclient import TestClient

    if getattr(TestClient.__init__, "_tamkeen", False):
        return
    original = TestClient.__init__

    def init(self, app, *args, headers=None, **kwargs):  # type: ignore[no-untyped-def]
        token = getattr(getattr(app, "state", None), "session_token", "")
        if token:
            headers = {"X-Tamkeen-Session": token, **(headers or {})}
        original(self, app, *args, headers=headers, **kwargs)

    init._tamkeen = True  # type: ignore[attr-defined]
    TestClient.__init__ = init  # type: ignore[method-assign]


_act_as_the_apps_page()


@pytest.fixture()
def fresh_db(tmp_path, monkeypatch):
    """A brand-new empty database for one test."""
    from app import db, paths

    monkeypatch.setattr(paths, "db_path", lambda: tmp_path / "library.db")
    db.init_db(tmp_path / "library.db")
    return tmp_path / "library.db"
