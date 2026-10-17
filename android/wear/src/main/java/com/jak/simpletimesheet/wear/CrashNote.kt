package com.jak.simpletimesheet.wear

import android.content.Context
import java.io.File

/** Remembers why the watch app last closed unexpectedly, so the next launch can show it. */
object CrashNote {
    private fun file(context: Context) = File(context.filesDir, "last-crash.txt")

    fun install(context: Context) {
        val app = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        if (previous is Recorder) return
        Thread.setDefaultUncaughtExceptionHandler(Recorder(app, previous))
    }

    /** The reason saved last time, if any; it's cleared once read. */
    fun take(context: Context): String? {
        val f = file(context)
        if (!f.exists()) return null
        return try { f.readText().take(160) } catch (_: Exception) { null } finally { f.delete() }
    }

    private class Recorder(val context: Context, val previous: Thread.UncaughtExceptionHandler?) : Thread.UncaughtExceptionHandler {
        override fun uncaughtException(thread: Thread, error: Throwable) {
            try {
                val where = error.stackTrace.firstOrNull { it.className.startsWith("com.jak.") } ?: error.stackTrace.firstOrNull()
                file(context).writeText("${error.javaClass.simpleName}: ${error.message ?: ""}${where?.let { " at ${it.fileName}:${it.lineNumber}" } ?: ""}")
            } catch (_: Exception) { }
            previous?.uncaughtException(thread, error)
        }
    }
}
