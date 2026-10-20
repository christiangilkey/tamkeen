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
 * permission the silent notification needs. notifyMessage / clearMessage: a friend's chat message
 * (ChatNotifications), which needs the same permission.
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

    /** A friend's chat message as a notification: {friend, title, text}. Resolves {shown}. */
    @PluginMethod
    public void notifyMessage(PluginCall call) {
        JSObject out = new JSObject();
        out.put("shown", ChatNotifications.show(getContext(), call.getString("friend", ""),
            call.getString("title", "Tamkeen"), call.getString("text", "")));
        call.resolve(out);
    }

    /** Take away a friend's message notification (their chat is open): {friend}. */
    @PluginMethod
    public void clearMessage(PluginCall call) {
        ChatNotifications.clear(getContext(), call.getString("friend", ""));
        call.resolve();
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
