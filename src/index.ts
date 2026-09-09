import type { Env } from '@/env'
import { handleMorning } from '@/handlers/morning'
import { handleSync } from '@/handlers/sync'

const MORNING_CRON = '1 21 * * *'

export default {
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    await runScheduled(event, env)
  },
}

/**
 * スケジュールされたハンドラーを実行する
 * @param event イベントオブジェクト
 * @param env 環境変数
 * @returns スケジュールされたハンドラーが完了したことを示すPromise
 */
async function runScheduled(event: ScheduledEvent, env: Env): Promise<void> {
  const job = event.cron === MORNING_CRON ? '当日の予定取得' : '差分同期'
  try {
    if (event.cron === MORNING_CRON) {
      await handleMorning(env)
      return
    }

    await handleSync(env)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error({
      message: `Scheduled handler failed (${job})`,
      error: message,
      stack,
    })
  }
}
