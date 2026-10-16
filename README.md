# Simple Timesheet

A free timesheet app for your phone. Log your hours with one button, keep track of expenses with receipt photos, and send your boss a tidy PDF with **your own company's name and logo** on it.

No account, no sign-up, no adverts. Everything you enter stays on your phone, and it works with no signal.

## What it does

- **One-tap logging.** Tap the big button as you go: *Start → On site → Off site → Finish*. Each tap records the time. You can change any time by tapping it.
- **Weekly or monthly.** Choose *Settings → Timesheets by: Week or Month*. On Month, the Week tab becomes a Month tab and the hours, pay, PDF, spreadsheet and *clear and start fresh* all cover the whole month.
- **Your week at a glance.** See each day's hours and the week's total. Add or fix entries by hand, or clear the week and start fresh.
- **Pay.** Add your hourly rate and travel rate in Settings. On site → Off site is paid at the hourly rate; Start → On site and Off site → Finish at the travel rate. A day with no on-site times is paid at the hourly rate. Pay shows on the Week page, the PDF and the spreadsheet.
- **Sign and date.** Draw your signature once in Settings. It goes at the bottom of your PDFs with the date you choose.
- **Timesheet PDF.** One tap makes a weekly timesheet with your company logo, name, address and contact details, ready to email or print. There's also a spreadsheet (CSV) download.
- **Expenses.** Add parking, fuel, materials, overnight stays, mileage (worked out at your rate per mile) and more. Snap a photo of the receipt. Make a monthly expense claim PDF with a page for each receipt.
- **Weather.** Today's forecast on the main screen, with a heads-up for rain, ice or wind.
- **Themes.** Forest, Paper, Midnight, Sand and Slate.
- **Team setup link.** Fill in the company details once and send everyone a link that sets up their app for them.
- **Android app, widget, Galaxy Watch and Pixel Watch.** An optional Android app adds a one-tap home-screen widget and a watch tile for any Wear OS watch. Taps from the watch, widget and phone all go into Today's log, and each carries on from the other. See [android/README.md](android/README.md).
- **Backup.** Save everything to one file and restore it on a new phone.

## Getting started

1. Open the app on your phone.
2. Go to **Settings**. Add your name, your company's details and your logo.
3. Add it to your home screen so it opens like a normal app:
   - **Android (Chrome):** tap ⋮ → *Add to home screen* (or *Install app*).
   - **iPhone (Safari):** tap the Share button → *Add to Home Screen*.

### Setting up a whole team

Fill in the company details on your phone, then go to **Settings → Set up your team → Share setup link** and send the link to your team (WhatsApp, text, email). When they open it, the company details fill in by themselves. They just add their own name. (The logo isn't in the link because it's too big; they can add it themselves.)

## Your data

Everything is stored on your own phone, in the browser. Nothing is sent anywhere, except a location or town name to [Open-Meteo](https://open-meteo.com) for the weather, which you can switch off in Settings.

Because it's on your phone, **clearing your browser data deletes it**. Use **Settings → Backup** now and then, and keep the file somewhere safe like Google Drive.

## Make your own copy

Anyone can host their own copy for free on GitHub:

1. Click **Fork** at the top of this page.
2. In your copy, go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
3. After a minute your app is live at `https://<your-username>.github.io/simple-timesheet/`.

## For developers

Plain HTML, CSS and JavaScript with no build step. PDFs are made in the browser with [pdf-lib](https://pdf-lib.js.org) (MIT licence, in `vendor/`) and previewed with Mozilla's [pdf.js](https://mozilla.github.io/pdf.js/) 3.11.174 (Apache 2.0 licence, in `vendor/pdfjs/`), because Chrome on Android can't show a PDF inside a page.

| File | What's in it |
| --- | --- |
| `core.js` | Hours, weeks, CSV, setup links, expense amounts (no screen code) |
| `pdf.js` | The timesheet and expense claim PDFs |
| `store.js` | Saving to the phone: localStorage, plus IndexedDB for expenses |
| `weather.js` | The weather card |
| `app.js` | Screens and buttons |
| `native-bridge.js` | Links the page to the Android app (watch and widget times, downloads, sharing). Does nothing in a normal browser. |
| `android/` | The Android phone app, widget and Wear OS watch app |
| `sw.js` | Offline support. Bump `VERSION` (and the `?v=` numbers in `index.html`) when you change a file. |

Run the tests with Node 22 or newer:

```sh
node --test tests/*.cjs
```

To try it locally, serve the folder (for example `python3 -m http.server`) and open http://localhost:8000.

## Licence

MIT. See [LICENSE](LICENSE).
