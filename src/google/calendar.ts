export interface CalendarEvent {
  id: string
  status?: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}

interface EventsListResponse {
  items?: CalendarEvent[]
  nextPageToken?: string
  nextSyncToken?: string
}

/**
 * 同期トークンが無効な場合のエラー
 */
export class SyncTokenInvalidError extends Error {
  constructor(message = 'syncToken is invalid (410)') {
    super(message)
    this.name = 'SyncTokenInvalidError'
  }
}

/**
 * イベントの開始時刻または終了時刻を取得する
 * @param slot イベントの開始時刻または終了時刻
 * @returns イベントの開始時刻または終了時刻
 */
function eventTimeValue(slot?: { dateTime?: string; date?: string }): string {
  return slot?.dateTime ?? slot?.date ?? ''
}

/**
 * 予定タイトル、開始時刻、終了時刻を正規化する
 * @param event イベントオブジェクト
 * @returns 予定タイトル、開始時刻、終了時刻
 */
export function normalizeEventTimes(event: CalendarEvent) {
  return {
    summary: event.summary?.trim() || '（無題）',
    start: eventTimeValue(event.start),
    end: eventTimeValue(event.end),
  }
}

/**
 * カレンダーのイベントを取得する
 * @param accessToken Googleカレンダーのアクセストークン
 * @param calendarId GoogleカレンダーのID
 * @param params パラメータ
 * @returns EventsListResponse
 */
async function getEventsPage(
  accessToken: string,
  calendarId: string,
  params: URLSearchParams
): Promise<EventsListResponse> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (response.status === 410) {
    throw new SyncTokenInvalidError()
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `Calendar events.list failed (${calendarId}): ${response.status} ${text}`
    )
  }

  return (await response.json()) as EventsListResponse
}

/**
 * カレンダーの全てのページを取得する
 * @param accessToken Googleカレンダーのアクセストークン
 * @param calendarId GoogleカレンダーのID
 * @param baseParams ベースパラメータ
 * @returns カレンダーのイベントと次の同期トークン
 */
async function listAllPages(
  accessToken: string,
  calendarId: string,
  params: URLSearchParams
): Promise<{ items: CalendarEvent[]; nextSyncToken?: string }> {
  const items: CalendarEvent[] = []
  let pageToken: string | undefined
  let nextSyncToken: string | undefined

  do {
    if (pageToken) {
      params.set('pageToken', pageToken)
    }

    const page = await getEventsPage(accessToken, calendarId, params)
    if (page.items?.length) {
      items.push(...page.items)
    }
    pageToken = page.nextPageToken
    if (page.nextSyncToken) {
      nextSyncToken = page.nextSyncToken
    }
  } while (pageToken)

  return { items, nextSyncToken }
}

/**
 * カレンダーのイベントを同期する
 * @param accessToken Googleカレンダーのアクセストークン
 * @param calendarId GoogleカレンダーのID
 * @param syncToken 同期トークン
 * @returns カレンダーのイベントと次の同期トークン
 */
export async function syncEvents(
  accessToken: string,
  calendarId: string,
  syncToken: string
): Promise<{ items: CalendarEvent[]; nextSyncToken?: string }> {
  const params = new URLSearchParams({
    syncToken,
    showDeleted: 'true',
  })

  return listAllPages(accessToken, calendarId, params)
}

/**
 * カレンダーのイベントを完全に同期する
 * @param accessToken Googleカレンダーのアクセストークン
 * @param calendarId GoogleカレンダーのID
 * @returns カレンダーのイベントと次の同期トークン
 */
export async function fullSyncEvents(
  accessToken: string,
  calendarId: string
): Promise<{ items: CalendarEvent[]; nextSyncToken?: string }> {
  const params = new URLSearchParams({
    singleEvents: 'false',
    showDeleted: 'true',
  })

  return listAllPages(accessToken, calendarId, params)
}

/**
 * カレンダーのイベントを取得する
 * @param accessToken Googleカレンダーのアクセストークン
 * @param calendarId GoogleカレンダーのID
 * @param timeMin 開始時刻
 * @param timeMax 終了時刻
 * @returns 削除された予定を除いたカレンダーの予定
 */
export async function getEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    showDeleted: 'false',
  })
  const { items } = await listAllPages(accessToken, calendarId, params)

  return items.filter((e) => e.status !== 'cancelled')
}
