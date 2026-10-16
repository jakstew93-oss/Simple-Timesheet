package com.jak.simpletimesheet

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.util.Base64
import android.webkit.JavascriptInterface
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import org.json.JSONArray
import org.json.JSONObject

/** What the web page can ask the app to do, as window.STNative (see native-bridge.js). */
class NativeBridge(private val activity: MainActivity) {
    /** Watch and widget sets from the last three days, for the page to bring into Quick Start. */
    @JavascriptInterface fun pendingRuns(): String {
        val cutoff = System.currentTimeMillis() - 3L * 24 * 60 * 60 * 1000
        val runs = try { CaptureStore.read(activity) } catch (_: Exception) { emptyList() }
        return JSONArray().apply {
            runs.filter { it.times.last().epochMillis >= cutoff }.forEach { put(CaptureStore.json(it).put("source", it.source)) }
        }.toString()
    }

    /** Sends the day in Quick Start to the watch, so it carries on from the phone's last stage. */
    @JavascriptInterface fun syncDay(json: String) {
        try { CaptureStore.dayFromJson(JSONObject(json)) } catch (_: Exception) { return }
        val request = PutDataMapRequest.create(WatchSyncService.DAY_PATH).apply {
            dataMap.putString(WatchSyncService.KEY_DAY, json)
            dataMap.putLong("sentAt", System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        Wearable.getDataClient(activity).putDataItem(request)
    }

    @JavascriptInterface fun saveFile(name: String, mime: String, base64: String) {
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        activity.runOnUiThread { activity.saveDownload(name, mime, bytes) }
    }

    @JavascriptInterface fun shareFile(name: String, mime: String, base64: String, title: String) {
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        activity.runOnUiThread { activity.shareBytes(name, mime, bytes, title) }
    }

    @JavascriptInterface fun shareText(title: String, text: String) = activity.runOnUiThread {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, title).putExtra(Intent.EXTRA_TEXT, text)
        activity.startActivity(Intent.createChooser(send, title.ifBlank { "Share" }))
    }

    @JavascriptInterface fun copyText(text: String) = activity.runOnUiThread {
        activity.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Simple Timesheet", text))
    }

    @JavascriptInterface fun appVersion(): String = Updater.versionCode(activity).toString()

    @JavascriptInterface fun checkForUpdates() = activity.runOnUiThread { Updater.check(activity, manual = true) }
}
