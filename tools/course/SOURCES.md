# Where Basics' Frequency words come from, and whether a paid app may use each source

Checked 2026-11-27 from each source's own licence page (links below). "Free for a paid app" is a reading of the
licence text, not legal advice. Nothing marked **check only** is shipped with Tamkeen or used to choose words.

## Used to make the lists

| Source | What it is | Made by | Licence | Free for a paid app? | Used for |
|---|---|---|---|---|---|
| [wordfreq 3.1.1](https://github.com/rspeer/wordfreq) | Word counts blended from many corpora (below) | Robyn Speer | Code Apache 2.0; data CC BY-SA 4.0 | **Yes**, with credit; lists made from it are CC BY-SA too | Every language's written counts (30% of the blend; all of words 1–1000) |
| ↳ its corpora | Wikipedia, OpenSubtitles 2018, SUBTLEX, NewsCrawl, Google Books Ngrams, OSCAR (web), Twitter, Reddit, ParaCrawl, Leeds Internet Corpus, GlobalVoices | various | wordfreq releases only counts; Google Books "any purpose"; Wikipedia/Leeds/ParaCrawl Creative Commons; SUBTLEX by permission with credit; **NewsCrawl, OSCAR, Reddit, GlobalVoices: no licence stated** | Counts only, as wordfreq publishes them: yes. **Doubtful**: a few underlying corpora state no licence (wordfreq's own choice of CC BY-SA covers its counts) | (inside wordfreq) |
| [FrequencyWords 2018](https://github.com/hermitdave/FrequencyWords) | Word counts of film and TV subtitles | Hermit Dave, from [OpenSubtitles 2018](http://www.opensubtitles.org/) via [OPUS](https://opus.nlpl.eu/) | Code MIT; content CC BY-SA 4.0; OpenSubtitles: "may be used with attribution" | **Yes**, with credit (and to OpenSubtitles). **Doubtful**: the rights in the subtitle texts themselves are not stated; only counts are used | 70% of the blend for words 1001–3000 (ar ca de en es fa fr hi it ja pt ru zh) |
| [Thai National Corpus counts](https://github.com/PyThaiNLP/pythainlp) (`tnc_freq.txt`) | Thai word counts | Chulalongkorn University (TNC), published by PyThaiNLP | PyThaiNLP's file: CC0 | **Doubtful**: CC0 for PyThaiNLP's file, but no official TNC terms were found (one list labels a TNC list "all rights reserved") | Thai's ranking (its own counts) |
| [OPUS NLLB](https://opus.nlpl.eu/legacy/NLLB.php) (Cebuano web text) | Web text in Cebuano | Meta / AllenAI, via OPUS | ODC-By 1.0, plus Common Crawl's terms | **Yes**, with credit | Bisaya's ranking (its own counts) |
| Korean film and TV subtitles counted by dictionary form | Lemma counts | Tamkeen, from OpenSubtitles via FrequencyWords | CC BY-SA 4.0 | **Yes**, with credit | Korean's ranking (its own counts) |
| [OpenRussian](https://github.com/Badestrand/russian-dictionary) | Russian dictionary tables | OpenRussian.org contributors | CC BY-SA 4.0 | **Yes**, with credit | Grouping Russian into dictionary words |
| [Wiktionary](https://en.wiktionary.org/wiki/Wiktionary:Copyrights) via [kaikki.org / wiktextract](https://kaikki.org/dictionary/) | Word tables (forms → dictionary word) | Wiktionary editors; Tatu Ylönen | CC BY-SA 4.0 and GFDL | **Yes**, with credit | Grouping forms (many languages), flags |
| [CAMeL Tools](https://github.com/CAMeL-Lab/camel_tools) morphology (calima-msa-r13, calima-egy-r13; glf-01, lev-01) | Arabic analyzer tables | NYU Abu Dhabi CAMeL Lab | Code MIT; msa-r13 and egy-r13 **GPL v2**; glf-01 and lev-01 CC BY 4.0 | **Yes, as used**: the app ships only its own reading code (MIT); the GPL tables are separate optional downloads on the website (docs/lexicon, with the GPL text, the changes and how to rebuild), never bundled in the app. Keep it so: bundling them into the app could make the combined work GPL | Grouping Arabic into dictionary words (the course's lists are our own output, not copies of the tables) |

## Used only to check the lists (the audit)

| Source | What it is | Licence | Free for a paid app? | Use |
|---|---|---|---|---|
| This computer's Tamkeen library transcripts | Real podcasts and videos the owner listens to (Arabic, Spanish) | the owner's own | n/a (never leaves the computer) | Coverage of real speech |
| [YODAS](https://huggingface.co/datasets/espnet/yodas) (manual captions) | Captions of Creative-Commons YouTube videos | CC BY 3.0 | **Yes**, with credit | Coverage of real speech (15 languages; no Bisaya or Tagalog) |
| [Tatoeba](https://tatoeba.org/) | Everyday sentences written by volunteers | CC BY 2.0 FR | **Yes**, with credit | Stand-in for speech in Tagalog and Bisaya (written, conversational) |
| [Leipzig Corpora Collection](https://wortschatz.uni-leipzig.de/en/download) | News and web word counts | Downloads say CC BY; the site's terms say CC BY-NC and no commercial use without written consent | **Check only**: unclear for commercial use, so used only to compare, never shipped | Second, independent frequency source |

Not used: TED transcripts (CC BY-NC-ND), the Spoken BNC2014 (no commercial use), COCA (paid licence).

## What the check found (2026-11-27)

Made with `audit_forms.py` (counts a text) and `audit.mjs` (groups it with the language's own ranking script);
the per-language reports are written to `build/audit/<lang>-report.md` (not committed). Words 1–3000 = the course's
1,000 plus the first 2,000 candidates before their review.

| Lang | Speech covered by the top 1,000 / 3,000 | Leipzig's top 1,000 / 3,000 that are in ours |
|---|---|---|
| en | 80.8% / 89.3% | 81.2% / 76.5% |
| fr | 82.7% / 90.5% | 78.2% / 72.5% |
| es | 78.8% / 86.9% | 76.0% / 70.2% |
| pt | 78.9% / 86.8% | 74.4% / 68.2% |
| it | 77.5% / 85.8% | 76.1% / 68.6% |
| ca | 77.6% / 85.2% | 78.8% / 72.1% |
| de | 76.0% / 83.4% | 74.3% / 66.2% |
| ru | 70.3% / 81.3% | 71.3% / 67.8% |
| hi | 73.0% / 80.9% | 66.3% / 63.8% |
| fa | 67.8% / 86.3% | 68.1% / 68.6% |
| ar | 56.1% / 69.6% (library 58.5% / 74.5%) | 66.2% / 73.9% |
| zh | 61.7% / 77.8% | 65.7% / 63.6% |
| ja | 59.3% / 81.0% | 53.2% / 57.1% |
| ko | 54.3% / 66.6% | 48.3% / 67.1% |
| th | 64.0% / 74.4% | 49.5% / 54.8% |
| tl | 81.2% / 89.3% (Tatoeba) | 64.7% / 70.5% |
| ceb | 74.3% / 84.4% (Tatoeba, 11,000 words) | not comparable: Leipzig's Bisaya is machine-written Wikipedia geography |

Speech is YODAS captions (Tatoeba for tl and ceb). Where the two sources disagree, our 1,000 mostly has words of
talk that news lacks (*hola, bonjour, привет, うん*), and Leipzig has 2020–2024 news (Trump, Ukraine, Covid). Languages
written without spaces between words, or with endings joined on, score lower partly because of how text is cut
into words.
