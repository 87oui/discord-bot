import { describe, expect, it } from 'vitest'
import { shouldNotifyEvent } from '@/lib/notifyFilter'

describe('shouldNotifyEvent', () => {
  describe('familyNotifyFilter が false のとき', () => {
    it('日中の仕事予定でも true', () => {
      expect(
        shouldNotifyEvent(
          '2026-08-10T10:00:00+09:00',
          '2026-08-10T11:00:00+09:00',
          false
        )
      ).toBe(true)
    })
  })

  describe('時刻付き予定（17:00〜翌4:00 に完全収納）', () => {
    it('夕方帯に完全に収まる予定は true', () => {
      expect(
        shouldNotifyEvent(
          '2026-08-10T18:00:00+09:00',
          '2026-08-10T20:00:00+09:00',
          true
        )
      ).toBe(true)
    })

    it('日をまたいで夜間帯に収まる予定は true', () => {
      expect(
        shouldNotifyEvent(
          '2026-08-10T22:00:00+09:00',
          '2026-08-11T03:00:00+09:00',
          true
        )
      ).toBe(true)
    })

    it('深夜帯のみの予定は true', () => {
      expect(
        shouldNotifyEvent(
          '2026-08-11T02:00:00+09:00',
          '2026-08-11T03:30:00+09:00',
          true
        )
      ).toBe(true)
    })

    it('17:00ちょうど開始・翌4:00ちょうど終了は true', () => {
      expect(
        shouldNotifyEvent(
          '2026-08-10T17:00:00+09:00',
          '2026-08-11T04:00:00+09:00',
          true
        )
      ).toBe(true)
    })

    it('日中に一部重なる予定は false', () => {
      expect(
        shouldNotifyEvent(
          '2026-08-10T16:00:00+09:00',
          '2026-08-10T18:00:00+09:00',
          true
        )
      ).toBe(false)
    })

    it('夜間開始だが翌朝4時を超える予定は false', () => {
      expect(
        shouldNotifyEvent(
          '2026-08-10T22:00:00+09:00',
          '2026-08-11T05:00:00+09:00',
          true
        )
      ).toBe(false)
    })

    it('平日日中の予定は false', () => {
      expect(
        shouldNotifyEvent(
          '2026-08-10T10:00:00+09:00',
          '2026-08-10T11:00:00+09:00',
          true
        )
      ).toBe(false)
    })
  })

  describe('終日予定（土日祝のみ）', () => {
    it('土曜日のみの終日は true', () => {
      // 2026-08-08 は土曜。Google 終日の end は排他で翌日
      expect(shouldNotifyEvent('2026-08-08', '2026-08-09', true)).toBe(true)
    })

    it('日曜のみの終日は true', () => {
      expect(shouldNotifyEvent('2026-08-09', '2026-08-10', true)).toBe(true)
    })

    it('土日にまたがる終日は true', () => {
      expect(shouldNotifyEvent('2026-08-08', '2026-08-10', true)).toBe(true)
    })

    it('祝日のみの終日は true', () => {
      // 2026-01-01 は元日
      expect(shouldNotifyEvent('2026-01-01', '2026-01-02', true)).toBe(true)
    })

    it('平日のみの終日は false', () => {
      // 2026-08-10 は月曜
      expect(shouldNotifyEvent('2026-08-10', '2026-08-11', true)).toBe(false)
    })

    it('金曜を含む終日は false', () => {
      // 2026-08-07(金)〜08(土)
      expect(shouldNotifyEvent('2026-08-07', '2026-08-09', true)).toBe(false)
    })
  })
})
