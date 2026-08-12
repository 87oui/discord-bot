export interface Env {
  CALENDAR_KV: KVNamespace
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GOOGLE_REFRESH_TOKEN: string
  DISCORD_WEBHOOK_URL: string
}

export interface CalendarConfig {
  id: string
  name: string
  /**
   * true のとき家族向け時間帯フィルタを適用する。
   * - 時刻付き: 17:00〜翌4:00 に完全収まる予定のみ
   * - 終日: 土日祝のみ
   */
  familyNotifyFilter?: boolean
}

export interface EventSnapshot {
  summary: string
  start: string
  end: string
}

export type EventSnapshotMap = Record<string, EventSnapshot>

export interface CachedAccessToken {
  accessToken: string
  expiresAt: number
}
