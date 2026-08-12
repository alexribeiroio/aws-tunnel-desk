export const ACCOUNT_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function accountCheckIsDue(lastCheckedAt, now = Date.now()) {
  return lastCheckedAt <= 0 || now - lastCheckedAt >= ACCOUNT_CHECK_INTERVAL_MS;
}
