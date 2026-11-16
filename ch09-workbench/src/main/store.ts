// 문서와 분석 결과를 SQLite(node:sqlite)에 저장한다
import { app } from 'electron';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AnalysisRecord,
  DocDetail,
  DocKind,
  DocSummary,
  SearchHit,
} from '../shared/ipc';
import type { AnalysisKind } from '../shared/prompts';
import { findSuspiciousLines } from '../shared/injection';
import { makeSnippet } from '../shared/snippet';

let db: DatabaseSync | null = null;

// 스키마 변경 이력. 순서대로 한 번씩만 실행된다 (PRAGMA user_version으로 기록)
const MIGRATIONS = [
  // 1: 문서와 분석 결과
  `CREATE TABLE documents (
     id       INTEGER PRIMARY KEY,
     name     TEXT    NOT NULL,
     kind     TEXT    NOT NULL,
     pages    INTEGER,
     encoding TEXT,
     chars    INTEGER NOT NULL,
     warning  TEXT,
     sha256   TEXT    NOT NULL UNIQUE,   -- 같은 파일을 두 번 저장하지 않는다
     added_at TEXT    NOT NULL,
     text     TEXT    NOT NULL
   );
   CREATE TABLE analyses (
     id         INTEGER PRIMARY KEY,
     doc_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
     kind       TEXT    NOT NULL,
     question   TEXT    NOT NULL DEFAULT '',
     model      TEXT    NOT NULL,
     result     TEXT    NOT NULL,
     sent_chars INTEGER NOT NULL,
     clipped    INTEGER NOT NULL,
     elapsed_ms INTEGER NOT NULL,
     created_at TEXT    NOT NULL
   );
   CREATE INDEX analyses_doc ON analyses(doc_id);`,
  // 2: 문서 이름·본문과 분석 결과를 함께 찾는 전문 검색 색인 (trigram: 한글 단어 중간도 찾는다)
  `CREATE VIRTUAL TABLE search_fts USING fts5(
     source UNINDEXED, ref_id UNINDEXED, doc_id UNINDEXED, title, body,
     tokenize = 'trigram'
   );`,
];

export function openStore() {
  const file = path.join(app.getPath('userData'), 'workbench.db');
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  migrate(db);
  return file;
}

export function closeStore() {
  db?.close();
  db = null;
}

function migrate(d: DatabaseSync) {
  const { user_version: version } = d.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  for (let v = version; v < MIGRATIONS.length; v++) {
    d.exec('BEGIN');
    try {
      d.exec(MIGRATIONS[v]);
      d.exec(`PRAGMA user_version = ${v + 1}`);
      d.exec('COMMIT');
    } catch (err) {
      d.exec('ROLLBACK');
      throw err;
    }
  }
}

function conn() {
  if (!db) throw new Error('DB가 열려 있지 않습니다.');
  return db;
}

// 여러 문장을 하나의 트랜잭션으로 묶는다. 중간에 실패하면 모두 되돌린다
function tx<T>(fn: (d: DatabaseSync) => T): T {
  const d = conn();
  d.exec('BEGIN');
  try {
    const result = fn(d);
    d.exec('COMMIT');
    return result;
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

interface DocRow {
  id: number;
  name: string;
  kind: DocKind;
  pages: number | null;
  encoding: string | null;
  chars: number;
  warning: string | null;
  added_at: string;
  text?: string;
}

const toSummary = (r: DocRow): DocSummary => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  pages: r.pages,
  encoding: r.encoding,
  chars: r.chars,
  warning: r.warning,
  addedAt: r.added_at,
});

const SUMMARY_COLUMNS =
  'id, name, kind, pages, encoding, chars, warning, added_at';

export const sha256 = (data: Uint8Array) =>
  createHash('sha256').update(data).digest('hex');

// 이미 같은 내용의 파일이 있으면 그 문서를 돌려준다
export function findByHash(hash: string): DocSummary | null {
  const row = conn()
    .prepare(`SELECT ${SUMMARY_COLUMNS} FROM documents WHERE sha256 = ?`)
    .get(hash) as DocRow | undefined;
  return row ? toSummary(row) : null;
}

