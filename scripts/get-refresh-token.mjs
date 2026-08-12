#!/usr/bin/env node
/**
 * Obtain a Google OAuth refresh_token for Calendar readonly access.
 *
 * Usage:
 *   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run oauth
 *
 * Add this redirect URI in Google Cloud Console:
 *   http://127.0.0.1:8787/oauth2callback
 */

import http from 'node:http'
import { URL } from 'node:url'

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const PORT = 8787
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.'
  )
  process.exit(1)
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id', CLIENT_ID)
authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope', SCOPE)
authUrl.searchParams.set('access_type', 'offline')
authUrl.searchParams.set('prompt', 'consent')

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
    if (reqUrl.pathname !== '/oauth2callback') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found')
      return
    }

    const error = reqUrl.searchParams.get('error')
    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(`Authorization failed: ${error}`)
      console.error('Authorization failed:', error)
      server.close()
      process.exit(1)
    }

    const code = reqUrl.searchParams.get('code')
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Missing code')
      return
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })

    const tokenJson = await tokenRes.json()
    if (!tokenRes.ok) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Token exchange failed. See terminal.')
      console.error('Token exchange failed:', tokenJson)
      server.close()
      process.exit(1)
    }

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Success. You can close this tab and return to the terminal.')

    console.log('\n=== OAuth tokens ===')
    console.log('access_token:', tokenJson.access_token)
    if (tokenJson.refresh_token) {
      console.log('refresh_token:', tokenJson.refresh_token)
      console.log(
        '\nStore refresh_token as Cloudflare Secret:\n  npx wrangler secret put GOOGLE_REFRESH_TOKEN'
      )
    } else {
      console.warn(
        '\nNo refresh_token returned. Revoke prior grants at https://myaccount.google.com/permissions and retry with prompt=consent.'
      )
    }

    server.close()
    process.exit(0)
  } catch (err) {
    console.error(err)
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Internal error')
    server.close()
    process.exit(1)
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('Waiting for OAuth callback on', REDIRECT_URI)
  console.log('\nOpen this URL in your browser:\n')
  console.log(authUrl.toString())
  console.log('')
})
