// SPDX-License-Identifier: Apache-2.0
package app.pulse.notes;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * R173 - AppWidgetProvider for the home screen "Recent notes" widget.
 *
 * Data flow:
 *   1. The web layer (widgetCache.ts) writes the top 3 notes to
 *      <filesDir>/widget-cache.json via Capacitor's Filesystem API
 *      (Directory.Documents -> context.filesDir on Android).
 *   2. This provider reads the same file in onUpdate() and renders the
 *      3 entries. If the file is missing (first install before the user
 *      opens the app, or no notes yet) we show an empty state.
 *   3. Tapping a note row fires a pulse://note/{id} VIEW intent;
 *      MainActivity is configured to handle that scheme (see
 *      AndroidManifest).
 *   4. The refresh button broadcasts ACTION_REFRESH to ourselves, which
 *      re-reads the file and re-renders every instance.
 *
 * Implemented in Java to match the rest of the native shell
 * (MainActivity.java) and avoid pulling in the Kotlin runtime just for
 * one file. ~150 LoC, no new dependencies.
 */
public class NotesWidgetProvider extends AppWidgetProvider {

    private static final String TAG = "NotesWidget";
    private static final String ACTION_REFRESH = "app.pulse.notes.WIDGET_REFRESH";
    private static final String CACHE_FILE = "widget-cache.json";
    private static final int REQUEST_REFRESH = 1001;
    private static final int REQUEST_OPEN_APP = 1002;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            renderWidget(context, manager, id);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            int[] ids = manager.getAppWidgetIds(
                    new ComponentName(context, NotesWidgetProvider.class));
            for (int id : ids) {
                renderWidget(context, manager, id);
            }
        }
    }

    private void renderWidget(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.notes_widget);
        JSONArray notes = readCache(context);
        WidgetSlot slot0 = getSlot(notes, 0);
        WidgetSlot slot1 = getSlot(notes, 1);
        WidgetSlot slot2 = getSlot(notes, 2);

        bindRow(views, R.id.widget_note_1, slot0);
        bindRow(views, R.id.widget_note_2, slot1);
        bindRow(views, R.id.widget_note_3, slot2);

        boolean anyNote = slot0 != null || slot1 != null || slot2 != null;
        views.setViewVisibility(
                R.id.widget_empty,
                anyNote ? View.GONE : View.VISIBLE);

        // Root tap -> open the app at the notes list.
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntentForOpenApp(context));
        bindRowClick(views, R.id.widget_note_1, slot0, context);
        bindRowClick(views, R.id.widget_note_2, slot1, context);
        bindRowClick(views, R.id.widget_note_3, slot2, context);

        // Refresh button -> broadcast ACTION_REFRESH to ourselves.
        Intent refreshIntent = new Intent(context, NotesWidgetProvider.class);
        refreshIntent.setAction(ACTION_REFRESH);
        PendingIntent refreshPending = PendingIntent.getBroadcast(
                context,
                REQUEST_REFRESH,
                refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_refresh, refreshPending);

        manager.updateAppWidget(widgetId, views);
    }

    private void bindRow(RemoteViews views, int viewId, WidgetSlot slot) {
        if (slot == null) {
            views.setTextViewText(viewId, "");
            views.setViewVisibility(viewId, View.GONE);
            return;
        }
        String title = slot.title.isEmpty() ? "Untitled" : slot.title;
        String display = slot.preview.isEmpty() ? title : title + " — " + slot.preview;
        views.setTextViewText(viewId, display);
        views.setViewVisibility(viewId, View.VISIBLE);
    }

    private void bindRowClick(RemoteViews views, int viewId, WidgetSlot slot, Context context) {
        if (slot == null) return;
        views.setOnClickPendingIntent(viewId, pendingIntentForNote(context, slot.id));
    }

    private PendingIntent pendingIntentForOpenApp(Context context) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(
                context,
                REQUEST_OPEN_APP,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private PendingIntent pendingIntentForNote(Context context, String id) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse("pulse://note/" + id));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
                context,
                // requestCode unique per note id so PendingIntent cache
                // doesn't collapse different deep links.
                id.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private JSONArray readCache(Context context) {
        File file = new File(context.getFilesDir(), CACHE_FILE);
        if (!file.exists()) return null;
        try {
            byte[] bytes = Files.readAllBytes(file.toPath());
            String raw = new String(bytes, StandardCharsets.UTF_8);
            return new JSONArray(raw);
        } catch (Exception e) {
            Log.w(TAG, "Failed to read widget cache: " + e.getMessage());
            return null;
        }
    }

    private WidgetSlot getSlot(JSONArray notes, int index) {
        if (notes == null) return null;
        if (index < 0 || index >= notes.length()) return null;
        JSONObject obj = notes.optJSONObject(index);
        if (obj == null) return null;
        String id = obj.optString("id", "");
        if (id.isEmpty()) return null;
        return new WidgetSlot(
                id,
                obj.optString("title", ""),
                obj.optString("preview", ""));
    }

    private static final class WidgetSlot {
        final String id;
        final String title;
        final String preview;

        WidgetSlot(String id, String title, String preview) {
            this.id = id;
            this.title = title;
            this.preview = preview;
        }
    }
}
