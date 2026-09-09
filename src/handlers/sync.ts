import { sendNotification } from '@/discord/webhook'
import type { Env, EventSnapshot, EventSnapshotMap } from '@/env'
import { getAccessToken } from '@/google/auth'
import {
  type CalendarEvent,
  fullSyncEvents,
  getEvents,
  normalizeEventTimes,
  SyncTokenInvalidError,
  syncEvents,
} from '@/google/calendar'
import {
  deleteSyncToken,
  getCalendars,
  getEventSnapshots,
  getSyncToken,
  putEventSnapshots,
  putSyncToken,
} from '@/kv/store'
import { shouldNotifyEvent } from '@/lib/notifyFilter'
import { formatEventTime, getFromNowRange } from '@/lib/time'

export const WATCH_START_LOOKAHEAD_DAYS = 365

type ChangeType = '追加' | '日時変更' | '削除'

export interface Change {
  type: ChangeType
  calendarName: string
  summary: string
  start: string
  end: string
  watchStart?: boolean
}

const CHANGE_EMOJI: Record<ChangeType, string> = {
  追加: '✨',
  削除: '❌',
  日時変更: '⚡',
}

/**
 * カレンダーの変更を取得して通知を送信する
 * @param env Googleカレンダーに関する環境変数
 */
export async function handleSync(env: Env): Promise<void> {
  const calendars = await getCalendars(env)
  if (calendars.length === 0) {
    console.warn('No calendars configured in config:calendars')
    return
  }

  const accessToken = await getAccessToken(env)
  const changes: Change[] = []
  const syncErrors: string[] = []

  for (const calendar of calendars) {
    try {
      const result = await syncCalendar(
        env,
        accessToken,
        calendar.id,
        calendar.name,
        Boolean(calendar.familyNotifyFilter)
      )
      changes.push(...result)
    } catch (err) {
      console.error(`Sync failed for calendar ${calendar.id}:`, err)
      syncErrors.push(
        `${calendar.name}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  if (changes.length > 0) {
    await sendNotification(
      env.DISCORD_WEBHOOK_URL,
      formatSyncNotification(changes)
    )
  }

  if (syncErrors.length > 0) {
    throw new Error(`カレンダー同期に失敗しました\n${syncErrors.join('\n')}`)
  }
}

/**
 * カレンダーの変更を取得する
 * @param env 環境変数
 * @param accessToken アクセストークン
 * @param calendarId カレンダーID
 * @param calendarName カレンダー名
 * @param familyNotifyFilter 家族向け通知フィルタの設定
 * @returns カレンダーの変更の配列
 */
async function syncCalendar(
  env: Env,
  accessToken: string,
  calendarId: string,
  calendarName: string,
  familyNotifyFilter: boolean
): Promise<Change[]> {
  // 前回どこまで同期したかを、シンクトークンとスナップショットを取得して差分を確認する
  const existingToken = await getSyncToken(env, calendarId)
  const snapshots = await getEventSnapshots(env, calendarId)

  // トークンがないときはスナップショットを再構築する
  if (!existingToken) {
    const notifyWatchStart = isInitialWatch(existingToken, snapshots)
    const upcoming = notifyWatchStart
      ? await getUpcomingEvents(accessToken, calendarId)
      : []
    await rebuildSnapshot(env, accessToken, calendarId, snapshots)
    if (!notifyWatchStart) {
      return []
    }

    return changesFromUpcomingEvents(upcoming, calendarName, familyNotifyFilter)
  }

  try {
    const { items, nextSyncToken } = await syncEvents(
      accessToken,
      calendarId,
      existingToken
    )
    const changes = applyIncrementalChanges(
      snapshots,
      items,
      calendarName,
      familyNotifyFilter
    )
    await putEventSnapshots(env, calendarId, snapshots)
    // どこまで取得したかのシンクトークンを保存する
    if (nextSyncToken) {
      await putSyncToken(env, calendarId, nextSyncToken)
    }

    return changes
  } catch (err) {
    if (err instanceof SyncTokenInvalidError) {
      console.warn(`syncToken invalid for ${calendarId}; rebuilding snapshot`)
      await deleteSyncToken(env, calendarId)
      await rebuildSnapshot(env, accessToken, calendarId, {})

      return []
    }
    throw err
  }
}

/**
 * カレンダーのスナップショットを再構築する
 * @param env 環境変数
 * @param accessToken アクセストークン
 * @param calendarId カレンダーID
 * @param seed スナップショットの初期値
 */
async function rebuildSnapshot(
  env: Env,
  accessToken: string,
  calendarId: string,
  seed: EventSnapshotMap
): Promise<void> {
  const { items, nextSyncToken } = await fullSyncEvents(accessToken, calendarId)
  const snapshots: EventSnapshotMap = { ...seed }

  for (const event of items) {
    if (!event.id) continue
    if (event.status === 'cancelled') {
      delete snapshots[event.id]
      continue
    }
    snapshots[event.id] = normalizeEventTimes(event)
  }

  await putEventSnapshots(env, calendarId, snapshots)
  // どこまで取得したかのシンクトークンを保存する
  if (nextSyncToken) {
    await putSyncToken(env, calendarId, nextSyncToken)
  }
}

/**
 * カレンダーの変更を適用する
 * @param snapshots スナップショット
 * @param items カレンダーのイベント
 * @param calendarName カレンダー名
 * @param familyNotifyFilter 家族向け通知フィルタの設定
 * @returns カレンダーの変更の配列
 */
function applyIncrementalChanges(
  snapshots: EventSnapshotMap,
  items: CalendarEvent[],
  calendarName: string,
  familyNotifyFilter: boolean
): Change[] {
  const changes: Change[] = []

  for (const event of items) {
    if (!event.id) continue

    if (event.status === 'cancelled') {
      const prev = snapshots[event.id]
      if (prev) {
        if (isNotifiableSnapshot(prev, familyNotifyFilter)) {
          changes.push({
            type: '削除',
            calendarName,
            summary: prev.summary,
            start: prev.start,
            end: prev.end,
          })
        }
        delete snapshots[event.id]
      }
      continue
    }

    const next = normalizeEventTimes(event)
    const prev = snapshots[event.id]
    const nextNotifiable = isNotifiableSnapshot(next, familyNotifyFilter)
    const prevNotifiable = prev
      ? isNotifiableSnapshot(prev, familyNotifyFilter)
      : false

    if (!prev) {
      if (nextNotifiable) {
        changes.push({
          type: '追加',
          calendarName,
          summary: next.summary,
          start: next.start,
          end: next.end,
        })
      }
      snapshots[event.id] = next
      continue
    }

    if (!prevNotifiable && nextNotifiable) {
      changes.push({
        type: '追加',
        calendarName,
        summary: next.summary,
        start: next.start,
        end: next.end,
      })
    } else if (prevNotifiable && !nextNotifiable) {
      changes.push({
        type: '削除',
        calendarName,
        summary: prev.summary,
        start: prev.start,
        end: prev.end,
      })
    } else if (
      nextNotifiable &&
      (prev.start !== next.start || prev.end !== next.end)
    ) {
      changes.push({
        type: '日時変更',
        calendarName,
        summary: next.summary,
        start: next.start,
        end: next.end,
      })
    }

    snapshots[event.id] = next
  }

  return changes
}

/**
 * 通知可能なスナップショットかどうかを返す
 * @param snapshot スナップショット
 * @param familyNotifyFilter 家族向け通知フィルタの設定
 * @returns 通知可能なスナップショットかどうか
 */
function isNotifiableSnapshot(
  snapshot: EventSnapshot,
  familyNotifyFilter: boolean
): boolean {
  return shouldNotifyEvent(snapshot.start, snapshot.end, familyNotifyFilter)
}

/**
 * シンクトークンもスナップショットもない監視開始かどうかを返す
 * @param existingToken シンクトークン
 * @param snapshots スナップショット
 * @returns 監視開始かどうか
 */
export function isInitialWatch(
  existingToken: string | null,
  snapshots: EventSnapshotMap
): boolean {
  return !existingToken && Object.keys(snapshots).length === 0
}

/**
 * 未来の予定を取得する
 * @param accessToken アクセストークン
 * @param calendarId カレンダーID
 * @returns 未来の予定
 */
async function getUpcomingEvents(
  accessToken: string,
  calendarId: string
): Promise<CalendarEvent[]> {
  const { timeMin, timeMax } = getFromNowRange(
    new Date(),
    WATCH_START_LOOKAHEAD_DAYS
  )
  return getEvents(accessToken, calendarId, timeMin, timeMax)
}

/**
 * 未来の予定を監視開始の追加通知に変換する
 * @param events カレンダーのイベント
 * @param calendarName カレンダー名
 * @param familyNotifyFilter 家族向け通知フィルタの設定
 * @returns 監視開始の追加通知
 */
export function changesFromUpcomingEvents(
  events: CalendarEvent[],
  calendarName: string,
  familyNotifyFilter: boolean
): Change[] {
  const changes: Change[] = []

  for (const event of events) {
    if (!event.id) continue
    if (event.status === 'cancelled') continue

    const next = normalizeEventTimes(event)
    if (!isNotifiableSnapshot(next, familyNotifyFilter)) continue

    changes.push({
      type: '追加',
      calendarName,
      summary: next.summary,
      start: next.start,
      end: next.end,
      watchStart: true,
    })
  }

  return changes
}

/**
 * 1件の変更を通知文にする
 * @param change 変更
 * @returns 通知文
 */
export function formatChangeLine(change: Change): string {
  const emoji = CHANGE_EMOJI[change.type]
  return `${emoji}${change.type} ${change.calendarName}: ${change.summary} ${formatEventTime(change.start, change.end)}`
}

/**
 * 変更一覧を Discord 通知文にする
 * @param changes 変更一覧
 * @returns 通知文
 */
export function formatSyncNotification(changes: Change[]): string {
  const watchStartChanges = changes.filter((change) => change.watchStart)
  const regularChanges = changes.filter((change) => !change.watchStart)
  const parts: string[] = []

  if (watchStartChanges.length > 0) {
    parts.push(
      ['監視開始', ...watchStartChanges.map(formatChangeLine)].join('\n')
    )
  }
  if (regularChanges.length > 0) {
    parts.push(regularChanges.map(formatChangeLine).join('\n'))
  }

  return parts.join('\n\n')
}