export function addDocument(
  doc: Omit<DocDetail, 'id' | 'addedAt' | 'suspicious'>,
  hash: string,
): DocSummary {
  const addedAt = new Date().toISOString();
  const id = tx((d) => {
    const { lastInsertRowid } = d
      .prepare(
        `INSERT INTO documents (name, kind, pages, encoding, chars, warning, sha256, added_at, text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        doc.name,
        doc.kind,
        doc.pages,
        doc.encoding,
        doc.chars,
        doc.warning,
        hash,
        addedAt,
        doc.text,
      );
    d.prepare(
      `INSERT INTO search_fts (source, ref_id, doc_id, title, body) VALUES ('doc', ?, ?, ?, ?)`,
    ).run(lastInsertRowid, lastInsertRowid, doc.name, doc.text);
    return Number(lastInsertRowid);
  });
  // 목록용 요약만 돌려준다 (본문은 문서를 고를 때 따로 가져간다)
  const { text: _text, ...summary } = doc;
  return { ...summary, id, addedAt };
}

export function listDocuments(): DocSummary[] {
  const rows = conn()
    .prepare(`SELECT ${SUMMARY_COLUMNS} FROM documents ORDER BY id DESC`)
    .all() as unknown as DocRow[];
  return rows.map(toSummary);
}

export function getDocument(id: number): DocDetail | null {
  const row = conn()
    .prepare(`SELECT ${SUMMARY_COLUMNS}, text FROM documents WHERE id = ?`)
    .get(id) as DocRow | undefined;
  if (!row) return null;
  const text = row.text ?? '';
  return { ...toSummary(row), text, suspicious: findSuspiciousLines(text) };
}

export function removeDocument(id: number): boolean {
  return tx((d) => {
    d.prepare('DELETE FROM search_fts WHERE doc_id = ?').run(id);
    // 분석 결과는 외래 키의 ON DELETE CASCADE로 함께 지워진다
    return d.prepare('DELETE FROM documents WHERE id = ?').run(id).changes > 0;
  });
}

export interface NewAnalysis {
  docId: number;
  kind: AnalysisKind;
  question: string;
  model: string;
  result: string;
  sentChars: number;
  clipped: boolean;
  elapsedMs: number;
}

const KIND_TITLE: Record<AnalysisKind, string> = {
  summary: '요약',
  keywords: '핵심어',
  qa: '질문',
};

export function addAnalysis(a: NewAnalysis): number {
  return tx((d) => {
    const { lastInsertRowid } = d
      .prepare(
        `INSERT INTO analyses (doc_id, kind, question, model, result, sent_chars, clipped, elapsed_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        a.docId,
        a.kind,
        a.question,
        a.model,
        a.result,
        a.sentChars,
        a.clipped ? 1 : 0,
        a.elapsedMs,
        new Date().toISOString(),
      );
    const title = a.question
      ? `${KIND_TITLE[a.kind]}: ${a.question}`
      : KIND_TITLE[a.kind];
    d.prepare(
      `INSERT INTO search_fts (source, ref_id, doc_id, title, body) VALUES ('analysis', ?, ?, ?, ?)`,
    ).run(lastInsertRowid, a.docId, title, a.result);
    return Number(lastInsertRowid);
  });
}

interface AnalysisRow {
  id: number;
  doc_id: number;
  kind: AnalysisKind;
  question: string;
  model: string;
  result: string;
  sent_chars: number;
  clipped: number;
  elapsed_ms: number;
  created_at: string;
}

export function listAnalyses(docId: number): AnalysisRecord[] {
  const rows = conn()
    .prepare('SELECT * FROM analyses WHERE doc_id = ? ORDER BY id DESC')
    .all(docId) as unknown as AnalysisRow[];
  return rows.map((r) => ({
    id: r.id,
    docId: r.doc_id,
    kind: r.kind,
    question: r.question,
    model: r.model,
    result: r.result,
    sentChars: r.sent_chars,
    clipped: r.clipped === 1,
    elapsedMs: r.elapsed_ms,
    createdAt: r.created_at,
  }));
}

interface HitRow {
  source: 'doc' | 'analysis';
  ref_id: number;
  doc_id: number;
  title: string;
  body: string;
  doc_name: string;
}

// 3글자 이상이면 FTS5(trigram), 1~2글자면 LIKE로 찾는다 (trigram은 3글자 미만을 찾지 못한다)
export function search(query: string, limit = 50): SearchHit[] {
  const q = query.trim();
  if (q === '') return [];
  const d = conn();
  const select = `SELECT s.source, s.ref_id, s.doc_id, s.title, s.body, doc.name AS doc_name
                  FROM search_fts s JOIN documents doc ON doc.id = s.doc_id`;
  let rows: HitRow[];
  if ([...q].length >= 3) {
    // 사용자 입력이 FTS5 문법(AND, *, " 등)으로 해석되지 않게 구(phrase)로 감싼다
    const phrase = `"${q.replaceAll('"', '""')}"`;
    rows = d
      .prepare(`${select} WHERE search_fts MATCH ? ORDER BY rank LIMIT ?`)
      .all(phrase, limit) as unknown as HitRow[];
  } else {
    // LIKE의 특수 문자(% _)를 글자 그대로 찾도록 이스케이프한다
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    rows = d
      .prepare(
        `${select} WHERE s.title LIKE ?1 ESCAPE '\\' OR s.body LIKE ?1 ESCAPE '\\'
         ORDER BY s.rowid DESC LIMIT ?2`,
      )
      .all(like, limit) as unknown as HitRow[];
  }
  return rows.map((r) => {
    const inTitle = r.title.toLowerCase().includes(q.toLowerCase());
    return {
      source: r.source,
      refId: r.ref_id,
      docId: r.doc_id,
      docName: r.doc_name,
      title: r.title,
      snippet: makeSnippet(inTitle && r.source === 'doc' ? r.title : r.body, q),
    };
  });
}
