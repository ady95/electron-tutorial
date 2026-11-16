import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeRequest, parseWorkerLine } from './protocol.ts';

test('진행률·결과·오류 메시지를 해석한다', () => {
  assert.deepEqual(
    parseWorkerLine(
      '{"id":1,"type":"progress","done":2,"total":7,"file":"서울-강남.xlsx"}',
    ),
    {
      id: 1,
      type: 'progress',
      done: 2,
      total: 7,
      file: '서울-강남.xlsx',
    },
  );
  assert.deepEqual(
    parseWorkerLine('{"id":3,"type":"result","result":{"rows":10}}'),
    {
      id: 3,
      type: 'result',
      result: { rows: 10 },
    },
  );
  assert.deepEqual(
    parseWorkerLine(
      '{"id":4,"type":"error","code":"cancelled","message":"취소했습니다."}',
    ),
    {
      id: 4,
      type: 'error',
      code: 'cancelled',
      message: '취소했습니다.',
    },
  );
});

test('프로토콜이 아닌 줄은 null', () => {
  assert.equal(parseWorkerLine('읽는 중: 서울-강남.xlsx'), null); // 스크립트의 print
  assert.equal(parseWorkerLine('[1, 2]'), null);
  assert.equal(parseWorkerLine('{"type":"result"}'), null); // id 없음
  assert.equal(parseWorkerLine('{"id":1,"type":"progress","done":"2"}'), null); // 형식 오류
  assert.equal(parseWorkerLine('{"id":1,"type":"hello"}'), null);
});

test('요청은 줄바꿈이 든 값이어도 정확히 한 줄이다', () => {
  const line = encodeRequest(5, 'report', { inputDir: '여러\n줄' });
  assert.equal(line.split('\n').length, 2); // 내용 한 줄 + 끝의 빈 문자열
  assert.ok(line.endsWith('\n'));
  assert.deepEqual(JSON.parse(line), {
    id: 5,
    method: 'report',
    params: { inputDir: '여러\n줄' },
  });
});
