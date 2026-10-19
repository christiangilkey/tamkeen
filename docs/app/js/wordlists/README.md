# Common-word lists

One file per language Tamkeen teaches: the 1000 most common words, most common first. The app
counts them as already seen for a learner who says they have already started (see
`../commonwords.js`).

Thai and Bisaya are not in wordfreq: Thai's list is the Thai National Corpus counts as PyThaiNLP
publishes them (CC0 1.0), and Bisaya's is counted from the Cebuano web text of OPUS's NLLB
collection (ODC-By 1.0); see licenses/pythainlp.txt and licenses/cebuano-sources.txt.

The others are made by `tools/make_wordlists.py` from **wordfreq** by Robyn Speer
(https://github.com/rspeer/wordfreq), which counts words in subtitles, Wikipedia, news, books and
the web. The script leaves out numbers, symbols, stray single letters and words in another
alphabet; nothing else is changed, and nothing is added by hand.

## Licence

wordfreq's data is licensed **Creative Commons Attribution-ShareAlike 4.0**
(https://creativecommons.org/licenses/by-sa/4.0/), and so are the lists in this folder (they are
taken from it). This applies to the list files only, not to the rest of the app.

wordfreq in turn draws on, and asks that credit be given to: OpenSubtitles
(http://www.opensubtitles.org/), Wikipedia, SUBTLEX (Brysbaert, New and colleagues), the Leeds
Internet Corpus, Google Books Ngrams, Jieba's word list, and the other sources named in its
README.

> Robyn Speer. (2022). rspeer/wordfreq: v3.0 (v3.0.2). Zenodo. https://doi.org/10.5281/zenodo.7199437

## Known limits

- These are the forms that are written, not dictionary entries: Spanish *es*, *son* and *fue* are
  three entries.
- Lower case throughout, so a few names are in there (*france*, *محمد*).
- Japanese is counted in the pieces a word-splitter makes, so some entries are parts of
  conjugated verbs (言わ, 知ら).
