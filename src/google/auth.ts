import type { Env } from '@/env'
import { getCachedAccessToken, putCachedAccessToken } from '@/kv/store'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'

/**
 * Googleアクセストークンを取得する
 * @param env Googleカレンダーに関する環境変数
 * @returns Googleアクセストークン
 */
export async function getAccessToken(env: Env): Promise<string> {
  // キャッシュされたトークンがあり、有効期限が1分以内の場合
  const cached = await getCachedAccessToken(env)
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken
  }

  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  })

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `Failed to refresh Google access token: ${response.status} ${text}`
    )
  }

  const json = (await response.json()) as {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }
  if (!json.access_token || typeof json.expires_in !== 'number') {
    throw new Error(
      `Google token response missing fields: error=${json.error ?? ''} ${json.error_description ?? ''} expires_in=${String(json.expires_in)}`
    )
  }

  const cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  }
  await putCachedAccessToken(env, cachedToken)

  return cachedToken.accessToken
}
