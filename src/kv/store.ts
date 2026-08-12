import type {
  CachedAccessToken,
  CalendarConfig,
  Env,
  EventSnapshotMap,
} from '../env'

const KEY_CALENDARS = 'config:calendars'
const KEY_ACCESS_TOKEN = 'token:access'

function syncKey(calendarId: string): string {
  return `sync:${calendarId}`
}

function eventsKey(calendarId: string): string {
  return `events:${calendarId}`
}

/**
 * カレンダー設定を取得する
 * @param env Googleカレンダーに関する環境変数
 * @returns カレンダー設定
 */
export async function getCalendars(env: Env): Promise<CalendarConfig[]> {
  const raw = await env.CALENDAR_KV.get(KEY_CALENDARS)
  if (!raw) {
    return []
  }

  const parsed = JSON.parse(raw) as CalendarConfig[]
  if (!Array.isArray(parsed)) {
    throw new Error('config:calendars must be a JSON array')
  }

  return parsed
}

/**
 * シンクトークンを取得する
 * @param env Googleカレンダーに関する環境変数
 * @param calendarId カレンダーID
 * @returns シンクトークン
 */
export async function getSyncToken(
  env: Env,
  calendarId: string
): Promise<string | null> {
  return env.CALENDAR_KV.get(syncKey(calendarId))
}

/**
 * シンクトークンを保存する
 * @param env Googleカレンダーに関する環境変数
 * @param calendarId カレンダーID
 * @param token シンクトークン
 */
export async function putSyncToken(
  env: Env,
  calendarId: string,
  token: string
): Promise<void> {
  await env.CALENDAR_KV.put(syncKey(calendarId), token)
}

/**
 * シンクトークンを削除する
 * @param env Googleカレンダーに関する環境変数
 * @param calendarId カレンダーID
 */
export async function deleteSyncToken(
  env: Env,
  calendarId: string
): Promise<void> {
  await env.CALENDAR_KV.delete(syncKey(calendarId))
}

/**
 * Googleカレンダーのスナップショットを取得する
 * @param env Googleカレンダーに関する環境変数
 * @param calendarId カレンダーID
 * @returns Googleカレンダーのスナップショット
 */
export async function getEventSnapshots(
  env: Env,
  calendarId: string
): Promise<EventSnapshotMap> {
  const raw = await env.CALENDAR_KV.get(eventsKey(calendarId))
  if (!raw) {
    return {}
  }

  return JSON.parse(raw) as EventSnapshotMap
}

/**
 * Googleカレンダーのスナップショットを保存する
 * @param env Googleカレンダーに関する環境変数
 * @param calendarId カレンダーID
 * @param snapshots Googleカレンダーのスナップショット
 */
export async function putEventSnapshots(
  env: Env,
  calendarId: string,
  snapshots: EventSnapshotMap
): Promise<void> {
  await env.CALENDAR_KV.put(eventsKey(calendarId), JSON.stringify(snapshots))
}

/**
 * キャッシュされたアクセストークンを取得する
 * @param env Googleカレンダーに関する環境変数
 * @returns キャッシュされたアクセストークン
 */
export async function getCachedAccessToken(
  env: Env
): Promise<CachedAccessToken | null> {
  const raw = await env.CALENDAR_KV.get(KEY_ACCESS_TOKEN)
  if (!raw) {
    return null
  }

  return JSON.parse(raw) as CachedAccessToken
}

/**
 * キャッシュされたアクセストークンを保存する
 * @param env Googleカレンダーに関する環境変数
 * @param token キャッシュされたアクセストークン
 */
export async function putCachedAccessToken(
  env: Env,
  token: CachedAccessToken
): Promise<void> {
  const ttlSeconds = Math.max(
    60,
    Math.floor((token.expiresAt - Date.now()) / 1000) - 60
  )
  await env.CALENDAR_KV.put(KEY_ACCESS_TOKEN, JSON.stringify(token), {
    expirationTtl: ttlSeconds,
  })
}
