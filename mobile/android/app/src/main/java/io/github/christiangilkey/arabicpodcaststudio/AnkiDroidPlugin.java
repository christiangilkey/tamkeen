package io.github.christiangilkey.arabicpodcaststudio;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.text.TextUtils;
import android.util.Base64;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;

import java.io.File;
import java.io.FileOutputStream;
import java.util.HashSet;
import java.util.Set;

/**
 * The Tamkeen deck in AnkiDroid, read and written through the door AnkiDroid opens to other apps
 * (its "content provider", content://com.ichi2.anki.flashcards, which the person must allow once).
 *
 * The rules of the sync are not here: they are in the app's JavaScript (anki-sync.js, run by
 * anki-droid.js). This class only fetches and stores, and guards what it is asked to do:
 *
 *   - every read names the deck, so only that deck's notes and cards are fetched (the one
 *     exception finds notes carrying Tamkeen's own mark, to learn that a card was moved away);
 *   - a note is changed or deleted only after checking, here, that it is in the deck;
 *   - only the fields called Front and Back are rewritten. AnkiDroid takes a note's fields as
 *     one list, so the others (the image field among them) are handed back exactly as they were;
 *   - an existing card layout is never changed.
 *
 * AnkiDroid cannot be told a note's guid, so a card made here carries its word's id as a tag.
 */
@CapacitorPlugin(
    name = "AnkiDroid",
    permissions = { @Permission(alias = "anki", strings = { AnkiDroidPlugin.PERMISSION }) }
)
public class AnkiDroidPlugin extends Plugin {
    static final String PACKAGE = "com.ichi2.anki";
    static final String PERMISSION = "com.ichi2.anki.permission.READ_WRITE_DATABASE";
    private static final Uri BASE = Uri.parse("content://com.ichi2.anki.flashcards");
    private static final Uri NOTES = Uri.withAppendedPath(BASE, "notes");
    private static final Uri NOTES_SQL = Uri.withAppendedPath(BASE, "notes_v2");
    private static final Uri MODELS = Uri.withAppendedPath(BASE, "models");
    private static final Uri DECKS = Uri.withAppendedPath(BASE, "decks");
    private static final Uri CARDS = Uri.withAppendedPath(BASE, "cards");
    private static final Uri MEDIA = Uri.withAppendedPath(BASE, "media");
    private static final String SEPARATOR = "\u001f";
    private static final String FRONT = "Front";
    private static final String BACK = "Back";
    // What newer AnkiDroid (2.24 and later) tells other apps about a card's schedule.
    private static final String[] SCHEDULE = {
        "note_id", "ord", "deck_id", "original_deck_id", "type", "queue", "due", "original_due", "interval",
        "reps", "lapses", "last_review_time_secs"
    };

    private ContentResolver resolver() {
        return getContext().getContentResolver();
    }

    // ----- is AnkiDroid there, and may we talk to it? -----

