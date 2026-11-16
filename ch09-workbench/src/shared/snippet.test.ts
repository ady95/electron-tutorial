import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSnippet } from './snippet.ts';

test('검색어 앞뒤를 잘라 말줄임표를 붙인다', () => {
  const text = '가'.repeat(100) + '인쇄소 발주' + '나'.repeat(100);
  const s = makeSnippet(text, '발주', 5);
  assert.equal(s, '…가인쇄소 발주나나나나나…'); // 앞뒤 5글자(공백 포함)
});

test('줄바꿈과 연속 공백은 공백 하나로 바꾼다', () => {
  assert.equal(makeSnippet('첫 줄\n\n  둘째 줄', '둘째'), '첫 줄 둘째 줄');
});

test('대소문자를 구분하지 않는다', () => {
  assert.equal(makeSnippet('Price B5 note', 'b5', 3), '…ce B5 no…');
});

test('검색어가 없으면 앞부분을 보여 준다', () => {
  assert.equal(makeSnippet('짧은 글', '없음'), '짧은 글');
});
