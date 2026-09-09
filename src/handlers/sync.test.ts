import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '@/env'
import type { CalendarEvent } from '@/google/calendar'
import {
  changesFromUpcomingEvents,
  formatSyncNotification,
  handleSync,
  isInitialWatch,
} from '@/handlers/sync'

const mocks = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  getAccessToken: vi.fn(),
  getCalendars: vi.fn(),
  getSyncToken: vi.fn(),
  getEventSnapshots: vi.fn(),
  putEventSnapshots: vi.fn(),
  putSyncToken: vi.fn(),
  getEvents: vi.fn(),
  fullSyncEvents: vi.fn(),
  syncEvents: vi.fn(),
}))

vi.mock('@/discord/webhook', () => ({
  sendNotification: mocks.sendNotification,
}))

vi.mock('@/google/auth', () => ({
  getAccessToken: mocks.getAccessToken,
}))

vi.mock('@/kv/store', () => ({
  getCalendars: mocks.getCalendars,
  getSyncToken: mocks.getSyncToken,
  getEventSnapshots: mocks.getEventSnapshots,
  putEventSnapshots: mocks.putEventSnapshots,
  putSyncToken: mocks.putSyncToken,
  deleteSyncToken: vi.fn(),
}))

vi.mock('@/google/calendar', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/google/calendar')>()
  return {
    ...original,
    getEvents: mocks.getEvents,
    fullSyncEvents: mocks.fullSyncEvents,
    syncEvents: mocks.syncEvents,
  }
})

const env = {
  CALENDAR_KV: {} as KVNamespace,
  GOOGLE_CLIENT_ID: 'id',
  GOOGLE_CLIENT_SECRET: 'secret',
  GOOGLE_REFRESH_TOKEN: 'refresh',
  DISCORD_WEBHOOK_URL: 'https://discord.example/webhook',
} satisfies Env

const saturdayEvent: CalendarEvent = {
  id: 'sat-1',
  summary: '公園',
  start: { dateTime: '2026-08-29T10:00:00+09:00' },
  end: { dateTime: '2026-08-29T11:00:00+09:00' },
}

const weekdayWorkEvent: CalendarEvent = {
  id: 'work-1',
  summary: '会議',
  start: { dateTime: '2026-08-10T10:00:00+09:00' },
  end: { dateTime: '2026-08-10T11:00:00+09:00' },
}

describe('isInitialWatch', () => {
  it('token も snapshot もないとき true', () => {
    expect(isInitialWatch(null, {})).toBe(true)
  })

  it('token があるときは false', () => {
    expect(
      isInitialWatch('token', {
        a: { summary: 'x', start: '2026-08-29', end: '2026-08-30' },
      })
    ).toBe(false)
  })

  it('snapshot があるときは false', () => {
    expect(
      isInitialWatch(null, {
        a: { summary: 'x', start: '2026-08-29', end: '2026-08-30' },
      })
    ).toBe(false)
  })
})

describe('changesFromUpcomingEvents', () => {
  it('未来の予定を監視開始の追加にする', () => {
    expect(changesFromUpcomingEvents([saturdayEvent], '湊', false)).toEqual([
      {
        type: '追加',
        calendarName: '湊',
        summary: '公園',
        start: '2026-08-29T10:00:00+09:00',
        end: '2026-08-29T11:00:00+09:00',
        watchStart: true,
      },
    ])
  })

  it('familyNotifyFilter で除外された予定は出さない', () => {
    expect(changesFromUpcomingEvents([weekdayWorkEvent], '由起', true)).toEqual(
      []
    )
  })

  it('familyNotifyFilter が false なら平日日中も出す', () => {
    expect(
      changesFromUpcomingEvents([weekdayWorkEvent], '湊', false)
    ).toHaveLength(1)
  })

  it('cancelled と id なしは無視する', () => {
    expect(
      changesFromUpcomingEvents(
        [
          { ...saturdayEvent, status: 'cancelled' },
          { ...saturdayEvent, id: '' },
        ],
        '湊',
        false
      )
    ).toEqual([])
  })
})

