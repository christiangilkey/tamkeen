// The in-app web browser's start page: a Google search box and popular news sites in the
// language being studied. Pure (no page, no imports from the app) so it is unit-tested and
// serves both apps: the computer shows it through web/browser-home.html, and the phone hands
// `homeHtml()` to its browser as one finished page (it cannot load files from the app there).
//
// To add or change a site, edit NEWS below: [name as the site writes it, address, short note].
// A note starting with "Easier" marks news written for learners; those are listed first.
//
// Above the news sits "Your saved sites": whatever the user kept with the star in the browser's
// bar (the list and its rules are in browser-sites.js). `paintSaved` draws it; it is written to
// stand entirely on its own, because the phone's page carries it as text inside the page.

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
    ["网易新闻", "https://news.163.com/", "NetEase News, China"],
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
  it: [
    ["Rai News", "https://www.rainews.it/", "Rai, public broadcaster"],
    ["ANSA", "https://www.ansa.it/", "ANSA, news agency"],
    ["Corriere della Sera", "https://www.corriere.it/", "Corriere della Sera"],
    ["la Repubblica", "https://www.repubblica.it/", "la Repubblica"],
    ["La Stampa", "https://www.lastampa.it/", "La Stampa"],
    ["Il Sole 24 Ore", "https://www.ilsole24ore.com/", "Business news"],
    ["Il Post", "https://www.ilpost.it/", "Il Post"],
    ["Sky TG24", "https://tg24.sky.it/", "Sky TG24"],
    ["Internazionale", "https://www.internazionale.it/", "World news in Italian"],
    ["Euronews", "https://it.euronews.com/", "In Italian"],
    ["Gazzetta dello Sport", "https://www.gazzetta.it/", "Sport"],
    ["Wikipedia", "https://it.wikipedia.org/", "Italian Wikipedia"],
  ],
  tl: [
    ["Abante", "https://www.abante.com.ph/", "Abante, in Tagalog"],
    ["Bombo Radyo", "https://www.bomboradyo.com/", "Bombo Radyo"],
    ["Pilipino Star Ngayon", "https://www.philstar.com/pilipino-star-ngayon", "Philstar's Tagalog paper"],
    ["Balita", "https://balita.mb.com.ph/", "Manila Bulletin's Tagalog news"],
    ["Bandera", "https://bandera.inquirer.net/", "Inquirer's Tagalog paper"],
    ["GMA News Balitambayan", "https://www.gmanetwork.com/news/balitambayan/", "GMA News in Tagalog"],
    ["Bulgar", "https://www.bulgaronline.com/", "Bulgar, in Tagalog"],
    ["Remate", "https://remate.ph/", "Remate, in Tagalog"],
    ["Pilipino Mirror", "https://pilipinomirror.com/", "Pilipino Mirror, in Tagalog"],
    ["Hataw", "https://www.hatawtabloid.com/", "Hataw, in Tagalog"],
    ["Radyo Pilipinas", "https://radyopilipinas.ph/", "Radyo Pilipinas, public radio"],
    ["Pinoy Weekly", "https://www.pinoyweekly.org/", "Pinoy Weekly"],
    ["Wikipedia", "https://tl.wikipedia.org/", "Tagalog Wikipedia"],
  ],
  pt: [
    ["g1", "https://g1.globo.com/", "Globo's news site"],
    ["Folha de S.Paulo", "https://www.folha.uol.com.br/", "Folha de S.Paulo"],
    ["Estadão", "https://www.estadao.com.br/", "O Estado de S. Paulo"],
    ["O Globo", "https://oglobo.globo.com/", "O Globo, Rio de Janeiro"],
    ["UOL", "https://www.uol.com.br/", "UOL"],
    ["BBC News Brasil", "https://www.bbc.com/portuguese", "BBC, in Brazilian Portuguese"],
    ["Agência Brasil", "https://agenciabrasil.ebc.com.br/", "Agência Brasil, public news agency"],
    ["CNN Brasil", "https://www.cnnbrasil.com.br/", "CNN Brasil"],
    ["Nexo Jornal", "https://www.nexojornal.com.br/", "Nexo, explainers"],
    ["Poder360", "https://www.poder360.com.br/", "Politics"],
    ["Superinteressante", "https://super.abril.com.br/", "Science and curiosities"],
    ["DW Brasil", "https://www.dw.com/pt-br/", "Deutsche Welle, in Brazilian Portuguese"],
    ["ge", "https://ge.globo.com/", "Sport"],
    ["Wikipédia", "https://pt.wikipedia.org/", "Portuguese Wikipedia"],
  ],
  ca: [
    ["3Cat Notícies", "https://www.3cat.cat/3catinfo/", "3Cat, Catalan public broadcaster"],
    ["VilaWeb", "https://www.vilaweb.cat/", "VilaWeb"],
    ["Ara", "https://www.ara.cat/", "Ara"],
    ["El Periódico en català", "https://www.elperiodico.cat/", "El Periódico, Catalan edition"],
    ["La Vanguardia en català", "https://www.lavanguardia.com/encatala", "La Vanguardia, Catalan edition"],
    ["Nació Digital", "https://www.naciodigital.cat/", "Nació Digital"],
    ["El Nacional", "https://www.elnacional.cat/ca/", "El Nacional"],
    ["RAC1", "https://www.rac1.cat/", "RAC1 radio"],
    ["betevé", "https://beteve.cat/", "Barcelona's city broadcaster"],
    ["À Punt", "https://www.apuntmedia.es/", "Valencian public broadcaster"],
    ["IB3", "https://ib3.org/", "Balearic public broadcaster"],
    ["El Temps", "https://www.eltemps.cat/", "Weekly news magazine"],
    ["Esport3", "https://www.3cat.cat/esport3/", "Sport"],
    ["Viquipèdia", "https://ca.wikipedia.org/", "Catalan Wikipedia"],
  ],
  ceb: [
    // Few news sites are written in Bisaya (most Philippine news is in English or Tagalog): these are
    // the ones found to be, checked 2026-10-19. Left out as not Bisaya: Bombo Radyo Cagayan de Oro and
    // Koronadal (much of it Tagalog), RMN and Brigada (their national pages are Tagalog).
    ["Superbalita Cebu", "https://www.sunstar.com.ph/superbalita-cebu", "SunStar's Bisaya paper, Cebu"],
    ["Superbalita Davao", "https://www.sunstar.com.ph/superbalita-davao", "SunStar's Bisaya paper, Davao"],
    ["Superbalita Cagayan de Oro", "https://www.sunstar.com.ph/superbalita-cagayan-de-oro", "SunStar's Bisaya paper, Cagayan de Oro"],
    ["Banat", "https://www.philstar.com/banat", "The Freeman's Bisaya paper, Cebu"],
    ["DYHP RMN Cebu", "https://dyhp612.com/", "RMN radio news, Cebu"],
    ["Bombo Radyo Cebu", "https://cebu.bomboradyo.com/", "Bombo Radyo, Cebu"],
    ["Bombo Radyo Davao", "https://davao.bomboradyo.com/", "Bombo Radyo, Davao"],
    ["Bombo Radyo Butuan", "https://butuan.bomboradyo.com/", "Bombo Radyo, Butuan"],
    ["Bombo Radyo GenSan", "https://gensan.bomboradyo.com/", "Bombo Radyo, General Santos"],
    ["Binisaya", "https://www.binisaya.com/", "Bisaya–English dictionary"],
    ["JW.org", "https://www.jw.org/ceb/", "Jehovah's Witnesses' site, in Bisaya"],
    ["Wikipedia", "https://ceb.wikipedia.org/", "Bisaya Wikipedia (many short automatic articles)"],
  ],
  th: [
    ["Thai PBS", "https://www.thaipbs.or.th/news", "Thai PBS, public broadcaster"],
    ["ไทยรัฐ", "https://www.thairath.co.th/", "Thairath"],
    ["ข่าวสด", "https://www.khaosod.co.th/", "Khaosod"],
    ["มติชน", "https://www.matichon.co.th/", "Matichon"],
    ["BBC ไทย", "https://www.bbc.com/thai", "BBC Thai"],
    ["THE STANDARD", "https://thestandard.co/", "The Standard"],
    ["ประชาไท", "https://prachatai.com/", "Prachatai"],
    ["Sanook ข่าว", "https://www.sanook.com/news/", "Sanook News"],
    ["PPTV", "https://www.pptvhd36.com/", "PPTV HD 36"],
    ["workpoint TODAY", "https://workpointtoday.com/", "Workpoint Today"],
    ["กรุงเทพธุรกิจ", "https://www.bangkokbiznews.com/", "Bangkok Biz News, business"],
    ["ผู้จัดการออนไลน์", "https://mgronline.com/", "Manager Online"],
    ["สยามกีฬา", "https://www.siamsport.co.th/", "Siamsport, sport"],
    ["วิกิพีเดีย", "https://th.wikipedia.org/", "Thai Wikipedia"],
  ],
  en: [
    ["News in Levels", "https://www.newsinlevels.com/", "Easier: the news at three levels of English"],
    ["VOA Learning English", "https://learningenglish.voanews.com/", "Easier: news in slow, simple English"],
    ["BBC News", "https://www.bbc.com/news", "BBC, British public broadcaster"],
    ["The Guardian", "https://www.theguardian.com/", "The Guardian"],
    ["NPR", "https://www.npr.org/", "NPR, American public radio"],
    ["AP News", "https://apnews.com/", "AP, news agency"],
    ["Reuters", "https://www.reuters.com/", "Reuters, news agency"],
    ["The New York Times", "https://www.nytimes.com/", "The New York Times"],
    ["ABC News (Australia)", "https://www.abc.net.au/news", "ABC, Australian public broadcaster"],
    ["CBC News", "https://www.cbc.ca/news", "CBC, Canadian public broadcaster"],
    ["The Verge", "https://www.theverge.com/", "Technology news"],
    ["Wikipedia", "https://simple.wikipedia.org/", "Easier: Simple English Wikipedia"],
  ],
  // (checked 2026-10-21: all answer; Die Zeit and kicker refuse automated checks with 403 but are live)
  de: [
    ["nachrichtenleicht", "https://www.nachrichtenleicht.de/", "Easier: news for learners"],
    ["DW Kurz und leicht", "https://learngerman.dw.com/de/kurz-und-leicht/s-69137519", "Easier: news for learners"],
    ["logo!", "https://www.logo.de/", "Easier: news for children"],
    ["tagesschau", "https://www.tagesschau.de/", "Germany's public broadcaster"],
    ["ZDFheute", "https://www.zdfheute.de/", "Germany's public broadcaster"],
    ["Deutsche Welle", "https://www.dw.com/de/", "World news"],
    ["Der Spiegel", "https://www.spiegel.de/", "Weekly news magazine"],
    ["Die Zeit", "https://www.zeit.de/", "Weekly newspaper"],
    ["Süddeutsche Zeitung", "https://www.sueddeutsche.de/", "Munich"],
    ["ORF", "https://orf.at/", "Austria's public broadcaster"],
    ["Der Standard", "https://www.derstandard.at/", "Austria"],
    ["SRF News", "https://www.srf.ch/news", "Switzerland's public broadcaster"],
    ["NZZ", "https://www.nzz.ch/", "Switzerland"],
    ["heise online", "https://www.heise.de/", "Technology news"],
    ["Handelsblatt", "https://www.handelsblatt.com/", "Business news"],
    ["kicker", "https://www.kicker.de/", "Sport"],
    ["Wikipedia", "https://de.wikipedia.org/", "German Wikipedia"],
  ],
  // (all checked live 2026-10-21: in Persian and answering from outside Iran; ISNA and IRNA answered with an
  // empty page, Tolo News and IranWire with a robot check, so they are left out)
  fa: [
    ["بی‌بی‌سی فارسی", "https://www.bbc.com/persian", "BBC Persian"],
    ["یورونیوز", "https://parsi.euronews.com/", "Euronews"],
    ["دویچه وله فارسی", "https://www.dw.com/fa-ir/", "Deutsche Welle"],
    ["رادیو فردا", "https://www.radiofarda.com/", "Radio Liberty"],
    ["ایران اینترنشنال", "https://www.iranintl.com/", "Iran International"],
    ["صدای آمریکا", "https://ir.voanews.com/", "Voice of America"],
    ["همشهری آنلاین", "https://www.hamshahrionline.ir/", "Hamshahri, Tehran"],
    ["خبرآنلاین", "https://www.khabaronline.ir/", "Khabar Online"],
    ["عصر ایران", "https://www.asriran.com/", "Asr Iran"],
    ["شرق", "https://www.sharghdaily.com/", "Shargh"],
    ["دنیای اقتصاد", "https://donya-e-eqtesad.com/", "Business news"],
    ["زومیت", "https://www.zoomit.ir/", "Technology news"],
    ["ورزش سه", "https://www.varzesh3.com/", "Sport"],
    ["اطلاعات روز", "https://www.etilaatroz.com/", "Etilaatroz, Afghanistan"],
    ["رادیو آزادی", "https://da.azadiradio.com/", "Radio Azadi, Afghanistan"],
    ["ویکی‌پدیا", "https://fa.wikipedia.org/", "Persian Wikipedia"],
  ],
};

