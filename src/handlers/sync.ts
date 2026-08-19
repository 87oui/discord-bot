import { sendNotification } from '@/discord/webhook'
import type { Env, EventSnapshot, EventSnapshotMap } from '@/env'
import { getAccessToken } from '@/google/auth'
import {
  type CalendarEvent,
  fullSyncEvents,
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
import { formatEventTime } from '@/lib/time'

type ChangeType = '追加' | '日時変更' | '削除'

interface Change {
  type: ChangeType
  calendarName: string
  summary: string
  start: string
  end: string
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
    }
  }

  if (changes.length === 0) {
    return
  }

  const messages: string[] = []
  for (const change of changes) {
    const emoji = {
      追加: '✨',
      削除: '❌',
      日時変更: '⚡',
    }[change.type]
    const message = `${emoji}${change.type} ${change.calendarName}: ${change.summary} ${formatEventTime(change.start, change.end)}`
    messages.push(message)
  }
  await sendNotification(env.DISCORD_WEBHOOK_URL, messages.join('\n'))
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
  // 前回どこまで動機したかを、シンクトークンとスナップショットを取得して差分を確認する
  const existingToken = await getSyncToken(env, calendarId)
  const snapshots = await getEventSnapshots(env, calendarId)

  // トークンがない初回は全件取得してスナップショットを作成する
  if (!existingToken) {
    await rebuildSnapshot(env, accessToken, calendarId, snapshots)
    return []
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
