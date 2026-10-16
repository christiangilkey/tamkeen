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