// Language names and the few words on the page, for the languages taught (the page itself is in
// English, like the rest of the app; only the heading greets in the language).
const NAMES = { ar: "Arabic", es: "Spanish", fr: "French", ja: "Japanese", zh: "Chinese", ru: "Russian", it: "Italian",
                tl: "Tagalog", pt: "Brazilian Portuguese", ca: "Catalan", ceb: "Bisaya (Cebuano)", th: "Thai", en: "English",
                de: "German", fa: "Persian" };
const RTL = { ar: true, fa: true };

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
  .saved { position: relative; min-width: 0; }
  .saved a.site { padding-inline-end: 46px; }
  .saved .rm { position: absolute; top: 50%; inset-inline-end: 9px; transform: translateY(-50%); width: 30px; height: 30px; padding: 0;
    border-radius: 50%; border: 1px solid var(--line); background: var(--card); color: var(--muted); font: inherit; font-size: 19px; line-height: 1; font-weight: 400; cursor: pointer; }
  .saved .rm:hover, .saved .rm:focus-visible { border-color: var(--accent); color: var(--ink); outline: none; }
  #saved[hidden] { display: none; }
  @media (max-width: 520px) { .grid { grid-template-columns: 1fr 1fr; } a.site { padding: 10px; gap: 8px; } .ico { width: 32px; height: 32px; font-size: 15px; } .ico img { padding: 4px; } .name { font-size: 15px; white-space: normal; } .top { padding: 22px 16px 20px; } form { flex-wrap: nowrap; } button { padding: 0 16px; } }
