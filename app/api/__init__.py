"""HTTP API routers."""

from fastapi import APIRouter

from . import anki, definer, episodes, feeds, lexicon, media, reels, search, sync, system, vocab

router = APIRouter(prefix="/api")
for module in (feeds, episodes, media, search, vocab, definer, sync, system, anki, lexicon, reels):
    router.include_router(module.router)
