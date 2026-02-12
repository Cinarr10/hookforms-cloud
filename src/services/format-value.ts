/**
 * Smart value formatter for webhook payloads.
 *
 * When a value is a nested object (common with GitHub, Stripe, GitLab webhooks etc.)
 * we try to extract a human-readable display name instead of showing "[object Object]".
 *
 * Priority order for display-name extraction:
 *   full_name > name > login > title > label > email > url > id
 *
 * If none of those keys exist, falls back to compact JSON.
 */

/** Keys we look for (in priority order) when extracting a display name from an object. */
const DISPLAY_KEYS = [
  'full_name',
  'name',
  'login',
  'title',
  'label',
  'email',
  'html_url',
  'url',
  'id',
] as const;

/**
 * Format a single value into a human-readable string.
 *
 * - Primitives are returned via `String(val)`.
 * - Arrays of primitives are joined with ", ".
 * - Objects are inspected for well-known display keys; if found we return that.
 * - Otherwise we return compact JSON (truncated to `maxLen` chars).
 */
export function formatValue(val: unknown, maxLen = 300): string {
  if (val === null || val === undefined) return '';

  // Primitives
  if (typeof val !== 'object') return String(val);

  // Arrays
  if (Array.isArray(val)) {
    if (val.length === 0) return '(empty)';
    // If every element is primitive, join them
    if (val.every((v) => typeof v !== 'object' || v === null)) {
      return val.map(String).join(', ');
    }
    // Array of objects — try to extract display names from each
    const items = val.map((v) => formatValue(v, 80));
    const joined = items.join(', ');
    return joined.length > maxLen ? `${joined.substring(0, maxLen)}...` : joined;
  }

  // Objects — try display-name extraction
  const obj = val as Record<string, unknown>;
  for (const key of DISPLAY_KEYS) {
    if (key in obj && obj[key] !== null && obj[key] !== undefined && typeof obj[key] !== 'object') {
      return String(obj[key]);
    }
  }

  // Fallback: compact JSON (truncated)
  try {
    const json = JSON.stringify(val);
    return json.length > maxLen ? `${json.substring(0, maxLen)}...` : json;
  } catch {
    return '[complex value]';
  }
}
