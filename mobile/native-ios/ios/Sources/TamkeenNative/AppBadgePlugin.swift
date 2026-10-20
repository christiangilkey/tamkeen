import Capacitor
import Foundation
import UIKit
import UserNotifications

/// The number of review cards left today, on the app's icon: the iPhone twin of AppBadgePlugin.java
/// (same name, same calls). setCounts hands over {day, counts: [today, tomorrow, ...]}: today's number
/// goes on the icon at once, and the coming days' numbers are left with the iPhone as notifications
/// for just after each midnight that carry only the number (no text, no sound: nothing is shown), so
/// it moves on without the app being opened. allowNotification asks once for the permission the
/// number needs. (Android also has a home-screen widget; an iPhone one would need a widget extension.)
/// notifyMessage / clearMessage: a friend's chat message as a notification (web/js/chatnotify.js decides
/// when; allowNotification then also asks for banners and sound). Tapping one tells the page through
/// the "messageTapped" event, kept until the page listens (when the tap started the app).
@objc(AppBadgePlugin)
public class AppBadgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppBadgePlugin"
    public let jsName = "AppBadge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setCounts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "allowNotification", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notifyMessage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearMessage", returnType: CAPPluginReturnPromise)
    ]

    /// Chat notifications' identifiers: one per friend, replaced by their newest message.
    private static let chatPrefix = "tamkeen-chat-"

    override public func load() {
        // Taps on a chat notification come here (no other part of the app sets this).
        UNUserNotificationCenter.current().delegate = self
    }

    /// The midnight updates waiting with the iPhone: one per coming day.
    private static let pendingPrefix = "tamkeen-review-count-"
    private static let daysAhead = 7
    /// The last counts handed over (day number, counts), put on the icon again once allowed.
    /// Only touched on the main thread.
    private static var last: (day: Int, counts: [Int])?

    /// The day number the app uses (web/js/review/fsrs.js dayNumber): whole local days since 1970.
    private static func today() -> Int {
        let now = Date()
        let local = now.timeIntervalSince1970 + Double(TimeZone.current.secondsFromGMT(for: now))
        return Int((local / 86_400).rounded(.down))
    }

    @objc func setCounts(_ call: CAPPluginCall) {
        let counts = (call.getArray("counts") ?? []).map { max(0, ($0 as? NSNumber)?.intValue ?? 0) }
        let day = call.getInt("day") ?? Self.today()
        DispatchQueue.main.async {
            Self.last = (day, counts)
            Self.apply(day: day, counts: counts) { call.resolve() }
        }
    }

    @objc func allowNotification(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.badge, .alert, .sound]) { granted, _ in
            DispatchQueue.main.async {
                guard granted, let last = Self.last else {
                    call.resolve(["granted": granted])
                    return
                }
                Self.apply(day: last.day, counts: last.counts) { call.resolve(["granted": granted]) }
            }
        }
    }

    /// Today's number on the icon now, and the next days' numbers left for just after their midnights.
    private static func apply(day: Int, counts: [Int], done: @escaping () -> Void) {
        let center = UNUserNotificationCenter.current()
        let waiting = (1...Self.daysAhead).map { Self.pendingPrefix + String($0) }
        center.getNotificationSettings { settings in
            DispatchQueue.main.async {
                // The numbers handed over before are out of date now.
                center.removePendingNotificationRequests(withIdentifiers: waiting)
                let status = settings.authorizationStatus
                guard status != .denied, status != .notDetermined, settings.badgeSetting != .disabled, !counts.isEmpty else {
                    done()
                    return
                }
                // Counts made on an earlier day: move along them (the last one stands for later days).
                let index = min(max(0, Self.today() - day), counts.count - 1)
                Self.setBadge(counts[index])
                let midnight = Calendar.current.startOfDay(for: Date())
                for ahead in 1...Self.daysAhead {
                    let at = index + ahead
                    guard at < counts.count,
                          let date = Calendar.current.date(byAdding: .day, value: ahead, to: midnight) else { break }
                    let wait = date.addingTimeInterval(60).timeIntervalSinceNow
                    guard wait > 0 else { continue }
                    let content = UNMutableNotificationContent()
                    content.badge = NSNumber(value: counts[at])
                    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: wait, repeats: false)
                    center.add(UNNotificationRequest(identifier: Self.pendingPrefix + String(ahead), content: content,
                                                     trigger: trigger), withCompletionHandler: nil)
                }
                done()
            }
        }
    }

    @objc func notifyMessage(_ call: CAPPluginCall) {
        let friend = call.getString("friend") ?? ""
        guard !friend.isEmpty else {
            call.resolve(["shown": false])
            return
        }
        let content = UNMutableNotificationContent()
        content.title = call.getString("title") ?? "Tamkeen"
        content.body = call.getString("text") ?? ""
        content.sound = .default
        content.threadIdentifier = Self.chatPrefix + friend
        content.userInfo = ["friend": friend]
        let request = UNNotificationRequest(identifier: Self.chatPrefix + friend, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { error in call.resolve(["shown": error == nil]) }
    }

    @objc func clearMessage(_ call: CAPPluginCall) {
        let friend = call.getString("friend") ?? ""
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [Self.chatPrefix + friend])
        call.resolve()
    }

    private static func setBadge(_ count: Int) {
        if #available(iOS 16.0, *) {
            UNUserNotificationCenter.current().setBadgeCount(count, withCompletionHandler: nil)
        } else {
            UIApplication.shared.applicationIconBadgeNumber = count
        }
    }
}

extension AppBadgePlugin: UNUserNotificationCenterDelegate {
    /// Tamkeen on screen: the page shows its own banner instead (chatnotify.js), so nothing here.
    public func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                       withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([])
    }

    /// A chat notification tapped: the page opens that chat.
    public func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                       withCompletionHandler completionHandler: @escaping () -> Void) {
        if let friend = response.notification.request.content.userInfo["friend"] as? String {
            notifyListeners("messageTapped", data: ["friend": friend], retainUntilConsumed: true)
        }
        completionHandler()
    }
}