`;

/**
 * Draw "Your saved sites" into the page: one tile per site, each with a small button that takes
 * it off again. `sites` is [{url, title}]; `onRemove(url)` is told when a site is taken off.
 * (Self-contained on purpose: no helpers from this file, see the note at the top.)
 */
export function paintSaved(doc, sites, onRemove) {
  var box = doc.getElementById("saved");
  var grid = doc.getElementById("saved-grid");
  if (!box || !grid) return;
  grid.textContent = "";
  (sites || []).forEach(function (s) {
    var site;
    try { site = new URL(s.url); } catch (e) { return; }
    if (site.protocol !== "https:" && site.protocol !== "http:") return;
    var name = site.hostname.replace(/^www\./, "");
    var title = String(s.title || "").trim() || name;
    var wrap = doc.createElement("div");
    wrap.className = "saved";
    var a = doc.createElement("a");
    a.className = "site";
    a.href = site.href;
    a.rel = "noreferrer";
    var ico = doc.createElement("span");
    ico.className = "ico";
    ico.textContent = Array.from(title)[0] || "";
    var img = doc.createElement("img");
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.onload = function () { img.className = "on"; };
    img.onerror = function () { img.remove(); };
    img.src = "https://www.google.com/s2/favicons?sz=64&domain=" + encodeURIComponent(name);
    ico.appendChild(img);
    var txt = doc.createElement("span");
    txt.className = "txt";
    var top = doc.createElement("span");
    top.className = "name";
    top.dir = "auto";
    top.textContent = title;
    var note = doc.createElement("span"); // always the real address, whatever the page called itself
    note.className = "note";
    note.dir = "ltr";
    note.textContent = name;
    txt.appendChild(top);
    txt.appendChild(note);
    a.appendChild(ico);
    a.appendChild(txt);
    var rm = doc.createElement("button");
    rm.type = "button";
    rm.className = "rm";
    rm.title = "Take this site off the start page";
    rm.setAttribute("aria-label", "Take " + title + " off the start page");
    rm.textContent = "\u00d7";
    rm.onclick = function (e) {
      e.preventDefault();
      wrap.remove();
      box.hidden = !grid.children.length;
      if (onRemove) onRemove(s.url);
    };
    wrap.appendChild(a);
    wrap.appendChild(rm);
    grid.appendChild(wrap);
  });
  box.hidden = !grid.children.length;
}

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
    <section id="saved" hidden>
      <h2>Your saved sites</h2>
      <p class="sub">Sites you kept with the star. Press × to take one off.</p>
      <div class="grid" id="saved-grid"></div>
    </section>
    <h2>News in ${esc(name)}</h2>
    <p class="sub">Open a site, find an article, then press the <strong>round teal button</strong> at the bottom right to read it with every word clickable.</p>
    <div class="grid">${sites}</div>
    <p class="tip">Looking for something else? Search above, or type a web address in the address box.
    To keep a site on this page, open it and press the star (☆) in the browser's bar.</p>
  </main>`;
}

/**
 * The whole start page as one self-contained HTML document (the phone's browser is handed this).
 * `sites` is [{url, title}], the user's saved sites. The page has no way to talk to the app, so:
 *   - taking a site off asks to go to the made-up address "tamkeen-video://site?do=remove&u=...",
 *     which only the app's browser understands (see InAppBrowser.java);
 *   - the browser calls the page's `__tkSites(list)` whenever the page is shown again, so a site
 *     saved a moment ago is there when the user comes back to the start page.
 */
export function homeHtml(code, sites = []) {
  // (As text inside a <script>: "<" is written as an escape so nothing can end the script early.)
  const list = JSON.stringify((sites || []).map((s) => ({ url: String(s.url || ""), title: String(s.title || "") })))
    .replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, "");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tamkeen browser</title><style>${HOME_CSS}</style></head>
<body>${homeBody(code)}
<script>
var paintSaved = ${paintSaved.toString()};
window.__tkSites = function (list) {
  paintSaved(document, list, function (url) { location.href = "tamkeen-video://site?do=remove&u=" + encodeURIComponent(url); });
};
window.__tkSites(${list});
</script></body></html>`;
}
