package io.github.christiangilkey.arabicpodcaststudio;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Updates the app from inside it: downloads the new release's APK from the app's own GitHub
 * releases and opens Android's installer on it (the user confirms there). Android asks once whether
 * Tamkeen may install apps; canInstall / openInstallSettings cover that. The APK is signed with the
 * same key as the installed app, so it installs over it and keeps the user's data.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final String RELEASES = "https://github.com/christiangilkey/tamkeen/releases/download/";

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject out = new JSObject();
        out.put("allowed", Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(out);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    /** {url, sha256?}: download the APK (progress as "updateProgress" {done, total}), then install it. */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url", "");
        String sha256 = call.getString("sha256", "");
        if (!url.startsWith(RELEASES) || !url.endsWith(".apk")) {
            call.reject("That isn't one of Tamkeen's releases.");
            return;
        }
        new Thread(() -> {
            File folder = new File(getContext().getCacheDir(), "update");
            File apk = new File(folder, "Tamkeen-update.apk");
            try {
                folder.mkdirs();
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(20000);
                conn.setReadTimeout(60000);
                if (conn.getResponseCode() >= 400) throw new Exception("GitHub answered " + conn.getResponseCode() + ".");
                long total = conn.getContentLengthLong();
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long done = 0, last = 0;
                try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[1 << 16];
                    for (int n; (n = in.read(buf)) > 0; ) {
                        out.write(buf, 0, n);
                        digest.update(buf, 0, n);
                        done += n;
                        long now = System.currentTimeMillis();
                        if (now - last > 250) {
                            last = now;
                            JSObject p = new JSObject();
                            p.put("done", done);
                            p.put("total", total);
                            notifyListeners("updateProgress", p);
                        }
                    }
                } finally {
                    conn.disconnect();
                }
                if (total > 0 && done != total) throw new Exception("The download stopped early. Please try again.");
                if (!sha256.isEmpty() && !sha256.equalsIgnoreCase(hex(digest.digest()))) {
                    throw new Exception("The download didn't match the release file. Please try again.");
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().runOnUiThread(() -> {
                    try {
                        getContext().startActivity(intent);
                        call.resolve();
                    } catch (Exception e) {
                        call.reject("Couldn't open Android's installer: " + e.getMessage());
                    }
                });
            } catch (Exception e) {
                apk.delete();
                call.reject(e.getMessage() == null ? "The update failed." : e.getMessage());
            }
        }, "tamkeen-update").start();
    }

    private static String hex(byte[] bytes) {
        StringBuilder s = new StringBuilder();
        for (byte b : bytes) s.append(String.format("%02x", b));
        return s.toString();
    }
}
