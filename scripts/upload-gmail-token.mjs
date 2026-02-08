#!/usr/bin/env node
/**
 * Helper to set Gmail secrets via wrangler.
 *
 * After running gmail_auth.py from the main hookforms repo (or getting
 * your OAuth credentials from Google Cloud Console), use this script
 * to upload them as Wrangler secrets.
 *
 * Usage:
 *   node scripts/upload-gmail-token.mjs
 *
 * It will prompt you for each value interactively via wrangler secret put.
 */

import { execSync } from 'child_process';

const secrets = [
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN',
  'GMAIL_SENDER_EMAIL',
];

console.log('Upload Gmail credentials as Wrangler secrets.\n');
console.log('You will be prompted for each value.\n');

for (const secret of secrets) {
  console.log(`\n--- Setting ${secret} ---`);
  try {
    execSync(`npx wrangler secret put ${secret}`, { stdio: 'inherit' });
  } catch {
    console.error(`Failed to set ${secret}. Skipping.`);
  }
}

console.log('\nDone. Redeploy with: npm run deploy');
