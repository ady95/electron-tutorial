// 재시도 대기 시간 계산. 순수 함수라 Electron 없이 테스트할 수 있다.

// Retry-After 헤더: 초(숫자) 또는 HTTP 날짜. 알 수 없으면 null
export function parseRetryAfter(
  value: string | null,
  now = Date.now(),
): number | null {
  if (value === null || value.trim() === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds))
    return seconds >= 0 ? Math.round(seconds * 1000) : null;
  const date = Date.parse(value); // 숫자가 아닐 때만 날짜로 본다 ('-1'도 날짜로 해석되기 때문)
  if (!Number.isNaN(date)) return Math.max(0, date - now);
  return null;
}

// attempt는 1부터. 서버가 기다릴 시간을 알려 줬으면 그대로 따르고,
// 아니면 1초, 2초, 4초…로 늘리며 0~30%를 무작위로 더한다(여러 앱이 동시에 다시 몰리지 않게)
export function retryDelay(
  attempt: number,
  retryAfterMs: number | null,
  random: () => number = Math.random,
): number {
  if (retryAfterMs !== null) return retryAfterMs;
  const base = 1000 * 2 ** (attempt - 1);
  return Math.round(base * (1 + 0.3 * random()));
}
