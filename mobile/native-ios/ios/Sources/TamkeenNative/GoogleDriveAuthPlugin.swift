import Capacitor
import Foundation
import UIKit
import WebKit

/// The iPhone side of the "GoogleDriveAuth" plugin: the same calls, with the same names and
/// answers, as GoogleDriveAuthPlugin.java on Android, so the app's JavaScript is shared.
///
/// It covers Google sign-in for Drive sync (GoogleAuth.swift), the in-app web browser
/// (InAppBrowser.swift), the reel window (ReelSurface.swift) and handing the sign-in token to the
/// video streamer (DriveMediaHandler.swift).
@objc(GoogleDriveAuthPlugin)
public class GoogleDriveAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GoogleDriveAuthPlugin"
    public let jsName = "GoogleDriveAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getIdToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openBrowser", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "closeBrowser", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reelOpen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reelLoad", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reelLayout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reelRun", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reelClose", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "browserSites", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "browserToast", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMediaToken", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        // The app's "iOS" client in Google Cloud (capacitor.config.json: plugins.GoogleDriveAuth).
        GoogleAuth.shared.clientId = getConfig().getString("iosClientId") ?? ""
    }

    // MARK: - Google sign-in

    private static func words(for failure: GoogleAuth.Failure) -> String {
        switch failure {
        case .notSetUp: return "Google sign-in isn't switched on in this iPhone build yet."
        case .needsInteraction: return "NEEDS_INTERACTION"
        case .cancelled: return "Sign-in was cancelled."
        case .message(let text): return text
        }
    }

    /// An access token for the app's own Drive folder: {accessToken, scopes}. With
    /// `interactive: false` nothing is ever shown ("NEEDS_INTERACTION" when the user must sign in).
    /// `tasks`: Google Tasks too (the Review tab's "Send to Google Tasks"); `calendar`: Google Calendar
    /// events too ("Send to Google Calendar"). Each is asked for the first time it is used.
    @objc func authorize(_ call: CAPPluginCall) {
        let interactive = call.getBool("interactive", true)
        let force = call.getBool("force", false)
        let tasks = call.getBool("tasks", false)
        let calendar = call.getBool("calendar", false)
        DispatchQueue.main.async {
            GoogleAuth.shared.anchor = self.bridge?.webView?.window
            GoogleAuth.shared.tokens(interactive: interactive, force: force, tasks: tasks, calendar: calendar) { result in
                switch result {
                case .success(let tokens):
                    call.resolve(["accessToken": tokens.accessToken, "scopes": tokens.scopes])
                case .failure(let failure):
                    call.reject(Self.words(for: failure))
                }
            }
        }
    }

    /// A Google ID token (signed proof of which account is using the app) for the online
    /// features: {idToken, email}. On the iPhone it comes with the Drive sign-in, issued for the
    /// app's "iOS" client, which Supabase is set up to trust.
    @objc func getIdToken(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            GoogleAuth.shared.anchor = self.bridge?.webView?.window
            GoogleAuth.shared.tokens(interactive: true, force: false, wantId: true) { result in
                switch result {
                case .success(let tokens):
                    guard let id = tokens.idToken else {
                        call.reject("Google didn't say which account this is. Sign in again in Settings.")
                        return
                    }
                    call.resolve(["idToken": id, "email": GoogleAuth.email(inIdToken: id)])
                case .failure(let failure):
                    call.reject(Self.words(for: failure))
                }
            }
        }
    }

    /// Forget the Google account on this phone (iPhone only: Android keeps none itself).
    @objc func signOut(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            GoogleAuth.shared.signOut()
            DriveMediaHandler.token = nil
            call.resolve()
        }
    }

    /// Hands the current access token to the video streamer (see DriveMediaHandler).
    @objc func setMediaToken(_ call: CAPPluginCall) {
        let token = call.getString("token")
        DispatchQueue.main.async {
            DriveMediaHandler.token = token
            call.resolve()
        }
    }

    // MARK: - the in-app web browser

    /// Opens the in-app web browser. When the user presses "Import Page" there, the page's text
    /// (extracted by the script passed in as "extractor") is sent to JavaScript as a "pageImport" event.
    @objc func openBrowser(_ call: CAPPluginCall) {
        let url = call.getString("url", "")
        let extractor = call.getString("extractor", "")
        let youtube = call.getString("youtube", "")
        let home = call.getString("home", "") // the start page, shown when no address is given
        // Opened for signing in to Instagram: the browser closes itself once signed in (see InAppBrowser).
        let forSignIn = call.getBool("closeOnInstagramSignIn", false)
        // Opened to read web pages (the ordinary browser), or for something else such as signing
        // in, YouTube or finding a word in a video: then it has no "Import Page" button.
        let forReading = !forSignIn && call.getBool("forReading", true)
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("Couldn't open the browser.")
                return
            }
            var signedIn: (() -> Void)?
            if forSignIn {
                signedIn = { [weak self] in
                    Toast.show("Signed in to Instagram")
                    self?.notifyListeners("instagramSignedIn", data: [:])
                }
            }
            InAppBrowser.open(from: presenter, url: url, extractor: extractor, youtubeScript: youtube, home: home,
                              forReading: forReading,
                              onImport: { [weak self] json in
                                  self?.notifyListeners("pageImport", data: ["result": json])
                              },
                              onVideo: { [weak self] id in
                                  self?.browserSaid(id)
                              },
                              onSignedIn: signedIn)
            call.resolve()
        }
    }

    /// What the browser passes on: a tapped YouTube video, the Follow button or the star.
    private func browserSaid(_ id: String) {
        if id.hasPrefix("tamkeen-video://site") {
            // The star in the bar, or a site taken off on the start page: JavaScript keeps the list.
            notifyListeners("browserSite", data: ["url": id])
            return
        }
        if id.hasPrefix("tamkeen-video:") {
            // The Follow button on a channel's page: JavaScript adds it to the followed channels.
            notifyListeners("youtubeFollow", data: ["url": id])
            return
        }
        // A YouTube video was tapped: JavaScript adds it and opens the app's player.
        // "<id>@<seconds>" when a moment in it came along (the "t" of its link).
        if let cut = id.firstIndex(of: "@"), cut != id.startIndex {
            let seconds = Int(id[id.index(after: cut)...]) ?? 0
            notifyListeners("youtubeVideo", data: ["id": String(id[..<cut]), "at": seconds])
        } else {
            notifyListeners("youtubeVideo", data: ["id": id])
        }
    }

    /// A link tapped inside the app is about to leave it: Capacitor hands anything that isn't the
    /// app's own page to the phone's browser. YouTube links are kept instead. Tapping the channel's
    /// picture, the title or a suggested video inside YouTube's embedded player (or a YouTube link
    /// anywhere else in the app) is passed to JavaScript as a "youtubeLink" event, which opens a
    /// channel's page in the in-app browser and a video in the app's own player.
    /// The embedded player's own address (/embed/...) is left alone, as is every other website.
    override public func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        guard let url = navigationAction.request.url, url.scheme == "https",
              let host = url.host?.lowercased() else { return nil }
        let youtube = host == "youtu.be" || host == "youtube.com" || host.hasSuffix(".youtube.com")
        if !youtube || url.path.hasPrefix("/embed/") { return nil } // Capacitor decides, as before
        // Only a link that would replace the app's page or open a new window; the player's own
        // frame loading its pieces is none of this.
        if let frame = navigationAction.targetFrame, !frame.isMainFrame { return nil }
        notifyListeners("youtubeLink", data: ["url": url.absoluteString], retainUntilConsumed: true)
        return NSNumber(value: true) // handled: don't load it here, don't open the phone's browser
    }

    /// Closes the in-app browser (after a tapped YouTube video has opened in the app's player).
    @objc func closeBrowser(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            InAppBrowser.close()
            call.resolve()
        }
    }

    /// The user's saved sites, for the in-app browser's start page and the star in its bar:
    /// "sites" is the JSON list [{url, title}]. Sent before the browser opens and after each change.
    @objc func browserSites(_ call: CAPPluginCall) {
        let sites = call.getString("sites", "[]")
        DispatchQueue.main.async {
            InAppBrowser.setSavedSites(sites)
            call.resolve()
        }
    }

    /// Shows a short message on top of the in-app browser (e.g. "Imported ...").
    @objc func browserToast(_ call: CAPPluginCall) {
        let text = call.getString("text", "")
        DispatchQueue.main.async {
            Toast.show(text, long: true)
            call.resolve()
        }
    }

    // MARK: - the reel window (see ReelSurface)

    private static func number(_ call: CAPPluginCall, _ key: String) -> CGFloat {
        return CGFloat((call.options[key] as? NSNumber)?.doubleValue ?? 0)
    }

    /// Opens the reel window over a box of the app's screen and loads a reel's embed page in it.
    /// Where the reel is, and its buttons, come back to JavaScript as "reelState" events.
    @objc func reelOpen(_ call: CAPPluginCall) {
        let url = call.getString("url", "")
        let script = call.getString("script", "")
        let top = Self.number(call, "top")
        let height = Self.number(call, "height")
        guard ReelSurface.isEmbed(url) else {
            call.reject("Not a reel.")
            return
        }
        DispatchQueue.main.async {
            guard let appView = self.bridge?.webView else {
                call.reject("Couldn't open the reel.")
                return
            }
            ReelSurface.open(over: appView, url: url, script: script, top: top, height: height) { [weak self] json in
                self?.notifyListeners("reelState", data: ["state": json])
            }
            call.resolve()
        }
    }

    /// Shows another reel in the window that is already open.
    @objc func reelLoad(_ call: CAPPluginCall) {
        let url = call.getString("url", "")
        guard ReelSurface.isEmbed(url) else {
            call.reject("Not a reel.")
            return
        }
        DispatchQueue.main.async {
            ReelSurface.load(url)
            call.resolve()
        }
    }

    /// Moves the reel window when the box it covers moves or changes size.
    @objc func reelLayout(_ call: CAPPluginCall) {
        let top = Self.number(call, "top")
        let height = Self.number(call, "height")
        DispatchQueue.main.async {
            if let appView = self.bridge?.webView {
                ReelSurface.layout(over: appView, top: top, height: height)
            }
            call.resolve()
        }
    }

    /// Tells the reel to play, pause or jump (JavaScript run inside the reel's page).
    @objc func reelRun(_ call: CAPPluginCall) {
        let script = call.getString("script", "")
        DispatchQueue.main.async {
            ReelSurface.run(script)
            call.resolve()
        }
    }

    @objc func reelClose(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            ReelSurface.close()
            call.resolve()
        }
    }
}