describe('formatSyncNotification', () => {
  it('監視開始を先頭に付け、追加と同じ体裁にする', () => {
    expect(
      formatSyncNotification(
        changesFromUpcomingEvents([saturdayEvent], '湊', false)
      )
    ).toBe('監視開始\n✨追加 湊: 公園 2026/08/29 10:00 〜 11:00')
  })

  it('通常の変更は監視開始を付けない', () => {
    expect(
      formatSyncNotification([
        {
          type: '追加',
          calendarName: '由起',
          summary: '買い物',
          start: '2026-08-29T18:00:00+09:00',
          end: '2026-08-29T19:00:00+09:00',
        },
      ])
    ).toBe('✨追加 由起: 買い物 2026/08/29 18:00 〜 19:00')
  })

  it('監視開始と通常の変更が混在するときは空行で分ける', () => {
    expect(
      formatSyncNotification([
        {
          type: '追加',
          calendarName: '由起',
          summary: '買い物',
          start: '2026-08-29T18:00:00+09:00',
          end: '2026-08-29T19:00:00+09:00',
        },
        ...changesFromUpcomingEvents([saturdayEvent], '湊', false),
      ])
    ).toBe(
      [
        '監視開始',
        '✨追加 湊: 公園 2026/08/29 10:00 〜 11:00',
        '',
        '✨追加 由起: 買い物 2026/08/29 18:00 〜 19:00',
      ].join('\n')
    )
  })
})

describe('handleSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAccessToken.mockResolvedValue('access-token')
    mocks.getCalendars.mockResolvedValue([
      { id: 'minato@example.com', name: '湊' },
    ])
    mocks.putEventSnapshots.mockResolvedValue(undefined)
    mocks.putSyncToken.mockResolvedValue(undefined)
    mocks.fullSyncEvents.mockResolvedValue({
      items: [saturdayEvent],
      nextSyncToken: 'next-token',
    })
    mocks.getEvents.mockResolvedValue([saturdayEvent])
    mocks.syncEvents.mockResolvedValue({
      items: [],
      nextSyncToken: 'next-token',
    })
  })

  it('token も snapshot もないときは未来の予定を監視開始として通知する', async () => {
    mocks.getSyncToken.mockResolvedValue(null)
    mocks.getEventSnapshots.mockResolvedValue({})

    await handleSync(env)

    expect(mocks.getEvents).toHaveBeenCalledOnce()
    expect(mocks.fullSyncEvents).toHaveBeenCalledOnce()
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      env.DISCORD_WEBHOOK_URL,
      '監視開始\n✨追加 湊: 公園 2026/08/29 10:00 〜 11:00'
    )
  })

  it('token がなく snapshot があるときは通知しない', async () => {
    mocks.getSyncToken.mockResolvedValue(null)
    mocks.getEventSnapshots.mockResolvedValue({
      'sat-1': {
        summary: '公園',
        start: '2026-08-29T10:00:00+09:00',
        end: '2026-08-29T11:00:00+09:00',
      },
    })

    await handleSync(env)

    expect(mocks.getEvents).not.toHaveBeenCalled()
    expect(mocks.sendNotification).not.toHaveBeenCalled()
  })

  it('token があるときは差分同期し、監視開始は付けない', async () => {
    mocks.getSyncToken.mockResolvedValue('existing-token')
    mocks.getEventSnapshots.mockResolvedValue({})
    mocks.syncEvents.mockResolvedValue({
      items: [saturdayEvent],
      nextSyncToken: 'next-token',
    })

    await handleSync(env)

    expect(mocks.getEvents).not.toHaveBeenCalled()
    expect(mocks.syncEvents).toHaveBeenCalledOnce()
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      env.DISCORD_WEBHOOK_URL,
      '✨追加 湊: 公園 2026/08/29 10:00 〜 11:00'
    )
  })
})
