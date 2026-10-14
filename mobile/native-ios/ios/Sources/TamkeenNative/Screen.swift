import UIKit

/// Small things about the screen that several files need.
enum Screen {
    /// The window the app is showing in.
    static func keyWindow() -> UIWindow? {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
        return windows.first { $0.isKeyWindow } ?? windows.first
    }

    /// A colour written the way the app's styles write it: "#1c1c1a".
    static func color(_ hex: String) -> UIColor {
        var value: UInt64 = 0
        Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&value)
        return UIColor(red: CGFloat((value >> 16) & 0xff) / 255,
                       green: CGFloat((value >> 8) & 0xff) / 255,
                       blue: CGFloat(value & 0xff) / 255,
                       alpha: 1)
    }

    /// What Android's WebView hands back for a page's answer: the text as a JSON string
    /// ("null" when there was none). The app's JavaScript expects exactly that on both phones.
    static func jsonText(_ text: String?) -> String {
        guard let text = text,
              let data = try? JSONSerialization.data(withJSONObject: [text]),
              let list = String(data: data, encoding: .utf8), list.count >= 2 else { return "null" }
        return String(list.dropFirst().dropLast()) // ["..."] without its brackets
    }
}

/// A short message that floats over whatever is on screen and fades away (Android's "toast").
enum Toast {
    private static weak var showing: UIView?

    static func show(_ text: String, long: Bool = false) {
        guard !text.isEmpty, let window = Screen.keyWindow() else { return }
        showing?.removeFromSuperview()

        let label = UILabel()
        label.text = text
        label.textColor = .white
        label.font = .systemFont(ofSize: 14, weight: .medium)
        label.numberOfLines = 0
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false

        let box = UIView()
        box.backgroundColor = UIColor(white: 0.12, alpha: 0.94)
        box.layer.cornerRadius = 14
        box.isUserInteractionEnabled = false
        box.alpha = 0
        box.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(label)
        window.addSubview(box)
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: box.topAnchor, constant: 10),
            label.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -10),
            label.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: 16),
            label.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -16),
            box.centerXAnchor.constraint(equalTo: window.centerXAnchor),
            box.widthAnchor.constraint(lessThanOrEqualTo: window.widthAnchor, constant: -32),
            box.bottomAnchor.constraint(equalTo: window.safeAreaLayoutGuide.bottomAnchor, constant: -84)
        ])
        showing = box

        UIView.animate(withDuration: 0.2) { box.alpha = 1 }
        UIView.animate(withDuration: 0.3, delay: long ? 3.5 : 2.0, options: [], animations: { box.alpha = 0 },
                       completion: { _ in box.removeFromSuperview() })
    }
}
