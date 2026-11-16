// 실행: node --test src/shared/csv.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { JobSummary } from './ipc';
import {
  BOM,
  escapeCell,
  historyFileName,
  historyToCsv,
  toCsv,
} from './csv.ts';

const job = (over: Partial<JobSummary> = {}): JobSummary => ({
  id: 1,
  startedAt: new Date(2026, 10, 16, 9, 5, 7).toISOString(),
  folderName: '사진',
  total: 3,
  status: 'done',
  message: '',
  sample: [],
  ...over,
});

const lines = (csv: string) => csv.slice(BOM.length).split('\r\n');

test('머리글: BOM으로 시작하고 첫 줄이 한글 머리글이다', () => {
  const csv = historyToCsv([job()]);
  assert.ok(csv.startsWith(BOM));
  const [header, row] = lines(csv);
  assert.equal(header, '시각,폴더,파일 수,결과,메시지');
  assert.equal(row, '2026-11-16 09:05:07,사진,3,완료,');
});

test('빈 목록: 머리글 한 줄만 나온다', () => {
  assert.equal(historyToCsv([]), `${BOM}시각,폴더,파일 수,결과,메시지\r\n`);
});

test('쉼표·큰따옴표·줄바꿈이 있으면 큰따옴표로 감싸고 열이 어긋나지 않는다', () => {
  assert.equal(escapeCell('a,b'), '"a,b"');
  assert.equal(escapeCell('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCell('줄1\n줄2'), '"줄1\n줄2"');
  assert.equal(escapeCell('줄1\r\n줄2'), '"줄1\r\n줄2"');
  assert.equal(escapeCell('평범'), '평범');

  const csv = historyToCsv([
    job({ folderName: 'a,b', status: 'failed', message: 'x "y"\nz' }),
  ]);

  assert.equal(
    csv,
    `${BOM}시각,폴더,파일 수,결과,메시지\r\n` +
      `2026-11-16 09:05:07,"a,b",3,실패,"x ""y""\nz"\r\n`,
  );
});

test('수식 주입: = + - @ 로 시작하는 값은 앞에 작은따옴표를 붙인다', () => {
  assert.equal(escapeCell('=1+1'), "'=1+1");
  assert.equal(escapeCell('+1'), "'+1");
  assert.equal(escapeCell('-1'), "'-1");
  assert.equal(escapeCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(escapeCell('\t=1'), "'\t=1");
  // 수식 방지와 따옴표 처리가 함께 적용된다
  assert.equal(
    escapeCell('=HYPERLINK("http://x","y")'),
    `"'=HYPERLINK(""http://x"",""y"")"`,
  );
  // 중간에 있는 기호는 그대로 둔다
  assert.equal(escapeCell('a=b'), 'a=b');
  // 숫자 셀은 수식 방지 대상이 아니다
  assert.equal(escapeCell(-3), '-3');

  const [, row] = lines(
    historyToCsv([job({ folderName: '=cmd|"/c calc"!A1', message: '@x' })]),
  );
  assert.equal(row, `2026-11-16 09:05:07,"'=cmd|""/c calc""!A1",3,완료,'@x`);
});

test('toCsv: 줄 끝은 CRLF이다', () => {
  assert.equal(toCsv(['a', 'b'], [[1, 'x']]), 'a,b\r\n1,x\r\n');
});

test('기본 파일 이름은 history-YYYYMMDD.csv', () => {
  assert.equal(historyFileName(new Date(2026, 0, 5)), 'history-20260105.csv');
});
