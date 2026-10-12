// The in-app web browser's start page: a Google search box and popular news sites in the
// language being studied. Pure (no page, no imports from the app) so it is unit-tested and
// serves both apps: the computer shows it through web/browser-home.html, and the phone hands
// `homeHtml()` to its browser as one finished page (it cannot load files from the app there).
//
// To add or change a site, edit NEWS below: [name as the site writes it, address, short note].
// A note starting with "Easier" marks news written for learners; those are listed first.

export const NEWS = {
  ar: [
    ["الجزيرة", "https://www.aljazeera.net/", "Al Jazeera"],
    ["BBC عربي", "https://www.bbc.com/arabic", "BBC Arabic"],
    ["العربية", "https://www.alarabiya.net/", "Al Arabiya"],
    ["سكاي نيوز عربية", "https://www.skynewsarabia.com/", "Sky News Arabia"],
    ["الشرق الأوسط", "https://aawsat.com/", "Asharq Al-Awsat"],
    ["CNN بالعربية", "https://arabic.cnn.com/", "CNN Arabic"],
    ["فرانس 24", "https://www.france24.com/ar/", "France 24"],
    ["DW عربية", "https://www.dw.com/ar/", "Deutsche Welle"],
    ["الشرق", "https://asharq.com/", "Asharq News"],
    ["اندبندنت عربية", "https://www.independentarabia.com/", "Independent Arabia"],
    ["القدس العربي", "https://www.alquds.co.uk/", "Al-Quds Al-Arabi"],
    ["الأهرام", "https://gate.ahram.org.eg/", "Al-Ahram, Egypt"],
    ["اليوم السابع", "https://www.youm7.com/", "Youm7, Egypt"],
    ["يورونيوز", "https://arabic.euronews.com/", "Euronews"],
    ["هسبريس", "https://www.hespress.com/", "Hespress, Morocco"],
    ["النهار", "https://www.annahar.com/", "An-Nahar, Lebanon"],
  ],
  es: [
    ["El País", "https://elpais.com/", "Spain"],
    ["BBC Mundo", "https://www.bbc.com/mundo", "BBC in Spanish"],
    ["El Mundo", "https://www.elmundo.es/", "Spain"],
    ["RTVE Noticias", "https://www.rtve.es/noticias/", "Spain's public broadcaster"],
    ["La Vanguardia", "https://www.lavanguardia.com/", "Spain"],
    ["20minutos", "https://www.20minutos.es/", "Spain"],
    ["CNN en Español", "https://cnnespanol.cnn.com/", "The Americas"],
    ["Infobae", "https://www.infobae.com/", "Argentina"],
    ["Clarín", "https://www.clarin.com/", "Argentina"],
    ["La Nación", "https://www.lanacion.com.ar/", "Argentina"],
    ["El Universal", "https://www.eluniversal.com.mx/", "Mexico"],
    ["Milenio", "https://www.milenio.com/", "Mexico"],
    ["El Tiempo", "https://www.eltiempo.com/", "Colombia"],
    ["El Comercio", "https://elcomercio.pe/", "Peru"],
    ["DW Español", "https://www.dw.com/es/", "Deutsche Welle"],
    ["France 24", "https://www.france24.com/es/", "In Spanish"],
  ],
  fr: [
    ["RFI Français facile", "https://francaisfacile.rfi.fr/fr/", "Easier: news for learners"],
    ["Le Monde", "https://www.lemonde.fr/", "France"],
    ["Le Figaro", "https://www.lefigaro.fr/", "France"],
    ["franceinfo", "https://www.franceinfo.fr/", "France's public broadcaster"],
    ["France 24", "https://www.france24.com/fr/", "World news"],
    ["RFI", "https://www.rfi.fr/fr/", "World news"],
    ["Libération", "https://www.liberation.fr/", "France"],
    ["Le Parisien", "https://www.leparisien.fr/", "France"],
    ["20 Minutes", "https://www.20minutes.fr/", "France"],
    ["BFMTV", "https://www.bfmtv.com/", "France"],
    ["Ouest-France", "https://www.ouest-france.fr/", "France"],
    ["L'Obs", "https://www.nouvelobs.com/", "France"],
    ["Radio-Canada", "https://ici.radio-canada.ca/info", "Canada"],
    ["La Presse", "https://www.lapresse.ca/", "Canada"],
    ["Le Soir", "https://www.lesoir.be/", "Belgium"],
    ["RTS Info", "https://www.rts.ch/info/", "Switzerland"],
  ],
  ja: [
    ["NHK やさしいことばニュース", "https://news.web.nhk/news/easy/", "Easier: NHK news in simple Japanese"],
    ["NHKニュース", "https://news.web.nhk/newsweb", "NHK, public broadcaster"],
    ["Yahoo!ニュース", "https://news.yahoo.co.jp/", "Yahoo! News Japan"],
    ["朝日新聞", "https://www.asahi.com/", "Asahi Shimbun"],
    ["読売新聞", "https://www.yomiuri.co.jp/", "Yomiuri Shimbun"],
    ["毎日新聞", "https://mainichi.jp/", "Mainichi Shimbun"],
    ["日本経済新聞", "https://www.nikkei.com/", "Nikkei"],
    ["産経新聞", "https://www.sankei.com/", "Sankei Shimbun"],
    ["東京新聞", "https://www.tokyo-np.co.jp/", "Tokyo Shimbun"],
    ["時事ドットコム", "https://www.jiji.com/", "Jiji Press"],
    ["共同通信", "https://www.kyodo.co.jp/", "Kyodo News"],
    ["TBS NEWS DIG", "https://newsdig.tbs.co.jp/", "TBS television news"],
    ["日テレNEWS", "https://news.ntv.co.jp/", "Nippon TV news"],
    ["BBCニュース", "https://www.bbc.com/japanese", "BBC in Japanese"],
    ["東洋経済オンライン", "https://toyokeizai.net/", "Toyo Keizai"],
    ["ITmedia", "https://www.itmedia.co.jp/", "Technology news"],
  ],
  zh: [
    ["BBC 中文", "https://www.bbc.com/zhongwen/simp", "BBC in Chinese"],
    ["纽约时报中文网", "https://cn.nytimes.com/", "The New York Times"],
    ["联合早报", "https://www.zaobao.com.sg/", "Lianhe Zaobao, Singapore"],
    ["德国之声", "https://www.dw.com/zh/", "Deutsche Welle"],
    ["法广", "https://www.rfi.fr/cn/", "RFI"],
    ["新华网", "https://www.news.cn/", "Xinhua, China"],
    ["人民网", "http://www.people.com.cn/", "People's Daily, China"],
    ["澎湃新闻", "https://www.thepaper.cn/", "The Paper, China"],
    ["财新网", "https://www.caixin.com/", "Caixin, China"],
    ["新浪新闻", "https://news.sina.com.cn/", "Sina News, China"],
    ["腾讯新闻", "https://news.qq.com/", "Tencent News, China"],
    ["界面新闻", "https://www.jiemian.com/", "Jiemian, China"],
    ["FT中文网", "https://www.ftchinese.com/", "Financial Times"],
    ["中央社", "https://www.cna.com.tw/", "CNA, Taiwan (traditional characters)"],
    ["聯合新聞網", "https://udn.com/news/index", "UDN, Taiwan (traditional characters)"],
    ["香港01", "https://www.hk01.com/", "HK01, Hong Kong (traditional characters)"],
  ],
  ru: [
    ["BBC News Русская служба", "https://www.bbc.com/russian", "BBC in Russian"],
    ["Медуза", "https://meduza.io/", "Meduza"],
    ["РБК", "https://www.rbc.ru/", "RBC"],
    ["Коммерсантъ", "https://www.kommersant.ru/", "Kommersant"],
    ["Интерфакс", "https://www.interfax.ru/", "Interfax"],
    ["ТАСС", "https://tass.ru/", "TASS, state news agency"],
    ["РИА Новости", "https://ria.ru/", "RIA Novosti, state news agency"],
    ["Лента.ру", "https://lenta.ru/", "Lenta.ru"],
    ["Ведомости", "https://www.vedomosti.ru/", "Vedomosti"],
    ["Газета.Ru", "https://www.gazeta.ru/", "Gazeta.ru"],
    ["DW на русском", "https://www.dw.com/ru/", "Deutsche Welle"],
    ["Радио Свобода", "https://www.svoboda.org/", "Radio Liberty"],
    ["Новая газета Европа", "https://novayagazeta.eu/", "Novaya Gazeta Europe"],
    ["Euronews", "https://ru.euronews.com/", "In Russian"],
    ["Настоящее Время", "https://www.currenttime.tv/", "Current Time"],
    ["Хабр", "https://habr.com/ru/news/", "Technology news"],
  ],
};

