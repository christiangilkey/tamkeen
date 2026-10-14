import Foundation
import WebKit

/// Streams the user's own videos from their Google Drive into the app's video player.
///
/// Drive only accepts the sign-in token as an "Authorization" header, which a <video> element
/// can't send. So the player asks for tkdrive://media/<file id> and this class fetches that file
/// from Drive with the header added, passing "Range" through so seeking only downloads the part
/// that's needed. (The iPhone twin of DriveMediaWebViewClient.java, where the address is
/// https://localhost/_drive/<file id>; an iPhone web view can only be given made-up address kinds.)
///
/// The app's web view is told about it in AppDelegate.swift. Everything here runs on the main
/// thread, which is what keeps a cancelled request from being answered afterwards.
public final class DriveMediaHandler: NSObject, WKURLSchemeHandler, URLSessionDataDelegate {
    public static let scheme = "tkdrive"

    /// The current access token, handed over from JavaScript (GoogleDriveAuth.setMediaToken).
    static var token: String?

    private var session: URLSession?
    private var asking: [Int: WKURLSchemeTask] = [:]             // by the Drive request's number
    private var fetching: [ObjectIdentifier: URLSessionDataTask] = [:] // by the player's request

    public override init() {
        super.init()
        let setup = URLSessionConfiguration.ephemeral
        setup.requestCachePolicy = .reloadIgnoringLocalCacheData
        setup.timeoutIntervalForRequest = 60
        session = URLSession(configuration: setup, delegate: self, delegateQueue: OperationQueue.main)
    }

    public func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let fileId = urlSchemeTask.request.url?.lastPathComponent ?? ""
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-_")
        guard let token = Self.token, !fileId.isEmpty, fileId != "/",
              let safeId = fileId.addingPercentEncoding(withAllowedCharacters: allowed),
              let drive = URL(string: "https://www.googleapis.com/drive/v3/files/\(safeId)?alt=media"),
              let session = session else {
            urlSchemeTask.didFailWithError(URLError(.userAuthenticationRequired))
            return
        }
        var request = URLRequest(url: drive)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let range = urlSchemeTask.request.value(forHTTPHeaderField: "Range") {
            request.setValue(range, forHTTPHeaderField: "Range")
        }
        let task = session.dataTask(with: request)
        asking[task.taskIdentifier] = urlSchemeTask
        fetching[ObjectIdentifier(urlSchemeTask as AnyObject)] = task
        task.resume()
    }

    public func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // The player has lost interest (a seek, or the video was closed). It must not be told
        // anything more about this request, so it is forgotten before the download is cancelled.
        guard let task = fetching.removeValue(forKey: ObjectIdentifier(urlSchemeTask as AnyObject)) else { return }
        asking[task.taskIdentifier] = nil
        task.cancel()
    }

    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                           completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let player = asking[dataTask.taskIdentifier], let address = player.request.url else {
            completionHandler(.cancel)
            return
        }
        let http = response as? HTTPURLResponse
        let code = http?.statusCode ?? 502
        var headers = ["Accept-Ranges": "bytes", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"]
        for name in ["Content-Range", "Content-Length"] {
            if let value = http?.value(forHTTPHeaderField: name) { headers[name] = value }
        }
        headers["Content-Type"] = code >= 400 ? "text/plain" : (http?.value(forHTTPHeaderField: "Content-Type") ?? "video/mp4")
        if let reply = HTTPURLResponse(url: address, statusCode: code, httpVersion: "HTTP/1.1", headerFields: headers) {
            player.didReceive(reply)
        }
        completionHandler(.allow)
    }

    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        asking[dataTask.taskIdentifier]?.didReceive(data)
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let player = asking.removeValue(forKey: task.taskIdentifier) else { return }
        fetching[ObjectIdentifier(player as AnyObject)] = nil
        if let error = error {
            player.didFailWithError(error)
        } else {
            player.didFinish()
        }
    }
}
