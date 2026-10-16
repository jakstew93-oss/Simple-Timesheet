package com.jak.simpletimesheet

import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

data class CaptureTime(val epochMillis: Long, val offsetSeconds: Int) {
    fun localTime() = Instant.ofEpochMilli(epochMillis).atOffset(ZoneOffset.ofTotalSeconds(offsetSeconds))
    fun timeLabel(): String = localTime().format(DateTimeFormatter.ofPattern("HH:mm:ss"))
    fun shortLabel(): String = localTime().format(DateTimeFormatter.ofPattern("HH:mm"))
}

/**
 * One day's times. On the watch, [baseCount] leading times came from the phone app (its copy of the day
 * at revision [base]); the rest were tapped on the watch. [seq] goes up with every change on the watch,
 * so the phone can tell a newer copy from an older one. A [closed] set takes no more taps.
 */
data class CaptureRun(
    val id: String,
    val times: List<CaptureTime>,
    val source: String = PHONE,
    val base: Long = 0,
    val baseCount: Int = 0,
    val seq: Long = 0,
    val closed: Boolean = false,
) {
    val complete get() = times.size == 4

    companion object {
        const val PHONE = "phone"
        const val WATCH = "watch"
        val STAGE_LABELS = listOf("Start", "On site", "Off site", "Finish")
        val ACTION_LABELS = listOf("START WORK", "ARRIVED ON SITE", "LEAVING SITE", "FINISH WORK")
        // A set left unfinished this long is treated as forgotten, so the next tap starts today's set.
        // 18 hours still lets a shift that runs past midnight carry on.
        const val OPEN_LIMIT_MILLIS = 18L * 60 * 60 * 1000

        /** True while [run] is still taking taps at [now]: unfinished, not closed and started within [OPEN_LIMIT_MILLIS]. */
        fun isOpen(run: CaptureRun?, now: Long) =
            run != null && !run.complete && !run.closed && now - run.times.first().epochMillis < OPEN_LIMIT_MILLIS

        /** Index into [STAGE_LABELS] of the next tap from [source] at [now]. */
        fun nextIndex(runs: List<CaptureRun>, source: String, now: Long): Int {
            val last = runs.lastOrNull { it.source == source }
            return if (isOpen(last, now)) last!!.times.size else 0
        }

        /** Adds [tap] to the open set from [source], or starts a new set. Phone and watch sets never mix. */
        fun append(runs: List<CaptureRun>, tap: CaptureTime, source: String = PHONE, newId: () -> String): List<CaptureRun> {
            val last = runs.lastOrNull { it.source == source }
            if (!isOpen(last, tap.epochMillis)) return runs + CaptureRun(newId(), listOf(tap), source, seq = 1)
            return runs.map { if (it.id == last!!.id) it.copy(times = it.times + tap, seq = it.seq + 1) else it }
        }

        /** Saves a set received from the watch if it is newer than the copy held. Returns the previous copy. */
        fun upsert(runs: List<CaptureRun>, incoming: CaptureRun): Pair<List<CaptureRun>, CaptureRun?> {
            val existing = runs.firstOrNull { it.id == incoming.id }
            val newer = existing == null || incoming.seq > existing.seq ||
                (incoming.seq == existing.seq && incoming.times.size > existing.times.size)
            if (!newer) return runs to existing
            val updated = (runs.filter { it.id != incoming.id } + incoming).sortedBy { it.times.first().epochMillis }
            return updated to existing
        }

        /**
         * Takes over the day as the phone app has it, so the watch carries on from the phone's last stage.
         * Watch taps the phone hasn't seen yet are kept after the phone's times. Reset on the phone clears
         * the day from the watch, and Save closes it.
         */
        fun adopt(runs: List<CaptureRun>, day: PhoneDay, now: Long): List<CaptureRun> {
            val existing = runs.firstOrNull { it.id == day.id && it.source == WATCH }
            if (existing != null && day.rev <= existing.base) return runs
            return when (day.state) {
                PhoneDay.CLEARED -> runs.filter { it !== existing }
                PhoneDay.SAVED -> runs.map { if (it === existing) it.copy(base = day.rev, closed = true, seq = it.seq + 1) else it }
                else -> {
                    if (day.times.isEmpty()) return runs
                    val unseen = existing?.times?.drop(existing.baseCount)
                        ?.filter { it.epochMillis !in day.seen && it.epochMillis >= day.times.last().epochMillis }.orEmpty()
                    val adopted = CaptureRun(day.id, (day.times + unseen).take(4), WATCH, day.rev, day.times.size.coerceAtMost(4),
                        (existing?.seq ?: 0) + 1)
                    val rest = runs.filter { it !== existing }
                    // An earlier day being filled in on the phone is kept, but doesn't get in the way of today's.
                    if (!isOpen(adopted, now)) return (rest + adopted).sortedBy { it.times.first().epochMillis }
                    // The phone's day is now the one in progress; another unfinished watch set stops taking taps.
                    rest.map { if (it.source == WATCH && isOpen(it, now)) it.copy(closed = true) else it } + adopted
                }
            }
        }
    }
}

/** The day in progress in the phone app's Quick Start, sent to the watch. */
data class PhoneDay(val id: String, val state: String, val rev: Long, val times: List<CaptureTime>, val seen: Set<Long>) {
    companion object {
        const val ACTIVE = "active"
        const val CLEARED = "cleared"
        const val SAVED = "saved"
    }
}
