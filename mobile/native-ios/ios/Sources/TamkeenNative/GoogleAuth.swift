import AuthenticationServices
import CryptoKit
import Foundation
import Security
import UIKit

/// Google sign-in on the iPhone.
///
/// The app asks only for its own hidden Drive folder plus the account's email, exactly as on
/// Android. There is no Google Play services here, so the sign-in is the standard one for
/// installed apps: Google's own page opens in the system's sign-in sheet (the app never sees the
/// password), hands back a one-time code, and the app swaps that for tokens. A one-time secret
/// made for each sign-in ("PKCE") stands in for a client secret, so none is stored in the app.
///
/// The long-lived "refresh token" is kept in the iPhone's keychain; later calls use it to get a
/// fresh access token without showing anything.
///
/// Every method must be called on the main thread; every completion comes back on it.
final class GoogleAuth: NSObject, ASWebAuthenticationPresentationContextProviding {
    struct Tokens {
        let accessToken: String
        let idToken: String?
        let scopes: [String]
    }

    enum Failure: Error {
        case notSetUp
        case needsInteraction
        case cancelled
        case message(String)
    }

    typealias Completion = (Result<Tokens, Failure>) -> Void

    static let shared = GoogleAuth()

    private static let driveScope = "https://www.googleapis.com/auth/drive.appdata"
    private static let scopes = [driveScope, "email", "openid"]
    private static let tokenAddress = "https://oauth2.googleapis.com/token"
    private static let keychainService = "tamkeen-google"
    private static let keychainAccount = "refresh-token"
    private static let fallbackKey = "tamkeen.google.refresh"

    /// The app's "iOS" client in Google Cloud (public; from capacitor.config.json).
    var clientId = ""
    /// The window the sign-in sheet is shown over.
    weak var anchor: UIWindow?

    private var accessToken: String?
    private var accessExpires = Date.distantPast
    private var idToken: String?
    private var idTokenAt = Date.distantPast
    private var granted: [String] = []
    private var session: ASWebAuthenticationSession?

    /// An access token (and the newest ID token). Silent when it can be; shows Google's page only
    /// when `interactive` is true and there is no other way.
    /// `force` asks Google for a new access token even if the one held looks fresh.
    /// `wantId` also makes sure the ID token is fresh (they last an hour).
    func tokens(interactive: Bool, force: Bool, wantId: Bool = false, completion: @escaping Completion) {
        guard !clientId.isEmpty else {
            completion(.failure(.notSetUp))
            return
        }
        let idFresh = idToken != nil && idTokenAt.timeIntervalSinceNow > -45 * 60
        if !force, let token = accessToken, accessExpires.timeIntervalSinceNow > 300, !wantId || idFresh {
            completion(.success(Tokens(accessToken: token, idToken: idToken, scopes: granted)))
            return
        }
        guard let refresh = loadRefresh() else {
            if interactive { signIn(completion) } else { completion(.failure(.needsInteraction)) }
            return
        }
        post(["grant_type": "refresh_token", "refresh_token": refresh, "client_id": clientId]) { result in
            switch result {
            case .success(let json):
                completion(.success(self.adopt(json)))
            case .failure(.needsInteraction):
                // Google no longer accepts the stored token (access was removed, or it expired).
                self.forget()
                if interactive { self.signIn(completion) } else { completion(.failure(.needsInteraction)) }
            case .failure(let failure):
                completion(.failure(failure))
            }
        }
    }

    /// Forget this account on the phone. (The app's JavaScript tells Google to revoke the token.)
    func signOut() {
        forget()
    }

    // MARK: - the sign-in page

