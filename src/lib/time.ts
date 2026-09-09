export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * 日本時間当日 0:00 から指定日数後の 0:00 までを返す
 * @param now 現在時刻（Dateオブジェクト）
 * @param days 日数（1なら当日のみ）
 * @param timeZone タイムゾーン
 * @returns 開始時刻と終了時刻
 */
export function getDaysRange(
  now = new Date(),
  days = 1,
  timeZone = 'Asia/Tokyo'
): { timeMin: string; timeMax: string } {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error('days must be a positive integer')
  }

  // 渡された現在時刻Dateオブジェクトをパーツごとに分解する
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  // パーツごとに年月日を取得する
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  if (!year || !month || !day) {
    throw new Error('Failed to resolve JST date parts')
  }

  // timeMin: 今日の0時0分
  const timeMin = new Date(
    `${year}-${month}-${day}T00:00:00+09:00`
  ).toISOString()
  // timeMax: 指定日数経過後の0時0分
  const endDay = new Date(`${year}-${month}-${day}T00:00:00+09:00`)
  endDay.setUTCDate(endDay.getUTCDate() + days)
  const timeMax = endDay.toISOString()

  return { timeMin, timeMax }
}

/**
 * 今日の開始時刻と終了時刻を返す
 * @param now 現在時刻（Dateオブジェクト）
 * @param timeZone タイムゾーン
 * @returns 今日の開始時刻と終了時刻
 */
export function getTodayRange(
  now = new Date(),
  timeZone = 'Asia/Tokyo'
): { timeMin: string; timeMax: string } {
  return getDaysRange(now, 1, timeZone)
}

/**
 * 現在時刻から指定日数後までの範囲を返す
 * @param now 現在時刻（Dateオブジェクト）
 * @param days 日数
 * @returns 開始時刻と終了時刻
 */
export function getFromNowRange(
  now = new Date(),
  days = 365
): { timeMin: string; timeMax: string } {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error('days must be a positive integer')
  }

  const timeMin = now.toISOString()
  const timeMax = new Date(
    now.getTime() + days * 24 * 60 * 60 * 1000
  ).toISOString()

  return { timeMin, timeMax }
}

/**
 * 開始・終了日時を表す文字列を返す
 * @param startDateTimeStr 開始日時（ISO 8601形式）
 * @param endDateTimeStr 終了日時（ISO 8601形式）
 * @returns 開始・終了日時を表す文字列
 */
export function formatEventTime(
  startDateTimeStr: string,
  endDateTimeStr: string,
  timeZone = 'Asia/Tokyo'
): string {
  // 開始・終了日ともに終日予定の場合は日付のみをフォーマットして返す
  if (DATE_ONLY.test(startDateTimeStr) && DATE_ONLY.test(endDateTimeStr)) {
    const endDateTime = new Date(`${endDateTimeStr}T00:00:00+09:00`)
    // Googleカレンダーは終日予定の場合、終了日が翌日になるため1日前倒しにする
    endDateTime.setUTCDate(endDateTime.getUTCDate() - 1)
    const endInclusive = formatDate(endDateTime, timeZone)
    const startInclusive = startDateTimeStr.replaceAll('-', '/')

    if (startInclusive === endInclusive) {
      return `${startInclusive}（終日）`
    }

    return `${startInclusive} 〜 ${endInclusive}（終日）`
  }

  const startLabel = formatDateTime(startDateTimeStr, timeZone)
  const endLabel = isSameDate(startDateTimeStr, endDateTimeStr, timeZone)
    ? formatTime(endDateTimeStr, timeZone)
    : formatDateTime(endDateTimeStr, timeZone)

  return `${startLabel} 〜 ${endLabel}`
}

/**
 * Dateオブジェクトをタイムゾーンに合わせてフォーマットする
 * @param date 日付（Dateオブジェクト）
 * @param timeZone タイムゾーン
 * @returns 日付を表す文字列（yyyy/mm/dd）
 */
function formatDate(date: Date, timeZone = 'Asia/Tokyo'): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * ISO 8601形式の日時をフォーマットする
 * @param dateStr 日時（ISO 8601形式）
 * @returns 日時を表す文字列（yyyy/mm/dd HH:MM）
 */
export function formatDateTime(
  dateStr: string,
  timeZone = 'Asia/Tokyo'
): string {
  // 日付のみの場合は `-` を `/` に変換して返す
  if (DATE_ONLY.test(dateStr)) {
    return dateStr.replaceAll('-', '/')
  }

  const date = new Date(dateStr)

  return new Intl.DateTimeFormat('ja-JP', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

/**
 * ISO 8601形式の日時から時刻のみをフォーマットする
 * @param dateStr 日時（ISO 8601形式）
 * @param timeZone タイムゾーン
 * @returns 時刻を表す文字列（HH:MM）
 */
function formatTime(dateStr: string, timeZone = 'Asia/Tokyo'): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(dateStr))
}

/**
 * 日時文字列が同じ日付かどうかを返す
 * @param a 日時文字列（YYYY-MM-DD HH:MM または YYYY-MM-DD）
 * @param b 日時文字列（YYYY-MM-DD HH:MM または YYYY-MM-DD）
 * @param timeZone タイムゾーン
 * @returns 日時文字列が同じ日付かどうか
 */
function isSameDate(a: string, b: string, timeZone = 'Asia/Tokyo'): boolean {
  return toDateKey(a, timeZone) === toDateKey(b, timeZone)
}

/**
 * 日時文字列を日付キーに変換して返す
 * @param value 日時文字列
 * @param timeZone タイムゾーン
 * @returns 日付キー
 */
function toDateKey(value: string, timeZone = 'Asia/Tokyo'): string {
  if (DATE_ONLY.test(value)) {
    return value
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

/**
 * 日時文字列をUTCタイムスタンプに変換して返す
 * @param dateStr 日時文字列
 * @returns UTCタイムスタンプ
 */
export function formatTimestamp(dateStr: string): number {
  let dateTimeStr = dateStr
  if (DATE_ONLY.test(dateStr)) {
    dateTimeStr = `${dateStr}T00:00:00+09:00`
  }

  return new Date(dateTimeStr).getTime()
}
