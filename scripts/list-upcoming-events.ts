#!/usr/bin/env node
/**
 * デバッグ用: 直近の予定を全件取得してターミナルに出力する
 *
 * Usage:
 *   npm run debug:events
 *   npm run debug:events -- --days 14
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getEvents,
  listCalendars,
  normalizeEventTimes,
} from '../src/google/calendar.ts'
import {
  DATE_ONLY,
  formatDateTime,
  formatEventTime,
  formatTimestamp,
  getDaysRange,
} from '../src/lib/time.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const PAST_DAYS = 7

interface CalendarConfig {
  id: string
  name: string
}

interface CalendarItem {
  calendarName: string
  summary: string
  start: string
  end: string
  created?: string
  sortKey: number
}

/**
 * コマンドライン引数から日数 `days` を取得する
 * @param argv コマンドライン引数
 * @returns 日数
 */
function parseDays(argv: string[]): number {
  if (argv.length === 0) {
    return 7
  }

  const index = argv.indexOf('--days')
  if (index === -1) {
    return 7
  }

  const raw = argv[index + 1]
  const days = Number(raw)
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    console.error('--days は 1〜90 の整数で指定してください')
    process.exit(1)
  }

  return days
}

/**
 * ローカル環境変数のキーと値のマップを返す
 * @returns ローカル環境変数のキーと値のマップ
 */
function loadDevVars(): Record<string, string> {
  const path = join(ROOT, '.dev.vars')
  if (!existsSync(path)) {
    console.error(
      '.dev.vars が見つかりません。README の Secrets 手順を参照してください。'
    )
    process.exit(1)
  }

  const vars: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    const eq = trimmed.indexOf('=')
    if (eq === -1) {
      continue
    }
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }

  return vars
}

/**
 * calendars.json をパースしてカレンダー設定の配列を返す
 * @returns カレンダー設定の配列
 */
function loadCalendars(): CalendarConfig[] {
  const path = join(ROOT, 'calendars.json')
  if (!existsSync(path)) {
    console.error(
      'calendars.json が見つかりません。calendars.example.json をコピーして編集してください。'
    )
    process.exit(1)
  }

  const parsed = JSON.parse(readFileSync(path, 'utf8')) as CalendarConfig[]
  if (!Array.isArray(parsed) || parsed.length === 0) {
    console.error(
      'calendars.json は1件以上のカレンダー配列である必要があります。'
    )
    process.exit(1)
  }

  return parsed
}

/**
 * アクセストークンを取得する
 * @param clientId クライアントID
 * @param clientSecret クライアントシークレット
 * @param refreshToken リフレッシュトークン
 * @returns アクセストークン
 */
async function getAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `Google のアクセストークン更新に失敗しました (${response.status}): ${text}\n.dev.vars の GOOGLE_REFRESH_TOKEN を確認するか、npm run oauth で再取得してください。`
    )
  }

  const json = (await response.json()) as { access_token: string }
  return json.access_token
}

/**
 * 日時文字列を日付キーに変換して返す
 * @param value 日時文字列
 * @returns 日付キー
 */
function toDateKey(value: string): string {
  if (DATE_ONLY.test(value)) {
    return value
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function formatDateHeading(dateKey: string): string {
  const weekday = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short',
  }).format(new Date(`${dateKey}T00:00:00+09:00`))

  return `${dateKey.replaceAll('-', '/')}（${weekday}）`
}

/**
 * 予定の登録日時を整形する
 * @param created 登録日時（ISO 8601形式）
 * @returns 登録日時を表す文字列
 */
function formatCreatedAt(created?: string): string {
  if (!created) {
    return '不明'
  }

  return formatDateTime(created)
}

/**
 * 予定一覧を標準出力する
 * @param items 予定一覧
 * @param days 日数
 * @param timeMin 開始時間
 * @param timeMax 終了時間
 */
function printItems(
  items: CalendarItem[],
  days: number,
  timeMin: string,
  timeMax: string
): void {
  const startLabel = toDateKey(timeMin).replaceAll('-', '/')
  const endExclusive = toDateKey(timeMax)
  const endInclusiveDate = new Date(`${endExclusive}T00:00:00+09:00`)
  endInclusiveDate.setUTCDate(endInclusiveDate.getUTCDate() - 1)
  const endLabel = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(endInclusiveDate)

  console.info(
    `\n直近 ${days + PAST_DAYS} 日の予定（${startLabel} 〜 ${endLabel}）`
  )
  console.info('通知フィルタは適用せず、全件を表示します。')

  if (items.length === 0) {
    console.info('予定はありません。')
    return
  }

  let currentKey = ''
  for (const item of items) {
    const key = toDateKey(item.start)
    if (key !== currentKey) {
      currentKey = key
      console.info(`## ${formatDateHeading(key)}`)
    }
    console.info(
      `- ${item.calendarName}: ${item.summary} ${formatEventTime(item.start, item.end)} （登録日: ${formatCreatedAt(item.created)}）`
    )
  }

  console.info(`合計 ${items.length} 件`)
}

async function main(): Promise<void> {
  const days = parseDays(process.argv.slice(2))
  const env = loadDevVars()
  const calendars = loadCalendars()

  const clientId = env.GOOGLE_CLIENT_ID
  const clientSecret = env.GOOGLE_CLIENT_SECRET
  const refreshToken = env.GOOGLE_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    console.error(
      '.dev.vars に GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN を入力してください。'
    )
    process.exit(1)
  }

  const accessToken = await getAccessToken(clientId, clientSecret, refreshToken)
  const from = new Date()
  from.setUTCDate(from.getUTCDate() - PAST_DAYS)
  const { timeMin, timeMax } = getDaysRange(from, days + PAST_DAYS)
  const items: CalendarItem[] = []
  const missingCalendarIds: string[] = []

  for (const calendar of calendars) {
    try {
      const events = await getEvents(accessToken, calendar.id, timeMin, timeMax)
      console.error(`取得成功: ${calendar.name} (${events.length}件)`)
      for (const event of events) {
        const normalized = normalizeEventTimes(event)
        items.push({
          calendarName: calendar.name,
          summary: normalized.summary,
          start: normalized.start,
          end: normalized.end,
          created: event.created,
          sortKey: formatTimestamp(normalized.start),
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const notFound = message.includes(': 404 ')
      if (notFound) {
        missingCalendarIds.push(calendar.id)
        console.error(
          `取得失敗: ${calendar.name} (${calendar.id}) — カレンダーが見つかりません。`
        )
        console.error(
          '認可した Google アカウントに共有されていないか、カレンダー ID が違います。'
        )
      } else {
        console.error(`取得失敗: ${calendar.name} (${calendar.id})`)
        console.error(err)
      }
    }
  }

  await printAccessibleCalendars(accessToken)

  items.sort((a, b) => a.sortKey - b.sortKey)
  printItems(items, days, timeMin, timeMax)
}

async function printAccessibleCalendars(accessToken: string): Promise<void> {
  try {
    const accessible = await listCalendars(accessToken)
    console.info('\nこのトークンがアクセスできるカレンダー:')
    for (const calendar of accessible) {
      const role = calendar.accessRole ? ` [${calendar.accessRole}]` : ''
      const primary = calendar.primary ? ' (primary)' : ''
      console.info(
        `- ${calendar.summary ?? '（無題）'}${primary}${role}: ${calendar.id}`
      )
    }
  } catch (err) {
    console.error('アクセス可能なカレンダー一覧の取得に失敗しました。')
    console.error(err)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
