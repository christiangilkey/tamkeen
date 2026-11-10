import Capacitor
import Foundation
import WebKit

/// The dubbed soundtrack of a YouTube video in the language being learned, chosen inside YouTube's embedded
/// player: web/js/yt-audio-frame.js (which explains it) runs at the start of every frame of the app's own web
/// view, YouTube's player frame included (a user script that isn't for the main frame only), and does
/// nothing outside YouTube's embed page. The page itself can't reach into that frame. The Android twin is
/// YouTubeAudio.java; the computer's is app/desktop.py. No calls from the page: it is all done on load.
@objc(YouTubeAudioPlugin)
public class YouTubeAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "YouTubeAudioPlugin"
    public let jsName = "YouTubeAudio"
    public let pluginMethods: [CAPPluginMethod] = []

    override public func load() {
        guard let url = Bundle.main.url(forResource: "yt-audio-frame", withExtension: "js", subdirectory: "public/js"),
              let source = try? String(contentsOf: url, encoding: .utf8) else {
            NSLog("YouTubeAudio: yt-audio-frame.js is missing")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let controller = self?.bridge?.webView?.configuration.userContentController else { return }
            controller.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        }
    }
}
