// Spotify in Tamkeen. In a computer's web browser the Tamkeen browser extension (extension/) adds a
// lyrics panel beside Spotify's web player (open.spotify.com): the song's lyrics karaoke-style, every
// word clickable for Tamkeen's word popup, and words saved there come into the Vocab through the web
// app (web-extension.js). Spotify plays nowhere else in Tamkeen: its sound is copy-protected, its
// phone apps can't be added to, and its developer platform offers no lyrics. So the Library's + sheet
// has a Spotify entry everywhere, which explains what is possible where (spotifyReason, spotifyText).
// (Nothing here touches the page when the file loads: tests/js/spotify.test.mjs.)
import { t } from "./i18n.js";

/** Spotify's web player. */
export const SPOTIFY = "https://open.spotify.com/";

/**
 * Why the lyrics panel isn't here in this version of the app, or "" when it is (the web app on a
 * computer, with the extension). What netflixSupport() found out here says it ({reason, extension}:
 * the same browser extension, the same computers):
 *   "web-computer"  the web app on a computer, without the extension yet
 *   "desktop"       the computer app (Spotify plays in a web browser, with the extension)
 *   "web-phone"     the web app on a phone or tablet
 *   "phone-app"     the Android or iPhone app
 */
export function spotifyReason({ platform = "", reason = "", extension = false } = {}) {
  if (platform === "desktop") return "desktop";
  if (extension) return "";
  if (reason === "web-computer") return "web-computer";
  if (reason === "web-phone") return "web-phone";
  return "phone-app";
}

/** What to say where the lyrics panel isn't: {title, lines}. */
export function spotifyText(reason) {
  const saved = t("Words you save there arrive in your Vocab, on every device that syncs.");
  if (reason === "web-computer") {
    return {
      title: t("Spotify needs the Tamkeen extension"),
      lines: [
        t("With the Tamkeen extension in Chrome or Edge, Spotify's web player gets a panel beside it with the song's lyrics, line by line as it plays, and every word can be clicked."),
        t("Words you save there come back here, to your Vocab."),
      ],
    };
  }
  if (reason === "desktop") {
    return {
      title: t("Spotify works in a web browser"),
      lines: [
        t("Song lyrics as words you can click work with Spotify's web player in Chrome or Edge, with the Tamkeen extension: open the Tamkeen web app there and choose Spotify to add it."),
        saved,
      ],
    };
  }
  return {
    title: t("Spotify's lyrics need a computer"),
    lines: [
      reason === "web-phone"
        ? t("On a phone, Spotify's lyrics can't be shown as words you can click: browsers on phones don't take the Tamkeen extension.")
        : t("Tamkeen can't add its lyrics to Spotify's own app."),
      t("On a computer, with the Tamkeen extension in Chrome or Edge, Spotify's web player shows the song's lyrics as words you can click."),
      saved,
    ],
  };
}
