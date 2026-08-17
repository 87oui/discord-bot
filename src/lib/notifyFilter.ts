import holidayJp from '@holiday-jp/holiday_jp'
import { DATE_ONLY } from '@/lib/time'

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

  // 終日予定は日程に関係なく通知する
  if (DATE_ONLY.test(start) && DATE_ONLY.test(end)) {
    return true
  }

  // 時刻付き予定は、土日祝を除く平日の8:00〜16:00に完全に収まる予定以外を通知する
  return !isFullyWithinWeekdayWorkHours(start, end)
}

/**
 * 平日の勤務時間帯に完全に収まるかどうかを返す
 * @param start 予定の開始日時
 * @param end 予定の終了日時
 * @returns 土日祝を除く平日の同一日 8:00〜16:00 に完全に収まる場合true
 */
function isFullyWithinWeekdayWorkHours(
  startStr: string,
  endStr: string
): boolean {
  // 開始日時と終了日時が不正な場合はfalseを返す
  const startMs = Date.parse(startStr)
  const endMs = Date.parse(endStr)
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return false
  }

  // 開始日が土日祝の時点でfalseを返す
  const startParts = getDateTimeParts(new Date(startMs))
  const startDate = `${startParts.year}-${startParts.month}-${startParts.day}`
  if (!isWeekday(startDate)) {
    return false
  }

  // 通知しない範囲（開始日の8時〜16時）
  const windowStartMs = Date.parse(`${startDate}T08:00:00+09:00`)
  const windowEndMs = Date.parse(`${startDate}T16:00:00+09:00`)

  // 開始日時が通知しない範囲の開始以降かつ終了日時が通知しない範囲の終了以前ならtrueを返す
  return startMs >= windowStartMs && endMs <= windowEndMs
}

/**
 * 土日祝を除く平日かどうかを返す
 * @param dateKey 日付（YYYY-MM-DD）
 * @returns 月〜金かつ祝日でない場合true
 */
function isWeekday(dateKey: string): boolean {
  const jstDay = new Date(`${dateKey}T00:00:00+09:00`)
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short',
  }).format(jstDay)
  if (weekday === 'Sat' || weekday === 'Sun') {
    return false
  }

  return !holidayJp.isHoliday(dateKey)
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
