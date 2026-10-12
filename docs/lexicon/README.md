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

What was changed: only the fields the lookup needs were kept (word pieces, their categories and
which go together, lemma, part of speech, root, corpus frequency, spelling); glosses,
tokenizations and phonetics were dropped, and the result was written as gzipped JSON.

To rebuild them, download the four databases from
<https://github.com/CAMeL-Lab/camel-tools-data/releases> (the `morphology_db_calima-*` files), unzip, and run:

    python tools/build_lexicon.py msa=<path>/morphology.db egy=<path>/morphology.db glf=<path>/morphology.db lev=<path>/morphology.db

`index.json` lists each file's size and SHA-256 checksum; the apps refuse a file that doesn't match.
The rest of this repository is under its own licence (see `LICENSE` at the top); these files are
only stored alongside it.
