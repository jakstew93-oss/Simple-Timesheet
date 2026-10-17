package com.jak.simpletimesheet

import android.content.Context

/** Remembers when data last went between the phone and watch, and why a send failed, for the connection check. */
object SyncLog {
    /** Declared by each app (res/values/wear.xml) so the other can tell it's installed. */
    const val PHONE_CAPABILITY = "simple_timesheet_phone"
    const val WATCH_CAPABILITY = "simple_timesheet_watch"

    private fun prefs(context: Context) = context.getSharedPreferences("sync-log", Context.MODE_PRIVATE)
    fun ok(context: Context, what: String) =
        prefs(context).edit().putLong("$what.ok", System.currentTimeMillis()).remove("$what.error").apply()
    fun failed(context: Context, what: String, error: Exception) =
        prefs(context).edit().putString("$what.error", (error.message ?: error.javaClass.simpleName).take(120)).apply()
    fun lastOk(context: Context, what: String): Long = prefs(context).getLong("$what.ok", 0)
    fun lastError(context: Context, what: String): String? = prefs(context).getString("$what.error", null)
}
