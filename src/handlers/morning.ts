import { sendNotification } from '@/discord/webhook'
import type { Env } from '@/env'
import { getAccessToken } from '@/google/auth'
import { getEvents, normalizeEventTimes } from '@/google/calendar'
import { getCalendars } from '@/kv/store'
import { shouldNotifyEvent } from '@/lib/notifyFilter'
import { formatEventTime, formatTimestamp, getTodayRange } from '@/lib/time'

interface MorningItem {
  calendarName: string
  summary: string
  start: string
  end: string
  sortKey: number
}

/**
 * 当日の予定を取得してDiscordに送信する
 * @param env Googleカレンダーに関する環境変数
 * @param now 現在時刻（Dateオブジェクト）
 */
export async function handleMorning(env: Env, now = new Date()): Promise<void> {
  const calendars = await getCalendars(env)

  // カレンダーの設定がない
  if (calendars.length === 0) {
    console.warn('No calendars configured in config:calendars')
  }

  const accessToken = await getAccessToken(env)
  const { timeMin, timeMax } = getTodayRange(now)
  const items: MorningItem[] = []
  const fetchErrors: string[] = []

  for (const calendar of calendars) {
    try {
      const events = await getEvents(accessToken, calendar.id, timeMin, timeMax)
      for (const event of events) {
        const normalized = normalizeEventTimes(event)
        if (
          !shouldNotifyEvent(
            normalized.start,
            normalized.end,
            Boolean(calendar.familyNotifyFilter)
          )
        ) {
          continue
        }
        items.push({
          calendarName: calendar.name,
          summary: normalized.summary,
          start: normalized.start,
          end: normalized.end,
          sortKey: formatTimestamp(normalized.start),
        })
      }
    } catch (err) {
      console.error(`Morning fetch failed for calendar ${calendar.id}:`, err)
      fetchErrors.push(
        `${calendar.name}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  items.sort((a, b) => a.sortKey - b.sortKey)

  if (items.length > 0) {
    const lines = [
      '📅 本日の予定',
      ...items.map(
        (item) =>
          `- ${item.calendarName}: ${item.summary} ${formatEventTime(item.start, item.end)}`
      ),
    ]
    await sendNotification(env.DISCORD_WEBHOOK_URL, lines.join('\n'))
  }

  if (fetchErrors.length > 0) {
    throw new Error(`カレンダー取得に失敗しました\n${fetchErrors.join('\n')}`)
  }
}
