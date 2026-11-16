import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseRetryAfter, retryDelay } from './retry.ts';

test('Retry-After 초 단위', () => {
  assert.equal(parseRetryAfter('3'), 3000);
  assert.equal(parseRetryAfter('0.5'), 500);
});

test('Retry-After HTTP 날짜', () => {
  const now = Date.parse('2026-11-16T00:00:00Z');
  assert.equal(parseRetryAfter('Mon, 16 Nov 2026 00:00:10 GMT', now), 10_000);
  assert.equal(parseRetryAfter('Mon, 16 Nov 2026 00:00:00 GMT', now + 5000), 0);
});

test('Retry-After가 없거나 이상하면 null', () => {
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter(''), null);
  assert.equal(parseRetryAfter('soon'), null);
  assert.equal(parseRetryAfter('-1'), null);
});

test('서버가 알려 준 시간이 우선', () => {
  assert.equal(
    retryDelay(1, 7000, () => 0.9),
    7000,
  );
});

test('지수 백오프와 무작위 가산', () => {
  assert.equal(
    retryDelay(1, null, () => 0),
    1000,
  );
  assert.equal(
    retryDelay(2, null, () => 0),
    2000,
  );
  assert.equal(
    retryDelay(3, null, () => 1),
    5200,
  );
});
