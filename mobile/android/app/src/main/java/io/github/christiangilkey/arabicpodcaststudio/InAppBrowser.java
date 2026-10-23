package io.github.christiangilkey.arabicpodcaststudio;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.net.URLEncoder;

/**
 * The app's own small web browser: an address bar with back / forward / close on top, the page
 * below, and a small round teal "Import to Tamkeen" button floating at the bottom right.
 *
 * Pressing that button runs the app's text extractor (web/js/extract.js, passed in as source)
 * inside the page being viewed and hands the result to the listener. The page itself is given
 * no access to the app: this WebView has no bridge to the app's code.
 *
 * On youtube.com, tapping a video hands its id to the video listener instead of playing it
 * there: web/js/youtube-browser.js (passed in as source, run in every page) asks to go to the
 * made-up address "tamkeen-video://watch?v=<id>", which only this browser understands.
 */
final class InAppBrowser {
    interface Listener {
        /** `json` is the page's answer exactly as WebView returns it (a JSON-encoded string). */
        void onImport(String json);
    }

    interface VideoListener {
        /** A YouTube video was tapped; `id` is its 11-character video id, followed by "@" and a
         *  number of seconds when a moment in it came along. (For the Follow button
         *  on a channel's page it is the whole made-up address, "tamkeen-video://follow?name=...".) */
        void onVideo(String id);
    }

    private static final String VIDEO_SCHEME = "tamkeen-video";

    // Sites the user saved to the start page, as the app last handed them over: the JSON list
    // [{url, title}] that the start page draws, and their addresses alone for the star in the bar.
    private static String savedSites = "[]";
    private static final java.util.Set<String> savedUrls = new java.util.HashSet<>();
    private static Runnable repaintStar; // set while a browser is open

    /** The app's list of saved sites (it changed, or the browser is about to open). */
    static void setSavedSites(String json) {
        String list = "[]";
        java.util.Set<String> urls = new java.util.HashSet<>();
        try {
            org.json.JSONArray sites = new org.json.JSONArray(json == null || json.trim().isEmpty() ? "[]" : json);
            for (int i = 0; i < sites.length(); i++) urls.add(sites.getJSONObject(i).optString("url"));
            list = sites.toString();
        } catch (Exception e) {
            urls.clear(); // not a list: treat it as empty
        }
        savedSites = list;
        savedUrls.clear();
        savedUrls.addAll(urls);
        Runnable repaint = repaintStar;
        if (repaint != null) repaint.run();
    }

    /** An address as the saved list keeps it: without any "#part". */
    private static String siteKey(String url) {
        if (url == null) return "";
        int hash = url.indexOf('#');
        return hash < 0 ? url : url.substring(0, hash);
    }

    /**
     * Asked of the page once a second when the browser was opened for signing in to Instagram:
     * "in" once the page is Instagram's, past its sign-in pages, and carries the mark Instagram
     * gives a signed-in visitor. Only that one word comes back; nothing about the account does.
     */
    private static final String SIGNED_IN =
        "(/(^|\\.)instagram\\.com$/.test(location.hostname) && /(^|; )ds_user_id=\\d/.test(document.cookie)"
        + " && !/^\\/accounts\\/(login|emailsignup|signup)/.test(location.pathname)) ? 'in' : ''";
    private static Dialog openDialog;

    /** Close the browser if it is open (once a tapped video has opened in the app's player). */
    static void close() {
        Dialog d = openDialog;
        if (d != null && d.isShowing()) d.dismiss();
    }

    private static final String HOME = "https://www.google.com/";

    private InAppBrowser() {}

    /** A typed address, or a web search for typed words, or the home page for nothing. */
    static String startUrl(String text) {
        String t = text == null ? "" : text.trim();
        if (t.isEmpty()) return HOME;
        if (t.matches("(?i)^[a-z][a-z0-9+.-]*://.*")) return t;
        if (!t.contains(" ") && t.contains(".")) return "https://" + t;
        try {
            return "https://www.google.com/search?q=" + URLEncoder.encode(t, "UTF-8");
        } catch (Exception e) {
            return HOME;
        }
    }

    /**
     * The address the history files the app's own start page under (see `home` below). Nothing
     * is ever fetched from it: ".invalid" is a name the internet guarantees never exists.
     */
    private static final String START_PAGE = "https://start.tamkeen.invalid/";

