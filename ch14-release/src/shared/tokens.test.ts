import assert from 'node:assert/strict';
import { test } from 'vitest';
import { estimateTokens } from './tokens.ts';

test('한글은 글자당 1', () => {
  assert.equal(estimateTokens('가나다'), 3);
});

test('ASCII는 3글자당 1 (올림)', () => {
  assert.equal(estimateTokens('abcd'), 2);
  assert.equal(estimateTokens(''), 0);
});

test('섞인 글', () => {
  assert.equal(estimateTokens('Electron 앱'), 1 + 3); // 앱(1) + "Electron "(9글자→3)
});

test('이모지 등 서로게이트 쌍은 한 글자로 센다', () => {
  assert.equal(estimateTokens('😀'), 1);
});
