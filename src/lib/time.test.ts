import { describe, expect, it } from 'vitest'
import {
  formatEventTime,
  formatTimestamp,
  getDaysRange,
  getTodayRange,
} from '@/lib/time'

describe('getTodayRange', () => {
  it('日本時間の当日 0:00 〜 翌日 0:00 を返す', () => {
    // 2026-08-10 15:30 日本時間 = 2026-08-10 06:30 UTC
    const now = new Date('2026-08-10T06:30:00.000Z')
    const { timeMin, timeMax } = getTodayRange(now)

    expect(timeMin).toBe(new Date('2026-08-10T00:00:00+09:00').toISOString())
    expect(timeMax).toBe(new Date('2026-08-11T00:00:00+09:00').toISOString())
  })

  it('UTC日付が前日でも日本時間当日を使う', () => {
    // 2026-08-10 01:00 日本時間 = 2026-08-09 16:00 UTC
    const now = new Date('2026-08-09T16:00:00.000Z')
    const { timeMin, timeMax } = getTodayRange(now)

    expect(timeMin).toBe(new Date('2026-08-10T00:00:00+09:00').toISOString())
    expect(timeMax).toBe(new Date('2026-08-11T00:00:00+09:00').toISOString())
  })
})

describe('getDaysRange', () => {
  it('指定日数後の日本時間 0:00 を timeMax にする', () => {
    const now = new Date('2026-08-10T06:30:00.000Z')
    const { timeMin, timeMax } = getDaysRange(now, 7)

    expect(timeMin).toBe(new Date('2026-08-10T00:00:00+09:00').toISOString())
    expect(timeMax).toBe(new Date('2026-08-17T00:00:00+09:00').toISOString())
  })

  it('days が 1 未満ならエラー', () => {
    expect(() => getDaysRange(new Date(), 0)).toThrow(
      'days must be a positive integer'
    )
  })
})

describe('formatEventTime', () => {
  it('終日（1日）を整形する', () => {
    expect(formatEventTime('2026-08-10', '2026-08-11')).toBe(
      '2026/08/10（終日）'
    )
  })

  it('終日（複数日）を整形する', () => {
    expect(formatEventTime('2026-08-08', '2026-08-10')).toBe(
      '2026/08/08 〜 2026/08/09（終日）'
    )
  })

  it('同日の時刻付き予定は終了を時刻のみにする', () => {
    expect(
      formatEventTime('2026-08-10T18:00:00+09:00', '2026-08-10T20:00:00+09:00')
    ).toBe('2026/08/10 18:00 〜 20:00')
  })

  it('日またぎの時刻付き予定は終了も日付付きにする', () => {
    expect(
      formatEventTime('2026-08-10T22:00:00+09:00', '2026-08-11T02:00:00+09:00')
    ).toBe('2026/08/10 22:00 〜 2026/08/11 02:00')
  })
})

describe('formatTimestamp', () => {
  it('日付のみは 日本時間 0:00 として解釈する', () => {
    expect(formatTimestamp('2026-08-10')).toBe(
      new Date('2026-08-10T00:00:00+09:00').getTime()
    )
  })

  it('ISO 日時はそのまま解釈する', () => {
    const iso = '2026-08-10T18:00:00+09:00'
    expect(formatTimestamp(iso)).toBe(new Date(iso).getTime())
  })
})
