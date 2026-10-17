package io.github.christiangilkey.arabicpodcaststudio;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Our own native plugin (Google sign-in for Drive sync) must be registered before startup.
        registerPlugin(GoogleDriveAuthPlugin.class);
        // Keeps saved words and the Tamkeen deck in AnkiDroid in step (see AnkiDroidPlugin).
        registerPlugin(AnkiDroidPlugin.class);
        // Downloads a new release's APK and opens Android's installer on it (see AppUpdaterPlugin).
        registerPlugin(AppUpdaterPlugin.class);
        // Cards left to review today on the app icon and the home-screen widget (see ReviewBadge).
        registerPlugin(AppBadgePlugin.class);
        // Settings → Reset Tamkeen: signs out of the sites in the app's browser windows.
        registerPlugin(AppResetPlugin.class);
        // The review card's Paste button reads the phone's clipboard (see ClipboardPlugin).
        registerPlugin(ClipboardPlugin.class);
        super.onCreate(savedInstanceState);
        // Lets the video player stream the user's own videos straight from Google Drive.
        getBridge().setWebViewClient(new DriveMediaWebViewClient(getBridge()));
    }
}
