import { describe, expect, it } from 'vitest'
import { shouldNotifyEvent } from '@/lib/notifyFilter'

describe('shouldNotifyEvent', () => {
  describe('familyNotifyFilter が false のとき', () => {
    it('平日日中の予定でも true', () => {
      expect(
        shouldNotifyEvent(
          '2026-08-10T10:00:00+09:00',
          '2026-08-10T11:00:00+09:00',
          false
        )
      ).toBe(true)
    })
  })

  describe('familyNotifyFilter が true のとき', () => {
    it('平日 8:00〜16:00 に完全に収まる予定は false', () => {
      // 2026-08-10 は月曜
      expect(
        shouldNotifyEvent(
          '2026-08-10T10:00:00+09:00',
          '2026-08-10T11:00:00+09:00',
          true
        )
      ).toBe(false)
    })

    it('平日 8:00ちょうど開始・16:00ちょうど終了は false', () => {
      expect(
        shouldNotifyEvent(
          '2026-08-10T08:00:00+09:00',
          '2026-08-10T16:00:00+09:00',
          true
        )
      ).toBe(false)
    })

    it('平日でも 8:00 より前に始まる予定は true', () => {
      expect(
        shouldNotifyEvent(
          '2026-08-10T07:00:00+09:00',
          '2026-08-10T09:00:00+09:00',
          true
        )
      ).toBe(true)
    })

    it('平日でも 16:00 を超えて終わる予定は true', () => {
      expect(
        shouldNotifyEvent(
          '2026-08-10T15:00:00+09:00',
          '2026-08-10T17:00:00+09:00',
          true
        )
      ).toBe(true)
    })

    it('平日の夕方帯の予定は true', () => {
      expect(
        shouldNotifyEvent(
          '2026-08-10T18:00:00+09:00',
          '2026-08-10T20:00:00+09:00',
          true
        )
      ).toBe(true)
    })

    it('平日をまたぐ予定は true', () => {
      expect(
        shouldNotifyEvent(
          '2026-08-10T10:00:00+09:00',
          '2026-08-11T10:00:00+09:00',
          true
        )
      ).toBe(true)
    })

    it('土曜日日中の予定は true', () => {
      // 2026-08-08 は土曜
      expect(
        shouldNotifyEvent(
          '2026-08-08T10:00:00+09:00',
          '2026-08-08T11:00:00+09:00',
          true
        )
      ).toBe(true)
    })

    it('祝日日中の予定は true', () => {
      // 2026-01-01 は元日（木曜）
      expect(
        shouldNotifyEvent(
          '2026-01-01T10:00:00+09:00',
          '2026-01-01T11:00:00+09:00',
          true
        )
      ).toBe(true)
    })

    it('土日にまたがる予定は true', () => {
      expect(
        shouldNotifyEvent(
          '2026-08-08T07:00:00+09:00',
          '2026-08-09T17:00:00+09:00',
          true
        )
      ).toBe(true)
    })

    it('終日予定は日程に関係なく true', () => {
      // 2026-08-10 は月曜
      expect(shouldNotifyEvent('2026-08-10', '2026-08-11', true)).toBe(true)
      // 2026-08-08 は土曜
      expect(shouldNotifyEvent('2026-08-08', '2026-08-09', true)).toBe(true)
    })
  })
})
