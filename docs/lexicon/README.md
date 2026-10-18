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

What was changed in the Arabic files: only the fields the lookup needs were kept (word pieces, their categories and
which go together, lemma, part of speech, root, corpus frequency, spelling); glosses,
tokenizations and phonetics were dropped, and the result was written as gzipped JSON.

To rebuild them, download the four databases from
<https://github.com/CAMeL-Lab/camel-tools-data/releases> (the `morphology_db_calima-*` files), unzip, and run:

    python tools/build_lexicon.py msa=<path>/morphology.db egy=<path>/morphology.db glf=<path>/morphology.db lev=<path>/morphology.db

`index.json` lists each file's size and SHA-256 checksum; the apps refuse a file that doesn't match.
The rest of this repository is under its own licence (see `LICENSE` at the top); these files are
only stored alongside it.
