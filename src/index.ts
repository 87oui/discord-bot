import type { Env } from '@/env'
import { handleMorning } from '@/handlers/morning'
import { handleSync } from '@/handlers/sync'

export default {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(runScheduled(event, env))
  },
}

/**
 * スケジュールされたハンドラーを実行する
 * @param event イベントオブジェクト
 * @param env 環境変数
 * @returns スケジュールされたハンドラーが完了したことを示すPromise
 */
async function runScheduled(event: ScheduledEvent, env: Env): Promise<void> {
  try {
    if (event.cron === '0 21 * * *') {
      await handleMorning(env)
      return
    }

    await handleSync(env)
  } catch (err) {
    console.error('Scheduled handler failed:', err)
  }
}
