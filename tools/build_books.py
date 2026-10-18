"""Build Tamkeen's free book shelf: famous public-domain books in each language taught.

Each book is fetched once from where it is published free, cleaned into headings and paragraphs,
and written to docs/books/<lang>/<id>.json.gz, which GitHub Pages serves to the apps; the list of
them is docs/books/index.json (read by web/js/books.js). Sources:
    gutenberg   Project Gutenberg's plain-text file (the Gutenberg header and licence are removed:
                what is kept is the public-domain text itself)
    wikisource  a Wikisource page, or its chapters when the page is a table of contents
    aozora      a work's XHTML file from Aozora Bunko (青空文庫), Japan's public-domain library

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
import re
import sys
import time
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
        ("la-barraca", "La barraca", "Vicente Blasco Ibáñez", 1898, "A farming family against a hostile village near Valencia.", ("gutenberg", 14944)),
        ("sangre-arena", "Sangre y arena", "Vicente Blasco Ibáñez", 1908, "The rise and fall of a bullfighter.", ("gutenberg", 26983)),
        ("cuentos-quiroga", "Cuentos de amor de locura y de muerte", "Horacio Quiroga", 1917, "Short stories of the jungle and the mind.", ("gutenberg", 13507)),
        ("celestina", "La Celestina", "Fernando de Rojas", 1499, "A go-between, two lovers and tragedy, written as dialogue.", ("gutenberg", 1619)),
    ],
    "fr": [
        ("tour-du-monde", "Le tour du monde en quatre-vingts jours", "Jules Verne", 1872, "Phileas Fogg bets he can circle the globe in 80 days.", ("gutenberg", 800)),
        ("candide", "Candide", "Voltaire", 1759, "An optimist's misadventures around the world.", ("gutenberg", 4650)),
        ("boule-de-suif", "Boule de Suif", "Guy de Maupassant", 1880, "Travellers in a coach during the war of 1870.", ("gutenberg", 10746)),
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
        ("promessi-sposi", "I promessi sposi", "Alessandro Manzoni", 1827, "Two young lovers kept apart in 17th-century Lombardy.", ("gutenberg", 45334)),
        ("inferno", "Divina Commedia: Inferno", "Dante Alighieri", 1320, "Dante's journey through Hell, in verse.", ("gutenberg", 997)),
        ("cuore", "Cuore", "Edmondo De Amicis", 1886, "A schoolboy's diary through a year in Turin.", ("wikisource", "it", "Cuore (1889)")),
        ("mattia-pascal", "Il fu Mattia Pascal", "Luigi Pirandello", 1904, "A man reported dead starts a new life.", ("wikisource", "it", "Il fu Mattia Pascal")),
        ("malavoglia", "I Malavoglia", "Giovanni Verga", 1881, "A Sicilian fishing family fights misfortune.", ("wikisource", "it", "I Malavoglia")),
        ("novelle-rusticane", "Novelle rusticane", "Giovanni Verga", 1883, "Short stories of Sicilian country life.", ("wikisource", "it", "Novelle rusticane")),
        ("principe", "Il Principe", "Niccolò Machiavelli", 1532, "How a prince wins power and keeps it.", ("wikisource", "it", "Il Principe")),
        ("uno-nessuno", "Uno, nessuno e centomila", "Luigi Pirandello", 1926, "A man discovers that everyone sees a different him.", ("wikisource", "it", "Uno, nessuno e centomila")),
        ("coscienza-zeno", "La coscienza di Zeno", "Italo Svevo", 1923, "Zeno tells his life to his psychoanalyst, starting with his last cigarette.", ("wikisource", "it", "La coscienza di Zeno")),
        ("sei-personaggi", "Sei personaggi in cerca d'autore", "Luigi Pirandello", 1921, "Six characters interrupt a rehearsal looking for an author.", ("gutenberg", 18457)),
        ("canti-leopardi", "Canti", "Giacomo Leopardi", 1835, "Leopardi's poems, among the greatest in Italian.", ("gutenberg", 55236)),
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
        ("geroy", "Герой нашего времени", "Михаил Лермонтов", 1840, "Pechorin, a bored and restless officer in the Caucasus.", ("wikisource", "ru", "Герой нашего времени (Лермонтов)")),
    ],
    "ar": [
        ("kalila-wa-dimna", "كليلة ودمنة", "ابن المقفع", 750, "Animal fables of wisdom and politics, told by a philosopher to a king.", ("wikisource", "ar", "كليلة ودمنة")),
        ("al-ajniha", "الأجنحة المتكسرة", "جبران خليل جبران", 1912, "Gibran's novel of a young love in Beirut, crushed by custom.", ("wikisource", "ar", "الأجنحة المتكسرة")),
        ("dama-wa-ibtisama", "دمعة وابتسامة", "جبران خليل جبران", 1914, "Gibran's short prose poems and reflections.", ("wikisource", "ar", "دمعة وابتسامة (1914)")),
        ("tawq-al-hamama", "طوق الحمامة", "ابن حزم الأندلسي", 1022, "The Ring of the Dove: on love and lovers, from Andalusia.", ("wikisource", "ar", "طوق الحمامة")),
        ("hayy-ibn-yaqzan", "حي بن يقظان", "ابن طفيل", 1160, "A child raised by a gazelle on an island discovers the world alone.", ("wikisource", "ar", "حي بن يقظان")),
        ("al-bukhala", "البخلاء", "الجاحظ", 850, "Funny portraits of misers from Basra and beyond.", ("wikisource", "ar", "البخلاء")),
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
        ("lunyu", "論語", "孔子", -479, "The sayings of Confucius.", ("gutenberg", 23839)),
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
        ("florante", "Florante at Laura", "Francisco Balagtas", 1838, "The great Tagalog poem of love and betrayal in Albania.", ("gutenberg", 15845)),
        ("ibong-adarna", "Ibong Adarna", "Anonymous", 1800, "Three princes seek the magical Adarna bird to heal their father.", ("gutenberg", 16157)),
        ("juan-tamad", "Búhay na Pinagdaanan ni Juan Tamad", "Anonymous", 1900, "The tales of lazy Juan.", ("gutenberg", 16386)),
        ("urbana-feliza", "Urbana at Feliza", "Modesto de Castro", 1864, "Letters between two sisters on good manners.", ("gutenberg", 15980)),
        ("nang-bata-pa-kami", "Nang Bata Pa Kami", "Pura Medrano", 1900, "Childhood memories.", ("gutenberg", 13686)),
        ("mananayaw", "Ang Mananayaw", "Rosauro Almario", 1910, "A short novel about a dancer.", ("gutenberg", 14794)),
        ("ilang-ilang", "Alamat ng Ilang-Ilang", "Jose N. Sevilla", 1915, "The legend of the ilang-ilang flower.", ("gutenberg", 13156)),
        ("sa-ano-nabubuhay", "Sa Ano Nabubuhay ang Tao", "Leo Tolstoy (salin ni Sofronio Calderón)", 1885, "Tolstoy's parable of an angel and a shoemaker, in Tagalog.", ("gutenberg", 15628)),
    ],
}

NO_SPACES = {"ja", "zh"}  # lines of a paragraph join without a space


def get(url: str, retries: int = 3) -> bytes:
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read()
        except Exception:  # noqa: BLE001 (any network failure: wait and try again)
            if attempt == retries - 1:
                raise
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("unreachable")


def tidy(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


# ----------------------------------------------------------------------------- Project Gutenberg

HEADING = re.compile(
    r"^(chapter|capítulo|capitulo|chapitre|capitolo|kabanata|libro|livre|tome|part|parte|partie|book|"
    r"stave|act|acte|acto|atto|scene|scène|escena|canto|tratado|prólogo|prologo|prologue|épilogue|epilogue|"
    r"introduction|introducción|preface|préface|prefazione|глава|часть|ночь|باب|الفصل|الجزء)\b"
    r"|^[IVXLC]+\.?$|^[IVXLC]+\.\s.{0,60}$|^第[一二三四五六七八九十百零〇\d]+[回章篇卷]", re.I)


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
    start = re.search(r"^\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG.*$", text, re.M | re.I)
    end = re.search(r"^\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG.*$", text, re.M | re.I)
    text = text[start.end() if start else 0: end.start() if end else len(text)]
    text = re.sub(r"\[(Illustration|Ilustración|Illustrazione)[^\]]*\]", "", text, flags=re.I)
    text = re.sub(r"(?<!\w)_([^_\n]+)_(?!\w)", r"\1", text)  # _italics_
    blocks = []
    joiner = "" if lang in NO_SPACES else " "
    for para in re.split(r"\n\s*\n", text):
        lines = [ln.strip() for ln in para.split("\n") if ln.strip()]
        if not lines:
            continue
        one = joiner.join(lines)
        if re.fullmatch(r"[\s*·.\-_=~#]+", one):
            continue  # decorative rules
        if re.match(r"(?i)(produced by|e-?text prepared by|transcriber'?s? note|nota del transcriptor|this e-?book)", one) and len(blocks) < 5:
            continue
        kind = "h2" if len(one) <= 80 and len(lines) <= 2 and HEADING.search(lines[0]) else "p"
        blocks.append({"kind": kind, "text": tidy(one) if lang not in NO_SPACES else one.strip()})
    return blocks


# ------------------------------------------------------------------------------------ Wikisource

class _Text(HTMLParser):
    """The readable text of a Wikisource page: headings, paragraphs and poem lines, without the
    navigation boxes, notes and edit links around them."""
    SKIP_CLASS = re.compile(r"\b(ws-noexport|noprint|mw-editsection|reference|references|header_notes|ws-header|"
                            r"navbox|metadata|toc|mw-references-wrap|wst-header|pagenum|ws-pagenum|plainlinks)\b")
    BLOCKS = {"p", "h1", "h2", "h3", "h4", "h5", "dd", "li", "blockquote", "div", "center"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
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
        skip = bool(self.SKIP_CLASS.search(a.get("class", "") or "")) or tag in ("table", "sup", "style", "script") \
            or a.get("id") in ("toc", "headertemplate")
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
        if not self.skip and tag in self.BLOCKS:
            self.flush()

    def handle_data(self, data):
        if not self.skip:
            self.buf.append(data)


def wiki_api(lang: str, **params) -> dict:
    params = {"format": "json", "formatversion": "2", **params}
    return json.loads(get(f"https://{lang}.wikisource.org/w/api.php?" + urllib.parse.urlencode(params)))


def wiki_page(lang: str, title: str) -> tuple[list[dict], list[str], str]:
    """(the page's text blocks, its links to its own subpages in the order they appear, the page
    its header calls the next one: chapters are often chained that way instead of listed)."""
    d = wiki_api(lang, action="parse", page=title, prop="text", redirects=1, disableeditsection=1)
    page_html = d["parse"]["text"]
    parser = _Text()
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

NOTES = re.compile(r"^(Примечания( редакторов Викитеки)?|Notes?|Notas?|Note|ملاحظات|هوامش|↑|脚注|注釈)\.?$", re.I)


def clean(blocks: list[dict]) -> list[dict]:
    """Drop lines with no letters (*** and the like), a heading repeated straight after itself,
    and the "Notes" headings left at the end once the notes themselves are gone."""
    out: list[dict] = []
    for b in blocks:
        text = b["text"].strip()
        if not re.search(r"\w", text) or (out and out[-1]["text"] == text):
            continue
        kind = b["kind"]
        if kind == "p" and len(text) <= 60 and HEADING.search(text):  # "I", "Глава первая", "第一回" on a line of their own
            kind = "h2"
        out.append({"kind": kind, "text": text})
    while out and (NOTES.match(out[-1]["text"]) or out[-1]["kind"] == "h2"):
        out.pop()
    return out


def build_one(lang: str, entry: tuple, again: bool) -> dict | None:
    book_id, title, author, year, blurb, source = entry
    path = OUT / lang / f"{book_id}.json.gz"
    if path.exists() and not again:
        data = json.loads(gzip.decompress(path.read_bytes()))
    else:
        kind = source[0]
        if kind == "gutenberg":
            blocks = gutenberg(source[1], lang)
            credit = f"Project Gutenberg #{source[1]} (https://www.gutenberg.org/ebooks/{source[1]})"
        elif kind == "wikisource":
            blocks = wikisource(source[1], source[2])
            credit = f"Wikisource (https://{source[1]}.wikisource.org/wiki/{urllib.parse.quote(source[2].replace(' ', '_'))})"
        else:
            blocks = aozora(source[1], source[2])
            credit = f"Aozora Bunko 青空文庫 (https://www.aozora.gr.jp/cards/{source[1]}/card{source[2]}.html)"
        blocks = clean(blocks)
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
