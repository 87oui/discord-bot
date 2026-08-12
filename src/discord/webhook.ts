const DISCORD_CONTENT_LIMIT = 1900

/**
 * Webhookを通して通知を送信する
 * @param webhookUrl Webhook URL
 * @param content 送信するメッセージ
 */
export async function sendNotification(
  webhookUrl: string,
  content: string
): Promise<void> {
  const chunks = splitMessage(content, DISCORD_CONTENT_LIMIT)
  for (const chunk of chunks) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: chunk }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Discord webhook failed: ${response.status} ${text}`)
    }
  }
}

/**
 * 長いメッセージを分割する
 * @param content 分割するメッセージ
 * @param limit 分割する長さ
 * @returns 分割されたメッセージ
 */
function splitMessage(content: string, limit: number): string[] {
  // 上限よりも短い場合
  if (content.length <= limit) {
    return [content]
  }

  // 改行で分割する
  const lines = content.split('\n')
  const chunks: string[] = []
  let current = ''

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line
    if (candidate.length <= limit) {
      current = candidate
      continue
    }

    if (current) {
      chunks.push(current)
    }

    if (line.length <= limit) {
      current = line
      continue
    }

    // Hard-split overly long lines.
    for (let i = 0; i < line.length; i += limit) {
      chunks.push(line.slice(i, i + limit))
    }
    current = ''
  }

  if (current) {
    chunks.push(current)
  }

  return chunks.length > 0 ? chunks : ['']
}