    private func signIn(_ completion: @escaping Completion) {
        let verifier = Self.randomText(bytes: 32)
        let state = Self.randomText(bytes: 16)
        let challenge = Self.base64url(Data(SHA256.hash(data: Data(verifier.utf8))))
        // Google's rule for iPhone apps: the answer comes back to the client id written backwards.
        let scheme = clientId.split(separator: ".").reversed().joined(separator: ".")
        let redirect = "\(scheme):/oauth2redirect"

        var parts = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")
        parts?.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirect),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: Self.scopes.joined(separator: " ")),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state)
        ]
        guard let address = parts?.url else {
            completion(.failure(.message("Couldn't start Google sign-in.")))
            return
        }

        session?.cancel()
        let web = ASWebAuthenticationSession(url: address, callbackURLScheme: scheme) { [weak self] callback, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.session = nil
                guard let callback = callback else {
                    let code = (error as NSError?)?.code
                    if code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                        completion(.failure(.cancelled))
                    } else {
                        completion(.failure(.message("Google sign-in failed: \(error?.localizedDescription ?? "no answer")")))
                    }
                    return
                }
                let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
                let value = { (name: String) in items.first { $0.name == name }?.value }
                guard value("state") == state, let code = value("code") else {
                    let why = value("error") ?? "no code came back"
                    completion(.failure(why == "access_denied" ? .cancelled : .message("Google sign-in failed: \(why)")))
                    return
                }
                self.post(["grant_type": "authorization_code", "code": code, "client_id": self.clientId,
                           "redirect_uri": redirect, "code_verifier": verifier]) { result in
                    switch result {
                    case .success(let json):
                        let tokens = self.adopt(json)
                        if !tokens.scopes.isEmpty && !tokens.scopes.contains(Self.driveScope) {
                            // The box for the app's Drive folder was left unticked on Google's page.
                            self.forget()
                            completion(.failure(.message("Tamkeen needs its own folder in your Google Drive to sync. Sign in again and leave that box ticked.")))
                        } else {
                            completion(.success(tokens))
                        }
                    case .failure(.needsInteraction):
                        completion(.failure(.message("Google sign-in failed: the code was refused.")))
                    case .failure(let failure):
                        completion(.failure(failure))
                    }
                }
            }
        }
        web.presentationContextProvider = self
        web.prefersEphemeralWebBrowserSession = false // reuse an account already signed in to in Safari
        session = web
        if !web.start() {
            session = nil
            completion(.failure(.message("Couldn't open Google's sign-in page.")))
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return anchor ?? Screen.keyWindow() ?? ASPresentationAnchor()
    }

    // MARK: - tokens

    /// Take in Google's answer; returns what the app works with.
    private func adopt(_ json: [String: Any]) -> Tokens {
        let access = json["access_token"] as? String ?? ""
        let lasts = (json["expires_in"] as? NSNumber)?.doubleValue ?? 3600
        accessToken = access
        accessExpires = Date().addingTimeInterval(lasts)
        if let id = json["id_token"] as? String {
            idToken = id
            idTokenAt = Date()
        }
        if let scope = json["scope"] as? String {
            granted = scope.split(separator: " ").map(String.init)
        }
        if let refresh = json["refresh_token"] as? String {
            saveRefresh(refresh)
        }
        return Tokens(accessToken: access, idToken: idToken, scopes: granted)
    }

    private func forget() {
        accessToken = nil
        accessExpires = Date.distantPast
        idToken = nil
        idTokenAt = Date.distantPast
        granted = []
        saveRefresh(nil)
    }

    /// Send a form to Google's token address. `.needsInteraction` means "sign in again".
    private func post(_ fields: [String: String], completion: @escaping (Result<[String: Any], Failure>) -> Void) {
        guard let address = URL(string: Self.tokenAddress) else { return }
        var request = URLRequest(url: address)
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = fields.map { "\($0.key)=\(Self.formEncoded($0.value))" }.joined(separator: "&").data(using: .utf8)
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(.failure(.message("Couldn't reach Google: \(error.localizedDescription)")))
                    return
                }
                let parsed = data.flatMap { try? JSONSerialization.jsonObject(with: $0) }
                let json = parsed as? [String: Any] ?? [:]
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                if status == 200, json["access_token"] is String {
                    completion(.success(json))
                } else if (json["error"] as? String) == "invalid_grant" {
                    completion(.failure(.needsInteraction))
                } else {
                    let why = json["error_description"] as? String ?? json["error"] as? String ?? "error \(status)"
                    completion(.failure(.message("Google sign-in failed: \(why)")))
                }
            }
        }.resume()
    }

    /// The email inside an ID token (its middle part is plain JSON, base64-encoded).
    static func email(inIdToken token: String?) -> String {
        guard let token = token else { return "" }
        let parts = token.split(separator: ".")
        guard parts.count >= 2 else { return "" }
        var middle = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while middle.count % 4 != 0 { middle += "=" }
        guard let data = Data(base64Encoded: middle),
              let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return "" }
        return json["email"] as? String ?? ""
    }

    // MARK: - keychain

    private var keychainItem: [String: Any] {
        return [kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: Self.keychainService,
                kSecAttrAccount as String: Self.keychainAccount]
    }

    private func saveRefresh(_ value: String?) {
        SecItemDelete(keychainItem as CFDictionary)
        UserDefaults.standard.removeObject(forKey: Self.fallbackKey)
        guard let value = value, let data = value.data(using: .utf8) else { return }
        var item = keychainItem
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        if SecItemAdd(item as CFDictionary, nil) != errSecSuccess {
            // The keychain refused (it can on some sideloaded installs): keep it in the app's own
            // settings instead, so the user isn't asked to sign in every time the app opens.
            UserDefaults.standard.set(value, forKey: Self.fallbackKey)
        }
    }

    private func loadRefresh() -> String? {
        var query = keychainItem
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var found: CFTypeRef?
        if SecItemCopyMatching(query as CFDictionary, &found) == errSecSuccess,
           let data = found as? Data, let text = String(data: data, encoding: .utf8), !text.isEmpty {
            return text
        }
        return UserDefaults.standard.string(forKey: Self.fallbackKey)
    }

    // MARK: - small helpers

    private static func base64url(_ data: Data) -> String {
        return data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private static func randomText(bytes count: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: count)
        if SecRandomCopyBytes(kSecRandomDefault, count, &bytes) != errSecSuccess {
            for index in bytes.indices { bytes[index] = UInt8.random(in: 0...255) }
        }
        return base64url(Data(bytes))
    }

    private static func formEncoded(_ text: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return text.addingPercentEncoding(withAllowedCharacters: allowed) ?? text
    }
}
