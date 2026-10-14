package io.github.christiangilkey.arabicpodcaststudio;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;

import java.util.TimeZone;

/**
 * How many review cards are left today, outside the app: a silent notification (which is what puts
 * the number on the app's icon on Android) and the home-screen widget (ReviewWidget).
 *
 * The app hands over counts for today and the next days ({day, counts}, see setCounts in
 * AppBadgePlugin), so at midnight the number moves on by itself (an alarm and the widget's
 * half-hourly update call refresh) without the app being opened.
 */
final class ReviewBadge {
    private static final String PREFS = "review_badge";
    private static final String CHANNEL = "review_count";
    private static final int NOTIFICATION = 4171;
    private static final long DAY = 86_400_000L;

    private ReviewBadge() {}

    /** The day number the app uses (web/js/review/fsrs.js dayNumber): whole local days since 1970. */
    static long today() {
        long now = System.currentTimeMillis();
        return Math.floorDiv(now + TimeZone.getDefault().getOffset(now), DAY);
    }

    static void save(Context context, long day, JSONArray counts) {
        prefs(context).edit().putLong("day", day).putString("counts", counts.toString()).apply();
    }

    /** Cards left today from the last counts the app handed over; -1 when there are none. */
    static int count(Context context) {
        SharedPreferences p = prefs(context);
        try {
            JSONArray counts = new JSONArray(p.getString("counts", "[]"));
            if (counts.length() == 0) return -1;
            long index = today() - p.getLong("day", today());
            if (index < 0) index = 0;
            if (index >= counts.length()) index = counts.length() - 1;  // older than the counts: the last one
            return Math.max(0, counts.getInt((int) index));
        } catch (Exception e) {
            return -1;
        }
    }

    /** Bring the notification and the widgets up to date, and wake up again after midnight. */
    static void refresh(Context context) {
        int n = count(context);
        showNotification(context, n);
        updateWidgets(context, n);
        scheduleMidnight(context);
    }

    private static void showNotification(Context context, int n) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (n <= 0) {
            manager.cancel(NOTIFICATION);
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context,
                Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Cards to review", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("How many cards are left to review today. Silent: no sound, vibration or pop-up.");
            channel.setShowBadge(true);
            channel.setSound(null, null);
            channel.enableVibration(false);
            manager.createNotificationChannel(channel);
        }
        NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_review)
            .setContentTitle(n == 1 ? "1 card to review today" : n + " cards to review today")
            .setContentText("Tap to open Tamkeen")
            .setNumber(n)
            .setBadgeIconType(NotificationCompat.BADGE_ICON_SMALL)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setContentIntent(openApp(context));
        manager.notify(NOTIFICATION, b.build());
    }

    private static void updateWidgets(Context context, int n) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, ReviewWidget.class));
        if (ids.length == 0) return;
        manager.updateAppWidget(ids, widgetViews(context, n));
    }

    static RemoteViews widgetViews(Context context, int n) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_review);
        views.setTextViewText(R.id.widget_count, n < 0 ? "–" : n == 0 ? "✓" : String.valueOf(n));
        views.setTextViewText(R.id.widget_label, n < 0 ? "Open Tamkeen to count your cards"
            : n == 0 ? "All reviewed today" : n == 1 ? "card to review" : "cards to review");
        views.setOnClickPendingIntent(R.id.widget_root, openApp(context));
        return views;
    }

    private static PendingIntent openApp(Context context) {
        Intent intent = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** An inexact alarm a minute after the next local midnight (no special permission needed). */
    private static void scheduleMidnight(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        long now = System.currentTimeMillis();
        long offset = TimeZone.getDefault().getOffset(now);
        long next = (today() + 1) * DAY - offset + 60_000L;
        Intent intent = new Intent(context, ReviewBadgeReceiver.class);
        PendingIntent pi = PendingIntent.getBroadcast(context, 1, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        alarms.set(AlarmManager.RTC, next, pi);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
