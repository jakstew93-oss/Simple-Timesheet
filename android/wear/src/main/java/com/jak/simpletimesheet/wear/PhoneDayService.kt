package com.jak.simpletimesheet.wear

import androidx.wear.tiles.TileService
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService
import com.jak.simpletimesheet.CaptureStore
import com.jak.simpletimesheet.SyncLog
import org.json.JSONObject

/** Takes over the day from the phone app, so the watch carries on from whatever was logged there. */
class PhoneDayService : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) {
        var changed = false
        for (event in events) {
            if (event.type != DataEvent.TYPE_CHANGED || event.dataItem.uri.path != WatchLog.DAY_PATH) continue
            val json = DataMapItem.fromDataItem(event.dataItem).dataMap.getString(WatchLog.KEY_DAY) ?: continue
            try { CaptureStore.adopt(this, CaptureStore.dayFromJson(JSONObject(json))); changed = true; SyncLog.ok(this, "fromPhone") } catch (_: Exception) { }
        }
        if (changed) TileService.getUpdater(this).requestUpdate(LogTileService::class.java)
    }
}
