package com.jak.simpletimesheet

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.ClipData
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.view.Gravity
import android.view.WindowInsets
import android.webkit.GeolocationPermissions
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File

/** The Simple Timesheet web app in its own Android app, linked to the watch, the widget and Android's files and sharing. */
class MainActivity : Activity() {
    companion object {
        const val HOME = "https://jakstew93-oss.github.io/Simple-Timesheet/"
        private const val PICK_FILE = 41
        private const val LOCATION = 42
        private const val NOTIFICATIONS = 43
    }

    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var cameraUri: Uri? = null
    private var geoCallback: GeolocationPermissions.Callback? = null
    private var geoOrigin: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // The phone app can be installed on a watch by mistake (same app ID), where there's no WebView and it would close at once.
        if (packageManager.hasSystemFeature(PackageManager.FEATURE_WATCH)) {
            showMessage("This is the phone app.\n\nOn the watch, install simple-timesheet-watch.apk instead. It shows as Timesheet Log.")
            return
        }
        web = try { WebView(this) } catch (_: Exception) {
            showMessage("Simple Timesheet needs Android System WebView. Update it from the Play Store, then open the app again.")
            return
        }
        web.setBackgroundColor(Color.BLACK)
        // Keep the page clear of the status bar, navigation bar and keyboard.
        val frame = FrameLayout(this).apply { setBackgroundColor(Color.BLACK); addView(web) }
        frame.setOnApplyWindowInsetsListener { view, insets ->
            if (Build.VERSION.SDK_INT >= 30) {
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime() or WindowInsets.Type.displayCutout())
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            } else padForOlderAndroid(view, insets)
            insets
        }
        setContentView(frame)

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            setGeolocationEnabled(true)
            textZoom = 100
            userAgentString = "$userAgentString SimpleTimesheetApp/${Updater.versionCode(this@MainActivity)}"
        }
        web.addJavascriptInterface(NativeBridge(this), "STNative")
        web.webViewClient = object : WebViewClient() {
            // The timesheet stays in the app; any other link opens in the browser.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame || request.url.toString().startsWith(HOME)) return false
                try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: Exception) { }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean =
                chooseFile(callback, params)
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) =
                askLocation(origin, callback)
        }
        // Ordinary links to files, such as the blank holiday form. Generated files come through NativeBridge.saveFile.
        web.setDownloadListener { url, _, disposition, mime, _ ->
            if (!url.startsWith("http")) return@setDownloadListener
            val name = URLUtil.guessFileName(url, disposition, mime)
            try {
                getSystemService(DownloadManager::class.java).enqueue(DownloadManager.Request(Uri.parse(url)).setMimeType(mime)
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "Simple Timesheet/$name"))
                toast("Downloading $name")
            } catch (_: Exception) { toast("Couldn’t download $name") }
        }

        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(HOME)
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATIONS)
        Updater.check(this, manual = false)
    }

    @Suppress("DEPRECATION")
    private fun padForOlderAndroid(view: android.view.View, insets: WindowInsets) =
        view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)

    private fun showMessage(text: String) = setContentView(TextView(this).apply {
        this.text = text; setTextColor(Color.WHITE); setBackgroundColor(Color.BLACK); gravity = Gravity.CENTER; textSize = 15f
        val pad = (24 * resources.displayMetrics.density).toInt(); setPadding(pad, pad, pad, pad)
    })

    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); if (::web.isInitialized) web.saveState(outState) }
    override fun onResume() {
        super.onResume(); if (!::web.isInitialized) return; web.onResume()
        // Bring in any watch or widget taps made while the app was in the background.
        web.evaluateJavascript("window.STBridge&&STBridge.pull()", null)
    }
    override fun onPause() { if (::web.isInitialized) web.onPause(); super.onPause() }
    override fun onDestroy() { if (::web.isInitialized) web.destroy(); super.onDestroy() }

    @Deprecated("Back gesture still goes back through the timesheet's pages first.")
    @Suppress("DEPRECATION")
    override fun onBackPressed() { if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed() }

    // ---------- Photos and files for the page ----------
    private fun chooseFile(callback: ValueCallback<Array<Uri>>, params: WebChromeClient.FileChooserParams): Boolean {
        fileCallback?.onReceiveValue(null)
        fileCallback = callback
        cameraUri = null
        val intent = when {
            params.isCaptureEnabled -> {
                val photo = File(File(cacheDir, "shared").apply { mkdirs() }, "photo-${System.currentTimeMillis()}.jpg")
                val uri = FileProvider.getUriForFile(this, "$packageName.files", photo).also { cameraUri = it }
                Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, uri)
                    .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    .apply { clipData = ClipData.newRawUri("", uri) }
            }
            // Backup files don't always show up under a JSON filter, so let any file be picked.
            params.acceptTypes.any { it.contains("json") } ->
                Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
            else -> params.createIntent()
        }
        return try { @Suppress("DEPRECATION") startActivityForResult(intent, PICK_FILE); true }
        catch (_: Exception) { fileCallback = null; cameraUri = null; false }
    }

    @Deprecated("Uses the platform Activity result API, which this app has no AndroidX replacement for.")
    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != PICK_FILE) { super.onActivityResult(requestCode, resultCode, data); return }
        val callback = fileCallback ?: return
        fileCallback = null
        val result = when {
            resultCode != RESULT_OK -> null
            cameraUri != null -> arrayOf(cameraUri!!)
            else -> WebChromeClient.FileChooserParams.parseResult(resultCode, data)
        }
        cameraUri = null
        callback.onReceiveValue(result)
    }

    // ---------- Location for the weather card ----------
    private fun askLocation(origin: String, callback: GeolocationPermissions.Callback) {
        val granted = listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            .any { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }
        if (granted) { callback.invoke(origin, true, false); return }
        geoOrigin = origin; geoCallback = callback
        requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), LOCATION)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != LOCATION) return
        geoCallback?.invoke(geoOrigin, grantResults.any { it == PackageManager.PERMISSION_GRANTED }, false)
        geoCallback = null; geoOrigin = null
    }

    // ---------- Files made by the page (CSV, PDFs, backups) ----------
    fun saveDownload(name: String, mime: String, bytes: ByteArray) {
        val safe = name.replace(Regex("[\\\\/:*?\"<>|]"), "_").ifBlank { "download" }
        try {
            val uri: Uri = if (Build.VERSION.SDK_INT >= 29) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, safe)
                    put(MediaStore.Downloads.MIME_TYPE, mime)
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Simple Timesheet")
                }
                val item = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: error("No download location")
                contentResolver.openOutputStream(item)!!.use { it.write(bytes) }
                item
            } else {
                val file = File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), safe)
                file.writeBytes(bytes)
                FileProvider.getUriForFile(this, "$packageName.files", file)
            }
            toast("Saved to Downloads/Simple Timesheet: $safe")
            if (mime == "application/pdf") try {
                startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
            } catch (_: Exception) { }
        } catch (_: Exception) { toast("Couldn’t save $safe") }
    }

    fun shareBytes(name: String, mime: String, bytes: ByteArray, title: String) {
        try {
            val file = File(File(cacheDir, "shared").apply { mkdirs() }, name.replace(Regex("[\\\\/:*?\"<>|]"), "_").ifBlank { "file" })
            file.writeBytes(bytes)
            val uri = FileProvider.getUriForFile(this, "$packageName.files", file)
            val send = Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri)
                .putExtra(Intent.EXTRA_SUBJECT, title).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            startActivity(Intent.createChooser(send, title.ifBlank { "Share" }))
        } catch (_: Exception) { toast("Couldn’t share $name") }
    }

    fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()
}
