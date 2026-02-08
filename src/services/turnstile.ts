/**
 * Verify a Cloudflare Turnstile token.
 */
export async function verifyTurnstile(
  secret: string,
  token: string,
  remoteIp?: string,
): Promise<boolean> {
  const resp = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
    },
  );

  if (!resp.ok) return false;

  const result = (await resp.json()) as { success: boolean };
  return result.success;
}
