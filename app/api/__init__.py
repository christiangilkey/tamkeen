"""HTTP API routers."""

from fastapi import APIRouter

from . import anki, definer, episodes, feeds, search, sync, system, vocab

router = APIRouter(prefix="/api")
for module in (feeds, episodes, search, vocab, definer, sync, system, anki):
    router.include_router(module.router)
