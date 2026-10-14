package io.github.christiangilkey.arabicpodcaststudio;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** The home-screen widget: how many cards are left to review today (see ReviewBadge). Tapping it
 *  opens the app. Android asks it to update every half hour, which also moves it on at midnight. */
public class ReviewWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        manager.updateAppWidget(ids, ReviewBadge.widgetViews(context, ReviewBadge.count(context)));
        ReviewBadge.refresh(context);
    }
}
