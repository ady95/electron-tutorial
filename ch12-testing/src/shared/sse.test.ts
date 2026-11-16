import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createSseParser } from './sse.ts';

const collect = (chunks: string[]) => {
  const got: string[] = [];
  const p = createSseParser((d) => got.push(d));
  for (const c of chunks) p.push(c);
  p.end();
  return got;
};

test('이벤트마다 data 값을 하나씩 낸다', () => {
  assert.deepEqual(collect(['data: {"a":1}\n\ndata: [DONE]\n\n']), [
    '{"a":1}',
    '[DONE]',
  ]);
});

test('줄 중간에서 끊겨 도착해도 이어 붙인다', () => {
  assert.deepEqual(collect(['da', 'ta: {"text":"안', '녕"}\n', '\n']), [
    '{"text":"안녕"}',
  ]);
});

test('CRLF 줄바꿈과 주석 줄을 처리한다', () => {
  assert.deepEqual(collect([': keep-alive\r\n\r\ndata: x\r\n\r\n']), ['x']);
});

test('여러 줄 data는 줄바꿈으로 합친다', () => {
  assert.deepEqual(collect(['data: 1\ndata: 2\n\n']), ['1\n2']);
});

test('마지막 빈 줄 없이 끝나도 남은 이벤트를 낸다', () => {
  assert.deepEqual(collect(['data: last']), ['last']);
});
