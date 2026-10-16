package com.jak.simpletimesheet

import org.junit.Assert.*
import org.junit.Test

class CaptureRunTest {
    @Test fun everyTapRetainsItsOriginalMilliseconds() {
        val taps = listOf(1791097200123L, 1791100800456L, 1791127800789L, 1791131400999L)
        var runs = emptyList<CaptureRun>()
        taps.forEach { runs = CaptureRun.append(runs, CaptureTime(it, 3600)) { "run-1" } }
        assertEquals(taps, runs.single().times.map { it.epochMillis })
        val afterFinish = CaptureRun.append(runs, CaptureTime(taps.last()+1, 3600)) { "run-2" }
        assertEquals(2, afterFinish.size)
        assertEquals(runs.single(), afterFinish.first())
        assertEquals(1, afterFinish.last().times.size)
    }
    @Test fun dateChangesDoNotDiscardAnUnfinishedShift() {
        val start = CaptureTime(java.time.Instant.parse("2026-10-04T22:59:59.999Z").toEpochMilli(), 3600)
        val next = CaptureTime(start.epochMillis+2, 3600)
        val runs = CaptureRun.append(listOf(CaptureRun("overnight", listOf(start))), next) { "unused" }
        assertEquals("overnight", runs.single().id)
        assertEquals("23:59:59", runs.single().times[0].timeLabel())
        assertEquals("00:00:00", runs.single().times[1].timeLabel())
    }
    @Test fun capturedTimezoneIsPreserved() {
        val tap = CaptureTime(java.time.Instant.parse("2026-10-04T12:34:56.789Z").toEpochMilli(), 3600)
        assertEquals("13:34:56", tap.timeLabel())
        assertEquals(789000000, tap.localTime().nano)
    }
}

class DayAndSourceTest {
    private fun at(iso: String) = CaptureTime(java.time.Instant.parse(iso).toEpochMilli(), 3600)

    @Test fun aSetForgottenYesterdayIsNotContinuedToday() {
        val yesterday = listOf(CaptureRun("yesterday", listOf(at("2026-10-14T05:00:00Z"), at("2026-10-14T06:30:00Z")), CaptureRun.WATCH))
        val today = CaptureRun.append(yesterday, at("2026-10-15T05:15:00Z"), CaptureRun.WATCH) { "today" }
        assertEquals(listOf("yesterday", "today"), today.map { it.id })
        assertEquals(2, today.first().times.size)
        assertEquals(1, today.last().times.size)
    }

    @Test fun aLateShiftStillFinishesAfterMidnight() {
        val start = at("2026-10-14T07:00:00Z")
        var runs = listOf(CaptureRun("late", listOf(start), CaptureRun.WATCH))
        runs = CaptureRun.append(runs, at("2026-10-14T23:10:00Z"), CaptureRun.WATCH) { "unused" }
        assertEquals(1, runs.size)
        assertEquals(0, CaptureRun.nextIndex(runs, CaptureRun.WATCH, start.epochMillis + CaptureRun.OPEN_LIMIT_MILLIS))
        assertEquals(2, CaptureRun.nextIndex(runs, CaptureRun.WATCH, start.epochMillis + CaptureRun.OPEN_LIMIT_MILLIS - 1))
    }

    @Test fun watchAndPhoneTapsNeverMix() {
        var runs = CaptureRun.append(emptyList(), at("2026-10-15T05:00:00Z"), CaptureRun.WATCH) { "watch-1" }
        runs = CaptureRun.append(runs, at("2026-10-15T05:01:00Z"), CaptureRun.PHONE) { "phone-1" }
        runs = CaptureRun.append(runs, at("2026-10-15T06:00:00Z"), CaptureRun.WATCH) { "unused" }
        assertEquals(listOf("watch-1", "phone-1"), runs.map { it.id })
        assertEquals(2, runs.first { it.id == "watch-1" }.times.size)
        assertEquals(1, runs.first { it.id == "phone-1" }.times.size)
        assertEquals(2, CaptureRun.nextIndex(runs, CaptureRun.WATCH, at("2026-10-15T07:00:00Z").epochMillis))
        assertEquals(1, CaptureRun.nextIndex(runs, CaptureRun.PHONE, at("2026-10-15T07:00:00Z").epochMillis))
    }

    @Test fun watchUpdatesReplaceOlderCopiesButNeverLoseTaps() {
        val one = CaptureRun("w", listOf(at("2026-10-15T05:00:00Z")), CaptureRun.WATCH)
        val two = one.copy(times = one.times + at("2026-10-15T06:00:00Z"))
        val phone = CaptureRun("p", listOf(at("2026-10-15T04:00:00Z")))
        var (runs, before) = CaptureRun.upsert(listOf(phone), one)
        assertNull(before)
        assertEquals(listOf("p", "w"), runs.map { it.id })
        val second = CaptureRun.upsert(runs, two); runs = second.first
        assertEquals(one, second.second)
        assertEquals(2, runs.last().times.size)
        val stale = CaptureRun.upsert(runs, one)
        assertEquals(runs, stale.first)
    }
}

