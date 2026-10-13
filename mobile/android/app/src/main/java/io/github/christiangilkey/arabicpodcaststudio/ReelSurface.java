package io.github.christiangilkey.arabicpodcaststudio;

import android.app.Activity;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * The small window that plays an Instagram reel on top of part of the app's own screen.
 *
 * The app's screen (web/js/pages/reels.js) leaves a box for it and draws the bar of words below;
 * this class puts a second WebView exactly over that box and loads the reel's embed page in it.
 * web/js/reel-embed.js (passed in as source) runs inside that page: it starts the reel and keeps
 * a note of where it is. That page is given no access to the app. Instead this class asks the
 * page a few times a second where the reel is, and passes any change on to the listener.
 *
 * Every method must be called on the UI thread.
 */
final class ReelSurface {
    interface Listener {
        /** `json` is the page's answer exactly as WebView returns it (a JSON-encoded string). */
        void onState(String json);
    }

    private static final long ASK_EVERY_MS = 120;
    private static final String ASK = "(window.__tkReelState ? window.__tkReelState() : '')";

    private static WebView view;
    private static Handler handler;
    private static Runnable tick;
    private static String script = "";
    private static String last = "";

    private ReelSurface() {}

    private static final String SITE = "https://www.instagram.com";

    /** Only a reel's own pages on Instagram are shown here: its embed page, or its ordinary page
     *  (for reels Instagram plays only to someone signed in). */
    static boolean isEmbed(String url) {
        if (url == null || !url.startsWith(SITE + "/")) return false;
        String path = url.substring(SITE.length()).split("[?#]")[0];
        return path.matches("/(reel|reels|p)/[\\w-]+(/embed(/captioned)?)?/?");
    }

    /** Instagram sends someone who isn't signed in to its sign-in page; that has to be let through
     *  so the script inside can report it (the user signs in from the app's own browser). */
    private static boolean isSignIn(String url) {
        return url != null && url.startsWith(SITE + "/accounts/login");
    }

    /** `top` and `height` are in the app page's own units (CSS pixels), measured from its top. */
    static void open(Activity activity, WebView appView, String url, String js, float top, float height, Listener listener) {
        close();
        script = js == null ? "" : js;
        last = "";
        WebView web = new WebView(activity);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false); // a reel starts by itself, like scrolling to it
        web.setBackgroundColor(Color.BLACK);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView v, String finished) {
                if (!script.isEmpty()) v.evaluateJavascript(script, null);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                // A tap on "View profile" and the like must not take this small window somewhere else.
                String to = request.getUrl().toString();
                return !isEmbed(to) && !isSignIn(to);
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        ViewGroup parent = (ViewGroup) appView.getParent();
        parent.addView(web, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1));
        view = web;
        layout(activity, appView, top, height);
        web.loadUrl(url);

        handler = new Handler(Looper.getMainLooper());
        tick = new Runnable() {
            @Override
            public void run() {
                WebView w = view;
                if (w == null) return;
                w.evaluateJavascript(ASK, value -> {
                    if (view != null && value != null && !value.equals(last)) {
                        last = value;
                        listener.onState(value);
                    }
                });
                Handler h = handler; // null once the window has been closed
                if (h != null) h.postDelayed(this, ASK_EVERY_MS);
            }
        };
        handler.postDelayed(tick, 300);
    }

    static void layout(Activity activity, WebView appView, float top, float height) {
        WebView web = view;
        if (web == null) return;
        float dp = activity.getResources().getDisplayMetrics().density;
        ViewGroup.LayoutParams params = web.getLayoutParams();
        params.height = Math.max(1, Math.round(height * dp));
        web.setLayoutParams(params);
        web.setX(appView.getX());
        web.setY(appView.getY() + top * dp);
    }

    static void load(String url) {
        WebView web = view;
        if (web == null) return;
        last = "";
        web.loadUrl(url);
    }

    /** Run JavaScript in the reel's page (play, pause, jump). */
    static void run(String js) {
        WebView web = view;
        if (web != null && js != null) web.evaluateJavascript(js, null);
    }

    static void close() {
        if (handler != null && tick != null) handler.removeCallbacks(tick);
        handler = null;
        tick = null;
        WebView web = view;
        view = null;
        if (web == null) return;
        web.stopLoading();
        if (web.getParent() instanceof ViewGroup) ((ViewGroup) web.getParent()).removeView(web);
        web.destroy();
    }
}
