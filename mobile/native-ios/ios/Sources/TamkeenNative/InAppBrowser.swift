import UIKit
import WebKit

/// The app's own small web browser: an address bar with back / forward / close on top, the page
/// below, and an "Import Page" button floating at the bottom right.
///
/// Pressing Import Page runs the app's text extractor (web/js/extract.js, passed in as source)
/// inside the page being viewed and hands the result to the listener. The page itself is given
/// no access to the app: this web view has no bridge to the app's code.
///
/// On youtube.com, tapping a video hands its id to the video listener instead of playing it
/// there: web/js/youtube-browser.js (passed in as source, run in every page) asks to go to the
/// made-up address "tamkeen-video://watch?v=<id>", which only this browser understands.
/// (The iPhone twin of InAppBrowser.java.)
final class InAppBrowser: UIViewController, WKNavigationDelegate, WKUIDelegate, UITextFieldDelegate {
    /// Makes sites treat this browser (and the reel window) as ordinary Safari on an iPhone.
    static let browserName = "Version/18.0 Mobile/15E148 Safari/604.1"

    private static let videoScheme = "tamkeen-video"
    private static let home = "https://www.google.com/"
    /// The address the history files the app's own start page under. Nothing is ever fetched
    /// from it: ".invalid" is a name the internet guarantees never exists.
    private static let startPage = "https://start.tamkeen.invalid/"
    /// Asked of the page once a second when the browser was opened for signing in to Instagram:
    /// "in" once the page is Instagram's, past its sign-in pages, and carries the mark Instagram
    /// gives a signed-in visitor. Only that one word comes back; nothing about the account does.
    private static let signedInTest =
        "(/(^|\\.)instagram\\.com$/.test(location.hostname) && /(^|; )ds_user_id=\\d/.test(document.cookie)"
        + " && !/^\\/accounts\\/(login|emailsignup|signup)/.test(location.pathname)) ? 'in' : ''"

    // Sites the user saved to the start page, as the app last handed them over: the JSON list
    // [{url, title}] that the start page draws, and their addresses alone for the star in the bar.
    private static var savedSites = "[]"
    private static var savedUrls = Set<String>()
    private static weak var showing: InAppBrowser?

    private let startUrl: String
    private let extractor: String
    private let youtubeScript: String
    private let homeHtml: String
    private let onImport: (String) -> Void
    private let onVideo: (String) -> Void
    private let onSignedIn: (() -> Void)?

    private var web: WKWebView!
    private let address = UITextField()
    private let star = UIButton(type: .system)
    private let progress = UIProgressView(progressViewStyle: .bar)
    private var watching: [NSKeyValueObservation] = []
    private var signInTimer: Timer?
    private var signedInSeen = 0
    private var shown = ""

    private let ink = Screen.color("#f2f1ec")

    // MARK: - what the plugin calls

