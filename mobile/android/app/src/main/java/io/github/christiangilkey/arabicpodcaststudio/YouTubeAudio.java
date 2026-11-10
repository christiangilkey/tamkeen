package io.github.christiangilkey.arabicpodcaststudio;

import android.content.res.AssetManager;
import android.util.Log;
import android.webkit.WebView;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * The dubbed soundtrack of a YouTube video in the language being learned, chosen inside YouTube's embedded
 * player: web/js/yt-audio-frame.js (which explains it) runs at the start of every youtube.com frame in the
 * app's own web view, the frame of the player page included. The page itself can't reach into that frame.
 * Older web views without "document start scripts" skip it, and the player page then shows how to choose
 * the track by hand. (The iPhone twin is YouTubeAudioPlugin.swift; the computer's is app/desktop.py.)
 */
final class YouTubeAudio {
    private static final String TAG = "YouTubeAudio";
    private static final Set<String> ORIGINS = new HashSet<>(Arrays.asList(
            "https://www.youtube.com", "https://www.youtube-nocookie.com"));

    private YouTubeAudio() {}

    static void install(WebView view, AssetManager assets) {
        if (view == null || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;
        try (InputStream in = assets.open("public/js/yt-audio-frame.js")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            WebViewCompat.addDocumentStartJavaScript(view, out.toString(StandardCharsets.UTF_8.name()), ORIGINS);
        } catch (IOException | RuntimeException e) {
            Log.w(TAG, "Couldn't add the YouTube audio script", e);
        }
    }
}
