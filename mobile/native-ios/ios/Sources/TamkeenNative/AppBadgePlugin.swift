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
@objc(AppBadgePlugin)
public class AppBadgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppBadgePlugin"
    public let jsName = "AppBadge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setCounts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "allowNotification", returnType: CAPPluginReturnPromise)
    ]

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
        UNUserNotificationCenter.current().requestAuthorization(options: [.badge]) { granted, _ in
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

    private static func setBadge(_ count: Int) {
        if #available(iOS 16.0, *) {
            UNUserNotificationCenter.current().setBadgeCount(count, withCompletionHandler: nil)
        } else {
            UIApplication.shared.applicationIconBadgeNumber = count
        }
    }
}
