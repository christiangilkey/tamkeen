import Capacitor
import Foundation
import WebKit

/// Settings → Reset Tamkeen (mobile/src/js/reset.js): sign out of every site in the app's browser
/// windows (Instagram, YouTube and the rest) by clearing the cookies they share. The iPhone twin of
/// AppResetPlugin.java. Only cookies: the app's own page keeps the library it stores (that store is
/// shared with the browser windows on the iPhone, so nothing else is cleared).
@objc(AppResetPlugin)
public class AppResetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppResetPlugin"
    public let jsName = "AppReset"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "clearCookies", returnType: CAPPluginReturnPromise)
    ]

    @objc func clearCookies(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            WKWebsiteDataStore.default().removeData(ofTypes: [WKWebsiteDataTypeCookies],
                                                    modifiedSince: Date.distantPast) {
                call.resolve()
            }
        }
    }
}