// Language names and the few words on the page, for the six languages (the page itself is in
// English, like the rest of the app; only the heading greets in the language).
const NAMES = { ar: "Arabic", es: "Spanish", fr: "French", ja: "Japanese", zh: "Chinese", ru: "Russian" };
const RTL = { ar: true };

export const hasNews = (code) => Object.prototype.hasOwnProperty.call(NEWS, code);

/** The sites for a language: learner-friendly ones first, otherwise in the order written. */
export function newsFor(code) {
  const list = hasNews(code) ? NEWS[code] : [];
  const easy = ([, , note]) => /^Easier/.test(note || "");
  return [...list.filter(easy), ...list.filter((s) => !easy(s))].map(([name, url, note]) => ({ name, url, note: note || "", easy: easy([0, 0, note]) }));
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };

export const HOME_CSS = `
  :root { color-scheme: light dark; --bg: #f6f4f1; --card: #fff; --line: #e1dcd9; --ink: #1f1a23; --muted: #6d6672; --accent: #0a7580; --soft: #d4edf0; }
  @media (prefers-color-scheme: dark) { :root { --bg: #141216; --card: #1e1b22; --line: #332e38; --ink: #f1edf3; --muted: #a79fad; --accent: #2dd4bf; --soft: #123f3c; } }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { background: var(--bg); color: var(--ink); font: 16px/1.4 ui-rounded, "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif; padding: 0 16px 90px; }
  .top { background: linear-gradient(45deg, #360032 0%, #1b526d 52%, #0b8693 100%); margin: 0 -16px; padding: 34px 16px 30px; text-align: center; }
  .top h1 { margin: 0 0 16px; color: #f1cf7b; font-size: 22px; font-weight: 700; }
  form { display: flex; gap: 8px; max-width: 640px; margin: 0 auto; }
  input[type=search] { flex: 1; min-width: 0; height: 48px; padding: 0 18px; border-radius: 99px; border: 1px solid transparent; background: #fff; color: #1f1a23; font: inherit; outline: none; }
  input[type=search]:focus { border-color: #f1cf7b; box-shadow: 0 0 0 3px rgba(241, 207, 123, .35); }
  button { height: 48px; padding: 0 22px; border-radius: 99px; border: 0; background: #f1cf7b; color: #2a1d00; font: inherit; font-weight: 700; cursor: pointer; }
  main { max-width: 1040px; margin: 0 auto; }
  h2 { font-size: 18px; margin: 26px 0 4px; }
  .sub { color: var(--muted); font-size: 14px; margin: 0 0 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
  a.site { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--card); color: inherit; text-decoration: none; min-width: 0; }
  a.site:hover, a.site:focus-visible { border-color: var(--accent); outline: none; }
  a.site:active { transform: scale(.98); }
  .ico { position: relative; width: 40px; height: 40px; flex: none; border-radius: 10px; background: var(--soft); color: var(--accent); display: grid; place-items: center; font-weight: 700; font-size: 18px; overflow: hidden; }
  .ico img { position: absolute; inset: 0; width: 100%; height: 100%; padding: 6px; border-radius: 10px; background: var(--card); opacity: 0; transition: opacity .2s; }
  .ico img.on { opacity: 1; }
  .txt { min-width: 0; flex: 1; }
  .name, .note { display: block; }
  .name { font-weight: 600; font-size: 17px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .note { color: var(--muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .easy { display: inline-block; margin-inline-end: 6px; padding: 0 7px; border-radius: 99px; background: var(--soft); color: var(--accent); font-size: 11px; font-weight: 700; }
  .tip { color: var(--muted); font-size: 14px; margin-top: 22px; }
  @media (max-width: 520px) { .grid { grid-template-columns: 1fr 1fr; } a.site { padding: 10px; gap: 8px; } .ico { width: 32px; height: 32px; font-size: 15px; } .ico img { padding: 4px; } .name { font-size: 15px; white-space: normal; } .top { padding: 22px 16px 20px; } form { flex-wrap: nowrap; } button { padding: 0 16px; } }
`;

