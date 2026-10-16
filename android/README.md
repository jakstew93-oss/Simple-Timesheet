# Simple Timesheet Android app and watch

**Simple Timesheet** (https://jakstew93-oss.github.io/Simple-Timesheet/) in its own Android app, for people who want watch or home-screen widget logging. Everyone else keeps using the web app. The app loads the live web app, so web changes reach it straight away and it still works offline. It works the same way, with the same rules, as the MDS Timesheet app.

Inside the app:
- Watch taps (Timesheet Log tile on a Galaxy Watch or Pixel Watch) and widget taps go straight into Today's log as they happen (`native-bridge.js` pulls them from the app every few seconds). When Finish is tapped on the watch, a notification opens the app.
- It works both ways: times stamped or typed in Today's log on the phone are sent to the watch (`STNative.syncDay`, Data Layer path `/st/day`), so the watch carries on from the phone's last stage. Reset on the phone clears the day from the watch, and Save closes it. Each watch tap is brought into Today's log once, so times corrected or cleared on the phone stay that way.
- Downloads (CSV, PDFs, backups) save to Downloads/Simple Timesheet, sharing uses Android's share menu, receipt photos use the camera or gallery, and the weather card can use location.
- **Moving data in:** the app has its own storage, separate from Chrome. In the web app use Settings → Backup → Download backup, then in the app use Settings → Backup → Restore.
- **Updates:** every signed build from `main` is published as a GitHub release (`app-v<version>`, with `simple-timesheet.apk` and `simple-timesheet-watch.apk`). The app checks the latest release each time it opens and offers to install it; Settings → Simple Timesheet app → Check for updates checks on demand. Android asks once to allow the app to install updates.

## The rules (shared by the phone, widget and watch)

- Each tap takes the time first, before any saving, and moves Start → On site → Off site → Finish. The tap after Finish starts a new set.
- Taps always log against the current day. A set left unfinished for 18 hours or more is treated as forgotten, so the next tap starts today's set; a shift that runs past midnight (10am to 1am) still finishes normally, and stays on the day it started.
- Watch sets and widget sets are kept separate.
- A tap is never brought into Today's log twice, and never overwrites times already there from somewhere else (you get a "Watch times are waiting" message instead: save or reset first).
- The tile's button names the exact stage it records, so a tile refresh can't log the same stage twice; the watch app ignores a second press within 1.5 seconds.

## Home-screen widget

One button. Each tap captures the phone clock immediately, saves it, and advances Start → On site → Off site → Finish. Long-press the home screen, choose Widgets, and add Simple Timesheet.

## Galaxy Watch and Pixel Watch (Wear OS)

**Timesheet Log** works on any Wear OS 3 or newer watch, including the Galaxy Watch (4 and later, such as the Watch 8 Classic) and every Google Pixel Watch. It records the four stages from a tile or the app's big round button, buzzes to confirm, and sends each set to the phone app over the watch's normal Bluetooth link. When Finish is tapped the phone shows **Day recorded on watch**. It can sit alongside MDS Log on the same watch. The watch must be paired with an Android phone that has the Simple Timesheet app (Wear OS watches don't pair with iPhones).

The watch app has the same application ID as the phone app (`com.jak.simpletimesheet`) and must be signed with the same key. Builds sign both with the key in the `ST_SIGNING_KEYSTORE` repository secret (a base64 PKCS12 keystore, alias `st`, password `simpletimesheet`), so later builds install over earlier ones. Without the secret the workflow warns and falls back to a throwaway key and makes no release; then install both APKs from the same run (artifacts `simple-timesheet-app` and `simple-timesheet-watch`).

Installing on the watch (one-off). First turn on Developer options:
- **Galaxy Watch:** Settings → About watch → Software information → tap **Software version** seven times.
- **Pixel Watch:** Settings → System → About → Versions → tap **Build number** seven times.

Then:
1. Settings → Developer options → turn on **ADB debugging** and **Wireless debugging** (watch and phone on the same Wi-Fi).
2. Install `simple-timesheet-watch.apk` with a phone app such as Bugjaeger or Easy Fire Tools (pair using the code shown under Wireless debugging), or from a computer with `adb pair`, `adb connect` and `adb install simple-timesheet-watch.apk`.
3. Add the tile:
   - **Galaxy Watch:** long-press the watch face → Tiles → add **Timesheet Log**.
   - **Pixel Watch:** swipe left past your tiles to the end → **Add tiles** (or long-press any tile) → add **Timesheet Log**.

Run `gradle testDebugUnitTest assembleDebug` from `android/`. The GitHub workflow (`.github/workflows/android.yml`) runs the tests and builds both APKs.
