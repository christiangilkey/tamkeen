"""HTTP API routers."""

from fastapi import APIRouter

from . import anki, definer, episodes, feeds, lexicon, media, search, sync, system, vocab

router = APIRouter(prefix="/api")
for module in (feeds, episodes, media, search, vocab, definer, sync, system, anki, lexicon):
    router.include_router(module.router)