    /**
     * `home` is the app's start page as one finished HTML page (a search box and news sites in
     * the language being studied, built by web/js/browser-home.js). It is shown when `url` is
     * empty; without it the browser starts on Google as before. `forReading` false: opened for
     * something other than reading pages (signing in, YouTube, finding a word in a video), so
     * there is no import button and no star.
     */
    static void open(Activity activity, String url, String extractor, String youtubeScript, String home,
                     boolean forReading, Listener listener, VideoListener videos, Runnable signedIn) {
        float dp = activity.getResources().getDisplayMetrics().density;
        int pad = Math.round(6 * dp);
        int dark = Color.parseColor("#1c1c1a");
        int ink = Color.parseColor("#f2f1ec");
        int teal = Color.parseColor("#0b8693"); // the brand teal (--brand-teal in web/css/app.css)

        Dialog dialog = new Dialog(activity, android.R.style.Theme_DeviceDefault_NoActionBar);
        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(dark);
        root.setFitsSystemWindows(true);

        // ----- top bar -----
        LinearLayout bar = new LinearLayout(activity);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(pad, pad, pad, pad);
        Button back = barButton(activity, "‹", ink, dp);
        Button forward = barButton(activity, "›", ink, dp);
        Button close = barButton(activity, "✕", ink, dp);
        // The star keeps the site being shown on the start page (hollow until it is); it is not
        // shown on the start page itself.
        Button star = barButton(activity, "☆", ink, dp);
        final String[] shown = { "" }; // the address being shown
        Runnable paintStar = () -> {
            boolean site = shown[0].startsWith("http") && !shown[0].startsWith(START_PAGE);
            boolean on = site && savedUrls.contains(siteKey(shown[0]));
            star.setText(on ? "★" : "☆");
            star.setTextColor(on ? Color.parseColor("#f1cf7b") : ink);
            star.setVisibility(site && forReading ? View.VISIBLE : View.GONE);
        };
        paintStar.run();
        EditText address = new EditText(activity);
        address.setSingleLine(true);
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setImeOptions(EditorInfo.IME_ACTION_GO);
        address.setHint("Search or type a web address");
        address.setTextColor(ink);
        address.setHintTextColor(Color.parseColor("#8a8880"));
        address.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        address.setSelectAllOnFocus(true);
        GradientDrawable field = new GradientDrawable();
        field.setColor(Color.parseColor("#141413"));
        field.setCornerRadius(8 * dp);
        address.setBackground(field);
        address.setPadding(Math.round(10 * dp), Math.round(8 * dp), Math.round(10 * dp), Math.round(8 * dp));
        bar.addView(back);
        bar.addView(forward);
        LinearLayout.LayoutParams grow = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        grow.setMargins(pad, 0, pad, 0);
        bar.addView(address, grow);
        bar.addView(star);
        bar.addView(close);
        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        ProgressBar progress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        root.addView(progress, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.round(3 * dp)));

