package io.github.christiangilkey.arabicpodcaststudio;

import android.webkit.CookieManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Settings → Reset Tamkeen (mobile/src/js/reset.js): sign out of every site in the app's browser
 *  windows (Instagram, YouTube and the rest) by clearing the cookies they share. */
@CapacitorPlugin(name = "AppReset")
public class AppResetPlugin extends Plugin {
    @PluginMethod
    public void clearCookies(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            CookieManager cookies = CookieManager.getInstance();
            cookies.removeAllCookies(done -> {
                cookies.flush();
                call.resolve();
            });
        });
    }
}
