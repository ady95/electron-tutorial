import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createNdjsonParser } from './ndjson.ts';

test('줄 중간에서 끊긴 조각을 이어 붙인다', () => {
  const got: unknown[] = [];
  const p = createNdjsonParser((v) => got.push(v));
  p.push('{"a":1}\n{"b"');
  p.push(':2}\n');
  p.push('{"c":3}');
  p.end();
  assert.deepEqual(got, [{ a: 1 }, { b: 2 }, { c: 3 }]);
});

test('빈 줄은 건너뛴다', () => {
  const got: unknown[] = [];
  const p = createNdjsonParser((v) => got.push(v));
  p.push('\n{"a":1}\n\n');
  p.end();
  assert.deepEqual(got, [{ a: 1 }]);
});

test('깨진 줄은 예외', () => {
  const p = createNdjsonParser(() => {});
  assert.throws(() => p.push('{"a":\n'));
});
