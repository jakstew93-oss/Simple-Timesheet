package com.jak.simpletimesheet.wear

import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.protolayout.material.Chip
import androidx.wear.protolayout.material.ChipColors
import androidx.wear.protolayout.material.Text
import androidx.wear.protolayout.material.Typography
import androidx.wear.protolayout.material.layouts.PrimaryLayout
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/** Swipe-to tile: tap the button to log the next time without opening the app. */
class LogTileService : TileService() {
    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        val tappedAt = System.currentTimeMillis()
        val clicked = requestParams.currentState.lastClickableId
        if (clicked.isNotEmpty() && clicked == WatchLog.clickId(WatchLog.runs(this), tappedAt)) {
            try { WatchLog.tap(this, tappedAt, updateTile = false) } catch (_: Exception) { /* Shown as unchanged; tap again. */ }
        }
        val now = System.currentTimeMillis()
        val runs = WatchLog.runs(this)
        val device = requestParams.deviceConfiguration
        val click = ModifiersBuilders.Clickable.Builder()
            .setId(WatchLog.clickId(runs, now))
            .setOnClick(ActionBuilders.LoadAction.Builder().build())
            .build()
        val button = Chip.Builder(this, click, device)
            .setPrimaryLabelContent(WatchLog.BUTTON_LABELS[WatchLog.nextIndex(runs, now)])
            .setChipColors(ChipColors(0xFF70E39D.toInt(), 0xFF092918.toInt()))
            .build()
        val layout = PrimaryLayout.Builder(device)
            .setPrimaryLabelTextContent(
                Text.Builder(this, "Timesheet · " + WatchLog.todayLabel())
                    .setTypography(Typography.TYPOGRAPHY_CAPTION1)
                    .setColor(argb(0xFFA0AFA8.toInt()))
                    .build())
            .setContent(
                Text.Builder(this, WatchLog.status(runs, now))
                    .setTypography(Typography.TYPOGRAPHY_BODY2)
                    .setColor(argb(0xFFEDF5EF.toInt()))
                    .setMaxLines(4)
                    .setMultilineAlignment(LayoutElementBuilders.TEXT_ALIGN_CENTER)
                    .build())
            .setPrimaryChipContent(button)
            .build()
        val tile = TileBuilders.Tile.Builder()
            .setResourcesVersion(RESOURCES_VERSION)
            .setFreshnessIntervalMillis(15 * 60 * 1000L)
            .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(layout))
            .build()
        return Futures.immediateFuture(tile)
    }

    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        Futures.immediateFuture(ResourceBuilders.Resources.Builder().setVersion(RESOURCES_VERSION).build())

    private companion object { const val RESOURCES_VERSION = "1" }
}
