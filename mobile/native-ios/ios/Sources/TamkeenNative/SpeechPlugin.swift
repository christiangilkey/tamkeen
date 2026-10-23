import AVFoundation
import Capacitor
import Foundation

/// The iPhone's own voice for flashcards that have no recording (Settings → Card voices, "This device's
/// voice"; web/js/devicevoice.js): the twin of SpeechPlugin.java (same name, same calls), with the
/// iPhone's AVSpeechSynthesizer. Nothing is recorded or kept.
///   speak({text, lang, rate})  resolves once it has been said (rejects "NO_VOICE")
///   stop()                     stops whatever is being said
///   hasVoice({lang})           {available, engine}: can the iPhone say this language?
///   openSettings()             {opened: false}: an app can't open Spoken Content (the page says where it is)
@objc(SpeechPlugin)
public class SpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpeechPlugin"
    public let jsName = "TamkeenSpeech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hasVoice", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    private let synth = AVSpeechSynthesizer()
    private let ears = SpeechEars()

    override public func load() {
        synth.delegate = ears
    }

    /// The iPhone's voice for a language tag: the exact one, else any voice of the same language.
    private static func voice(_ tag: String) -> AVSpeechSynthesisVoice? {
        let wanted = tag.replacingOccurrences(of: "_", with: "-")
        if let exact = AVSpeechSynthesisVoice(language: wanted) { return exact }
        let base = String(wanted.split(separator: "-").first ?? "").lowercased()
        let bases: Set<String> = base == "fil" || base == "tl" ? ["fil", "tl"] : [base]
        return AVSpeechSynthesisVoice.speechVoices().first { v in
            bases.contains(String(v.language.split(separator: "-").first ?? "").lowercased())
        }
    }

    @objc func hasVoice(_ call: CAPPluginCall) {
        let tag = call.getString("lang") ?? "en-US"
        call.resolve(["available": Self.voice(tag) != nil, "engine": true])
    }

    @objc func speak(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        let tag = call.getString("lang") ?? "en-US"
        let rate = call.getFloat("rate") ?? 1.0
        DispatchQueue.main.async {
            guard let voice = Self.voice(tag) else {
                call.reject("This iPhone has no voice for this language.", "NO_VOICE")
                return
            }
            // Played as media, like the app's other sound (heard with the silent switch on, too).
            try? AVAudioSession.sharedInstance().setCategory(.playback)
            try? AVAudioSession.sharedInstance().setActive(true)
            self.ears.finish()  // the page's earlier call: over now
            if self.synth.isSpeaking { self.synth.stopSpeaking(at: .immediate) }
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = voice
            utterance.rate = AVSpeechUtteranceDefaultSpeechRate * max(0.5, min(1.5, rate))
            self.ears.waiting = call
            self.ears.utterance = utterance
            self.synth.speak(utterance)
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.synth.stopSpeaking(at: .immediate)
            self.ears.finish()
            call.resolve()
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        call.resolve(["opened": false])
    }
}

/// Hears when the iPhone has finished speaking, and answers the page's waiting call then.
final class SpeechEars: NSObject, AVSpeechSynthesizerDelegate {
    var waiting: CAPPluginCall?
    var utterance: AVSpeechUtterance?

    func finish() {
        let call = waiting
        waiting = nil
        utterance = nil
        call?.resolve()
    }

    /// Only the utterance the waiting call is for ends it (a stopped earlier one says so late).
    private func ended(_ u: AVSpeechUtterance) {
        if u === utterance { finish() }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) { ended(utterance) }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) { ended(utterance) }
}