class PhoneSyncTest {
    private fun at(iso: String) = CaptureTime(java.time.Instant.parse(iso).toEpochMilli(), 3600)
    private val now = at("2026-10-15T09:00:00Z").epochMillis
    private fun active(id: String, rev: Long, vararg times: CaptureTime, seen: Set<Long> = emptySet()) =
        PhoneDay(id, PhoneDay.ACTIVE, rev, times.toList(), seen)

    @Test fun aStartLoggedOnThePhoneIsCarriedOnByTheWatch() {
        var runs = CaptureRun.adopt(emptyList(), active("p", 10, at("2026-10-15T06:00:00Z")), now)
        assertEquals(1, CaptureRun.nextIndex(runs, CaptureRun.WATCH, now))
        runs = CaptureRun.append(runs, at("2026-10-15T08:00:00Z"), CaptureRun.WATCH) { "unused" }
        val day = runs.single()
        assertEquals("p", day.id)
        assertEquals(2, day.times.size)
        assertEquals(1, day.baseCount)
        assertEquals(2L, day.seq)
    }

    @Test fun phoneEditsReplaceTheWatchCopyButKeepTapsThePhoneHasNotSeen() {
        val start = at("2026-10-15T05:00:00Z"); val onSite = at("2026-10-15T07:00:00Z"); val offSite = at("2026-10-15T08:30:00Z")
        var runs = CaptureRun.append(emptyList(), start, CaptureRun.WATCH) { "w" }
        runs = CaptureRun.append(runs, onSite, CaptureRun.WATCH) { "unused" }
        runs = CaptureRun.append(runs, offSite, CaptureRun.WATCH) { "unused" }
        // The phone has seen Start and On site, moved Start to 05:30 and cleared On site; Off site hasn't reached it yet.
        val corrected = at("2026-10-15T05:30:00Z")
        runs = CaptureRun.adopt(runs, active("w", 20, corrected, seen = setOf(start.epochMillis, onSite.epochMillis)), now)
        assertEquals(listOf(corrected, offSite), runs.single().times)
        assertEquals(1, runs.single().baseCount)
        // An older message arriving late changes nothing.
        assertEquals(runs, CaptureRun.adopt(runs, active("w", 15, start), now))
    }

    @Test fun resetOnThePhoneClearsTheWatchAndSaveClosesTheDay() {
        val runs = CaptureRun.adopt(emptyList(), active("p", 10, at("2026-10-15T06:00:00Z")), now)
        val cleared = CaptureRun.adopt(runs, PhoneDay("p", PhoneDay.CLEARED, 11, emptyList(), emptySet()), now)
        assertTrue(cleared.isEmpty())
        assertEquals(0, CaptureRun.nextIndex(cleared, CaptureRun.WATCH, now))
        val saved = CaptureRun.adopt(runs, PhoneDay("p", PhoneDay.SAVED, 11, emptyList(), emptySet()), now)
        assertTrue(saved.single().closed)
        assertEquals(0, CaptureRun.nextIndex(saved, CaptureRun.WATCH, now))
    }

    @Test fun thePhonesDayTakesOverFromAnUnfinishedWatchDay() {
        var runs = CaptureRun.append(emptyList(), at("2026-10-15T05:00:00Z"), CaptureRun.WATCH) { "w" }
        runs = CaptureRun.adopt(runs, active("p", 10, at("2026-10-15T05:10:00Z"), at("2026-10-15T07:00:00Z")), now)
        assertEquals(listOf("w", "p"), runs.map { it.id })
        assertTrue(runs.first().closed)
        assertEquals(2, CaptureRun.nextIndex(runs, CaptureRun.WATCH, now))
    }

    @Test fun anEarlierDayFilledInOnThePhoneLeavesTodaysWatchDayAlone() {
        var runs = CaptureRun.append(emptyList(), at("2026-10-15T05:00:00Z"), CaptureRun.WATCH) { "w" }
        runs = CaptureRun.adopt(runs, active("old", 10, at("2026-10-12T06:00:00Z")), now)
        assertEquals(listOf("old", "w"), runs.map { it.id })
        assertFalse(runs.last().closed)
        assertEquals(1, CaptureRun.nextIndex(runs, CaptureRun.WATCH, now))
    }

    @Test fun aNewerWatchCopyWinsEvenWithFewerTimes() {
        val older = CaptureRun("w", listOf(at("2026-10-15T05:00:00Z"), at("2026-10-15T07:00:00Z")), CaptureRun.WATCH, seq = 2)
        val newer = CaptureRun("w", listOf(at("2026-10-15T05:30:00Z")), CaptureRun.WATCH, base = 10, baseCount = 1, seq = 3)
        assertEquals(newer, CaptureRun.upsert(listOf(older), newer).first.single())
        assertEquals(newer, CaptureRun.upsert(listOf(newer), older).first.single())
    }
}
