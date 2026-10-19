# Arabic word dictionaries

These files let Tamkeen work out the dictionary form (lemma) of an Arabic word, so that a word
the learner has seen counts as seen in every form it takes. The apps download them from here the
first time someone learning Arabic agrees to it (`app/lexicon.py` on the computer,
`mobile/src/js/lexicon-store.js` on the phone); `web/js/lexicon/arabic.js` reads them.

They are **not Tamkeen's own work**. Each is a cut-down copy of a morphology database published
by the [CAMeL Lab](https://nyuad.nyu.edu/en/research/faculty-labs-and-projects/computational-approaches-to-modeling-language-lab.html)
at New York University Abu Dhabi for [CAMeL Tools](https://github.com/CAMeL-Lab/camel_tools),
and each keeps the licence of the database it was made from:

| File | Made from | Licence |
|---|---|---|
| `ar-msa.json.gz` | `calima-msa-r13` (Modern Standard Arabic; derived from Aramorph 1.2.1 / the Buckwalter analyzer) | GNU GPL version 2: `LICENSE-GPL-2.0.txt` |
| `ar-egy.json.gz` | `calima-egy-r13` (Egyptian Arabic) | GNU GPL version 2: `LICENSE-GPL-2.0.txt` |
| `ar-glf.json.gz` | `calima-glf-01` (Gulf Arabic) | Creative Commons Attribution 4.0: `LICENSE-CC-BY-4.0.txt` |
| `ar-lev.json.gz` | `calima-lev-01` (Levantine Arabic) | Creative Commons Attribution 4.0: `LICENSE-CC-BY-4.0.txt` |

For Spanish, French and Italian the files are tables of word forms and their dictionary forms
(hablas → hablar), read by `web/js/lexicon/romance.js`:

| File | Made from | Licence |
|---|---|---|
| `es-lemmas.json.gz`, `fr-lemmas.json.gz`, `it-lemmas.json.gz`, `en-lemmas.json.gz` | [Lemmatization lists](https://github.com/michmech/lemmatization-lists) by Michal Měchura; word counts from [wordfreq](https://github.com/rspeer/wordfreq) by Robyn Speer (CC BY-SA 4.0) to keep the forms people meet and to choose between two dictionary forms for one spelling | Open Database License 1.0: `LICENSE-ODbL-1.0.txt` |

The English table also carries US pronunciations (IPA) for the 60,000 commonest words, converted
from the [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict) (BSD-style licence:
`LICENSE-CMUdict.txt`); `web/js/lexicon/english.js` reads them, with a hand-written list of common
phrasal verbs.

Tagalog has no table of forms: `tl-roots.json.gz` is [wordfreq](https://github.com/rspeer/wordfreq)'s
Filipino word list (CC BY-SA 4.0: `LICENSE-CC-BY-SA-4.0.txt`), most common first, made by
`tools/build_lemmas.py tl=wordfreq`. `web/js/lexicon/tagalog.js` takes prefixes, infixes, suffixes and
repeated syllables off a word and keeps the result only when it is a word in that list.

Russian has one table of word forms with stress, read by `web/js/lexicon/russian.js`:

| File | Made from | Licence |
|---|---|---|
| `ru-lemmas.json.gz` | The [OpenRussian.org dictionary data](https://github.com/Badestrand/russian-dictionary) (much of it from Wiktionary): every form of each noun, adjective and verb with its stress, and each verb's aspect partner; word counts from wordfreq (CC BY-SA 4.0) to keep common forms | Creative Commons Attribution-ShareAlike 4.0: `LICENSE-CC-BY-SA-4.0.txt` |

It is rebuilt with `tools/build_russian.py`. The Spanish, French and Italian tables are rebuilt with `tools/build_lemmas.py` (see the top of that file); a few common Italian
words the lists get wrong are corrected there by hand (`EXTRA`).

Japanese and Chinese have a dictionary each that splits their text (written without spaces) into
words and gives each word's reading, for furigana and pinyin (`web/js/lexicon/japanese.js`,
`chinese.js`, `readings.js`):

| File | Made from | Licence |
|---|---|---|
| `ja-ipadic.bin.gz` | The IPADIC dictionary (mecab-ipadic-2.7.0-20070801, Nara Institute of Science and Technology) as prepared by [kuromoji.js](https://github.com/takuyaa/kuromoji.js) 0.1.2 (Apache 2.0), whose tokenizer is ported to `web/js/lexicon/kuromoji.js`: padding removed, entry descriptions shortened (pronunciations dropped), packed into one binary file | NAIST / ICOT notice, Apache 2.0 and MIT: `LICENSE-IPADIC.txt` |
| `zh-cedict.json.gz` | [CC-CEDICT](https://cc-cedict.org) (MDBG, 2026-10-17): every word in simplified characters with its pinyin and traditional spelling (definitions dropped; one reading per word, a few common characters' readings set by hand); word counts from [wordfreq](https://github.com/rspeer/wordfreq) to choose the likeliest way to cut a sentence | Creative Commons Attribution-ShareAlike 4.0: `LICENSE-CC-BY-SA-4.0.txt` |

Both are rebuilt with `tools/build_cjk.py` (see the top of that file).

Thai has a table of how each word is said, shown over Thai text (`web/js/lexicon/thai.js`, `readings.js`):

| File | Made from | Licence |
|---|---|---|
| `th-readings.json.gz` | English Wiktionary's Thai entries as extracted by [Wiktextract](https://kaikki.org) (Tatu Ylonen): each word's Paiboon-style romanization with tone marks, and which words come from Pali or Sanskrit (from the etymologies) | Creative Commons Attribution-ShareAlike 4.0: `LICENSE-CC-BY-SA-4.0.txt` |

It is rebuilt with `tools/build_thai_readings.py`.

What was changed in the Arabic files: only the fields the lookup needs were kept (word pieces, their categories and
which go together, lemma, part of speech, root, corpus frequency, spelling); glosses,
tokenizations and phonetics were dropped, and the result was written as gzipped JSON.

To rebuild them, download the four databases from
<https://github.com/CAMeL-Lab/camel-tools-data/releases> (the `morphology_db_calima-*` files), unzip, and run:

    python tools/build_lexicon.py msa=<path>/morphology.db egy=<path>/morphology.db glf=<path>/morphology.db lev=<path>/morphology.db

`index.json` lists each file's size and SHA-256 checksum; the apps refuse a file that doesn't match.
The rest of this repository is under its own licence (see `LICENSE` at the top); these files are
only stored alongside it.

## Word meanings (No AI)

Someone who chooses **No AI** in Settings → Word definitions gets a word's meanings from these files
instead of an AI provider (`web/js/meanings.js`, `web/js/lexicon/meaningdata.js`): one per language,
downloaded only then.

| File | Made from | Licence |
|---|---|---|
| `<lang>-meanings.json.gz` (ar, es, fr, it, ru, en, tl, ja, zh) | The English [Wiktionary](https://en.wiktionary.org) as extracted by [Wiktextract](https://github.com/tatuylonen/wiktextract) ([kaikki.org](https://kaikki.org)): each word's part of speech, its first few definitions, its full spelling (Arabic vowels, Russian stress), reading (kana, pinyin) or Arabic root, and which word each form belongs to. Arabic includes Wiktionary's Egyptian, Levantine, Gulf, Hijazi, Moroccan and Tunisian words; English keeps only common words and phrases made of them | Creative Commons Attribution-ShareAlike 4.0: `LICENSE-CC-BY-SA-4.0.txt` |

Rebuilt with `tools/build_meanings.py` (see the top of that file).

Arabic has a second meanings file, asked when Wiktionary lacks a word (or has it only as a name):

| File | Made from | Licence |
|---|---|---|
| `ar-camel-meanings.json.gz` | The English glosses of the CAMeL Tools morphology databases (CAMeL Lab, NYU Abu Dhabi), the same databases as the Arabic word tables above: calima-msa-r13 (Standard Arabic, from the SAMA/Buckwalter lexicon) and calima-egy-r13 (Egyptian; marked as Egyptian). 39,294 dictionary words with their part of speech, vowelled form and root, and each stem spelling pointing to its word. The Gulf and Levantine databases have no glosses yet | GNU GPL v2: `LICENSE-GPL-2.0.txt` |

Rebuilt with `tools/build_arabic_glosses.py` (see the top of that file).

