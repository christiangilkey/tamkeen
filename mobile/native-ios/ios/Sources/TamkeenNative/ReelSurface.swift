import UIKit
import WebKit

/// The small window that plays an Instagram reel on top of part of the app's own screen.
///
/// The app's screen (web/js/pages/reels.js) leaves a box for it and draws the bar of words below;
/// this class puts a second web view exactly over that box and loads the reel's embed page in it.
/// web/js/reel-embed.js (passed in as source) runs inside that page: it starts the reel and keeps
/// a note of where it is. That page is given no access to the app. Instead this class asks the
/// page a few times a second where the reel is, and passes any change on to the listener.
/// (The iPhone twin of ReelSurface.java.)
///
/// Every method must be called on the main thread.
final class ReelSurface: NSObject, WKNavigationDelegate {
    private static let askEvery: TimeInterval = 0.12
    private static let ask = "(window.__tkReelState ? window.__tkReelState() : '')"
    private static let site = "https://www.instagram.com"
    private static var current: ReelSurface?

    private let web: WKWebView
    private let script: String
    private let listener: (String) -> Void
    private var timer: Timer?
    private var last = ""
    private var closed = false

    /// Only a reel's own pages on Instagram are shown here: its embed page, or its ordinary page
    /// (for reels Instagram plays only to someone signed in).
    static func isEmbed(_ url: String) -> Bool {
        guard url.hasPrefix(site + "/") else { return false }
        var path = String(url.dropFirst(site.count))
        if let cut = path.firstIndex(where: { $0 == "?" || $0 == "#" }) {
            path = String(path[..<cut])
        }
        return path.range(of: "^/(reel|reels|p)/[\\w-]+(/embed(/captioned)?)?/?$", options: .regularExpression) != nil
    }

    /// Instagram sends someone who isn't signed in to its sign-in page; that has to be let through
    /// so the script inside can report it (the user signs in from the app's own browser).
    private static func isSignIn(_ url: String) -> Bool {
        return url.hasPrefix(site + "/accounts/login")
    }

    /// `top` and `height` are in the app page's own units (CSS pixels), measured from its top.
    static func open(over appView: UIView, url: String, script: String, top: CGFloat, height: CGFloat,
                     listener: @escaping (String) -> Void) {
        close()
        let surface = ReelSurface(script: script, listener: listener)
        current = surface
        appView.addSubview(surface.web)
        layout(over: appView, top: top, height: height)
        if let address = URL(string: url) {
            surface.web.load(URLRequest(url: address))
        }
        surface.startAsking()
    }

    static func layout(over appView: UIView, top: CGFloat, height: CGFloat) {
        guard let surface = current else { return }
        // On an iPhone one CSS pixel of the app's page is one point of the screen.
        surface.web.frame = CGRect(x: 0, y: top, width: appView.bounds.width, height: max(1, height))
    }

    static func load(_ url: String) {
        guard let surface = current, let address = URL(string: url) else { return }
        surface.last = ""
        surface.web.load(URLRequest(url: address))
    }

    /// Run JavaScript in the reel's page (play, pause, jump).
    static func run(_ js: String) {
        guard let surface = current, !js.isEmpty else { return }
        surface.web.evaluateJavaScript(js, completionHandler: nil)
    }

    static func close() {
        guard let surface = current else { return }
        current = nil
        surface.closed = true
        surface.timer?.invalidate()
        surface.timer = nil
        surface.web.stopLoading()
        surface.web.navigationDelegate = nil
        surface.web.removeFromSuperview()
    }

    private init(script: String, listener: @escaping (String) -> Void) {
        self.script = script
        self.listener = listener
        let setup = WKWebViewConfiguration()
        setup.allowsInlineMediaPlayback = true                 // play in the box, not full screen
        setup.mediaTypesRequiringUserActionForPlayback = []    // a reel starts by itself, like scrolling to it
        setup.applicationNameForUserAgent = InAppBrowser.browserName
        web = WKWebView(frame: .zero, configuration: setup)
        super.init()
        web.navigationDelegate = self
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.backgroundColor = .black
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.autoresizingMask = [.flexibleWidth]
    }

    private func startAsking() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            guard let self = self, !self.closed else { return }
            self.timer = Timer.scheduledTimer(withTimeInterval: Self.askEvery, repeats: true) { [weak self] _ in
                self?.askOnce()
            }
        }
    }

    private func askOnce() {
        if closed { return }
        web.evaluateJavaScript(Self.ask) { [weak self] value, _ in
            guard let self = self, !self.closed, let text = value as? String else { return }
            let answer = Screen.jsonText(text)
            if answer != self.last {
                self.last = answer
                self.listener(answer)
            }
        }
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if !script.isEmpty {
            webView.evaluateJavaScript(script, completionHandler: nil)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let frame = navigationAction.targetFrame else {
            decisionHandler(.cancel) // a link that wants a new window
            return
        }
        if !frame.isMainFrame {
            decisionHandler(.allow) // parts inside the page (its player, its frames)
            return
        }
        // A tap on "View profile" and the like must not take this small window somewhere else.
        let to = navigationAction.request.url?.absoluteString ?? ""
        decisionHandler(Self.isEmbed(to) || Self.isSignIn(to) ? .allow : .cancel)
    }
}
