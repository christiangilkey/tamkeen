# Tamkeen (تمكين)

Learn a language from real material: podcasts, YouTube videos with captions and web pages become text where
every word can be tapped to hear it and see what it means in that sentence. Desktop (Windows, macOS, Linux) and
Android. Releases: https://github.com/christiangilkey/tamkeen/releases

## Opening a YouTube video in Tamkeen from another app

Another app on the same device can ask Tamkeen to play a YouTube video in its own player (captions you can tap):

```
tamkeen://watch?v=<11-character YouTube video id>[&t=<start, in seconds>][&from=<your app's name>]
```

- **Windows**: start `%LOCALAPPDATA%\Programs\ArabicPodcastStudio\ArabicPodcastStudio.exe` with the link as its
  only argument, or open the link itself (the installer registers the `tamkeen` protocol). If Tamkeen is
  already open, the new process hands the link to it and exits, and the open window comes to the front.
- **Android**: send an `ACTION_VIEW` intent with the link as its data and
  `setPackage("io.github.christiangilkey.arabicpodcaststudio")`. Declare that package in your manifest's
  `<queries>` to check that Tamkeen is installed.

A video already in the library opens straight away; any other is added first. A video with no captions (for
example a live stream) shows "No captions available for this video." Supported from the first release after
v0.21.0. Details: `app/applink.py`.

## Showing Tamkeen's player inside another app (Windows)

Another app can show just Tamkeen's player for one video (the video with its clickable captions; tapping a
word opens its meaning) inside its own window, in an `<iframe>` or Electron `<webview>`:

1. Find the running Tamkeen: `%APPDATA%\ArabicPodcastStudio\instance.json` holds its `port`.
   `GET http://127.0.0.1:<port>/api/app/info` answers `{"app": "Tamkeen", "version": "…", "embed": 1}`
   (ask from your app's main process, not from a web page: Tamkeen refuses requests from web pages).
2. Not running (no file, or nothing answers)? Start
   `%LOCALAPPDATA%\Programs\ArabicPodcastStudio\ArabicPodcastStudio.exe --background`. It runs with its
   window hidden, does nothing if Tamkeen is already running, and closes itself after 10 minutes with no
   player open and its window never shown. Then wait for `instance.json` and `/api/app/info`.
3. Show `http://127.0.0.1:<port>/embed?v=<11-character YouTube id>[&t=<start, in seconds>]`. Framed, the
   page tells its host how it went: `postMessage({source: "tamkeen", event: "ready", title})` or
   `{source: "tamkeen", event: "error", error}` (for example "No captions available for this video.").

Opening Tamkeen while it runs (from the Start menu, or a `tamkeen://` link) shows that same copy's window:
only one Tamkeen runs at a time. Supported from the first release after v0.32.0; older versions answer
`/api/app/info` with 404.
