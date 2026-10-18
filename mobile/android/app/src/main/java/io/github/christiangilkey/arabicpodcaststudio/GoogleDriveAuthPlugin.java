package io.github.christiangilkey.arabicpodcaststudio;

import android.app.Activity;
import android.net.Uri;
import android.os.CancellationSignal;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import java.util.Arrays;

/**
 * Google sign-in for Drive sync, using Google's Authorization API (Google Play services).
 *
 * The app asks only for its own hidden Drive folder plus the account's email. Google
 * recognises the app by its package name and signing-key fingerprint, so no client secret
 * is needed on the phone. After the first consent, later calls return a fresh access token
 * silently.
 */
@CapacitorPlugin(name = "GoogleDriveAuth")
public class GoogleDriveAuthPlugin extends Plugin {
    private ActivityResultLauncher<IntentSenderRequest> launcher;
    private PluginCall pending;

    @Override
    public void load() {
        launcher = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(), this::onConsentResult);
    }

    /** `tasks`: Google Tasks too (the Review tab's "Send to Google Tasks"), asked the first time it is used. */
    private AuthorizationRequest request(boolean tasks) {
        java.util.List<Scope> scopes = new java.util.ArrayList<>(Arrays.asList(
            new Scope("https://www.googleapis.com/auth/drive.appdata"),
            new Scope("email"),
            new Scope("openid")));
        if (tasks) scopes.add(new Scope("https://www.googleapis.com/auth/tasks"));
        return AuthorizationRequest.builder().setRequestedScopes(scopes).build();
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", true));
        boolean tasks = Boolean.TRUE.equals(call.getBoolean("tasks", false));
        Identity.getAuthorizationClient(getActivity()).authorize(request(tasks))
            .addOnSuccessListener(result -> {
                if (!result.hasResolution()) {
                    resolveWith(call, result);
                } else if (!interactive) {
                    call.reject("NEEDS_INTERACTION");
                } else {
                    if (pending != null) pending.reject("Another sign-in started.");
                    pending = call;
                    launcher.launch(new IntentSenderRequest.Builder(
                        result.getPendingIntent().getIntentSender()).build());
                }
            })
            .addOnFailureListener(e -> call.reject("Google sign-in failed: " + e.getMessage(), e));
    }

    /**
     * A Google ID token (signed proof of which account is using the app) for the online features.
     * The Drive sign-in above only grants access, so this uses Credential Manager. The token is
     * issued for the app's "Web" client (serverClientId), which Supabase is set up to trust.
     */
    @PluginMethod
    public void getIdToken(PluginCall call) {
        String serverClientId = call.getString("serverClientId");
        if (serverClientId == null) {
            call.reject("Missing serverClientId.");
            return;
        }
        GetGoogleIdOption.Builder option = new GetGoogleIdOption.Builder()
            .setServerClientId(serverClientId)
            .setFilterByAuthorizedAccounts(false)
            .setAutoSelectEnabled(true);
        String nonce = call.getString("nonce");
        if (nonce != null) option.setNonce(nonce);
        GetCredentialRequest request = new GetCredentialRequest.Builder()
            .addCredentialOption(option.build())
            .build();
        CredentialManager.create(getContext()).getCredentialAsync(
            getActivity(), request, new CancellationSignal(), ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse response) {
                    Credential credential = response.getCredential();
                    if (!(credential instanceof CustomCredential)
                        || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                        call.reject("Google returned an unexpected kind of sign-in.");
                        return;
                    }
                    try {
                        GoogleIdTokenCredential google =
                            GoogleIdTokenCredential.createFrom(((CustomCredential) credential).getData());
                        JSObject out = new JSObject();
                        out.put("idToken", google.getIdToken());
                        out.put("email", google.getId());
                        call.resolve(out);
                    } catch (Exception e) {
                        call.reject("Couldn't read Google's answer: " + e.getMessage(), e);
                    }
                }

                @Override
                public void onError(GetCredentialException e) {
                    call.reject("Google sign-in failed: " + e.getMessage(), e);
                }
            });
    }

    /**
     * Opens the in-app web browser. When the user presses "Import Page" there, the page's text
     * (extracted by the script passed in as "extractor") is sent to JavaScript as a "pageImport" event.
     */
    @PluginMethod
    public void openBrowser(PluginCall call) {
        String url = call.getString("url", "");
        String extractor = call.getString("extractor", "");
        String youtube = call.getString("youtube", "");
        String home = call.getString("home", ""); // the start page, shown when no address is given
        // Opened for signing in to Instagram: the browser closes itself once signed in (see InAppBrowser).
        boolean forSignIn = Boolean.TRUE.equals(call.getBoolean("closeOnInstagramSignIn", false));
        // Opened to read web pages (the ordinary browser), or for something else such as signing
        // in, YouTube or finding a word in a video: then it has no "Import Page" button.
        boolean forReading = !forSignIn && !Boolean.FALSE.equals(call.getBoolean("forReading", true));
        Runnable signedIn = !forSignIn ? null : () -> {
            android.widget.Toast.makeText(getContext(), "Signed in to Instagram", android.widget.Toast.LENGTH_SHORT).show();
            notifyListeners("instagramSignedIn", new JSObject());
        };
        getActivity().runOnUiThread(() -> {
            try {
                InAppBrowser.open(getActivity(), url, extractor, youtube, home, forReading, json -> {
                    android.widget.Toast.makeText(getContext(), "Importing page…", android.widget.Toast.LENGTH_SHORT).show();
                    JSObject event = new JSObject();
                    event.put("result", json);
                    notifyListeners("pageImport", event);
                }, id -> {
                    JSObject event = new JSObject();
                    if (id.startsWith("tamkeen-video://site")) {
                        // The star in the bar, or a site taken off on the start page: JavaScript keeps the list.
                        event.put("url", id);
                        notifyListeners("browserSite", event);
                        return;
                    }
                    if (id.startsWith("tamkeen-video://find")) {
                        // "Find in a video": the videos Filmot's results page listed, top first.
                        event.put("url", id);
                        notifyListeners("youtubeFind", event);
                        return;
                    }
                    if (id.startsWith("tamkeen-video:")) {
                        // The Follow button on a channel's page: JavaScript adds it to the followed channels.
                        event.put("url", id);
                        notifyListeners("youtubeFollow", event);
                        return;
                    }
                    // A YouTube video was tapped: JavaScript adds it and opens the app's player.
                    // "<id>@<seconds>" when a moment in it came along (a caption search result).
                    int cut = id.indexOf('@');
                    if (cut > 0) {
                        event.put("at", Integer.parseInt(id.substring(cut + 1)));
                        event.put("id", id.substring(0, cut));
                    } else {
                        event.put("id", id);
                    }
                    notifyListeners("youtubeVideo", event);
                }, signedIn);
                call.resolve();
            } catch (Exception e) {
                call.reject("Couldn't open the browser: " + e.getMessage(), e);
            }
        });
    }

    /**
     * A link tapped inside the app is about to leave it: Capacitor hands anything that isn't the
     * app's own page to the phone's browser. YouTube links are kept instead. Tapping the channel's
     * picture, the title or a suggested video inside YouTube's embedded player (or a YouTube link
     * anywhere else in the app) is passed to JavaScript as a "youtubeLink" event, which opens a
     * channel's page in the in-app browser and a video in the app's own player.
     * The embedded player's own address (/embed/...) is left alone, as is every other website.
     */
    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        if (url == null || !"https".equals(url.getScheme()) || url.getHost() == null) return null;
        String host = url.getHost().toLowerCase(java.util.Locale.ROOT);
        boolean youtube = host.equals("youtu.be") || host.equals("youtube.com") || host.endsWith(".youtube.com");
        String path = url.getPath() == null ? "" : url.getPath();
        if (!youtube || path.startsWith("/embed/")) return null; // Capacitor decides, as before
        JSObject event = new JSObject();
        event.put("url", url.toString());
        notifyListeners("youtubeLink", event, true); // kept until the page is listening
        return true; // handled: don't load it here, don't open the phone's browser
    }

    /** Closes the in-app browser (after a tapped YouTube video has opened in the app's player). */
    @PluginMethod
    public void closeBrowser(PluginCall call) {
        getActivity().runOnUiThread(InAppBrowser::close);
        call.resolve();
    }

    // ----- the reel window (see ReelSurface) -----

    /** Opens the reel window over a box of the app's screen and loads a reel's embed page in it.
     *  Where the reel is, and its buttons, come back to JavaScript as "reelState" events. */
    @PluginMethod
    public void reelOpen(PluginCall call) {
        String url = call.getString("url", "");
        String script = call.getString("script", "");
        float top = call.getFloat("top", 0f);
        float height = call.getFloat("height", 0f);
        if (!ReelSurface.isEmbed(url)) {
            call.reject("Not a reel.");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                ReelSurface.open(getActivity(), getBridge().getWebView(), url, script, top, height, json -> {
                    JSObject event = new JSObject();
                    event.put("state", json);
                    notifyListeners("reelState", event);
                });
                call.resolve();
            } catch (Exception e) {
                call.reject("Couldn't open the reel: " + e.getMessage(), e);
            }
        });
    }

    /** Shows another reel in the window that is already open. */
    @PluginMethod
    public void reelLoad(PluginCall call) {
        String url = call.getString("url", "");
        if (!ReelSurface.isEmbed(url)) {
            call.reject("Not a reel.");
            return;
        }
        getActivity().runOnUiThread(() -> ReelSurface.load(url));
        call.resolve();
    }

    /** Moves the reel window when the box it covers moves or changes size. */
    @PluginMethod
    public void reelLayout(PluginCall call) {
        float top = call.getFloat("top", 0f);
        float height = call.getFloat("height", 0f);
        getActivity().runOnUiThread(() -> ReelSurface.layout(getActivity(), getBridge().getWebView(), top, height));
        call.resolve();
    }

    /** Tells the reel to play, pause or jump (JavaScript run inside the reel's page). */
    @PluginMethod
    public void reelRun(PluginCall call) {
        String script = call.getString("script", "");
        getActivity().runOnUiThread(() -> ReelSurface.run(script));
        call.resolve();
    }

    @PluginMethod
    public void reelClose(PluginCall call) {
        getActivity().runOnUiThread(ReelSurface::close);
        call.resolve();
    }

    /**
     * The user's saved sites, for the in-app browser's start page and the star in its bar:
     * "sites" is the JSON list [{url, title}]. Sent before the browser opens and after each change.
     */
    @PluginMethod
    public void browserSites(PluginCall call) {
        String sites = call.getString("sites", "[]");
        getActivity().runOnUiThread(() -> InAppBrowser.setSavedSites(sites));
        call.resolve();
    }

    /** Shows a short message on top of the in-app browser (e.g. "Imported ..."). */
    @PluginMethod
    public void browserToast(PluginCall call) {
        String text = call.getString("text", "");
        getActivity().runOnUiThread(() ->
            android.widget.Toast.makeText(getContext(), text, android.widget.Toast.LENGTH_LONG).show());
        call.resolve();
    }

    /** Hands the current access token to the video streamer (see DriveMediaWebViewClient). */
    @PluginMethod
    public void setMediaToken(PluginCall call) {
        DriveMediaWebViewClient.setToken(call.getString("token"));
        call.resolve();
    }

    private void onConsentResult(ActivityResult r) {
        PluginCall call = pending;
        pending = null;
        if (call == null) return;
        if (r.getResultCode() != Activity.RESULT_OK) {
            call.reject("Sign-in was cancelled.");
            return;
        }
        try {
            AuthorizationResult result =
                Identity.getAuthorizationClient(getActivity()).getAuthorizationResultFromIntent(r.getData());
            resolveWith(call, result);
        } catch (ApiException e) {
            call.reject("Google sign-in failed: " + e.getMessage(), e);
        }
    }

    private void resolveWith(PluginCall call, AuthorizationResult result) {
        if (result.getAccessToken() == null) {
            call.reject("Google didn't return an access token.");
            return;
        }
        JSObject out = new JSObject();
        out.put("accessToken", result.getAccessToken());
        out.put("scopes", new JSArray(result.getGrantedScopes()));
        call.resolve(out);
    }
}
