"""Build Tamkeen's free book shelf: famous public-domain books in each language taught.

Each book is fetched once from where it is published free, cleaned into headings and paragraphs,
and written to docs/books/<lang>/<id>.json.gz, which GitHub Pages serves to the apps; the list of
them is docs/books/index.json (read by web/js/books.js). Sources:
    gutenberg   Project Gutenberg's plain-text file (the Gutenberg header and licence are removed:
                what is kept is the public-domain text itself)
    wikisource  a Wikisource page, or its chapters when the page is a table of contents, or a list of
                pages read one after the other (where the chapters aren't the contents page's subpages)
    aozora      a work's XHTML file from Aozora Bunko (青空文庫), Japan's public-domain library
    wikisource-scan  a book that is on Wikisource only as the proofread pages of its scan (Index:…):
                its pages from first to last, put together ("mul" is the multilingual Wikisource)
A source may end with a dict of the book's own cuts, where the general cleaning can't see them:
"from" and "to" (regular expressions for the first block of the book and the first block after it),
"drop" (blocks to leave out), "join_lines" (rejoin a scan's lines into paragraphs). See trim().

    BOOKS_CACHE=<folder> python tools/build_books.py --again   keeps the downloads, for tuning the cleaning

    python tools/build_books.py            (every book; a book already built is kept)
    python tools/build_books.py --again    (build every book again)
    python tools/build_books.py ru ja      (only these languages)

Only works in the public domain both where they were written and in the United States are listed.
The file: {"format": 1, "id", "lang", "title", "author", "year", "source", "blocks": [{"kind": "h2"|"p", "text"}]}.
"""

from __future__ import annotations

import gzip
import hashlib
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "books"
UA = {"User-Agent": "Tamkeen book shelf builder (https://github.com/christiangilkey/tamkeen)"}
MAX_WORDS = 450_000

