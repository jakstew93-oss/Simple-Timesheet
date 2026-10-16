package com.jak.simpletimesheet.wear

import android.content.Context
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.wear.tiles.TileService
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import com.jak.simpletimesheet.CaptureRun
import com.jak.simpletimesheet.CaptureStore
import com.jak.simpletimesheet.CaptureTime
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Records watch taps and sends each set to the Simple Timesheet phone app. */
object WatchLog {
    private const val PATH_PREFIX = "/st/run/"
    private const val KEY_RUN = "run"
    /** Where the phone app puts the day in progress (see PhoneDayService). */
    const val DAY_PATH = "/st/day"
    const val KEY_DAY = "day"
    val BUTTON_LABELS = listOf("START", "ON SITE", "OFF SITE", "FINISH")

    fun runs(context: Context): List<CaptureRun> = try { CaptureStore.read(context) } catch (_: Exception) { emptyList() }
    fun current(runs: List<CaptureRun>) = runs.lastOrNull { it.source == CaptureRun.WATCH }
    fun nextIndex(runs: List<CaptureRun>, now: Long) = CaptureRun.nextIndex(runs, CaptureRun.WATCH, now)

    /** Saves the time of a tap at [tappedAt] and sends the set to the phone. */
    fun tap(context: Context, tappedAt: Long, updateTile: Boolean = true): CaptureRun {
        val offset = ZoneId.systemDefault().rules.getOffset(Instant.ofEpochMilli(tappedAt)).totalSeconds
        val run = CaptureStore.append(context, CaptureTime(tappedAt, offset), CaptureRun.WATCH)
        send(context, run)
        buzz(context)
        if (updateTile) TileService.getUpdater(context).requestUpdate(LogTileService::class.java)
        return run
    }

    /** Uses the Data Layer, so the set reaches the phone even if it reconnects later. */
    private fun send(context: Context, run: CaptureRun) {
        val request = PutDataMapRequest.create(PATH_PREFIX + run.id).apply {
            dataMap.putString(KEY_RUN, CaptureStore.json(run).toString())
            dataMap.putLong("sentAt", System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        Wearable.getDataClient(context).putDataItem(request)
    }

    @Suppress("DEPRECATION")
    private fun buzz(context: Context) {
        try { context.getSystemService(Vibrator::class.java)?.vibrate(VibrationEffect.createOneShot(120, VibrationEffect.DEFAULT_AMPLITUDE)) }
        catch (_: Exception) { /* A missed buzz shouldn't stop the time being saved. */ }
    }

    fun todayLabel(): String = LocalDate.now().format(DateTimeFormatter.ofPattern("EEE d MMM"))

    fun status(runs: List<CaptureRun>, now: Long): String {
        val run = current(runs)
        val today = LocalDate.now()
        return when {
            run == null -> "Tap to log today’s start time"
            run.complete && run.times.first().localTime().toLocalDate() == today -> "Day logged ✓ Sent to your phone"
            run.closed && run.times.first().localTime().toLocalDate() == today -> "Day saved on your phone ✓"
            !CaptureRun.isOpen(run, now) -> "Tap to log today’s start time"
            else -> run.times.mapIndexed { i, t -> CaptureRun.STAGE_LABELS[i] + " " + t.shortLabel() }.joinToString("\n")
        }
    }

    /**
     * The tile's button ID names the exact stage it records, so a tile refresh that repeats an
     * old click can never log the same stage twice.
     */
    fun clickId(runs: List<CaptureRun>, now: Long): String {
        val run = current(runs)
        return if (CaptureRun.isOpen(run, now)) "log-${run!!.id}-${run.times.size}" else "log-new-${run?.id ?: "none"}"
    }
}
