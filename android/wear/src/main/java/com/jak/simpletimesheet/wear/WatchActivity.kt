package com.jak.simpletimesheet.wear

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Gravity
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/** One big button: Start → On site → Off site → Finish for today. */
class WatchActivity : Activity() {
    private lateinit var date: TextView
    private lateinit var button: Button
    private lateinit var status: TextView
    private var lastTap = 0L
    // Why the app closed last time, shown until the next tap.
    private var notice: String? = null
    private val handler = Handler(Looper.getMainLooper())
    // Picks up times logged in the phone app while this screen is open.
    private val refresh = object : Runnable { override fun run() { render(); handler.postDelayed(this, 3000) } }

    override fun onCreate(savedInstanceState: Bundle?) {
        CrashNote.install(this)
        super.onCreate(savedInstanceState)
        val width = resources.displayMetrics.widthPixels
        val column = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER }
        date = TextView(this).apply { setTextColor(Color.rgb(160, 175, 168)); textSize = 13f; gravity = Gravity.CENTER }
        button = Button(this).apply {
            textSize = 17f; setTypeface(typeface, Typeface.BOLD); setTextColor(Color.rgb(9, 41, 24))
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.rgb(112, 227, 157)) }
            setOnClickListener { record() }
        }
        status = TextView(this).apply {
            setTextColor(Color.rgb(237, 245, 239)); textSize = 12f; gravity = Gravity.CENTER; maxLines = 4
        }
        val size = (width * 0.48).toInt()
        column.addView(date)
        column.addView(button, LinearLayout.LayoutParams(size, size).apply { gravity = Gravity.CENTER_HORIZONTAL; topMargin = width / 40; bottomMargin = width / 40 })
        column.addView(status, LinearLayout.LayoutParams((width * 0.72).toInt(), LinearLayout.LayoutParams.WRAP_CONTENT).apply { gravity = Gravity.CENTER_HORIZONTAL })
        setContentView(FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            addView(column, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER))
        })
    }

    override fun onResume() {
        super.onResume()
        // If the app closed unexpectedly last time, say why, so it can be reported and fixed.
        CrashNote.take(this)?.let { notice = "Closed last time:\n$it" }
        refresh.run()
    }
    override fun onPause() { handler.removeCallbacks(refresh); super.onPause() }

    private fun record() {
        // Take the time first, before any saving or screen work.
        val tappedAt = System.currentTimeMillis()
        // Ignore a second tap straight after the first so one press can't log two stages.
        if (SystemClock.elapsedRealtime() - lastTap < 1500) return
        lastTap = SystemClock.elapsedRealtime()
        notice = null
        try { WatchLog.tap(this, tappedAt) } catch (_: Exception) { status.text = "Time not saved. Try again." ; return }
        render()
    }

    private fun render() {
        val now = System.currentTimeMillis()
        val runs = WatchLog.runs(this)
        date.text = WatchLog.todayLabel()
        button.text = WatchLog.BUTTON_LABELS[WatchLog.nextIndex(runs, now)]
        status.text = notice ?: WatchLog.status(runs, now)
    }
}
