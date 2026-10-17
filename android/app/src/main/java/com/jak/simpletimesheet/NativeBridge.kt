package com.jak.simpletimesheet

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.util.Base64
import android.webkit.JavascriptInterface
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

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
            .addOnSuccessListener { SyncLog.ok(activity, "toWatch") }
            .addOnFailureListener { SyncLog.failed(activity, "toWatch", it) }
    }

    /** For Settings → Check watch connection: which watches are connected, which have Timesheet Log, and when data last went each way. */
    @JavascriptInterface fun watchStatus(): String {
        val out = JSONObject()
        try {
            val nodes = Tasks.await(Wearable.getNodeClient(activity).connectedNodes, 8, TimeUnit.SECONDS)
            out.put("connected", JSONArray(nodes.map { it.displayName }))
            val app = Tasks.await(Wearable.getCapabilityClient(activity).getCapability(SyncLog.WATCH_CAPABILITY, CapabilityClient.FILTER_ALL), 8, TimeUnit.SECONDS)
            out.put("withApp", JSONArray(app.nodes.map { it.displayName }))
        } catch (error: Exception) {
            out.put("error", (error.cause?.message ?: error.message ?: error.javaClass.simpleName).take(160))
        }
        out.put("fromWatch", SyncLog.lastOk(activity, "fromWatch")).put("toWatch", SyncLog.lastOk(activity, "toWatch"))
        SyncLog.lastError(activity, "toWatch")?.let { out.put("toWatchError", it) }
        return out.toString()
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
