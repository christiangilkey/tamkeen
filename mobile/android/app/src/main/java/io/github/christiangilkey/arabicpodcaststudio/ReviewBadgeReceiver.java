package io.github.christiangilkey.arabicpodcaststudio;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Woken just after midnight (ReviewBadge.scheduleMidnight) to show the new day's count. */
public class ReviewBadgeReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        ReviewBadge.refresh(context);
    }
}