        // ----- page + floating round import button -----
        FrameLayout frame = new FrameLayout(activity);
        WebView web = new WebView(activity);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setBuiltInZoomControls(true);
        web.getSettings().setDisplayZoomControls(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void doUpdateVisitedHistory(WebView view, String current, boolean isReload) {
                if (!address.hasFocus()) address.setText(START_PAGE.equals(current) ? "" : current);
                shown[0] = current == null ? "" : current;
                paintStar.run();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                android.net.Uri uri = request.getUrl();
                if (uri == null || !VIDEO_SCHEME.equals(uri.getScheme())) return false;
                // The Follow button on a channel's page, or a saved site taken off on the start page.
                if ("follow".equals(uri.getHost()) || "site".equals(uri.getHost())) {
                    if (videos != null) videos.onVideo(uri.toString());
                    return true;
                }
                String id = uri.getQueryParameter("v");
                if (id != null && id.matches("[\\w-]{11}") && videos != null) {
                    // A moment in the video may come with it ("&t=95", the "t" of a video page's
                    // address, see web/js/youtube-browser.js): it travels on as "<id>@<seconds>".
                    String at = uri.getQueryParameter("t");
                    videos.onVideo(at != null && at.matches("\\d{1,6}") ? id + "@" + at : id);
                }
                return true; // never an address to load
            }

            @Override
            public void onPageFinished(WebView view, String finished) {
                if (START_PAGE.equals(finished) || START_PAGE.equals(view.getUrl())) {
                    // The start page draws the saved sites it is handed, so one saved a moment
                    // ago is there when the user comes back to it. (Only ever said to this page.)
                    view.evaluateJavascript("window.__tkSites&&window.__tkSites(" + savedSites + ")", null);
                }
                if (youtubeScript != null && !youtubeScript.isEmpty()) {
                    view.evaluateJavascript("window.__tamkeenBridge='address';" + youtubeScript, null);
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int value) {
                progress.setProgress(value);
                progress.setVisibility(value >= 100 ? View.INVISIBLE : View.VISIBLE);
            }
        });
        frame.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // A plain teal circle (no shadow) with the app's white line "import" icon, an arrow going
        // down into a tray (res/drawable/ic_tamkeen_import.xml). It replaced the "Import Page" pill.
        ImageButton importButton = new ImageButton(activity);
        importButton.setImageResource(R.drawable.ic_tamkeen_import);
        importButton.setScaleType(android.widget.ImageView.ScaleType.CENTER);
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(teal);
        importButton.setBackground(circle);
        importButton.setElevation(0);
        importButton.setStateListAnimator(null); // stays flat when pressed, too
        importButton.setContentDescription("Import to Tamkeen");
        if (android.os.Build.VERSION.SDK_INT >= 26) importButton.setTooltipText("Import to Tamkeen");
        int round = Math.round(56 * dp);
        FrameLayout.LayoutParams corner = new FrameLayout.LayoutParams(round, round, Gravity.BOTTOM | Gravity.RIGHT); // right, also in right-to-left languages
        corner.setMargins(0, 0, Math.round(16 * dp), Math.round(20 * dp));
        frame.addView(importButton, corner);
        if (!forReading) importButton.setVisibility(View.GONE);
        root.addView(frame, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        // ----- behaviour -----
        back.setOnClickListener(v -> { if (web.canGoBack()) web.goBack(); });
        forward.setOnClickListener(v -> { if (web.canGoForward()) web.goForward(); });
        close.setOnClickListener(v -> dialog.dismiss());
        star.setOnClickListener(v -> {
            // The app keeps the list; it is told which site and answers with the new list.
            String site = siteKey(web.getUrl());
            if (videos == null || !site.startsWith("http") || site.startsWith(START_PAGE)) return;
            String title = web.getTitle() == null ? "" : web.getTitle();
            videos.onVideo(VIDEO_SCHEME + "://site?do=toggle&u=" + android.net.Uri.encode(site)
                + "&t=" + android.net.Uri.encode(title));
        });
        repaintStar = paintStar;
        address.setOnEditorActionListener((v, actionId, event) -> {
            boolean enter = event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER
                && event.getAction() == KeyEvent.ACTION_DOWN;
            if (actionId != EditorInfo.IME_ACTION_GO && !enter) return false;
            web.loadUrl(startUrl(address.getText().toString()));
            address.clearFocus();
            InputMethodManager keyboard = (InputMethodManager) activity.getSystemService(Activity.INPUT_METHOD_SERVICE);
            if (keyboard != null) keyboard.hideSoftInputFromWindow(address.getWindowToken(), 0);
            return true;
        });
        importButton.setOnClickListener(v -> {
            if (!importButton.isEnabled()) return;
            importButton.setEnabled(false); // one import at a time; dimmed while it reads the page
            importButton.setAlpha(0.6f);
            Toast.makeText(activity, "Importing page…", Toast.LENGTH_SHORT).show();
            String script = "(function(){" + extractor
                + "\nreturn JSON.stringify(extractArticle(document, location.href));})()";
            web.evaluateJavascript(script, json -> {
                importButton.setEnabled(true);
                importButton.setAlpha(1f);
                listener.onImport(json);
            });
        });
        dialog.setOnKeyListener((d, keyCode, event) -> {
            if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP && web.canGoBack()) {
                web.goBack();
                return true;
            }
            return false;
        });
        dialog.setOnDismissListener(d -> {
            if (openDialog == dialog) openDialog = null;
            if (repaintStar == paintStar) repaintStar = null;
            web.stopLoading();
            frame.removeView(web);
            web.destroy();
        });

        dialog.setContentView(root);
        Window window = dialog.getWindow();
        if (window != null) {
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        }
        openDialog = dialog;
        dialog.show();
        if (signedIn != null) {
            // Opened for signing in to Instagram (`signedIn` is given): close by itself once the
            // user is signed in, and say so, so the app can carry on with what needed the sign-in.
            final Handler watch = new Handler(Looper.getMainLooper());
            final int[] seen = {0};
            watch.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (openDialog != dialog) return; // closed by hand, or already closed here
                    web.evaluateJavascript(SIGNED_IN, value -> {
                        if (openDialog != dialog) return;
                        seen[0] = "\"in\"".equals(value) ? seen[0] + 1 : 0;
                        if (seen[0] >= 2) { // two looks in a row: Instagram has finished signing in
                            CookieManager.getInstance().flush();
                            dialog.dismiss();
                            signedIn.run();
                        }
                    });
                    watch.postDelayed(this, 1000);
                }
            }, 1500);
        }
        boolean nothingTyped = url == null || url.trim().isEmpty();
        if (nothingTyped && home != null && !home.isEmpty()) {
            // The last argument keeps the page in the history, so Back returns to it.
            web.loadDataWithBaseURL(START_PAGE, home, "text/html", "UTF-8", START_PAGE);
        } else {
            web.loadUrl(startUrl(url));
        }
    }

    private static Button barButton(Activity activity, String label, int color, float dp) {
        Button b = new Button(activity);
        b.setText(label);
        b.setTextColor(color);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        b.setBackgroundColor(Color.TRANSPARENT);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        b.setPadding(Math.round(12 * dp), 0, Math.round(12 * dp), 0);
        b.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, Math.round(40 * dp)));
        return b;
    }
}
