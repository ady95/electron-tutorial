// 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeText } from './text.ts';

const utf8 = (s: string) => new TextEncoder().encode(s);

test('UTF-8 파일은 그대로 읽는다', () => {
  assert.deepEqual(decodeText(utf8('회의록\n첫 줄')), {
    text: '회의록\n첫 줄',
    encoding: 'utf-8',
  });
});

test('UTF-8 BOM은 떼어 낸다', () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('공지')]);
  assert.deepEqual(decodeText(bytes), { text: '공지', encoding: 'utf-8' });
});

test('UTF-8로 읽을 수 없으면 EUC-KR(CP949)로 읽는다', () => {
  // "한글" (CP949: C7 D1 B1 DB)
  const bytes = new Uint8Array([0xc7, 0xd1, 0xb1, 0xdb]);
  assert.deepEqual(decodeText(bytes), { text: '한글', encoding: 'euc-kr' });
});

test('CP949 확장 글자(똠)도 읽는다', () => {
  // "똠" (CP949: 8C 63) — KS X 1001 완성형에는 없는 글자
  assert.equal(decodeText(new Uint8Array([0x8c, 0x63])).text, '똠');
});

test('UTF-16LE(BOM 있음)도 읽는다', () => {
  // "가A" = AC00 0041
  const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0xac, 0x41, 0x00]);
  assert.deepEqual(decodeText(bytes), { text: '가A', encoding: 'utf-16le' });
});

test('줄바꿈(CRLF, CR)을 LF로 통일한다', () => {
  assert.equal(decodeText(utf8('a\r\nb\rc')).text, 'a\nb\nc');
});
