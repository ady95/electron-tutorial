import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  completedTurns,
  fitHistory,
  recentTurns,
  type ChatMessage,
} from './chat.ts';

const u = (content: string): ChatMessage => ({ role: 'user', content });
const a = (content: string): ChatMessage => ({ role: 'assistant', content });

test('예산 안이면 모두 보낸다', () => {
  const r = fitHistory('sys', [u('aa'), a('bb'), u('cc')], 100);
  assert.equal(r?.dropped, 0);
  assert.equal(r?.messages.length, 4);
  assert.equal(r?.messages[0].role, 'system');
});

test('예산을 넘으면 오래된 것부터 뺀다', () => {
  // sys(3) + 마지막 질문(4) = 7, 예산 15 → 바로 앞 답변(4)까지 담고 그 앞(4)은 넘친다
  const r = fitHistory(
    'sys',
    [u('1111'), a('2222'), u('3333'), a('4444'), u('5555')],
    15,
  );
  assert.deepEqual(r?.messages.slice(1), [u('3333'), a('4444'), u('5555')]);
  assert.equal(r?.dropped, 2);
});

test('맨 앞이 답변으로 시작하지 않게 한다', () => {
  const r = fitHistory('', [u('1111'), a('2222'), u('3333')], 8);
  assert.deepEqual(r?.messages.slice(1), [u('3333')]);
  assert.equal(r?.dropped, 2);
});

test('마지막 질문만으로 넘치면 null', () => {
  assert.equal(fitHistory('sys', [u('x'.repeat(50))], 10), null);
});

test('마지막이 사용자 메시지가 아니면 null', () => {
  assert.equal(fitHistory('sys', [u('a'), a('b')], 100), null);
});

test('measure 함수로 단위를 바꿀 수 있다', () => {
  const history = [u('가나다라'), a('마바'), u('사')];
  // 글자 수로 재면 사(1)+마바(2)=3, 가나다라(4)는 넘친다
  assert.equal(fitHistory('', history, 4)?.dropped, 2);
  // 두 글자를 1로 재면 사(1)+마바(1)+가나다라(2)=4로 모두 들어간다
  assert.equal(
    fitHistory('', history, 4, (t) => Math.ceil(t.length / 2))?.dropped,
    0,
  );
});

test('완료된 질문-답변 쌍만 고른다', () => {
  const turns = [
    { role: 'user' as const, content: '질문1', done: true },
    { role: 'assistant' as const, content: '답1', done: true },
    { role: 'user' as const, content: '너무 긴 질문', done: true },
    { role: 'assistant' as const, content: '', done: false }, // 거절·오류·중지
    { role: 'user' as const, content: '질문3', done: true },
    { role: 'assistant' as const, content: '답3', done: true },
  ];
  assert.deepEqual(completedTurns(turns), [
    u('질문1'),
    a('답1'),
    u('질문3'),
    a('답3'),
  ]);
});

test('상한을 넘으면 최근 쌍만 남긴다', () => {
  const turns = Array.from({ length: 10 }, (_, i) =>
    i % 2 === 0 ? u(`q${i}`) : a(`a${i}`),
  );
  // 상한 6 → 새 질문 자리 1개를 빼면 5, 짝수로 4개
  const r = recentTurns(turns, 6);
  assert.equal(r.kept.length, 4);
  assert.equal(r.kept[0].role, 'user');
  assert.equal(r.omitted, 6);
  assert.equal(recentTurns(turns.slice(0, 4), 6).omitted, 0);
});
