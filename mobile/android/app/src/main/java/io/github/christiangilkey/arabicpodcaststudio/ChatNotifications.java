package io.github.christiangilkey.arabicpodcaststudio;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * A friend's chat message as an Android notification (web/js/chatnotify.js decides when): its own
 * "Chat messages" channel, with sound and a pop-up, unlike the silent review count (ReviewBadge).
 * One notification per friend, replaced by their newest message. Tapping it opens the app at
 * tamkeen://chat/<friend id>, which the app turns into that chat (mobile/src/js/app.js
 * openTamkeenLink); the link goes straight to this app's own screen, so nothing else can catch it.
 */
final class ChatNotifications {
    private static final String CHANNEL = "chat_messages";

    private ChatNotifications() {}

    /** False when Android doesn't allow notifications (13 and later ask first). */
    static boolean show(Context context, String friend, String title, String text) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || friend == null || friend.isEmpty()) return false;
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context,
                Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Chat messages", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Messages, voice notes and things to study that friends send you.");
            manager.createNotificationChannel(channel);
        }
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse("tamkeen://chat/" + Uri.encode(friend)), context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, friend.hashCode(), open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_review)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(tap);
        manager.notify("chat", friend.hashCode(), b.build());
        return true;
    }

    /** Take a friend's notification away (their chat was opened). */
    static void clear(Context context, String friend) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null && friend != null) manager.cancel("chat", friend.hashCode());
    }
}