    /// The app's list of saved sites (it changed, or the browser is about to open).
    static func setSavedSites(_ json: String) {
        var list = "[]"
        var urls = Set<String>()
        let text = json.trimmingCharacters(in: .whitespacesAndNewlines)
        if let data = (text.isEmpty ? "[]" : text).data(using: .utf8),
           let sites = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] {
            for site in sites {
                urls.insert(site["url"] as? String ?? "")
            }
            list = text.isEmpty ? "[]" : text
        }
        savedSites = list
        savedUrls = urls
        showing?.paintStar()
    }

    /// Close the browser if it is open (once a tapped video has opened in the app's player).
    static func close() {
        showing?.presentingViewController?.dismiss(animated: true)
    }

    /// `home` is the app's start page as one finished HTML page (a search box and news sites in
    /// the language being studied, built by web/js/browser-home.js). It is shown when `url` is
    /// empty; without it the browser starts on Google.
    static func open(from presenter: UIViewController, url: String, extractor: String, youtubeScript: String,
                     home: String, onImport: @escaping (String) -> Void, onVideo: @escaping (String) -> Void,
                     onSignedIn: (() -> Void)?) {
        let browser = InAppBrowser(url: url, extractor: extractor, youtubeScript: youtubeScript, home: home,
                                   onImport: onImport, onVideo: onVideo, onSignedIn: onSignedIn)
        browser.modalPresentationStyle = .fullScreen
        let present = {
            showing = browser
            presenter.present(browser, animated: true)
        }
        if let old = showing, old.presentingViewController != nil {
            old.dismiss(animated: false, completion: present)
        } else {
            present()
        }
    }

    // MARK: - setting up

    private init(url: String, extractor: String, youtubeScript: String, home: String,
                 onImport: @escaping (String) -> Void, onVideo: @escaping (String) -> Void,
                 onSignedIn: (() -> Void)?) {
        self.startUrl = url
        self.extractor = extractor
        self.youtubeScript = youtubeScript
        self.homeHtml = home
        self.onImport = onImport
        self.onVideo = onVideo
        self.onSignedIn = onSignedIn
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        return nil
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        overrideUserInterfaceStyle = .dark
        view.backgroundColor = Screen.color("#1c1c1a")

        // ----- top bar -----
        let back = barButton("‹", action: #selector(backTapped))
        let forward = barButton("›", action: #selector(forwardTapped))
        let close = barButton("✕", action: #selector(closeTapped))
        close.titleLabel?.font = .systemFont(ofSize: 18)
        // The star keeps the site being shown on the start page (hollow until it is); it is not
        // shown on the start page itself.
        star.setTitle("☆", for: .normal)
        star.titleLabel?.font = .systemFont(ofSize: 21)
        star.addTarget(self, action: #selector(starTapped), for: .touchUpInside)
        star.widthAnchor.constraint(equalToConstant: 40).isActive = true

        address.delegate = self
        address.textColor = ink
        address.font = .systemFont(ofSize: 14)
        address.attributedPlaceholder = NSAttributedString(
            string: "Search or type a web address",
            attributes: [.foregroundColor: Screen.color("#8a8880")])
        address.backgroundColor = Screen.color("#141413")
        address.layer.cornerRadius = 8
        address.keyboardType = .webSearch
        address.returnKeyType = .go
        address.autocapitalizationType = .none
        address.autocorrectionType = .no
        address.spellCheckingType = .no
        address.clearButtonMode = .whileEditing
        address.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 10, height: 1))
        address.leftViewMode = .always
        address.heightAnchor.constraint(equalToConstant: 36).isActive = true
        address.setContentHuggingPriority(.defaultLow, for: .horizontal)
        address.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        let bar = UIStackView(arrangedSubviews: [back, forward, address, star, close])
        bar.axis = .horizontal
        bar.alignment = .center
        bar.spacing = 4
        bar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bar)

        progress.progressTintColor = Screen.color("#2dd4bf")
        progress.trackTintColor = .clear
        progress.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(progress)

        // ----- page + floating Import Page button -----
        let setup = WKWebViewConfiguration()
        setup.allowsInlineMediaPlayback = true
        setup.applicationNameForUserAgent = Self.browserName
        web = WKWebView(frame: .zero, configuration: setup)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)

        let importButton = UIButton(type: .system)
        importButton.setTitle("Import Page", for: .normal)
        importButton.setTitleColor(Screen.color("#062a26"), for: .normal)
        importButton.titleLabel?.font = .boldSystemFont(ofSize: 14)
        importButton.backgroundColor = Screen.color("#2dd4bf")
        importButton.layer.cornerRadius = 22
        importButton.layer.shadowColor = UIColor.black.cgColor
        importButton.layer.shadowOpacity = 0.35
        importButton.layer.shadowRadius = 6
        importButton.layer.shadowOffset = CGSize(width: 0, height: 3)
        importButton.addTarget(self, action: #selector(importTapped), for: .touchUpInside)
        importButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(importButton)

        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo: safe.topAnchor, constant: 4),
            bar.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 6),
            bar.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -6),
            bar.heightAnchor.constraint(equalToConstant: 44),
            progress.topAnchor.constraint(equalTo: bar.bottomAnchor, constant: 2),
            progress.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progress.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            progress.heightAnchor.constraint(equalToConstant: 3),
            web.topAnchor.constraint(equalTo: progress.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            web.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            importButton.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -16),
            importButton.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -20),
            importButton.heightAnchor.constraint(equalToConstant: 44),
            importButton.widthAnchor.constraint(equalToConstant: 132)
        ])

        watching = [
            web.observe(\.url, options: [.new]) { [weak self] _, _ in self?.addressChanged() },
            web.observe(\.estimatedProgress, options: [.new]) { [weak self] web, _ in
                let value = Float(web.estimatedProgress)
                self?.progress.progress = value
                self?.progress.isHidden = value >= 1
            }
        ]
        paintStar()

        if startUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !homeHtml.isEmpty {
            loadHome()
        } else {
            go(to: Self.webAddress(for: startUrl))
        }
        if onSignedIn != nil {
            watchForInstagramSignIn()
        }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed || presentingViewController == nil {
            signInTimer?.invalidate()
            signInTimer = nil
            watching = []
            web?.stopLoading()
            if Self.showing === self { Self.showing = nil }
        }
    }

    private func barButton(_ label: String, action: Selector) -> UIButton {
        let button = UIButton(type: .system)
        button.setTitle(label, for: .normal)
        button.setTitleColor(ink, for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 28)
        button.addTarget(self, action: action, for: .touchUpInside)
        button.widthAnchor.constraint(equalToConstant: 40).isActive = true
        return button
    }

    // MARK: - addresses

    /// A typed address, or a web search for typed words, or the home page for nothing.
    private static func webAddress(for text: String) -> String {
        let typed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if typed.isEmpty { return home }
        if typed.range(of: "^[a-z][a-z0-9+.-]*://.*", options: [.regularExpression, .caseInsensitive]) != nil { return typed }
        if !typed.contains(" ") && typed.contains(".") { return "https://" + typed }
        return "https://www.google.com/search?q=" + encoded(typed)
    }

    /// An address as the saved list keeps it: without any "#part".
    private static func siteKey(_ url: String?) -> String {
        guard let url = url else { return "" }
        guard let hash = url.firstIndex(of: "#") else { return url }
        return String(url[..<hash])
    }

    /// Text made safe to sit inside an address.
    private static func encoded(_ text: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-_.~!*'()")
        return text.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
    }

    private func go(to text: String) {
        if let url = URL(string: text) ?? URL(string: Self.home) {
            web.load(URLRequest(url: url))
        }
    }

    private func loadHome() {
        web.loadHTMLString(homeHtml, baseURL: URL(string: Self.startPage))
    }

    private func addressChanged() {
        let current = web.url?.absoluteString ?? ""
        if !address.isFirstResponder {
            address.text = current.hasPrefix(Self.startPage) ? "" : current
        }
        shown = current
        paintStar()
    }

    private func paintStar() {
        let site = shown.hasPrefix("http") && !shown.hasPrefix(Self.startPage)
        let on = site && Self.savedUrls.contains(Self.siteKey(shown))
        star.setTitle(on ? "★" : "☆", for: .normal)
        star.setTitleColor(on ? Screen.color("#f1cf7b") : ink, for: .normal)
        star.isHidden = !site
    }

    // MARK: - buttons

    @objc private func backTapped() {
        guard let before = web.backForwardList.backItem else { return }
        if before.url.absoluteString.hasPrefix(Self.startPage) && !homeHtml.isEmpty {
            loadHome() // the start page lives in the app, so it can't be fetched again by going back
        } else {
            web.goBack()
        }
    }

    @objc private func forwardTapped() {
        if web.canGoForward { web.goForward() }
    }

    @objc private func closeTapped() {
        dismiss(animated: true)
    }

    @objc private func starTapped() {
        // The app keeps the list; it is told which site and answers with the new list.
        let site = Self.siteKey(web.url?.absoluteString)
        guard site.hasPrefix("http"), !site.hasPrefix(Self.startPage) else { return }
        onVideo("\(Self.videoScheme)://site?do=toggle&u=\(Self.encoded(site))&t=\(Self.encoded(web.title ?? ""))")
    }

    @objc private func importTapped() {
        let script = "(function(){" + extractor + "\nreturn JSON.stringify(extractArticle(document, location.href));})()"
        web.evaluateJavaScript(script) { [weak self] value, _ in
            Toast.show("Importing page…")
            self?.onImport(Screen.jsonText(value as? String))
        }
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        go(to: Self.webAddress(for: textField.text ?? ""))
        textField.resignFirstResponder()
        return true
    }

    func textFieldDidBeginEditing(_ textField: UITextField) {
        DispatchQueue.main.async { textField.selectAll(nil) }
    }

    // MARK: - signing in to Instagram

    /// Opened for signing in to Instagram: close by itself once the user is signed in, and say
    /// so, so the app can carry on with what needed the sign-in.
    private func watchForInstagramSignIn() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            guard let self = self, Self.showing === self else { return }
            self.signInTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                guard let self = self, Self.showing === self else { return }
                self.web.evaluateJavaScript(Self.signedInTest) { [weak self] value, _ in
                    guard let self = self, Self.showing === self, self.signInTimer != nil else { return }
                    self.signedInSeen = (value as? String) == "in" ? self.signedInSeen + 1 : 0
                    if self.signedInSeen >= 2 { // two looks in a row: Instagram has finished signing in
                        self.signInTimer?.invalidate()
                        self.signInTimer = nil
                        let done = self.onSignedIn
                        self.dismiss(animated: true) { done?() }
                    }
                }
            }
        }
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }
        let scheme = (url.scheme ?? "").lowercased()
        if scheme == Self.videoScheme {
            decisionHandler(.cancel) // never an address to load
            videoAddress(url)
            return
        }
        if navigationAction.targetFrame == nil {
            // A link that wants a new window: there is only this one, so it opens here.
            decisionHandler(.cancel)
            if scheme == "http" || scheme == "https" { webView.load(navigationAction.request) }
            return
        }
        if navigationAction.targetFrame?.isMainFrame == true && !["http", "https", "about", "blob", "data"].contains(scheme) {
            decisionHandler(.cancel) // phone numbers, other apps' links and the like: not pages
            return
        }
        decisionHandler(.allow)
    }

    private func videoAddress(_ url: URL) {
        let host = url.host ?? ""
        // The Follow button on a channel's page, or a saved site taken off on the start page.
        if host == "follow" || host == "site" {
            onVideo(url.absoluteString)
            return
        }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard let id = items.first(where: { $0.name == "v" })?.value,
              id.range(of: "^[\\w-]{11}$", options: .regularExpression) != nil else { return }
        // A moment in the video may come with it ("&t=95", from a caption search result, see
        // web/js/filmot-browser.js): it travels on as "<id>@<seconds>".
        if let at = items.first(where: { $0.name == "t" })?.value,
           at.range(of: "^\\d{1,6}$", options: .regularExpression) != nil {
            onVideo("\(id)@\(at)")
        } else {
            onVideo(id)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if (webView.url?.absoluteString ?? "").hasPrefix(Self.startPage) {
            // The start page draws the saved sites it is handed, so one saved a moment ago is
            // there when the user comes back to it. (Only ever said to this page.)
            webView.evaluateJavaScript("window.__tkSites&&window.__tkSites(\(Self.savedSites))", completionHandler: nil)
        }
        if !youtubeScript.isEmpty {
            webView.evaluateJavaScript("window.__tamkeenBridge='address';" + youtubeScript, completionHandler: nil)
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        // Going back to the start page with a swipe asks the internet for it, which can't work.
        let failed = (error as NSError).userInfo[NSURLErrorFailingURLStringErrorKey] as? String ?? ""
        if failed.hasPrefix(Self.startPage) && !homeHtml.isEmpty {
            loadHome()
        }
    }

    // MARK: - WKUIDelegate

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // A page asking for a new window from its own script: it opens here instead.
        if let url = navigationAction.request.url {
            let scheme = (url.scheme ?? "").lowercased()
            if scheme == Self.videoScheme {
                videoAddress(url)
            } else if scheme == "http" || scheme == "https" {
                webView.load(navigationAction.request)
            }
        }
        return nil
    }
}
