package io.github.christiangilkey.arabicpodcaststudio;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * The number of review cards left today, shown outside the app (ReviewBadge): setCounts hands over
 * {day, counts: [today, tomorrow, ...]}; allowNotification asks Android (13 and later) once for the
 * permission the silent notification needs.
 */
@CapacitorPlugin(name = "AppBadge",
    permissions = @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }))
public class AppBadgePlugin extends Plugin {
    @PluginMethod
    public void setCounts(PluginCall call) {
        try {
            JSArray counts = call.getArray("counts", new JSArray());
            long day = call.getData().optLong("day", ReviewBadge.today());
            ReviewBadge.save(getContext(), day, counts);
            ReviewBadge.refresh(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "Couldn't update the count." : e.getMessage());
        }
    }

    @PluginMethod
    public void allowNotification(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(getContext(),
                Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            answer(call, true);
        } else {
            requestPermissionForAlias("notifications", call, "permissionAnswered");
        }
    }

    @PermissionCallback
    private void permissionAnswered(PluginCall call) {
        boolean granted = getPermissionState("notifications") == PermissionState.GRANTED;
        if (granted) ReviewBadge.refresh(getContext());
        answer(call, granted);
    }

    private static void answer(PluginCall call, boolean granted) {
        JSObject out = new JSObject();
        out.put("granted", granted);
        call.resolve(out);
    }
}
