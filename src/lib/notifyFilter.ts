import holidayJp from '@holiday-jp/holiday_jp'
import { DATE_ONLY } from '@/lib/time'

const EVENING_START_MINUTES = 17 * 60
const EVENING_END_MINUTES = 4 * 60

/**
 * 家族向け通知フィルタを適用すべき予定かどうかを返す
 * @param start 予定の開始日時
 * @param end 予定の終了日時
 * @param familyNotifyFilter 家族向け通知フィルタの設定
 * @returns 家族向け通知フィルタを適用すべき予定かどうか
 */
export function shouldNotifyEvent(
  start: string,
  end: string,
  familyNotifyFilter: boolean
): boolean {
  // フィルタがOFFの時は常にtrueを返す
  if (!familyNotifyFilter) {
    return true
  }

  // 終日の予定は、土日祝の場合trueを返す
  if (DATE_ONLY.test(start) && DATE_ONLY.test(end)) {
    return isAllDayFullyOnWeekendOrHoliday(start, end)
  }

  // 終日でない（時刻のある）予定は、夜間のみtrueを返す
  return isFullyWithinEveningWindow(start, end)
}

/**
 * 終日の予定が土日祝かどうかを返す
 * @param startDate 予定の開始日
 * @param endDateExclusive 予定の終了日
 * @returns 予定の開始日から終了日までのすべての日が土日祝の場合trueを返す
 */
function isAllDayFullyOnWeekendOrHoliday(
  startDate: string,
  endDateExclusive: string
): boolean {
  // 予定の開始日から終了日までの配列を取得
  const days = listInclusiveDateKeys(startDate, endDateExclusive)
  if (days.length === 0) {
    return false
  }

  // 全ての日付が土日祝ならtrueを返す
  return days.every(isWeekendOrHoliday)
}

/**
 * 予定が夜間かどうかを返す
 * @param startIso 予定の開始日時
 * @param endIso 予定の終了日時
 * @returns 予定が夜間のみの場合trueを返す
 */
function isFullyWithinEveningWindow(startIso: string, endIso: string): boolean {
  const startMs = Date.parse(startIso)
  const endMs = Date.parse(endIso)
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return false
  }

  const startParts = getDateTimeParts(new Date(startMs))
  const startMinutes = startParts.hour * 60 + startParts.minute
  let windowStartDate = `${startParts.year}-${startParts.month}-${startParts.day}`

  // 日中の予定はfalseを返す
  if (
    startMinutes < EVENING_START_MINUTES &&
    startMinutes >= EVENING_END_MINUTES
  ) {
    return false
  }

  // 0時からの場合は日付を1日足す
  if (startMinutes < EVENING_END_MINUTES) {
    windowStartDate = addDays(windowStartDate, -1)
  }

  const windowStartMs = Date.parse(`${windowStartDate}T17:00:00+09:00`)
  const windowEndMs = Date.parse(
    `${addDays(windowStartDate, 1)}T04:00:00+09:00`
  )

  return startMs >= windowStartMs && endMs <= windowEndMs
}

/**
 * 日付が土日祝かどうかを返す
 * @param dateKey 日付（YYYY-MM-DD）
 * @returns 日付が土日祝の場合trueを返す
 */
function isWeekendOrHoliday(dateKey: string): boolean {
  const jstDay = new Date(`${dateKey}T00:00:00+09:00`)
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short',
  }).format(jstDay)
  const isWeekend = weekday === 'Sat' || weekday === 'Sun'

  return isWeekend || holidayJp.isHoliday(dateKey)
}

/**
 * 予定の開始日から終了日までのすべての日を返す
 * @param startDate 予定の開始日
 * @param endDateExclusive 予定の終了日
 * @returns 予定の開始日から終了日までのすべての日付の配列
 */
function listInclusiveDateKeys(
  startDate: string,
  endDateExclusive: string
): string[] {
  const days: string[] = []
  let cursor = startDate
  while (cursor < endDateExclusive) {
    days.push(cursor)
    cursor = addDays(cursor, 1)
  }

  return days
}

/**
 * 日付を加算する
 * @param dateKey 日付（YYYY-MM-DD）
 * @param days 加算する日数
 * @returns 加算後の日付
 */
function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00+09:00`)
  date.setUTCDate(date.getUTCDate() + days)

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * 日時を年、月、日、時、分に分解する
 * @param date Dateオブジェクト
 * @returns 年、月、日、時、分のオブジェクト
 */
function getDateTimeParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  const hour = parts.find((p) => p.type === 'hour')?.value
  const minute = parts.find((p) => p.type === 'minute')?.value
  if (!year || !month || !day || hour === undefined || minute === undefined) {
    throw new Error('Failed to resolve JST datetime parts')
  }

  return {
    year,
    month,
    day,
    hour: Number(hour === '24' ? '0' : hour),
    minute: Number(minute),
  }
}
