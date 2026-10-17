package io.github.christiangilkey.arabicpodcaststudio;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Reads the phone's clipboard for the review card's Paste button. Android's web view does not let a
 * page read the clipboard by itself, so the page asks here. Only text is read, only when the learner
 * presses Paste (the app is then in front, which Android requires), and nothing is kept.
 */
@CapacitorPlugin(name = "TamkeenClipboard")
public class ClipboardPlugin extends Plugin {

    @PluginMethod
    public void read(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            String text = "";
            try {
                ClipboardManager clipboard = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
                if (clipboard != null && clipboard.hasPrimaryClip()) {
                    ClipData clip = clipboard.getPrimaryClip();
                    if (clip != null && clip.getItemCount() > 0) {
                        CharSequence value = clip.getItemAt(0).coerceToText(getContext());
                        if (value != null) text = value.toString();
                    }
                }
            } catch (Exception e) {
                call.reject("The clipboard couldn't be read.");
                return;
            }
            JSObject result = new JSObject();
            result.put("text", text);
            call.resolve(result);
        });
    }
}
