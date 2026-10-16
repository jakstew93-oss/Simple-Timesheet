package com.jak.simpletimesheet

import android.content.Context
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException
import java.util.UUID

object CaptureStore {
    private fun file(context: Context) = AtomicFile(File(context.filesDir, "quick-captures-v1.json"))
    @Synchronized fun read(context: Context): List<CaptureRun> {
        val source = try { file(context).openRead().bufferedReader().use { it.readText() } }
        catch (_: FileNotFoundException) { return emptyList() }
        val array = JSONArray(source)
        return (0 until array.length()).map { fromJson(array.getJSONObject(it)) }
    }
    private fun times(array: JSONArray) = (0 until array.length()).map { j ->
        val time = array.getJSONObject(j)
        CaptureTime(time.getLong("epochMillis"), time.getInt("offsetSeconds"))
    }
    private fun timesJson(times: List<CaptureTime>) = JSONArray().apply {
        times.forEach { put(JSONObject().put("epochMillis", it.epochMillis).put("offsetSeconds", it.offsetSeconds)) }
    }
    fun fromJson(run: JSONObject): CaptureRun {
        val times = times(run.getJSONArray("times"))
        require(times.size in 1..4)
        return CaptureRun(run.getString("id"), times, run.optString("source", CaptureRun.PHONE),
            run.optLong("base"), run.optInt("baseCount"), run.optLong("seq"), run.optBoolean("closed"))
    }
    fun json(run: CaptureRun): JSONObject = JSONObject().put("id", run.id).put("times", timesJson(run.times)).apply {
        if (run.source != CaptureRun.PHONE) put("source", run.source)
        if (run.base != 0L) put("base", run.base)
        if (run.baseCount != 0) put("baseCount", run.baseCount)
        if (run.seq != 0L) put("seq", run.seq)
        if (run.closed) put("closed", true)
    }
    /** Reads the day the phone app sends to the watch (see native-bridge.js). */
    fun dayFromJson(day: JSONObject): PhoneDay {
        val times = day.optJSONArray("times")?.let { times(it) }.orEmpty()
        require(times.size <= 4)
        val seen = day.optJSONArray("seen")?.let { s -> (0 until s.length()).map { s.getLong(it) } }.orEmpty().toSet()
        return PhoneDay(day.getString("id"), day.getString("state"), day.getLong("rev"), times, seen)
    }
    private fun write(context: Context, runs: List<CaptureRun>) {
        val data = JSONArray().apply { runs.forEach { put(json(it)) } }.toString().toByteArray(Charsets.UTF_8)
        val target = file(context)
        val stream = target.startWrite()
        try { stream.write(data); target.finishWrite(stream) }
        catch (error: Exception) { target.failWrite(stream); throw error }
    }
    /** Records [tap] and returns the set it was added to. */
    @Synchronized fun append(context: Context, tap: CaptureTime, source: String = CaptureRun.PHONE): CaptureRun {
        val runs = CaptureRun.append(read(context), tap, source) { UUID.randomUUID().toString() }
        write(context, runs)
        return runs.last { it.source == source && it.times.last() == tap }
    }
    /** Saves a set from the watch and returns the copy that was there before, if any. */
    @Synchronized fun upsert(context: Context, run: CaptureRun): CaptureRun? {
        val (runs, before) = CaptureRun.upsert(read(context), run)
        write(context, runs)
        return before
    }
    /** On the watch: takes over the day as the phone app has it. */
    @Synchronized fun adopt(context: Context, day: PhoneDay) {
        write(context, CaptureRun.adopt(read(context), day, System.currentTimeMillis()))
    }
}
