import UIKit
import WebKit
import Capacitor
import TamkeenNative

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

/// The screen that holds the app's web page (named in Base.lproj/Main.storyboard).
/// Tamkeen's own additions to Capacitor's standard one:
/// - the video player can stream the user's own videos from Google Drive (tkdrive://..., see
///   DriveMediaHandler.swift in mobile/native-ios);
/// - swiping in from the left edge goes back, since an iPhone has no back button.
class TamkeenViewController: CAPBridgeViewController {
    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let configuration = super.webViewConfiguration(for: instanceConfiguration)
        configuration.setURLSchemeHandler(DriveMediaHandler(), forURLScheme: DriveMediaHandler.scheme)
        return configuration
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        webView?.allowsBackForwardNavigationGestures = true
        // The page itself never scrolls (its lists do), so it shouldn't stretch like a rubber band.
        webView?.scrollView.bounces = false
    }
}