# id, title, author, year, blurb (English, one line), source
BOOKS: dict[str, list[tuple]] = {
    "en": [
        ("alice", "Alice's Adventures in Wonderland", "Lewis Carroll", 1865, "A girl falls down a rabbit hole into a world of nonsense.", ("gutenberg", 11)),
        ("pride-prejudice", "Pride and Prejudice", "Jane Austen", 1813, "Elizabeth Bennet and Mr Darcy, and first impressions.", ("gutenberg", 1342)),
        ("sherlock", "The Adventures of Sherlock Holmes", "Arthur Conan Doyle", 1892, "Twelve cases of the great detective.", ("gutenberg", 1661)),
        ("christmas-carol", "A Christmas Carol", "Charles Dickens", 1843, "Scrooge is visited by three spirits on Christmas Eve.", ("gutenberg", 46)),
        ("frankenstein", "Frankenstein", "Mary Shelley", 1818, "A scientist builds a living creature and abandons it.", ("gutenberg", 84)),
        ("treasure-island", "Treasure Island", "Robert Louis Stevenson", 1883, "Pirates, a map and buried gold.", ("gutenberg", 120)),
        ("dorian-gray", "The Picture of Dorian Gray", "Oscar Wilde", 1890, "A portrait ages while its owner stays young.", ("gutenberg", 174)),
        ("tom-sawyer", "The Adventures of Tom Sawyer", "Mark Twain", 1876, "A boy's adventures on the Mississippi.", ("gutenberg", 74)),
        ("great-gatsby", "The Great Gatsby", "F. Scott Fitzgerald", 1925, "Parties, money and a lost love on Long Island.", ("gutenberg", 64317)),
        ("peter-pan", "Peter Pan", "J. M. Barrie", 1911, "The boy who wouldn't grow up.", ("gutenberg", 16)),
        ("jungle-book", "The Jungle Book", "Rudyard Kipling", 1894, "Mowgli, raised by wolves in the Indian jungle.", ("gutenberg", 236)),
        ("wizard-of-oz", "The Wonderful Wizard of Oz", "L. Frank Baum", 1900, "Dorothy, Toto and the yellow brick road.", ("gutenberg", 55)),
        ("time-machine", "The Time Machine", "H. G. Wells", 1895, "A traveller visits the year 802,701.", ("gutenberg", 35)),
        ("jane-eyre", "Jane Eyre", "Charlotte Brontë", 1847, "An orphan governess and the secret of Thornfield Hall.", ("gutenberg", 1260)),
    ],
    "es": [
        ("lazarillo", "Lazarillo de Tormes", "Anónimo", 1554, "A poor boy serves a string of masters: the first picaresque novel.", ("gutenberg", 320)),
        ("quijote", "Don Quijote", "Miguel de Cervantes", 1605, "A knight who read too many books, and his squire Sancho.", ("gutenberg", 2000)),
        ("marianela", "Marianela", "Benito Pérez Galdós", 1878, "A plain orphan guides a blind young man.", ("gutenberg", 17340)),
        ("misericordia", "Misericordia", "Benito Pérez Galdós", 1897, "A servant begs in secret to feed her mistress, in Madrid.", ("gutenberg", 21831)),
        ("pepita-jimenez", "Pepita Jiménez", "Juan Valera", 1874, "A young seminarian falls for a widow, told in letters.", ("gutenberg", 17223)),
        ("niebla", "Niebla", "Miguel de Unamuno", 1914, "A man discovers he is a character in a novel.", ("gutenberg", 49836)),
        ("la-barraca", "La barraca", "Vicente Blasco Ibáñez", 1898, "A farming family against a hostile village near Valencia.", ("gutenberg", 14944, {"from": r"^I$"})),
        ("sangre-arena", "Sangre y arena", "Vicente Blasco Ibáñez", 1908, "The rise and fall of a bullfighter.", ("gutenberg", 26983)),
        ("cuentos-quiroga", "Cuentos de amor de locura y de muerte", "Horacio Quiroga", 1917, "Short stories of the jungle and the mind.", ("gutenberg", 13507)),
        # (Not La Celestina: Gutenberg's #1619 is R. S. Rudder's 1998 edition, with his notes, under copyright.)
        # An American school edition: its English introduction, notes and vocabulary are left out.
        ("sombrero-tres-picos", "El sombrero de tres picos", "Pedro Antonio de Alarcón", 1874, "A miller's clever wife outwits a lecherous magistrate in Andalusia.",
         ("gutenberg", 29506, {"from": r"^PREFACIO DEL AUTOR", "to": r"^NOTES$"})),
    ],
    "fr": [
        ("tour-du-monde", "Le tour du monde en quatre-vingts jours", "Jules Verne", 1872, "Phileas Fogg bets he can circle the globe in 80 days.", ("gutenberg", 800)),
        ("candide", "Candide", "Voltaire", 1759, "An optimist's misadventures around the world.", ("gutenberg", 4650, {"from": r"^CHAPITRE (PREMIER|I\b)"})),
        ("boule-de-suif", "Boule de Suif", "Guy de Maupassant", 1880, "Travellers in a coach during the war of 1870.", ("gutenberg", 10746, {"from": r"^BOULE DE SUIF$"})),
        ("le-horla", "Le Horla", "Guy de Maupassant", 1887, "A diary of a man haunted by an invisible being.", ("gutenberg", 10775)),
        ("madame-bovary", "Madame Bovary", "Gustave Flaubert", 1857, "A doctor's wife dreams of a life like the novels she reads.", ("gutenberg", 14155)),
        ("trois-mousquetaires", "Les trois mousquetaires", "Alexandre Dumas", 1844, "D'Artagnan and his friends: all for one.", ("gutenberg", 13951)),
        ("vingt-mille-lieues", "Vingt mille lieues sous les mers", "Jules Verne", 1870, "Captain Nemo and the submarine Nautilus.", ("gutenberg", 5097)),
        ("miserables-1", "Les misérables, tome I : Fantine", "Victor Hugo", 1862, "Jean Valjean and Fantine: the first part.", ("gutenberg", 17489)),
        ("notre-dame", "Notre-Dame de Paris", "Victor Hugo", 1831, "Quasimodo, Esmeralda and the cathedral.", ("gutenberg", 19657)),
        ("cyrano", "Cyrano de Bergerac", "Edmond Rostand", 1897, "A poet with a long nose writes love letters for another man.", ("gutenberg", 1256)),
        ("germinal", "Germinal", "Émile Zola", 1885, "A miners' strike in northern France.", ("gutenberg", 5711)),
    ],
    "it": [
        ("pinocchio", "Le avventure di Pinocchio", "Carlo Collodi", 1883, "A wooden puppet who wants to be a real boy.", ("gutenberg", 52484)),
        ("promessi-sposi", "I promessi sposi", "Alessandro Manzoni", 1827, "Two young lovers kept apart in 17th-century Lombardy.", ("gutenberg", 45334, {"from": r"^INTRODUZIONE$"})),
        ("inferno", "Divina Commedia: Inferno", "Dante Alighieri", 1320, "Dante's journey through Hell, in verse.", ("gutenberg", 997)),
        ("cuore", "Cuore", "Edmondo De Amicis", 1886, "A schoolboy's diary through a year in Turin.", ("wikisource", "it", "Cuore (1889)")),
        ("mattia-pascal", "Il fu Mattia Pascal", "Luigi Pirandello", 1904, "A man reported dead starts a new life.", ("wikisource", "it", "Il fu Mattia Pascal")),
        ("malavoglia", "I Malavoglia", "Giovanni Verga", 1881, "A Sicilian fishing family fights misfortune.", ("wikisource", "it", "I Malavoglia")),
        ("novelle-rusticane", "Novelle rusticane", "Giovanni Verga", 1883, "Short stories of Sicilian country life.", ("wikisource", "it", "Novelle rusticane")),
        ("principe", "Il Principe", "Niccolò Machiavelli", 1532, "How a prince wins power and keeps it.", ("wikisource", "it", "Il Principe")),
        ("uno-nessuno", "Uno, nessuno e centomila", "Luigi Pirandello", 1926, "A man discovers that everyone sees a different him.", ("wikisource", "it", "Uno, nessuno e centomila")),
        ("coscienza-zeno", "La coscienza di Zeno", "Italo Svevo", 1923, "Zeno tells his life to his psychoanalyst, starting with his last cigarette.", ("wikisource", "it", "La coscienza di Zeno")),
        ("sei-personaggi", "Sei personaggi in cerca d'autore", "Luigi Pirandello", 1921, "Six characters interrupt a rehearsal looking for an author.", ("gutenberg", 18457)),
        ("canti-leopardi", "Canti", "Giacomo Leopardi", 1835, "Leopardi's poems, among the greatest in Italian.", ("gutenberg", 55236, {"from": r"^I\.$"})),
    ],
    "ru": [
        ("pikovaya-dama", "Пиковая дама", "Александр Пушкин", 1834, "A young officer wants an old countess's secret of three cards.", ("wikisource", "ru", "Пиковая дама (Пушкин)")),
        ("kapitanskaya-dochka", "Капитанская дочка", "Александр Пушкин", 1836, "A young officer, a fortress, and Pugachev's rebellion.", ("wikisource", "ru", "Капитанская дочка (Пушкин)")),
        ("shinel", "Шинель", "Николай Гоголь", 1842, "A poor clerk saves for a new overcoat.", ("wikisource", "ru", "Шинель (Гоголь)")),
        ("nos", "Нос", "Николай Гоголь", 1836, "A civil servant wakes up without his nose.", ("wikisource", "ru", "Нос (Гоголь)")),
        ("dama-s-sobachkoy", "Дама с собачкой", "Антон Чехов", 1899, "A holiday romance in Yalta that doesn't end.", ("wikisource", "ru", "Дама с собачкой (Чехов)")),
        ("kashtanka", "Каштанка", "Антон Чехов", 1887, "A lost dog joins a circus act.", ("wikisource", "ru", "Каштанка (Чехов)")),
        ("palata-6", "Палата № 6", "Антон Чехов", 1892, "A doctor befriends a patient in a provincial asylum.", ("wikisource", "ru", "Палата № 6 (Чехов)")),
        ("bednaya-liza", "Бедная Лиза", "Николай Карамзин", 1792, "A peasant girl and a nobleman: a sentimental tale.", ("wikisource", "ru", "Бедная Лиза (Карамзин)")),
        ("mumu", "Муму", "Иван Тургенев", 1854, "A deaf-mute servant and his little dog.", ("wikisource", "ru", "Муму (Тургенев)")),
        ("belye-nochi", "Белые ночи", "Фёдор Достоевский", 1848, "A lonely dreamer meets a young woman during St Petersburg's white nights.", ("wikisource", "ru", "Белые ночи (Достоевский)")),
        ("ottsy-i-deti", "Отцы и дети", "Иван Тургенев", 1862, "A young nihilist and the older generation.", ("wikisource", "ru", "Отцы и дети (Тургенев)")),
        ("geroy", "Герой нашего времени", "Михаил Лермонтов", 1840, "Pechorin, a bored and restless officer in the Caucasus.", ("wikisource", "ru", [f"Герой нашего времени (Лермонтов)/СО/{part}" for part in (
             "Предисловие", "Бэла", "Максим Максимыч", "Журнал Печорина", "Тамань", "Княжна Мери", "Фаталист")])),
    ],
    "ar": [
        ("kalila-wa-dimna", "كليلة ودمنة", "ابن المقفع", 750, "Animal fables of wisdom and politics, told by a philosopher to a king.", ("wikisource", "ar", "كليلة ودمنة")),
        ("al-ajniha", "الأجنحة المتكسرة", "جبران خليل جبران", 1912, "Gibran's novel of a young love in Beirut, crushed by custom.", ("wikisource", "ar", "الأجنحة المتكسرة")),
        ("dama-wa-ibtisama", "دمعة وابتسامة", "جبران خليل جبران", 1914, "Gibran's short prose poems and reflections.", ("wikisource", "ar", "دمعة وابتسامة (1914)")),
        ("tawq-al-hamama", "طوق الحمامة", "ابن حزم الأندلسي", 1022, "The Ring of the Dove: on love and lovers, from Andalusia.", ("wikisource", "ar", "طوق الحمامة")),
        ("hayy-ibn-yaqzan", "حي بن يقظان", "ابن طفيل", 1160, "A child raised by a gazelle on an island discovers the world alone.", ("wikisource", "ar", "حي بن يقظان")),
        ("al-bukhala", "البخلاء", "الجاحظ", 850, "Funny portraits of misers from Basra and beyond.", ("wikisource", "ar", "البخلاء", {"from": r"^المقدمة$"})),
        ("risalat-al-ghufran", "رسالة الغفران", "أبو العلاء المعري", 1033, "A journey to Paradise and Hell to meet the poets.", ("wikisource", "ar", "رسالة الغفران")),
        ("an-nazarat", "النظرات", "مصطفى لطفي المنفلوطي", 1910, "Al-Manfaluti's essays and moving short stories.", ("wikisource", "ar", "النظرات")),
    ],
    "ja": [
        ("rashomon", "羅生門", "芥川龍之介", 1915, "A servant and an old woman at a ruined Kyoto gate.", ("aozora", "000879", "127")),
        ("kumo-no-ito", "蜘蛛の糸", "芥川龍之介", 1918, "The Buddha lowers a spider's thread into Hell.", ("aozora", "000879", "92")),
        ("hana", "鼻", "芥川龍之介", 1916, "A monk ashamed of his very long nose.", ("aozora", "000879", "42")),
        ("toshishun", "杜子春", "芥川龍之介", 1920, "A young man in Tang China is given riches by a hermit.", ("aozora", "000879", "170")),
        ("botchan", "坊っちゃん", "夏目漱石", 1906, "A hot-headed young teacher in a country school.", ("aozora", "000148", "752")),
        ("kokoro", "こころ", "夏目漱石", 1914, "A student and the secret of the man he calls Sensei.", ("aozora", "000148", "773")),
        ("yume-juya", "夢十夜", "夏目漱石", 1908, "Ten strange dreams.", ("aozora", "000148", "799")),
        ("ginga-tetsudo", "銀河鉄道の夜", "宮沢賢治", 1934, "Two boys ride a train across the Milky Way.", ("aozora", "000081", "456")),
        ("chumon", "注文の多い料理店", "宮沢賢治", 1924, "Two hunters find a restaurant with many requests.", ("aozora", "000081", "43754")),
        ("hashire-merosu", "走れメロス", "太宰治", 1940, "A man runs to save his friend from execution.", ("aozora", "000035", "1567")),
        ("gongitsune", "ごん狐", "新美南吉", 1932, "A mischievous little fox tries to make amends.", ("aozora", "000121", "628")),
    ],
    "zh": [
        ("lunyu", "論語", "孔子", -479, "The sayings of Confucius.", ("gutenberg", 23839, {"drop": r"should be"})),
        ("daodejing", "道德經", "老子", -400, "The classic of the Way and its virtue.", ("gutenberg", 7337)),
        ("sunzi", "孫子兵法", "孫子", -500, "The Art of War.", ("gutenberg", 23864)),
        ("nahan", "吶喊", "魯迅", 1923, "Lu Xun's first story collection, with A Madman's Diary and The True Story of Ah Q.", ("gutenberg", 27166)),
        ("xiyouji", "西遊記", "吳承恩", 1592, "Journey to the West: the Monkey King and the monk Tang.", ("gutenberg", 23962)),
        ("sanguo", "三國志演義", "羅貫中", 1400, "Romance of the Three Kingdoms.", ("gutenberg", 23950)),
        ("shuihu", "水滸傳", "施耐庵", 1400, "Water Margin: 108 outlaws of Liangshan.", ("gutenberg", 23863)),
        ("hongloumeng", "紅樓夢", "曹雪芹", 1791, "Dream of the Red Chamber: the decline of a great family.", ("gutenberg", 24264)),
        ("liaozhai", "聊齋志異", "蒲松齡", 1740, "Strange tales of fox spirits and ghosts.", ("gutenberg", 51828)),
        ("rulin", "儒林外史", "吳敬梓", 1750, "The Scholars: a satire of the imperial examinations.", ("gutenberg", 24032)),
    ],
    "tl": [
        ("noli", "Noli Me Tangere", "José Rizal (salin ni Pascual Poblete)", 1887, "Rizal's novel of colonial Philippines, in the 1909 Tagalog translation.", ("gutenberg", 20228)),
        ("filibusterismo", "Ang Filibusterismo", "José Rizal (salin ni Patricio Mariano)", 1891, "The sequel to Noli Me Tangere, in Tagalog.", ("gutenberg", 47629)),
        ("florante", "Florante at Laura", "Francisco Balagtas", 1838, "The great Tagalog poem of love and betrayal in Albania.", ("gutenberg", 15845, {"from": r"^Pinagdaanang Buhay$", "to": r"^MGA PALIWANAG$"})),
        ("ibong-adarna", "Ibong Adarna", "Anonymous", 1800, "Three princes seek the magical Adarna bird to heal their father.", ("gutenberg", 16157)),
        ("juan-tamad", "Búhay na Pinagdaanan ni Juan Tamad", "Anonymous", 1900, "The tales of lazy Juan.", ("gutenberg", 16386, {"from": [r"^BÚHAY NA PINAGDAANAN$", 2]})),
        ("urbana-feliza", "Urbana at Feliza", "Modesto de Castro", 1864, "Letters between two sisters on good manners.", ("gutenberg", 15980, {"from": [r"^PAG SUSULATAN$", 2]})),
        ("nang-bata-pa-kami", "Nang Bata Pa Kami", "Pura Medrano", 1900, "Childhood memories.", ("gutenberg", 13686)),
        ("mananayaw", "Ang Mananayaw", "Rosauro Almario", 1910, "A short novel about a dancer.", ("gutenberg", 14794, {"from": [r"^ANG MÁNANAYAW$", 2], "to": r"^NOBELANG TAGALOG$"})),
        ("ilang-ilang", "Alamat ng Ilang-Ilang", "Jose N. Sevilla", 1915, "The legend of the ilang-ilang flower.", ("gutenberg", 13156, {"to": r"^Palatuntunan"})),
        ("sa-ano-nabubuhay", "Sa Ano Nabubuhay ang Tao", "Leo Tolstoy (salin ni Sofronio Calderón)", 1885, "Tolstoy's parable of an angel and a shoemaker, in Tagalog.", ("gutenberg", 15628)),
    ],

    "pt": [
        ("dom-casmurro", "Dom Casmurro", "Machado de Assis", 1899, "Bentinho tells of his love for Capitu, and his jealousy.", ("gutenberg", 55752)),
        ("bras-cubas", "Memórias Póstumas de Brás Cubas", "Machado de Assis", 1881, "A dead man writes his memoirs, with wit and no mercy.", ("gutenberg", 54829)),
        ("quincas-borba", "Quincas Borba", "Machado de Assis", 1891, "A schoolteacher inherits a fortune, a philosophy and a dog.", ("gutenberg", 55682)),
        ("papeis-avulsos", "Papéis Avulsos", "Machado de Assis", 1882, "Short stories, among them O Alienista, the doctor who locks up a whole town.", ("gutenberg", 57001)),
        ("historias-sem-data", "Histórias sem Data", "Machado de Assis", 1884, "More of Machado's short stories.", ("gutenberg", 33056)),
        ("o-cortico", "O Cortiço", "Aluísio Azevedo", 1890, "Life in a crowded Rio tenement and the man who owns it.", ("gutenberg", 69187)),
        ("iracema", "Iracema", "José de Alencar", 1865, "A legend of Ceará: the Tabajara maiden and the Portuguese warrior.", ("gutenberg", 67740, {"to": r"^NOTAS$"})),
        ("policarpo-quaresma", "Triste Fim de Policarpo Quaresma", "Lima Barreto", 1915, "A patriot's schemes to make Brazil great go wrong.", ("gutenberg", 67535)),
        ("o-ateneu", "O Ateneu", "Raul Pompeia", 1888, "A boy's years at a Rio boarding school.", ("gutenberg", 68541)),
        ("escrava-isaura", "A Escrava Isaura", "Bernardo Guimarães", 1875, "An enslaved woman's flight from her cruel master.", ("gutenberg", 74475)),
        ("inocencia", "Inocência", "Visconde de Taunay", 1872, "Love in the backlands of Mato Grosso.", ("gutenberg", 68635)),
    ],
    "ca": [
        ("escanyapobres", "L'escanyapobres", "Narcís Oller", 1884, "A miser grows rich on the poor of a small town.", ("gutenberg", 72856)),
        ("vilaniu", "Vilaniu", "Narcís Oller", 1885, "Love and politics in a provincial town.", ("gutenberg", 75945)),
        ("josafat", "Josafat", "Prudenci Bertrana", 1906, "The bell-ringer of Girona cathedral and a woman of the street.", ("gutenberg", 73408)),
        ("sots-ferestecs", "Els sots feréstecs", "Raimon Casellas", 1901, "A young priest sent to a wild mountain parish.", ("gutenberg", 75701)),
        ("auca-senyor-esteve", "L'auca del senyor Esteve", "Santiago Rusiñol", 1907, "A Barcelona shopkeeper's son wants to be an artist.", ("gutenberg", 56856)),
        ("sang-nova", "Sang nova", "Marià Vayreda", 1900, "A mountain girl's story, from the author of La punyalada.", ("gutenberg", 23021)),
        ("pinya-de-rosa", "Pinya de rosa", "Joaquim Ruyra", 1920, "Stories of the sea and the coast.", ("gutenberg", 15346)),
        ("canigo", "Canigó", "Jacint Verdaguer", 1886, "The epic poem of the Pyrenees and the birth of Catalonia.", ("wikisource", "ca", "Canigó", {"drop": r"^IFallayres son los"})),
        ("atlantida", "L'Atlàntida", "Jacint Verdaguer", 1877, "The epic poem of the sinking of Atlantis.", ("wikisource", "ca", "L'Atlàntida", {"to": r"^Notes$"})),
        ("terra-baixa", "Terra baixa", "Àngel Guimerà", 1897, "A shepherd comes down from the mountains: Catalonia's most famous play.", ("wikisource", "ca", ["Terra baixa - Acte Primer", "Terra baixa - Acte Segon", "Terra baixa - Acte Tercer"])),
        ("mar-i-cel", "Mar i cel", "Àngel Guimerà", 1888, "A Christian woman and a Muslim corsair at sea.", ("wikisource", "ca", ["Mar y cel - Acte Primer", "Mar y cel - Acte Segon", "Mar y cel - Acte Tercer"])),
        ("visions-cants", "Visions & cants", "Joan Maragall", 1900, "Poems of Catalan legend and landscape.", ("gutenberg", 52409, {"to": r"^INDEX$"})),
    ],
    "ceb": [
        # The only two books of Bisaya writing in Project Gutenberg (its third Bisaya book is a table of
        # English, Spanish and old-spelling phrases, not something to read), and the proofread Cebuano scans of
        # the multilingual Wikisource (from the University of Michigan's Philippine collection) that are both
        # in the public domain and worth reading. Left out, checked 2026-10-18: "Ang abian sa calag" (it is
        # Hiligaynon), "Ang rueda ug ang oraculo" (a fortune-telling book), "Tigulang napta" (an almanac),
        # "Kasingkasing sa babaye" (a 1939 printing, the author's dates unknown), "Halayo kanimo!" (half
        # proofread), and the 1962 Noli and 1963 Filibusterismo in Cebuano: published by the government's
        # Rizal centennial commission, but translated by private translators (the Noli's in 1922; the
        # Fili's, Vicente C. Padriega), whose rights a government edition doesn't end. The Internet Archive's
        # other scans are uncorrected OCR, too garbled to read.
        ("larawan", "Larawan: Mga Sugilanon ug Dinalídalí", "Vicente Rama", 1913, "Short stories and sketches of Cebuano life.", ("gutenberg", 20820, {"to": r"^MGA BASAHONG SINULAT NI VICENTE RAMA"})),
        ("walay-igsoon", "Wala'y Igsoon", "Juan Villagonzalo Irles", 1912, "A short Bisaya novel.", ("gutenberg", 47869)),
        # (by a pen name, so 50 years from 1919 in the Philippines)
        ("ang-pulahan", "Ang Pulahan: Sugilanong Binisaya", "Enarem", 1919, "A novel of the Pulahan rising in Cebu against the abuses of the constabulary.",
         ("wikisource-scan", "mul", "Ang pulahan (microform) - sugilanong binisaya (IA apt6492.0001.001.umich.edu).pdf", 1, 101,
          {"from": r"^PILA KA PULONG$"})),
        ("mga-awit-sa-kabukiran", "Mga Awit sa Kabukiran", "Fernando Buyser (1876–1929)", 1911, "Country songs of Cebu (balitaw, kolilisi, garay) and poems, gathered by the poet-priest Fernando Buyser.",
         ("wikisource-scan", "mul", "Mga awit sa kabukiran (microform) - mga balitaw, mga kolilisi, mga garay ug mga balak (IA aqr7923.0001.001.umich.edu).pdf", 1, 70,
          {"from": r"^MGA AWIT SA KABUKIRAN$"})),
        ("evangelio-lucas", "Ang Evangelio ni San Lucas", "Sociedad Biblica Britanica y Extrangera", 1904, "The Gospel of Luke in the old Cebuano Bible translation.",
         ("wikisource-scan", "mul", "Ang evangelio ó ma-ayong balita sa atong guino-ong Jesu-Cristo matud ni San Lucas (IA ajg9970.0001.001.umich.edu).pdf", 2, 116,
          {"from": r"^ANG EVANGELIO$", "to": r"^UNIVERSITY OF MICHIGAN$",
           "drop": r"^(THE GOSPEL OF SAINT LUKE|PRINTED BY THE AMERICAN|FOR THE BRITISH AND FOREIGN|\d{4,})", "join_lines": True})),
    ],
    "th": [
        ("nithan-boran-khadi", "นิทานโบราณคดี", "สมเด็จฯ กรมพระยาดำรงราชานุภาพ", 1944, "Prince Damrong's twenty true stories from his travels and his life.", ("wikisource", "th", ['นิทานโบรานคดี/นิทานที่ 1', 'นิทานโบรานคดี/นิทานที่ 2', 'นิทานโบรานคดี/นิทานที่ 3', 'นิทานโบรานคดี/นิทานที่ 4', 'นิทานโบรานคดี/นิทานที่ 5', 'นิทานโบรานคดี/นิทานที่ 6', 'นิทานโบรานคดี/นิทานที่ 7', 'นิทานโบรานคดี/นิทานที่ 8', 'นิทานโบรานคดี/นิทานที่ 9', 'นิทานโบรานคดี/นิทานที่ 10', 'นิทานโบรานคดี/นิทานที่ 11', 'นิทานโบรานคดี/นิทานที่ 12', 'นิทานโบรานคดี/นิทานที่ 13', 'นิทานโบรานคดี/นิทานที่ 14', 'นิทานโบรานคดี/นิทานที่ 15', 'นิทานโบรานคดี/นิทานที่ 16', 'นิทานโบรานคดี/นิทานที่ 17', 'นิทานโบรานคดี/นิทานที่ 18', 'นิทานโบรานคดี/นิทานที่ 19', 'นิทานโบรานคดี/นิทานที่ 20'])),
        ("nithan-isop", "นิทานอีสป", "อีสป", 1911, "Aesop's fables in Thai.", ("wikisource", "th", ['นิทานอีสป/นิทานที่ 1', 'นิทานอีสป/นิทานที่ 2', 'นิทานอีสป/นิทานที่ 3', 'นิทานอีสป/นิทานที่ 4', 'นิทานอีสป/นิทานที่ 5', 'นิทานอีสป/นิทานที่ 6', 'นิทานอีสป/นิทานที่ 7', 'นิทานอีสป/นิทานที่ 8', 'นิทานอีสป/นิทานที่ 9', 'นิทานอีสป/นิทานที่ 10', 'นิทานอีสป/นิทานที่ 11', 'นิทานอีสป/นิทานที่ 12', 'นิทานอีสป/นิทานที่ 13', 'นิทานอีสป/นิทานที่ 14', 'นิทานอีสป/นิทานที่ 15', 'นิทานอีสป/นิทานที่ 16', 'นิทานอีสป/นิทานที่ 17', 'นิทานอีสป/นิทานที่ 18', 'นิทานอีสป/นิทานที่ 19', 'นิทานอีสป/นิทานที่ 20', 'นิทานอีสป/นิทานที่ 21', 'นิทานอีสป/นิทานที่ 22', 'นิทานอีสป/นิทานที่ 23', 'นิทานอีสป/นิทานที่ 24', 'นิทานอีสป/นิทานที่ 25', 'นิทานอีสป/นิทานที่ 26', 'นิทานอีสป/นิทานที่ 27', 'นิทานอีสป/นิทานที่ 28', 'นิทานอีสป/นิทานที่ 29', 'นิทานอีสป/นิทานที่ 30', 'นิทานอีสป/นิทานที่ 31', 'นิทานอีสป/นิทานที่ 32', 'นิทานอีสป/นิทานที่ 33', 'นิทานอีสป/นิทานที่ 34', 'นิทานอีสป/นิทานที่ 35', 'นิทานอีสป/นิทานที่ 36', 'นิทานอีสป/นิทานที่ 37', 'นิทานอีสป/นิทานที่ 38', 'นิทานอีสป/นิทานที่ 39', 'นิทานอีสป/นิทานที่ 40', 'นิทานอีสป/นิทานที่ 41', 'นิทานอีสป/นิทานที่ 42', 'นิทานอีสป/นิทานที่ 43', 'นิทานอีสป/นิทานที่ 44', 'นิทานอีสป/นิทานที่ 45'])),
        ("nirat-phukhaothong", "นิราศภูเขาทอง", "สุนทรภู่", 1828, "Sunthorn Phu's journey poem to the Golden Mount.", ("wikisource", "th", "นิราศภูเขาทอง")),
        ("nirat-phrabat", "นิราศพระบาท", "สุนทรภู่", 1807, "Sunthorn Phu's journey poem to the Buddha's Footprint at Saraburi.", ("wikisource", "th", "นิราศพระบาท")),
        ("nirat-mueangklaeng", "นิราศเมืองแกลง", "สุนทรภู่", 1807, "Sunthorn Phu's first journey poem, to Klaeng.", ("wikisource", "th", "นิราศเมืองแกลง")),
        ("lilit-talengphai", "ลิลิตตะเลงพ่าย", "สมเด็จพระมหาสมณเจ้า กรมพระปรมานุชิตชิโนรส", 1832, "King Naresuan's war with Burma, in verse.", ("wikisource", "th", "ลิลิตตะเลงพ่าย")),
        ("rachathirat", "ราชาธิราช", "เจ้าพระยาพระคลัง (หน)", 1785, "The wars of the Mon king Razadarit, a classic of Thai prose.", ("wikisource", "th", ['ราชาธิราช/เล่ม ๑', 'ราชาธิราช/เล่ม ๒', 'ราชาธิราช/เล่ม ๓', 'ราชาธิราช/เล่ม ๔', 'ราชาธิราช/เล่ม ๕', 'ราชาธิราช/เล่ม ๖', 'ราชาธิราช/เล่ม ๗', 'ราชาธิราช/เล่ม ๘', 'ราชาธิราช/เล่ม ๙', 'ราชาธิราช/เล่ม ๑๐', 'ราชาธิราช/เล่ม ๑๑', 'ราชาธิราช/เล่ม ๑๒', 'ราชาธิราช/เล่ม ๑๓', 'ราชาธิราช/เล่ม ๑๔', 'ราชาธิราช/เล่ม ๑๕', 'ราชาธิราช/เล่ม ๑๖', 'ราชาธิราช/เล่ม ๑๗'],
         # (the first scan page is a stray page from further on; the printer's notices at the volumes' ends go)
         {"from": r"^ศุภมัศดุพระพุทธศักราช", "drop": r"^แจ้งความ$|^ที?โรงพิมพ์ราษฎร์เจริญ|ไปลองซื้อหรือจ้างพิมพ์"})),
        ("nithan-wetan", "นิทานเวตาล", "น.ม.ส. (พระราชวรวงศ์เธอ กรมหมื่นพิทยาลงกรณ)", 1918, "The ten tales a spirit tells King Vikramaditya, each ending in a riddle.",
         ("wikisource", "th", ["นิทานเวตาล/คำนำของ น.ม.ส.", "นิทานเวตาล/ต้นเรื่อง"] + [f"นิทานเวตาล เรื่องที่ {n}" for n in "๑ ๒ ๓ ๔ ๕ ๖ ๗ ๘ ๙ ๑๐".split()]
          + ["นิทานเวตาล/ปลายเรื่อง"])),
        ("samkok", "สามก๊ก เล่ม ๑", "เจ้าพระยาพระคลัง (หน)", 1805, "The Romance of the Three Kingdoms in its classic Thai version: the first volume.", ("wikisource", "th", ['สามก๊ก/เล่ม 1/ตอนที่ 1', 'สามก๊ก/ตอนที่ ๒', 'สามก๊ก/ตอนที่ ๓', 'สามก๊ก/ตอนที่ ๔', 'สามก๊ก/ตอนที่ ๕', 'สามก๊ก/ตอนที่ ๖', 'สามก๊ก/ตอนที่ ๗', 'สามก๊ก/ตอนที่ ๘'])),
    ],
}

