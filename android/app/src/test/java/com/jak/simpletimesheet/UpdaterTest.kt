package com.jak.simpletimesheet

import org.junit.Assert.*
import org.junit.Test

class UpdaterTest {
    private fun release(tag: String, vararg assets: String) =
        """{"tag_name":"$tag","assets":[${assets.joinToString(",") { """{"name":"$it","browser_download_url":"https://github.com/x/releases/download/$tag/$it"}""" }}]}"""

    @Test fun readsTheVersionAndPhoneApkFromALatestRelease() {
        val found = Updater.parse(release("app-v123", "simple-timesheet-watch.apk", "simple-timesheet.apk"))!!
        assertEquals(123L, found.code)
        assertEquals("https://github.com/x/releases/download/app-v123/simple-timesheet.apk", found.apkUrl)
    }

    @Test fun ignoresReleasesThatAreNotAppBuildsOrHaveNoPhoneApk() {
        assertNull(Updater.parse(release("v1.0", "simple-timesheet.apk")))
        assertNull(Updater.parse(release("app-v124", "simple-timesheet-watch.apk")))
        assertNull(Updater.parse("""{"tag_name":"app-v125"}"""))
    }
}
