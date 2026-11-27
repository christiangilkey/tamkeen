"""The page's listening progress, kept by this computer so the sync can share it (app/listening.py).

The page (web/js/listensync.js) names episodes by their id on this computer; what is kept and synced names them by
their uid, the same on every device. These two routes turn one into the other. The phone's twins are in
mobile/src/js/backend.js.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from .. import db, listening, sync

router = APIRouter(tags=["listening"])

MOST_SENT = 2000  # records in one request (the page sends 500 at a time)


@router.get("/listening")
def get_listening() -> dict[str, Any]:
    """Everything kept, for the episodes still in the library, with their id here."""
    with db.session() as conn:
        kept = listening.load(conn)
        ids = {r["uid"]: r["id"] for r in conn.execute("SELECT id, uid FROM episodes WHERE deleted = 0 AND uid IS NOT NULL")}
    return {"items": [{**rec, "id": ids[uid], "uid": uid} for uid, rec in kept.items() if uid in ids]}


@router.post("/listening")
def post_listening(body: dict[str, Any]) -> dict[str, Any]:
    """Records from the page ({items: [{id, kind, ts, pos, dur, frac, done, title, sub}]}), merged into what is kept."""
    items = body.get("items")
    if not isinstance(items, list) or len(items) > MOST_SENT:
        raise HTTPException(400, "A list of at most 2000 records was expected.")
    wanted = {}
    for item in items:
        if isinstance(item, dict) and isinstance(item.get("id"), (int, str)) and str(item["id"]).isdigit():
            wanted[int(item["id"])] = item
    if not wanted:
        return {"saved": 0}
    with db.session() as conn:
        uids: dict[int, str] = {}
        ids = list(wanted)
        for i in range(0, len(ids), 500):
            chunk = ids[i:i + 500]
            rows = conn.execute(f"SELECT id, uid FROM episodes WHERE uid IS NOT NULL AND id IN ({','.join('?' * len(chunk))})", chunk)
            uids.update({r["id"]: r["uid"] for r in rows})
        theirs = {uids[i]: rec for i, rec in wanted.items() if i in uids}
        changed = listening.merge_into(conn, theirs)
    if changed:
        sync.request(60)  # the user's other devices learn what was heard here (not at every second of it)
    return {"saved": changed}
