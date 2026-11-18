package io.github.christiangilkey.arabicpodcaststudio;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import androidx.activity.result.ActivityResult;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * The phone's own voice for flashcards that have no recording (Settings → Card voices, "This device's
 * voice"; web/js/devicevoice.js). Android's web view has no speech of its own, so the page asks here:
 * Android's TextToSpeech (Google's speech engine on most phones) says the word or the sentence. Nothing
 * is recorded or kept. The iPhone twin is SpeechPlugin.swift (same name, same calls).
 *   speak({text, lang, rate, volume})  resolves once it has been said (rejects "NO_VOICE" / "NO_ENGINE");
 *                              volume 0..1 is Settings' Sound volume (web/js/appvolume.js)
 *   stop()                     stops whatever is being said
 *   hasVoice({lang})           {available, engine}: can the phone say this language?
 *   openSettings()             opens Android's text-to-speech settings, where voices are added
 *   recognize({lang, prompt})  hears one question (Vocab's microphone, web/js/components/voiceask.js): Android's
 *                              own speech recognition (Google's on most phones, as the keyboard's microphone),
 *                              in its own small window. No key. Resolves {text, cancelled}; rejects
 *                              "NO_RECOGNIZER" when the phone has none. (Not on the iPhone: there it is typed.)
 */
@CapacitorPlugin(name = "TamkeenSpeech")
public class SpeechPlugin extends Plugin {

    private TextToSpeech tts;
    private int status = -2; // -2 not started, -1 starting, TextToSpeech.SUCCESS or ERROR once known
    private final List<Runnable> waiting = new ArrayList<>();
    private final Map<String, PluginCall> speaking = new HashMap<>();

    /** Run `then` once the speech engine is ready (or has failed to start). */
    private synchronized void ready(Runnable then) {
        if (status == TextToSpeech.SUCCESS || status == TextToSpeech.ERROR) {
            then.run();
            return;
        }
        waiting.add(then);
        if (status == -2) {
            status = -1;
            tts = new TextToSpeech(getContext(), (result) -> {
                List<Runnable> run;
                synchronized (SpeechPlugin.this) {
                    status = result == TextToSpeech.SUCCESS ? TextToSpeech.SUCCESS : TextToSpeech.ERROR;
                    if (status == TextToSpeech.SUCCESS) tts.setOnUtteranceProgressListener(listener);
                    run = new ArrayList<>(waiting);
                    waiting.clear();
                }
                for (Runnable r : run) r.run();
            });
        }
    }

    private final UtteranceProgressListener listener = new UtteranceProgressListener() {
        @Override public void onStart(String id) { }
        @Override public void onDone(String id) { finish(id, null); }
        @Override public void onError(String id) { finish(id, "FAILED"); }
        @Override public void onStop(String id, boolean interrupted) { finish(id, null); }
    };

    private void finish(String id, String error) {
        PluginCall call;
        synchronized (this) { call = speaking.remove(id); }
        if (call == null) return;
        if (error == null) call.resolve(); else call.reject("The phone's voice couldn't say it.", error);
    }

    private static Locale locale(String tag) {
        Locale l = Locale.forLanguageTag(tag == null || tag.isEmpty() ? "en-US" : tag);
        // Android knows Tagalog as "fil"; Java's older code for Hebrew and the like don't matter here.
        if ("tl".equals(l.getLanguage())) l = new Locale("fil", l.getCountry());
        return l;
    }

    /** A language the engine can say: the tag itself, else the same language anywhere. Null when none. */
    private Locale usable(String tag) {
        Locale want = locale(tag);
        int r = tts.isLanguageAvailable(want);
        if (r >= TextToSpeech.LANG_AVAILABLE) return r == TextToSpeech.LANG_AVAILABLE ? new Locale(want.getLanguage()) : want;
        Locale bare = new Locale(want.getLanguage());
        return tts.isLanguageAvailable(bare) >= TextToSpeech.LANG_AVAILABLE ? bare : null;
    }

    @PluginMethod
    public void hasVoice(PluginCall call) {
        String tag = call.getString("lang", "en-US");
        ready(() -> {
            JSObject out = new JSObject();
            boolean engine = status == TextToSpeech.SUCCESS;
            out.put("engine", engine);
            out.put("available", engine && usable(tag) != null);
            call.resolve(out);
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        String tag = call.getString("lang", "en-US");
        float rate = call.getFloat("rate", 1.0f);
        float volume = Math.max(0f, Math.min(1f, call.getFloat("volume", 1.0f)));
        ready(() -> {
            if (status != TextToSpeech.SUCCESS) {
                call.reject("This phone has no text-to-speech engine.", "NO_ENGINE");
                return;
            }
            Locale l = usable(tag);
            if (l == null) {
                call.reject("This phone has no voice for this language.", "NO_VOICE");
                return;
            }
            tts.setLanguage(l);
            tts.setSpeechRate(rate);
            String id = UUID.randomUUID().toString();
            synchronized (this) { speaking.put(id, call); }
            call.setKeepAlive(false);
            Bundle params = new Bundle();
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume);
            if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, id) != TextToSpeech.SUCCESS) finish(id, "FAILED");
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null && status == TextToSpeech.SUCCESS) tts.stop();
        List<String> ids;
        synchronized (this) { ids = new ArrayList<>(speaking.keySet()); }
        for (String id : ids) finish(id, null);
        call.resolve();
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        JSObject out = new JSObject();
        try {
            Intent intent = new Intent("com.android.settings.TTS_SETTINGS");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            out.put("opened", true);
        } catch (ActivityNotFoundException e) {
            out.put("opened", false);
        }
        call.resolve(out);
    }

    @PluginMethod
    public void recognize(PluginCall call) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        String tag = call.getString("lang", "");
        if (tag != null && !tag.isEmpty()) intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, tag);
        String prompt = call.getString("prompt", "");
        if (prompt != null && !prompt.isEmpty()) intent.putExtra(RecognizerIntent.EXTRA_PROMPT, prompt);
        try {
            startActivityForResult(call, intent, "recognized");
        } catch (ActivityNotFoundException e) {
            call.reject("This phone has no speech recognition.", "NO_RECOGNIZER");
        }
    }

    @ActivityCallback
    private void recognized(PluginCall call, ActivityResult result) {
        if (call == null) return;
        String text = "";
        boolean ok = result.getResultCode() == Activity.RESULT_OK;
        Intent data = result.getData();
        if (ok && data != null) {
            ArrayList<String> heard = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (heard != null && !heard.isEmpty() && heard.get(0) != null) text = heard.get(0);
        }
        JSObject out = new JSObject();
        out.put("text", text);
        out.put("cancelled", !ok);
        call.resolve(out);
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.shutdown();
            tts = null;
        }
        super.handleOnDestroy();
    }
}
