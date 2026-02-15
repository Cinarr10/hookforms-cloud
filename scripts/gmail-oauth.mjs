#!/usr/bin/env node
/**
 * Gmail OAuth2 refresh token generator.
 *
 * Uses the same redirect URI (http://localhost:8090/callback) as
 * the original hookforms gmail_auth scripts — already registered
 * in Google Cloud Console.
 *
 * Usage:
 *   node scripts/gmail-oauth.mjs <CLIENT_ID> <CLIENT_SECRET>
 *
 * Or with no args, uses the hardcoded defaults.
 */

import { createServer } from 'http';
import { execSync } from 'child_process';
import { URL } from 'url';

const clientId = process.argv[2] || process.env.GMAIL_CLIENT_ID;
const clientSecret = process.argv[3] || process.env.GMAIL_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Usage: node scripts/gmail-oauth.mjs <CLIENT_ID> <CLIENT_SECRET>');
  console.error('  Or set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET env vars.');
  console.error('\nGet these from: https://console.cloud.google.com/apis/credentials');
  process.exit(1);
}

const PORT = 8090;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = 'https://www.googleapis.com/auth/gmail.send';

// Build authorization URL
// access_type=offline  — requests a refresh_token
// prompt=consent       — forces re-consent so Google ALWAYS returns a refresh_token
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

console.log('\n=== Gmail OAuth2 Token Generator ===\n');
console.log('Open this URL in your browser:\n');
console.log(`  ${authUrl.toString()}\n`);
console.log('Waiting for callback...\n');

// Start local server to receive the callback
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname !== '/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h1>Error</h1><p>${error}</p>`);
    console.error(`OAuth error: ${error}`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end('<h1>Error</h1><p>No authorization code received</p>');
    return;
  }

  // Exchange code for tokens
  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResp.json();

    if (!tokenResp.ok) {
      throw new Error(JSON.stringify(tokenData));
    }

    if (!tokenData.refresh_token) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<h1>Warning</h1><p>No refresh_token returned. Revoke access at <a href="https://myaccount.google.com/permissions">Google Account Permissions</a> and try again.</p>`);
      console.error('\nNo refresh_token in response.');
      console.error('Revoke access at https://myaccount.google.com/permissions and retry.\n');
      console.log('Full response:', JSON.stringify(tokenData, null, 2));
      server.close();
      process.exit(1);
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h1>Success!</h1><p>Refresh token obtained. Check your terminal.</p></body></html>');

    console.log('=== Token obtained successfully ===\n');
    console.log(`Refresh Token: ${tokenData.refresh_token}\n`);

    // Set the wrangler secret
    console.log('Setting GMAIL_REFRESH_TOKEN as Wrangler secret...\n');
    try {
      execSync(`echo "${tokenData.refresh_token}" | npx wrangler secret put GMAIL_REFRESH_TOKEN`, {
        stdio: 'inherit',
      });
      console.log('\nSecret updated!');
    } catch {
      console.error('\nFailed to set secret automatically. Set it manually:');
      console.error(`  echo "${tokenData.refresh_token}" | npx wrangler secret put GMAIL_REFRESH_TOKEN`);
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h1>Error</h1><p>${err.message}</p>`);
    console.error('Token exchange failed:', err);
  }

  server.close();
});

server.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}/callback`);
});
