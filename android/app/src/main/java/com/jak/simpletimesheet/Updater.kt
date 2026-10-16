package com.jak.simpletimesheet

import android.app.Activity
import android.app.AlertDialog
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Finds the newest Simple Timesheet release on GitHub and installs it over this one. */
object Updater {
    private const val LATEST = "https://api.github.com/repos/jakstew93-oss/Simple-Timesheet/releases/latest"
    const val APK_NAME = "simple-timesheet.apk"

    data class Release(val code: Long, val apkUrl: String)

    fun versionCode(context: Context): Long {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        return if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
    }

    /** Reads a GitHub release tagged app-v<version> that has the phone APK attached. */
    fun parse(json: String): Release? {
        val release = JSONObject(json)
        val code = Regex("^app-v(\\d+)$").find(release.optString("tag_name"))?.groupValues?.get(1)?.toLongOrNull() ?: return null
        val assets = release.optJSONArray("assets") ?: return null
        for (i in 0 until assets.length()) {
            val asset = assets.getJSONObject(i)
            if (asset.optString("name") == APK_NAME) return Release(code, asset.getString("browser_download_url"))
        }
        return null
    }

    fun check(activity: Activity, manual: Boolean) {
        Thread {
            val release = try { fetch() } catch (_: Exception) { null }
            activity.runOnUiThread {
                if (activity.isFinishing) return@runOnUiThread
                when {
                    release == null -> if (manual) toast(activity, "Couldn’t check for updates. Check your signal and try again.")
                    release.code <= versionCode(activity) -> if (manual) toast(activity, "You’re on the latest version.")
                    else -> AlertDialog.Builder(activity)
                        .setTitle("Update available")
                        .setMessage("A new version of Simple Timesheet is ready (version ${release.code}). Your timesheet data stays as it is.")
                        .setPositiveButton("Install") { _, _ -> install(activity, release) }
                        .setNegativeButton("Later", null).show()
                }
            }
        }.start()
    }

    private fun fetch(): Release? {
        val connection = URL(LATEST).openConnection() as HttpURLConnection
        connection.setRequestProperty("Accept", "application/vnd.github+json")
        connection.setRequestProperty("User-Agent", "Simple-Timesheet-App")
        connection.connectTimeout = 10_000; connection.readTimeout = 15_000
        return try {
            if (connection.responseCode != 200) null else parse(connection.inputStream.bufferedReader().use { it.readText() })
        } finally { connection.disconnect() }
    }

    private fun install(activity: Activity, release: Release) {
        if (!activity.packageManager.canRequestPackageInstalls()) {
            AlertDialog.Builder(activity)
                .setTitle("Allow updates")
                .setMessage("Android needs your OK once to let Simple Timesheet install its own updates. Turn on “Allow from this source”, come back, and tap Install again.")
                .setPositiveButton("Open settings") { _, _ ->
                    activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")))
                }
                .setNegativeButton("Cancel", null).show()
            return
        }
        toast(activity, "Downloading the update…")
        Thread {
            try {
                val installer = activity.packageManager.packageInstaller
                val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
                if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
                val id = installer.createSession(params)
                installer.openSession(id).use { session ->
                    val connection = URL(release.apkUrl).openConnection() as HttpURLConnection
                    connection.instanceFollowRedirects = true
                    connection.setRequestProperty("User-Agent", "Simple-Timesheet-App")
                    try {
                        connection.inputStream.use { input ->
                            session.openWrite(APK_NAME, 0, -1).use { output -> input.copyTo(output); session.fsync(output) }
                        }
                    } finally { connection.disconnect() }
                    val done = PendingIntent.getBroadcast(activity, id, Intent(activity, InstallReceiver::class.java),
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
                    session.commit(done.intentSender)
                }
            } catch (_: Exception) {
                activity.runOnUiThread { toast(activity, "The update couldn’t be downloaded. Try again later.") }
            }
        }.start()
    }

    private fun toast(context: Context, message: String) = Toast.makeText(context, message, Toast.LENGTH_LONG).show()
}

/** Shows Android's install confirmation, or explains a failed update. */
class InstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                val confirm = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                    else @Suppress("DEPRECATION") intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                confirm?.let { context.startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            }
            PackageInstaller.STATUS_SUCCESS -> Unit
            else -> Toast.makeText(context, "The update didn’t install: " +
                (intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "unknown reason"), Toast.LENGTH_LONG).show()
        }
    }
}