/** The page's contents (everything inside <body>). */
export function homeBody(code) {
  const lang = hasNews(code) ? code : "ar";
  const name = NAMES[lang];
  const sites = newsFor(lang).map((s) => {
    // The site's own small picture, fetched through Google's icon service; the first letter shows until (or unless) it loads.
    const icon = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host(s.url))}`;
    const note = s.easy ? `<span class="easy">Easier</span>${esc(s.note.replace(/^Easier:?\s*/, ""))}` : esc(s.note);
    return `<a class="site" href="${esc(s.url)}" rel="noreferrer">
      <span class="ico">${esc([...s.name][0] || "")}<img src="${esc(icon)}" alt="" referrerpolicy="no-referrer" onload="this.className='on'" onerror="this.remove()"></span>
      <span class="txt"><span class="name" lang="${lang}" dir="${RTL[lang] ? "rtl" : "ltr"}">${esc(s.name)}</span><span class="note">${note}</span></span>
    </a>`;
  }).join("\n");
  return `<div class="top">
    <h1>Read the web in ${esc(name)}</h1>
    <form action="https://www.google.com/search" method="get" role="search">
      <input type="search" name="q" placeholder="Search Google" aria-label="Search Google" autocomplete="off" dir="auto" required>
      <button type="submit">Search</button>
    </form>
  </div>
  <main>
    <h2>News in ${esc(name)}</h2>
    <p class="sub">Open a site, find an article, then press <strong>Import Page</strong> to read it with every word clickable.</p>
    <div class="grid">${sites}</div>
    <p class="tip">Looking for something else? Search above, or type a web address in the address box.</p>
  </main>`;
}

/** The whole start page as one self-contained HTML document. */
export function homeHtml(code) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tamkeen browser</title><style>${HOME_CSS}</style></head>
<body>${homeBody(code)}</body></html>`;
}