NO_SPACES = {"ja", "zh", "th"}  # lines of a paragraph join without a space
CAPS_HEADINGS = {"ca", "ceb", "pt", "tl"}  # Gutenberg books whose chapter titles are lines in capitals


def get(url: str, retries: int = 3) -> bytes:
    # BOOKS_CACHE=<folder> keeps every download there, so building again while tuning the cleaning
    # doesn't fetch everything again.
    cache = os.environ.get("BOOKS_CACHE")
    cached = Path(cache) / hashlib.sha256(url.encode()).hexdigest()[:32] if cache else None
    if cached and cached.exists():
        return cached.read_bytes()
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                data = r.read()
                if cached:
                    cached.parent.mkdir(parents=True, exist_ok=True)
                    cached.write_bytes(data)
                return data
        except Exception:  # noqa: BLE001 (any network failure: wait and try again)
            if attempt == retries - 1:
                raise
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("unreachable")


def tidy(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


# ----------------------------------------------------------------------------- Project Gutenberg

HEADING = re.compile(
    r"^(chapter|capítulo|capitulo|chapitre|capitolo|capítol|kabanata|kapitulo|libro|livre|tome|part|parte|partie|book|cant|"
    r"stave|act|acte|acto|atto|scene|scène|escena|canto|tratado|prólogo|prologo|prologue|épilogue|epilogue|"
    r"introduction|introducción|introduzione|introdução|introducció|preface|préface|prefazione|глава|часть|ночь|باب|الفصل|الجزء)\b"
    r"|^[IVXLC]+\.?$|^(?![LCDM]\.\s|[IVXLC]+\.\s[A-Z]\.)[IVXLC]+\.\s.{0,60}$|^-[IVXLC]+-$|^\w+\s+(partie|parte|part|livre|libro|livro)\.?$|^[IVXLC]+\s*[—–-]\s.{0,60}$"
    r"|^第[一二三四五六七八九十百零〇\d]+[回章篇卷]|^卷[一二三四五六七八九十百零〇\d]+$|^\S{1,6}第[一二三四五六七八九十百]+$|^(ตอนที่|บทที่|นิทานที่|เรื่องที่)\s", re.I)
# A heading that starts with one of these words may run to two or three lines ("Capítulo primero. Que
# trata de la condición y ejercicio del famoso hidalgo / don Quijote de la Mancha").
HEADING_WORD = re.compile(r"^(chapter|capítulo|capitulo|chapitre|capitolo|capítol|kabanata|kapitulo|stave|cant|canto|tratado)\b", re.I)
CONTENTS = re.compile(r"^(contents|table of contents|índice|indice|índex|table des matières|table|sommario|indice generale|"
                      r"talaan ng nilalaman|mga sulod|sumário|índice geral|taula|índex|index|目次|目錄|目录|สารบัญ|فهرس|оглавление|содержание)\.?$", re.I)
NOTE_TITLE = re.compile(r"^\[?(transcriber'?s? notes?|notes? of the transcriber|nota del transcriptor|nota de transcripción|"
                        r"notas? del? transcripción|note del trascrittore|nota del trascrittore|note de transcription|"
                        r"nota do transcritor|notas? d[eoa] transcri\w*|notes? del transcriptor|nota de la transcripció)\b", re.I)
META = re.compile(r"^(author|title|remark|language|release date|posting date|character set( encoding)?|credits|"
                  r"most recently updated|original publication|illustrator|translator|editor|subtitle)\s*:"
                  r"|^(produced by|e-?text prepared by|this e-?text|we thank|updated editions will|a millennium fulcrum edition|"
                  r"the millennium fulcrum edition|this e-?book (was|is) produced|nous remercions|encoding\s*:)", re.I)
# (searched for in the short paragraphs before the text: a publisher's notice)
FRONT_JUNK = re.compile(r"\bcopyright\b|all rights reserved|derechos reservados|reservados todos los derechos|^es propiedad\b|"
                        r"tous droits|diritti riservati|proprietà letteraria|todos os direitos", re.I)
# The last line of a book ("FIN", "THE END"): what comes after it is the publisher's (a list of the
# author's other books, advertisements), apart from a place and date line.
THE_END = re.compile(r"^(fin|fin de .{1,60}|the end|fine|fim|fi|katapusan|catapusan|wak[aá]s|wac[aá]s|wak[aá]s .{1,40}|wac[aá]s .{1,40}|"
                     r"конец|終|完|จบ|انتهى|تمت)[.!]?$", re.I)
FOOTNOTE = re.compile(r"^\[(\d+|\*|[a-z]|[ivx]+)(\]|:)", re.I)


DIGITS = str.maketrans("๐๑๒๓๔๕๖๗๘๙٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def _key(text: str) -> str:
    """The letters of a line, for comparing two spellings of a title ("ESTACION" and "estación")."""
    text = text.translate(DIGITS)  # "นิทานที่ ๑" and "นิทานที่ 1" are one heading
    plain = "".join(c for c in unicodedata.normalize("NFD", text) if not unicodedata.combining(c))
    return re.sub(r"[\W_]+", "", plain).casefold()


def _short(lines: list[str]) -> bool:
    return len(lines) <= 2 and len(" ".join(lines)) <= 120


def _prose(lines: list[str]) -> bool:
    """A paragraph of the book itself, not a part of a contents list (whose lines are short)."""
    text = " ".join(lines)
    if len(lines) >= 3 and sum(map(len, lines)) / len(lines) < 48:
        return False
    return len(text) > 160 and bool(re.search(r"[a-zà-ÿа-я][,;.!?]", text)) and len(re.findall(r"\b[IVXLC]+\.", text)) < 3


def _caption(m: re.Match) -> str:
    heading = re.search(r"\n\s*((chapter|capítulo|chapitre|capitolo)\s+[IVXLC\d]+\.?)\s*\]$", m.group(0), re.I)
    return f"\n\n{heading.group(1)}\n\n" if heading else ""


def gutenberg(book_id: int, lang: str) -> list[dict]:
    raw = None
    for url in (f"https://www.gutenberg.org/cache/epub/{book_id}/pg{book_id}.txt",
                f"https://www.gutenberg.org/files/{book_id}/{book_id}-0.txt"):
        try:
            raw = get(url).decode("utf-8-sig", "replace")
            break
        except Exception:  # noqa: BLE001
            continue
    if raw is None:
        raise RuntimeError(f"Gutenberg {book_id}: not found")
    text = raw.replace("\r\n", "\n")
    # Windows-1252 dashes and quotes that came through as control characters ("LLIBRE II \x96 FANTASIES").
    text = re.sub(r"[\x80-\x9f]", lambda m: bytes([ord(m.group(0))]).decode("cp1252", "replace"), text)
    start = re.search(r"^\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG.*$", text, re.M | re.I)
    end = re.search(r"^\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG.*$", text, re.M | re.I)
    text = text[start.end() if start else 0: end.start() if end else len(text)]
    # Older files carry the 1990s header ("*SMALL PRINT! ... *END*") inside, and end with "End of
    # [this] Project Gutenberg Etext of ...".
    small = list(re.finditer(r"^.*SMALL PRINT.*\*END\*.*$|^\*END\*THE SMALL PRINT.*$", text, re.M))
    if small and small[-1].start() < len(text) // 3:
        text = text[small[-1].end():]
    old_end = re.search(r"^\s*(End of (the |this )?(is )?(COPYRIGHTED )?Project Gutenberg|End of Project Gutenberg)", text, re.M | re.I)
    if old_end and old_end.start() > len(text) // 2:
        text = text[:old_end.start()]
    # A picture's caption goes, except a chapter heading printed in it ("[Illustration: ... Chapter I.]").
    text = re.sub(r"\[(Illustration|Ilustración|Illustrazione|Ilustração|Ilustració|Larawan|Patalastas)[^\]]*\]", _caption, text, flags=re.I)
    text = re.sub(r"^([#=])([^#=\n]{1,100})\1$", r"\2", text, flags=re.M)  # "#TITLE#", "=I.=": headings in some old files
    text = re.sub(r"\[(Transcriber'?s? note|Nota del transcriptor|Paalala ng nagsalin|Paliwanag ng Tagapagsalin|Tal[aâ] ng Tagapagsalin)"
                  r"[^\]]*\]", "", text, flags=re.I | re.S)
    text = re.sub(r"(?<!\w)_((?:(?!\n\s*\n)[^_]){1,300}?)_(?!\w)", r"\1", text)  # _italics_ (over a line break too)
    text = re.sub(r"(?<=\w)~(?=\w)", "", text)  # old Tagalog g with a tilde, typed "n~g" ("M~ga"): "ng", "Mga"
    joiner = "" if lang in NO_SPACES else " "
    paras = []
    for para in re.split(r"\n\s*\n", text):
        lines = [ln.strip() for ln in para.split("\n") if ln.strip()]
        if lines and lang in NO_SPACES and len(lines) > 12:
            # Chinese files that wrap a whole chapter at a fixed width with no blank lines: a line
            # well short of the width that ends a sentence ends a paragraph.
            width = sorted(map(len, lines))[len(lines) * 3 // 4]
            piece: list[str] = []
            for ln in lines:
                chapter = re.match(r"(第[一二三四五六七八九十百零〇\d]+[回章][\s　]+\S+(?:[\s　]+\S+?)??)[-—]*(?=話說|话说|却說|卻說|且說|$)", ln)
                if chapter:  # "第十二回　名士大宴鶯脰腹溯　俠客虛設人頭會話說…": the heading, then the text
                    if piece:
                        paras.append(piece)
                    paras.append([chapter.group(1)])
                    piece = []
                    ln = ln[chapter.end():].strip("-— ")
                    if not ln:
                        continue
                piece.append(ln)
                if len(ln) < width * 0.8 and re.search(r"[。！？」』”）：]$", ln):
                    paras.append(piece)
                    piece = []
            if piece:
                paras.append(piece)
        elif lines:
            paras.append(lines)
    # Front matter that is about the file, not the book: "Author:", "Produced by", a transcriber's note.
    head, i = [], 0
    for i, lines in enumerate(paras[:40]):
        one = " ".join(lines)
        if META.match(one) or (len(one) < 300 and FRONT_JUNK.search(one)):
            continue
        if NOTE_TITLE.match(one):
            head.append(("note", lines))
            continue
        if head and head[-1][0] == "note" and (re.match(r"^[-*•—–]", one) or re.search(r"(?i)trascri|transcri|ortograf|spelling|errore|error|corrig|corrett|correct|cursiv|corsiv|italic", one)):
            continue  # the rest of the note
        head.append(("text", lines))
    paras = [lines for kind, lines in head if kind == "text"] + paras[40:]
    # A transcriber's note at the end: it and what follows go.
    for j in range(max(0, len(paras) - 12), len(paras)):
        if NOTE_TITLE.match(" ".join(paras[j])):
            paras = paras[:j]
            break
    # A contents list near the start: dropped, but its lines are kept to recognise the chapter titles
    # when they come round in the text (story titles with no "Chapter" in front of them).
    entries: list[str] = []
    t = next((k for k, lines in enumerate(paras[:80]) if len(lines) == 1 and CONTENTS.match(lines[0].strip("#* "))), None)
    if t is not None:
        k, prose = t + 1, False
        while k < len(paras) and k < t + 400:
            here = _key(" ".join(paras[k]))
            if _prose(paras[k]):
                prose = True
                break
            # The list is over when its first entry comes round again, as the first heading.
            if entries and k > t + 1 and _short(paras[k]) and len(here) >= 4 and any(
                    here.startswith(_key(e)) or _key(e).startswith(here) for e in entries[:2] if len(_key(e)) >= 4):
                break
            entries.extend(re.sub(r"[\s.·…]+\d+$", "", ln).strip() for ln in paras[k])
            k += 1
        if prose:
            # The text began without its first entry coming round (a part's title, then "I", then the
            # chapter's name): the headings just before the first paragraph are given back.
            twice = {e for e in map(_key, entries) if e and sum(1 for f in entries if _key(f) == e) >= 2}
            back = [j for j in range(max(t + 2, k - 3), k) if _short(paras[j])
                    and (HEADING.search(paras[j][0]) or _key(" ".join(paras[j])) in twice)]
            if back:
                k = back[0]
        paras = paras[:t] + paras[k:]
    # A contents list (or index) at the end, after the last chapter.
    tail = next((k for k in range(len(paras) - 1, max(0, len(paras) * 3 // 4), -1)
                 if len(paras[k]) == 1 and CONTENTS.match(paras[k][0].strip("#* "))), None)
    if tail is not None and not any(_prose(p) for p in paras[tail + 1:]):
        for p in paras[tail + 1:]:
            entries.extend(re.sub(r"[\s.·…]+\d+$", "", ln).strip() for ln in p)
        paras = paras[:tail]
    titles = {_key(e) for e in entries if 6 <= len(_key(e)) <= 120}
    blocks = []
    for n, lines in enumerate(paras):
        if re.fullmatch(r"(?i)(foot-?notes|notes?|notas?|mga talababa|talababa)\s*:?", " ".join(lines)) \
                and n + 1 < len(paras) and FOOTNOTE.match(paras[n + 1][0]):
            continue  # the title of a chapter's footnotes
        one = joiner.join(lines)
        if re.fullmatch(r"[\s*·.\-_=~#]+", one):
            continue  # decorative rules
        if FOOTNOTE.match(one):
            continue  # a footnote (its mark in the text is taken out below)
        one = re.sub(r"\[(\d+|\*)\]", "", one)
        if len(one) <= 150:
            one = re.sub(r"^[=#](.+?)[=#](\.?)$", r"\1\2", one)  # "=XXVII. SA PAGTATAKIPSILIM.=" over two lines
        kind = "h2" if len(one) <= 80 and len(lines) <= 2 and any(HEADING.search(ln) for ln in lines) else "p"
        if kind == "p" and len(one) <= 220 and len(lines) <= 3 and HEADING_WORD.search(lines[0]) and not _prose(one[60:]):
            kind = "h2"
        if kind == "p" and _short(lines) and _key(one) in titles and not re.match(r"[\"“«„—-]", one):
            kind = "title"  # (a heading if the book has hardly any others: see below)
        # Some newer Gutenberg files mark their headings the Markdown way: "## I.", "# CAPÍTOL PRIMER".
        marked = re.match(r"#{1,6}\s+(.+)$", one)
        if marked and len(one) <= 120:
            kind, one = "h2", marked.group(1)
        # Chapter titles on a line of their own in capitals ("UNA TARDA PER MAR", "UNA'NG PANAGKITA").
        if lang in CAPS_HEADINGS and kind == "p" and len(lines) <= 2 and len(one) <= 60 \
                and re.search(r"[A-ZÀ-Ý]{3}", one) and not re.search(r"[a-zß-ÿ]", one):
            kind = "h2"
        blocks.append({"kind": kind, "text": tidy(one) if lang not in NO_SPACES else one.strip()})
    # Story titles found through the contents list are headings in a book that has hardly any
    # others (a collection of stories); in a book with chapters they are only lines of the text.
    few = sum(1 for b in blocks if b["kind"] == "h2") < max(3, sum(1 for b in blocks if b["kind"] == "title"))
    for b in blocks:
        if b["kind"] == "title":
            b["kind"] = "h2" if few else "p"
    return blocks


# ------------------------------------------------------------------------------------ Wikisource

class _Text(HTMLParser):
    """The readable text of a Wikisource page: headings, paragraphs and poem lines, without the
    navigation boxes, notes and edit links around them."""
    SKIP_CLASS = re.compile(r"\b(ws-noexport|noprint|mw-editsection|reference|references|header_notes|ws-header|"
                            r"navbox|metadata|toc|mw-references-wrap|wst-header|pagenum|ws-pagenum|plainlinks)\b")
    BLOCKS = {"p", "h1", "h2", "h3", "h4", "h5", "dd", "li", "blockquote", "div", "center"}

    def __init__(self, tables: bool = False):
        super().__init__(convert_charrefs=True)
        # Thai poems are laid out as plain tables, a couplet a row: with `tables`, a table without a
        # class (not a navigation or notice box) is read a row at a time. Other tables are left out.
        self.tables = tables
        self.blocks: list[dict] = []
        self.buf: list[str] = []
        self.kind = "p"
        self.skip = 0
        self.stack: list[tuple[str, bool]] = []
        self.poem = 0

    def flush(self):
        text = tidy("".join(self.buf))
        if text:
            self.blocks.append({"kind": self.kind, "text": text})
        self.buf = []
        self.kind = "p"

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        plain_table = tag == "table" and self.tables and not a.get("class") and not a.get("id")
        skip = bool(self.SKIP_CLASS.search(a.get("class", "") or "")) or tag in ("sup", "style", "script") \
            or (tag == "table" and not plain_table) or a.get("id") in ("toc", "headertemplate")
        if tag in ("br", "img", "hr", "wbr", "meta", "link", "input"):
            if tag == "br" and not self.skip and self.poem:
                self.flush()
            elif tag == "br" and not self.skip:
                self.buf.append(" ")
            return
        self.stack.append((tag, skip))
        if skip:
            self.skip += 1
            return
        if "poem" in (a.get("class", "") or ""):
            self.poem += 1
        if not self.skip and tag in self.BLOCKS:
            self.flush()
            if tag in ("h2", "h3", "h4", "h5"):
                self.kind = "h2"

    VOID = {"br", "img", "hr", "wbr", "meta", "link", "input", "source", "col", "area"}

    def handle_endtag(self, tag):
        # (`<br />` arrives as a start and an end: nothing was opened for it, so nothing is closed.)
        if tag in self.VOID or all(t != tag for t, _skip in self.stack):
            return
        while self.stack:
            t, skip = self.stack.pop()
            if skip:
                self.skip -= 1
            if t == tag:
                break
        if not self.skip and (tag in self.BLOCKS or tag == "tr" and self.tables):
            self.flush()
        elif not self.skip and tag == "td" and self.tables:
            self.buf.append(" ")  # between the two halves of a line of verse

    def handle_data(self, data):
        if not self.skip:
            self.buf.append(data)


def wiki_host(lang: str) -> str:
    return "wikisource.org" if lang == "mul" else f"{lang}.wikisource.org"  # "mul": the multilingual Wikisource


def wiki_api(lang: str, **params) -> dict:
    params = {"format": "json", "formatversion": "2", **params}
    return json.loads(get(f"https://{wiki_host(lang)}/w/api.php?" + urllib.parse.urlencode(params)))


def wiki_scan(lang: str, index: str, first: int, last: int) -> list[dict]:
    """A book that is on Wikisource only as the proofread pages of its scan (Index:…, Page:…/n):
    its pages put together the way Wikisource does it for a reading page, with <pages>, a few at a time."""
    blocks: list[dict] = []
    for a in range(first, last + 1, 20):
        b = min(last, a + 19)
        d = wiki_api(lang, action="parse", text=f'<pages index="{index}" from={a} to={b} />', contentmodel="wikitext",
                     title="Tamkeen", prop="text", disablelimitreport=1)
        parser = _Text(tables=lang == "th")
        parser.feed(d["parse"]["text"])
        parser.flush()
        blocks.extend(parser.blocks)
        time.sleep(0.5)
    return blocks


def wiki_page(lang: str, title: str) -> tuple[list[dict], list[str], str]:
    """(the page's text blocks, its links to its own subpages in the order they appear, the page
    its header calls the next one: chapters are often chained that way instead of listed)."""
    d = wiki_api(lang, action="parse", page=title, prop="text", redirects=1, disableeditsection=1)
    page_html = d["parse"]["text"]
    parser = _Text(tables=lang == "th")
    parser.feed(page_html)
    parser.flush()
    real = d["parse"]["title"]
    subs = []
    for href in re.findall(r'href="/wiki/([^"#?]+)"', page_html):
        t = urllib.parse.unquote(href).replace("_", " ")
        if t.startswith(real + "/") and t not in subs:
            subs.append(t)
    nxt = re.search(r'id="headernext"[^>]*>.*?href="/wiki/([^"#?]+)"', page_html, re.S)
    nxt_title = urllib.parse.unquote(nxt.group(1)).replace("_", " ") if nxt else ""
    return parser.blocks, subs, nxt_title


EDITION = re.compile(r"/(\d{4}|ПСС|СС|ДО|СО)\b|\((ДО|СО)\)\s*$")


def wikisource(lang: str, title: str, depth: int = 0, chain: bool = True) -> list[dict]:
    blocks, subs, nxt = wiki_page(lang, title)
    words = sum(len(b["text"].split()) for b in blocks)
    if subs and (words < 600 or len(subs) >= 3) and depth < 2:
        editions = [s for s in subs if EDITION.search(s)]
        if editions and len(editions) == len(subs):
            # Different printings of the same work: the modern spelling (СО) if there is one.
            pick = next((s for s in editions if "СО" in s), editions[0])
            return wikisource(lang, pick, depth + 1)
        out = []
        for sub in subs:
            # A chapter inside a part also listed here is read with its part, not twice.
            if any(sub.startswith(other + "/") for other in subs if other != sub):
                continue
            part = wikisource(lang, sub, depth + 1, chain=False)
            if part:
                name = sub[len(title) + 1:] if sub.startswith(title + "/") else sub.rsplit("/", 1)[-1]
                if not part[0]["kind"].startswith("h"):
                    out.append({"kind": "h2", "text": tidy(name)})
                out.extend(part)
            time.sleep(0.2)
        return out
    # A chapter whose header points on to the next chapter of the same work: follow the chain.
    parent = title.rsplit("/", 1)[0] if "/" in title else ""
    seen = {title}
    while chain and depth > 0 and nxt and parent and nxt.startswith(parent + "/") and nxt not in seen and len(seen) < 300:
        seen.add(nxt)
        more, _subs, after = wiki_page(lang, nxt)
        name = nxt[len(parent) + 1:]
        if more and not more[0]["kind"].startswith("h"):
            blocks.append({"kind": "h2", "text": tidy(name)})
        blocks.extend(more)
        nxt = after
        time.sleep(0.2)
    return blocks


# ---------------------------------------------------------------------------------- Aozora Bunko

def aozora(author: str, card: str) -> list[dict]:
    card_url = f"https://www.aozora.gr.jp/cards/{author}/card{card}.html"
    page = get(card_url).decode("utf-8", "replace")
    m = re.search(r'href="\./files/([^"]+\.html)"', page)
    if not m:
        raise RuntimeError(f"Aozora card {card}: no XHTML file")
    raw = get(f"https://www.aozora.gr.jp/cards/{author}/files/{m.group(1)}")
    enc = re.search(rb'charset=["\']?([\w-]+)', raw[:2000])
    text = raw.decode(enc.group(1).decode() if enc else "shift_jis", "replace")
    body = re.search(r'<div class="main_text">(.*?)<div class="bibliographical_information">', text, re.S)
    body = body.group(1) if body else text
    body = re.sub(r"<rp>.*?</rp>|<rt>.*?</rt>", "", body, flags=re.S)  # furigana: the app adds its own
    blocks = []
    for chunk in re.split(r"<br\s*/?>|</?div[^>]*>|</h\d>", body):
        heading = bool(re.search(r"<h\d|midashi", chunk))
        line = tidy(html.unescape(re.sub(r"<[^>]+>", "", chunk))).replace(" ", "")
        if line:
            blocks.append({"kind": "h2" if heading and len(line) < 40 else "p", "text": line})
    return blocks


# ------------------------------------------------------------------------------------------ build

SEE_ALSO = re.compile(r"^(see also|voir aussi|vedi anche|véase también|vegeu també|veja também|см\. также|ดูเพิ่ม|انظر أيضا|関連項目)$", re.I)
NOTES = re.compile(r"^(Примечания( редакторов Викитеки)?|Notes?|Notas?|Note|ملاحظات|هوامش|↑|脚注|注釈|Mga tala|หมายเหตุ|เชิงอรรถ)\.?$", re.I)


NUMBER = re.compile(r"^((chapter|capítulo|capitulo|chapitre|capitolo|capítol|kabanata|kapitulo|глава|part|parte|livro|libro|book)\s+\S+"
                    r"|-?[IVXLC]+-?\.?|\d+\.?)$", re.I)


HEAD_WORD = re.compile(r"^(chapter|capítulo|capitulo|chapitre|capitolo|capítol|kabanata|kapitulo|глава|libro|livre|livro|book|part|parte|partie)\s+", re.I)


def _same_heading(a: str, b: str) -> bool:
    """Two lines that are one heading ("Capitolo I" and "I."; "Il Reverendo" and "IL REVERENDO.")."""
    x, y = _key(a), _key(b)
    if not x or not y:
        return False
    if x == y or (min(len(x), len(y)) >= 6 and (x.startswith(y) or y.startswith(x))):
        return True
    return _key(HEAD_WORD.sub("", a)) == _key(HEAD_WORD.sub("", b)) and bool(re.fullmatch(r"[ivxlc\d]+", _key(HEAD_WORD.sub("", b))))


def clean(blocks: list[dict]) -> list[dict]:
    """Drop lines with no letters (*** and the like), a heading repeated straight after itself, and
    the "Notes" headings left once the notes themselves are gone; join a chapter number to the title
    on the line after it ("CAPÍTULO I" + "O TREM": "CAPÍTULO I. O TREM")."""
    out: list[dict] = []
    for b in blocks:
        text = b["text"].strip()
        if not re.search(r"\w", text) or (out and out[-1]["text"] == text):
            continue
        if re.search(r"\.(pdf|djvu)/\d+", text):
            continue  # links to scan pages not transcribed yet ("หน้า:….pdf/422")
        if b["kind"] == "p" and re.fullmatch(r"[\W_]*\d{1,3}[\W_]*", text):
            continue  # a printed page number ("―4―", "9")
        kind = b["kind"]
        if len(text) <= 150:
            text = re.sub(r"^=+|=+(?=\.?$)", "", text).strip() or text  # what is left of "=I.=" bold marks
        if kind == "p" and len(text) <= 60 and HEADING.search(text):  # "I", "Глава первая", "第一回" on a line of their own
            kind = "h2"
        if out and out[-1]["kind"] == "h2" and len(text) <= 120 and _same_heading(out[-1]["text"], text):
            # The same heading twice ("Capitolo I" from the page's name, then "CAPITOLO I." or "I." in
            # it; "Il Reverendo", then "IL REVERENDO"): the fuller one is kept, as the heading.
            if len(text) > len(out[-1]["text"]) and kind == "h2":
                out[-1] = {"kind": "h2", "text": text}
            continue
        if out and kind == "h2" and out[-1]["kind"] == "h2":
            prev = out[-1]["text"]
            if NOTES.match(prev):
                out.pop()
            elif len(prev) <= 30 and HEADING.search(prev) and not HEADING.search(text) and len(text) <= 100 \
                    and not (len(out) > 1 and out[-2]["kind"] == "h2"):
                out[-1] = {"kind": "h2", "text": prev + (" " if prev[-1] in ".:—-" else ". ") + text}
                continue
        out.append({"kind": kind, "text": text})
    # Three or more headings in a row near the start are a title page's lines in capitals, not headings.
    i = 0
    while i < min(len(out), 80):
        j = i
        while j < len(out) and out[j]["kind"] == "h2":
            j += 1
        if j - i >= 3:
            for b in out[i:j]:
                if NUMBER.match(b["text"]) or HEADING.search(b["text"]):
                    break  # (the first chapter's heading, after the title page)
                b["kind"] = "p"
        i = j + 1
    # Lines in capitals on the title page (the author, the title, the town) aren't headings either: a
    # heading near the start is one with text after it.
    for i in range(min(len(out), 60)):
        b = out[i]
        if b["kind"] == "h2" and not (NUMBER.match(b["text"]) or HEADING.search(b["text"])) \
                and not any(x["kind"] == "p" and len(x["text"]) > 150 for x in out[i + 1:i + 3]):
            b["kind"] = "p"
    # A bare number heading ("-I-", "CHAPTER I") followed by a short line with no full stop, and then
    # prose (not the short lines of a poem), has its chapter's name on that line ("Perdido").
    for i in range(len(out) - 3, -1, -1):
        h, name, after = out[i], out[i + 1], out[i + 2]
        upper = name["text"].isupper()
        if h["kind"] == "h2" and name["kind"] == "p" and after["kind"] == "p" and NUMBER.match(h["text"]) \
                and len(name["text"]) <= (200 if upper else 70) and (len(after["text"]) > 200 or upper) \
                and not re.search(r"[!?:;,…»\"”)]$" if upper else r"[.!?:;,…»\"”)]$", name["text"]) \
                and not re.match(r"[\"“«„—–(\[-]", name["text"]):
            out[i] = {"kind": "h2", "text": h["text"] + (" " if h["text"][-1] in ".:—-" else ". ") + name["text"]}
            del out[i + 1]
    # A Wikisource page's "See also" links at the end.
    see = next((i for i in range(len(out) * 3 // 4, len(out)) if SEE_ALSO.match(out[i]["text"])), None)
    if see is not None:
        out = out[:see]
    # The editor's notes at the back ("NOTES", "NOTE I."), now that the notes' marks are gone from the text.
    notes = next((i for i in range(len(out) * 3 // 4, len(out)) if NOTES.match(out[i]["text"].rstrip(":"))
                  and not any(b["kind"] == "h2" for b in out[i + 1:])), None)
    if notes is not None:
        out = out[:notes]
    end = next((i for i in range(len(out) - 1, max(-1, len(out) - max(60, len(out) // 6)), -1) if THE_END.match(out[i]["text"])), None)
    if end is not None and not any(b["kind"] == "h2" for b in out[end + 1:]):  # (not a last story after it)
        k = end + 1
        while k < len(out) and len(out[k]["text"]) <= 60 and re.search(r"\b1[5-9]\d\d\b", out[k]["text"]):
            k += 1
        out = out[:k]
    while out and (NOTES.match(out[-1]["text"]) or out[-1]["kind"] == "h2"):
        out.pop()
    return out


def trim(blocks: list[dict], opts: dict) -> list[dict]:
    """A book's own cuts, where the general cleaning can't see them: "from" (the first block of the
    book itself, a regular expression), "to" (the first block after its end), "drop" (blocks to leave out)."""
    if opts.get("from"):
        # ("from" may be [pattern, n]: the n-th block that matches, where a title page comes twice.)
        pattern, nth = (opts["from"], 1) if isinstance(opts["from"], str) else opts["from"]
        hits = [i for i, b in enumerate(blocks) if re.search(pattern, b["text"])]
        if len(hits) < nth:
            raise RuntimeError(f"no block matches from={opts['from']!r}")
        blocks = blocks[hits[nth - 1]:]
    if opts.get("to"):
        k = next((i for i, b in enumerate(blocks) if i and re.search(opts["to"], b["text"])), None)
        if k is None:
            raise RuntimeError(f"no block matches to={opts['to']!r}")
        blocks = blocks[:k]
    if opts.get("drop"):
        blocks = [b for b in blocks if not re.search(opts["drop"], b["text"])]
    if opts.get("join_lines"):
        # A scan proofread a printed line to a paragraph: a line that doesn't end a sentence, followed
        # by one that starts in small letters, is one paragraph.
        out: list[dict] = []
        for b in blocks:
            if out and b["kind"] == out[-1]["kind"] == "p" and not re.search(r"[.!?:;”»\"]$", out[-1]["text"]) \
                    and re.match(r"[a-zà-ÿñ¿¡(]", b["text"]):
                joined = out[-1]["text"]
                out[-1] = {"kind": "p", "text": (joined[:-1] if joined.endswith("-") else joined + " ") + b["text"]}
            else:
                out.append(b)
        blocks = out
    return blocks


def build_one(lang: str, entry: tuple, again: bool) -> dict | None:
    book_id, title, author, year, blurb, source = entry
    opts = source[-1] if isinstance(source[-1], dict) else {}
    source = source[:-1] if opts else source
    path = OUT / lang / f"{book_id}.json.gz"
    if path.exists() and not again:
        data = json.loads(gzip.decompress(path.read_bytes()))
    else:
        kind = source[0]
        if kind == "gutenberg":
            blocks = gutenberg(source[1], lang)
            credit = f"Project Gutenberg #{source[1]} (https://www.gutenberg.org/ebooks/{source[1]})"
        elif kind == "wikisource" and isinstance(source[2], list):
            blocks = []
            for page in source[2]:
                part = wikisource(source[1], page, depth=1, chain=False)
                # (the page's name is its heading, unless it has one of its own in its first lines)
                if part and not any(b["kind"].startswith("h") or (len(b["text"]) <= 80 and HEADING.search(b["text"])) for b in part[:3]):
                    blocks.append({"kind": "h2", "text": tidy(page.rsplit("/", 1)[-1].split(" - ")[-1])})
                blocks.extend(part)
                time.sleep(0.2)
            first = source[2][0]
            credit = f"Wikisource (https://{source[1]}.wikisource.org/wiki/{urllib.parse.quote(first.replace(' ', '_'))})"
        elif kind == "wikisource":
            blocks = wikisource(source[1], source[2])
            credit = f"Wikisource (https://{source[1]}.wikisource.org/wiki/{urllib.parse.quote(source[2].replace(' ', '_'))})"
        elif kind == "wikisource-scan":
            blocks = wiki_scan(source[1], source[2], source[3], source[4])
            credit = f"Wikisource (https://{wiki_host(source[1])}/wiki/{urllib.parse.quote(('Index:' + source[2]).replace(' ', '_'))})"
        else:
            blocks = aozora(source[1], source[2])
            credit = f"Aozora Bunko 青空文庫 (https://www.aozora.gr.jp/cards/{source[1]}/card{source[2]}.html)"
        blocks = clean(trim(blocks, opts))
        words, kept = 0, []
        for b in blocks:
            n = len(b["text"].split()) if lang not in NO_SPACES else max(1, len(b["text"]) // 2)
            if words + n > MAX_WORDS:
                break
            words += n
            kept.append(b)
        if not kept:
            raise RuntimeError(f"{lang}/{book_id}: no text")
        data = {"format": 1, "id": book_id, "lang": lang, "title": title, "author": author, "year": year,
                "source": credit, "blocks": kept}
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(gzip.compress(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 9, mtime=0))
    packed = path.read_bytes()
    chars = sum(len(b["text"]) for b in data["blocks"])
    return {"id": book_id, "title": title, "author": author, "year": year, "blurb": blurb,
            "file": f"{lang}/{book_id}.json.gz", "bytes": len(packed), "sha256": hashlib.sha256(packed).hexdigest(),
            "chars": chars, "chapters": sum(1 for b in data["blocks"] if b["kind"] == "h2"), "source": data["source"]}


def main(args: list[str]) -> None:
    again = "--again" in args
    langs = [a for a in args if a in BOOKS] or list(BOOKS)
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {"format": 1, "books": {}}
    for lang in langs:
        shelf = []
        for entry in BOOKS[lang]:
            try:
                row = build_one(lang, entry, again)
                shelf.append(row)
                print(f"  {lang}/{row['id']}: {row['chars']:,} characters, {row['chapters']} headings, {row['bytes'] / 1e6:.2f} MB", flush=True)
            except Exception as exc:  # noqa: BLE001 (one book failing shouldn't stop the rest)
                print(f"  {lang}/{entry[0]}: FAILED {exc}", flush=True)
        index["books"][lang] = shelf
        index_path.parent.mkdir(parents=True, exist_ok=True)
        index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main(sys.argv[1:])