    private JSObject describe() {
        JSObject out = new JSObject();
        PackageManager pm = getContext().getPackageManager();
        boolean installed = false;
        String version = null;
        try {
            PackageInfo info = pm.getPackageInfo(PACKAGE, 0);
            installed = true;
            version = info.versionName;
        } catch (PackageManager.NameNotFoundException e) {
            // not installed
        }
        // Android only knows the permission once AnkiDroid is installed. If Tamkeen was installed
        // first, older Android versions may refuse to grant it until Tamkeen is installed again.
        boolean known = false;
        try {
            pm.getPermissionInfo(PERMISSION, 0);
            known = true;
        } catch (PackageManager.NameNotFoundException e) {
            // AnkiDroid has not defined it (not installed)
        }
        boolean granted = ContextCompat.checkSelfPermission(getContext(), PERMISSION) == PackageManager.PERMISSION_GRANTED;
        out.put("installed", installed);
        out.put("version", version);
        out.put("known", known);
        out.put("permission", granted ? "granted" : getPermissionState("anki") == PermissionState.DENIED ? "denied" : "prompt");
        return out;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(describe());
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), PERMISSION) == PackageManager.PERMISSION_GRANTED) {
            call.resolve(describe());
            return;
        }
        requestPermissionForAlias("anki", call, "accessAnswered");
    }

    @PermissionCallback
    private void accessAnswered(PluginCall call) {
        call.resolve(describe());
    }

    /** Run a piece of work and turn what can go wrong into an answer the app can show. */
    private interface Work {
        void run() throws Exception;
    }

    private void guarded(PluginCall call, Work work) {
        try {
            work.run();
        } catch (SecurityException e) {
            call.reject("Tamkeen is not allowed to use AnkiDroid's cards.", "NO_PERMISSION", e);
        } catch (IllegalStateException e) {
            call.reject("AnkiDroid is not ready (open it once, then try again).", "NOT_READY", e);
        } catch (Exception e) {
            call.reject("AnkiDroid: " + e.getMessage(), "FAILED", e);
        }
    }

    // ----- searching -----

    /** "deck:Name" for AnkiDroid's search, matching that deck and the decks inside it. */
    private static String inDeck(String deck) {
        String escaped = deck.replace("\\", "\\\\").replace("\"", "\\\"").replace("*", "\\*").replace("_", "\\_");
        return "\"deck:" + escaped + "\"";
    }

    private static boolean ours(String name, String deck) {
        String a = name.toLowerCase(), b = deck.toLowerCase();
        return a.equals(b) || a.startsWith(b + "::");
    }

    /** The ids of the deck and of the decks inside it; `list` (if given) also receives {id, name}. */
    private Set<Long> deckIds(String deck, JSArray list) throws JSONException {
        Set<Long> ids = new HashSet<>();
        try (Cursor c = resolver().query(DECKS, new String[] { "deck_id", "deck_name" }, null, null, null)) {
            while (c != null && c.moveToNext()) {
                if (!ours(c.getString(1), deck)) continue;
                ids.add(c.getLong(0));
                if (list != null) {
                    JSObject d = new JSObject();
                    d.put("id", c.getLong(0));
                    d.put("name", c.getString(1));
                    list.put(d);
                }
            }
        }
        return ids;
    }

    private boolean noteInDeck(String deck, long id) {
        try (Cursor c = resolver().query(NOTES, new String[] { "_id" }, inDeck(deck) + " nid:" + id, null, null)) {
            return c != null && c.getCount() == 1;
        }
    }

    private JSArray fieldNames(long model) throws JSONException {
        try (Cursor c = resolver().query(Uri.withAppendedPath(MODELS, Long.toString(model)),
                 new String[] { "field_names" }, null, null, null)) {
            if (c == null || !c.moveToFirst()) return new JSArray();
            return new JSArray(c.getString(0).split(SEPARATOR, -1));
        }
    }

    private static JSObject noteRow(Cursor c) throws JSONException {
        JSObject n = new JSObject();
        n.put("id", c.getLong(0));
        n.put("guid", c.getString(1));
        n.put("mid", c.getLong(2));
        n.put("mod", c.getLong(3));
        String tags = c.getString(4) == null ? "" : c.getString(4).trim();
        n.put("tags", tags.isEmpty() ? new JSArray() : new JSArray(tags.split("\\s+")));
        n.put("fields", new JSArray(c.getString(5).split(SEPARATOR, -1)));
        return n;
    }

    // ----- reading the deck -----

    /**
     * Everything in the deck: { decks, notes, models, cards }.
     * `cards` is null on an AnkiDroid too old to report schedules (before 2.24).
     */
    @PluginMethod
    public void readDeck(PluginCall call) {
        guarded(call, () -> {
            String deck = call.getString("deck", "");
            JSObject out = new JSObject();
            JSArray decks = new JSArray();
            deckIds(deck, decks);
            out.put("decks", decks);

            JSArray notes = new JSArray();
            JSObject models = new JSObject();
            Set<Long> modelIds = new HashSet<>();
            String[] columns = { "_id", "guid", "mid", "mod", "tags", "flds" };
            if (decks.length() > 0) {
                try (Cursor c = resolver().query(NOTES, columns, inDeck(deck), null, null)) {
                    while (c != null && c.moveToNext()) {
                        notes.put(noteRow(c));
                        modelIds.add(c.getLong(2));
                    }
                }
            }
            for (long model : modelIds) {
                JSObject m = new JSObject();
                try (Cursor c = resolver().query(Uri.withAppendedPath(MODELS, Long.toString(model)),
                         new String[] { "field_names", "num_cards", "name" }, null, null, null)) {
                    if (c != null && c.moveToFirst()) {
                        m.put("fields", new JSArray(c.getString(0).split(SEPARATOR, -1)));
                        m.put("cards", c.getInt(1));
                        m.put("name", c.getString(2));
                    }
                }
                models.put(Long.toString(model), m);
            }
            out.put("notes", notes);
            out.put("models", models);

            Object cards = org.json.JSONObject.NULL;
            if (decks.length() > 0) {
                try (Cursor c = resolver().query(CARDS, SCHEDULE, inDeck(deck), null, null)) {
                    JSArray rows = new JSArray();
                    while (c != null && c.moveToNext()) {
                        if (c.isNull(0)) continue;  // deleted while we were reading
                        JSObject card = new JSObject();
                        card.put("note", c.getLong(0));
                        card.put("ord", c.getInt(1));
                        card.put("deck", c.getLong(2));
                        card.put("home", c.getLong(3));
                        card.put("type", c.getInt(4));
                        card.put("queue", c.getInt(5));
                        card.put("due", c.getLong(6));
                        card.put("homeDue", c.getLong(7));
                        card.put("interval", c.getInt(8));
                        card.put("reps", c.getInt(9));
                        card.put("lapses", c.getInt(10));
                        card.put("last", c.isNull(11) ? org.json.JSONObject.NULL : (Object) c.getLong(11));
                        rows.put(card);
                    }
                    cards = rows;
                } catch (SecurityException e) {
                    throw e;
                } catch (Exception e) {
                    // an older AnkiDroid: it has no card search, or does not know these columns
                }
            }
            out.put("cards", cards);
            call.resolve(out);
        });
    }

    /** The decks one note's cards are in: [{ ord, deck }]. Works on every AnkiDroid version. */
    @PluginMethod
    public void noteCards(PluginCall call) {
        guarded(call, () -> {
            long id = call.getLong("id", 0L);
            JSArray rows = new JSArray();
            Uri uri = Uri.withAppendedPath(Uri.withAppendedPath(NOTES, Long.toString(id)), "cards");
            try (Cursor c = resolver().query(uri, new String[] { "ord", "deck_id" }, null, null, null)) {
                while (c != null && c.moveToNext()) {
                    JSObject card = new JSObject();
                    card.put("ord", c.getInt(0));
                    card.put("deck", c.getLong(1));
                    rows.put(card);
                }
            }
            JSObject out = new JSObject();
            out.put("cards", rows);
            call.resolve(out);
        });
    }

    /**
     * Review cards of the deck that match one more search term, a few at most: { cards: [{ due, queue }] }.
     * Used to learn which of AnkiDroid's day numbers is today (search "prop:due=0"), nothing else.
     */
    @PluginMethod
    public void probe(PluginCall call) {
        guarded(call, () -> {
            String deck = call.getString("deck", "");
            String extra = call.getString("extra", "");
            if (!extra.matches("prop:due=-?\\d{1,4}")) {
                call.reject("Unknown search.");
                return;
            }
            JSArray rows = new JSArray();
            try (Cursor c = resolver().query(CARDS, new String[] { "due", "queue", "original_deck_id" },
                     inDeck(deck) + " is:review " + extra, null, null)) {
                while (c != null && c.moveToNext() && rows.length() < 5) {
                    if (c.isNull(0)) continue;
                    JSObject card = new JSObject();
                    card.put("due", c.getLong(0));
                    card.put("queue", c.getInt(1));
                    card.put("home", c.getLong(2));
                    rows.put(card);
                }
            }
            JSObject out = new JSObject();
            out.put("cards", rows);
            call.resolve(out);
        });
    }

    /**
     * Notes anywhere in AnkiDroid that carry Tamkeen's own mark (a "tk-" guid or a "tamkeen-id::" tag):
     * { notes: [{ id, guid, tags }] }. Only those three things are read. The app uses it to see that a
     * card it made was moved to another deck, so it does not make the card a second time.
     */
    @PluginMethod
    public void marked(PluginCall call) {
        guarded(call, () -> {
            JSArray rows = new JSArray();
            Set<Long> seen = new HashSet<>();
            String[] columns = { "_id", "guid", "tags" };
            try (Cursor c = resolver().query(NOTES_SQL, columns, "guid like 'tk-v%'", null, null)) {
                addMarked(c, rows, seen);
            }
            try (Cursor c = resolver().query(NOTES, columns, "\"tag:tamkeen-id::*\"", null, null)) {
                addMarked(c, rows, seen);
            }
            JSObject out = new JSObject();
            out.put("notes", rows);
            call.resolve(out);
        });
    }

    private static void addMarked(Cursor c, JSArray rows, Set<Long> seen) throws JSONException {
        while (c != null && c.moveToNext()) {
            if (!seen.add(c.getLong(0))) continue;
            JSObject n = new JSObject();
            n.put("id", c.getLong(0));
            n.put("guid", c.getString(1));
            String tags = c.getString(2) == null ? "" : c.getString(2).trim();
            n.put("tags", tags.isEmpty() ? new JSArray() : new JSArray(tags.split("\\s+")));
            rows.put(n);
        }
    }

    // ----- writing -----

    /**
     * Make sure the deck and the Tamkeen card layout exist: { deckId, modelId, fields, madeDeck, madeModel }.
     * A layout already called by that name is used as it is and never changed.
     * model = { name, fields: [names], front, back, css }
     */
    @PluginMethod
    public void prepare(PluginCall call) {
        guarded(call, () -> {
            String deck = call.getString("deck", "");
            JSObject model = call.getObject("model");
            String name = model.getString("name");
            JSObject out = new JSObject();

            long deckId = -1;
            try (Cursor c = resolver().query(DECKS, new String[] { "deck_id", "deck_name" }, null, null, null)) {
                while (c != null && c.moveToNext()) {
                    if (c.getString(1).equalsIgnoreCase(deck)) deckId = c.getLong(0);
                }
            }
            out.put("madeDeck", deckId < 0);
            if (deckId < 0) {
                ContentValues values = new ContentValues();
                values.put("deck_name", deck);
                Uri made = resolver().insert(DECKS, values);
                if (made == null) throw new Exception("the deck could not be made");
                deckId = Long.parseLong(made.getLastPathSegment());
            }

            long modelId = -1;
            try (Cursor c = resolver().query(MODELS, new String[] { "_id", "name" }, null, null, null)) {
                while (c != null && c.moveToNext()) {
                    if (c.getString(1).equals(name)) modelId = c.getLong(0);
                }
            }
            out.put("madeModel", modelId < 0);
            if (modelId < 0) {
                org.json.JSONArray fields = model.getJSONArray("fields");
                StringBuilder joined = new StringBuilder();
                for (int i = 0; i < fields.length(); i++) joined.append(i == 0 ? "" : SEPARATOR).append(fields.getString(i));
                ContentValues values = new ContentValues();
                values.put("name", name);
                values.put("field_names", joined.toString());
                values.put("num_cards", 1);
                values.put("css", model.getString("css"));
                values.put("deck_id", deckId);
                values.put("sort_field_index", 0);
                Uri made = resolver().insert(MODELS, values);
                if (made == null) throw new Exception("the card layout could not be made");
                modelId = Long.parseLong(made.getLastPathSegment());
                ContentValues template = new ContentValues();
                template.put("question_format", model.getString("front"));
                template.put("answer_format", model.getString("back"));
                resolver().update(Uri.withAppendedPath(Uri.withAppendedPath(made, "templates"), "0"), template, null, null);
            }
            out.put("deckId", deckId);
            out.put("modelId", modelId);
            out.put("fields", fieldNames(modelId));
            call.resolve(out);
        });
    }

    /** Add one note to the deck: { id }. fields = one value per field of the layout, in order. */
    @PluginMethod
    public void addNote(PluginCall call) {
        guarded(call, () -> {
            long deckId = call.getLong("deckId", 0L);
            long modelId = call.getLong("modelId", 0L);
            JSArray fields = call.getArray("fields");
            JSArray tags = call.getArray("tags", new JSArray());
            StringBuilder flds = new StringBuilder(), tagText = new StringBuilder();
            for (int i = 0; i < fields.length(); i++) flds.append(i == 0 ? "" : SEPARATOR).append(fields.getString(i));
            for (int i = 0; i < tags.length(); i++) tagText.append(i == 0 ? "" : " ").append(tags.getString(i));
            ContentValues values = new ContentValues();
            values.put("mid", modelId);
            values.put("flds", flds.toString());
            values.put("tags", tagText.toString());
            Uri made = resolver().insert(NOTES, values);
            if (made == null) throw new Exception("the card could not be made");
            long id = Long.parseLong(made.getLastPathSegment());
            // AnkiDroid puts a new note in its layout's usual deck: move its cards to ours if that is another.
            Uri cards = Uri.withAppendedPath(made, "cards");
            try (Cursor c = resolver().query(cards, new String[] { "ord", "deck_id" }, null, null, null)) {
                while (c != null && c.moveToNext()) {
                    if (c.getLong(1) == deckId) continue;
                    ContentValues move = new ContentValues();
                    move.put("deck_id", deckId);
                    resolver().update(Uri.withAppendedPath(cards, Integer.toString(c.getInt(0))), move, null, null);
                }
            }
            JSObject out = new JSObject();
            out.put("id", id);
            call.resolve(out);
        });
    }

    /**
     * Change a note of the deck: its Front and/or Back, and tags to add. { changed }
     * Refused (changed: false, refused: true) when the note is not in the deck.
     */
    @PluginMethod
    public void updateNote(PluginCall call) {
        guarded(call, () -> {
            String deck = call.getString("deck", "");
            long id = call.getLong("id", 0L);
            JSObject out = new JSObject();
            if (!noteInDeck(deck, id)) {
                out.put("changed", false);
                out.put("refused", true);
                call.resolve(out);
                return;
            }
            Uri uri = Uri.withAppendedPath(NOTES, Long.toString(id));
            long model;
            String[] fields;
            String tags;
            try (Cursor c = resolver().query(uri, new String[] { "mid", "flds", "tags" }, null, null, null)) {
                if (c == null || !c.moveToFirst()) throw new Exception("the card has gone");
                model = c.getLong(0);
                fields = c.getString(1).split(SEPARATOR, -1);
                tags = c.getString(2) == null ? "" : c.getString(2).trim();
            }
            ContentValues values = new ContentValues();
            JSArray names = fieldNames(model);
            boolean rewrite = false;
            for (int i = 0; i < names.length() && i < fields.length; i++) {
                String name = names.getString(i);
                String key = FRONT.equals(name) ? "front" : BACK.equals(name) ? "back" : null;
                if (key == null || call.getString(key) == null || call.getString(key).equals(fields[i])) continue;
                fields[i] = call.getString(key);
                rewrite = true;
            }
            if (rewrite) values.put("flds", TextUtils.join(SEPARATOR, fields));  // every other field exactly as it was
            JSArray add = call.getArray("addTags", new JSArray());
            StringBuilder tagText = new StringBuilder(tags);
            boolean tagged = false;
            for (int i = 0; i < add.length(); i++) {
                String tag = add.getString(i);
                if ((" " + tags.toLowerCase() + " ").contains(" " + tag.toLowerCase() + " ")) continue;
                tagText.append(tagText.length() == 0 ? "" : " ").append(tag);
                tagged = true;
            }
            if (tagged) values.put("tags", tagText.toString());
            if (values.size() > 0) resolver().update(uri, values, null, null);
            out.put("changed", rewrite);
            out.put("tagged", tagged);
            call.resolve(out);
        });
    }

    /**
     * Move a note's cards from one Tamkeen deck to another (made if missing), keeping their review
     * history: { moved, skipped }. Only cards sitting in the `deck` it comes from are moved; a card
     * on loan to a filtered deck stays there. Refused when the note is not in `deck`.
     */
    @PluginMethod
    public void moveNote(PluginCall call) {
        guarded(call, () -> {
            String deck = call.getString("deck", "");
            String to = call.getString("to", "");
            long id = call.getLong("id", 0L);
            JSObject out = new JSObject();
            if (to.trim().isEmpty() || !noteInDeck(deck, id)) {
                out.put("moved", false);
                out.put("refused", true);
                call.resolve(out);
                return;
            }
            long target = -1;
            try (Cursor c = resolver().query(DECKS, new String[] { "deck_id", "deck_name" }, null, null, null)) {
                while (c != null && c.moveToNext()) {
                    if (c.getString(1).equalsIgnoreCase(to)) target = c.getLong(0);
                }
            }
            if (target < 0) {
                ContentValues values = new ContentValues();
                values.put("deck_name", to);
                Uri made = resolver().insert(DECKS, values);
                if (made == null) throw new Exception("the deck could not be made");
                target = Long.parseLong(made.getLastPathSegment());
            }
            Set<Long> from = deckIds(deck, null);
            Uri cards = Uri.withAppendedPath(Uri.withAppendedPath(NOTES, Long.toString(id)), "cards");
            int moved = 0, skipped = 0;
            try (Cursor c = resolver().query(cards, new String[] { "ord", "deck_id" }, null, null, null)) {
                while (c != null && c.moveToNext()) {
                    if (!from.contains(c.getLong(1))) {
                        skipped++;
                        continue;
                    }
                    ContentValues move = new ContentValues();
                    move.put("deck_id", target);
                    resolver().update(Uri.withAppendedPath(cards, Integer.toString(c.getInt(0))), move, null, null);
                    moved++;
                }
            }
            out.put("moved", moved > 0);
            out.put("skipped", skipped);
            call.resolve(out);
        });
    }

    /**
     * Delete a note of the deck, with its cards and their review history. { deleted }
     * Refused when the note is not in the deck, or when any of its cards sits in another deck.
     */
    @PluginMethod
    public void deleteNote(PluginCall call) {
        guarded(call, () -> {
            String deck = call.getString("deck", "");
            long id = call.getLong("id", 0L);
            JSObject out = new JSObject();
            boolean allowed = noteInDeck(deck, id);
            if (allowed) {
                Set<Long> ids = deckIds(deck, null);
                Uri cards = Uri.withAppendedPath(Uri.withAppendedPath(NOTES, Long.toString(id)), "cards");
                try (Cursor c = resolver().query(cards, new String[] { "deck_id" }, null, null, null)) {
                    while (c != null && c.moveToNext()) allowed = allowed && ids.contains(c.getLong(0));
                }
            }
            if (!allowed) {
                out.put("deleted", false);
                out.put("refused", true);
                call.resolve(out);
                return;
            }
            int count = resolver().delete(Uri.withAppendedPath(NOTES, Long.toString(id)), null, null);
            out.put("deleted", count > 0);
            call.resolve(out);
        });
    }

    /**
     * Hand AnkiDroid a file (a word's audio clip, or the card font): { name }, the name AnkiDroid
     * stored it under, which may differ from the one asked for. data = the file in base64.
     */
    @PluginMethod
    public void addMedia(PluginCall call) {
        guarded(call, () -> {
            String name = call.getString("name", "file").replaceAll("[^A-Za-z0-9._-]", "_");
            File folder = new File(getContext().getCacheDir(), "anki-media");
            folder.mkdirs();
            File file = new File(folder, name);
            try (FileOutputStream stream = new FileOutputStream(file)) {
                stream.write(Base64.decode(call.getString("data", ""), Base64.DEFAULT));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            getContext().grantUriPermission(PACKAGE, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try {
                int dot = name.lastIndexOf('.');
                ContentValues values = new ContentValues();
                values.put("file_uri", uri.toString());
                values.put("preferred_name", dot > 0 ? name.substring(0, dot) : name);
                Uri stored = resolver().insert(MEDIA, values);
                if (stored == null || stored.getPath() == null) throw new Exception("the file was not accepted");
                JSObject out = new JSObject();
                out.put("name", new File(stored.getPath()).getName());
                call.resolve(out);
            } finally {
                getContext().revokeUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                file.delete();
            }
        });
    }
}
