"""HTTP API routers."""

from fastapi import APIRouter

from . import (anki, audiobooks, course, definer, episodes, feeds, grammar, lexicon, media, netflix, reels, reviews, search, shared, sync, system, vocab,
               voices, vowels)

router = APIRouter(prefix="/api")
for module in (feeds, episodes, media, netflix, search, vocab, definer, sync, system, anki, lexicon, reels, reviews, shared,
               vowels, voices, course, grammar, audiobooks):
    router.include_router(module.router)
