import { app, dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { historyFileName, historyToCsv } from '../shared/csv';
import type { ExportResult, JobStatus, JobSummary } from '../shared/ipc';

let db: DatabaseSync | null = null;

// 스키마 변경 이력. 순서대로 한 번씩만 실행된다 (PRAGMA user_version으로 기록)
const MIGRATIONS = [
  // 1: 작업과 작업별 파일 목록
  `CREATE TABLE jobs (
     id          INTEGER PRIMARY KEY,
     started_at  TEXT    NOT NULL,
     folder      TEXT    NOT NULL,
     folder_name TEXT    NOT NULL,
     total       INTEGER NOT NULL,
     status      TEXT    NOT NULL,
     message     TEXT    NOT NULL DEFAULT ''
   );
   CREATE TABLE job_items (
     job_id    INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
     from_name TEXT    NOT NULL,
     to_name   TEXT    NOT NULL
   );
   CREATE INDEX job_items_job ON job_items(job_id);`,
  // 2: 전문 검색(FTS5) 색인. trigram은 한글 단어 중간도 찾을 수 있다(3글자 이상)
  `CREATE VIRTUAL TABLE jobs_fts USING fts5(folder_name, names, tokenize = 'trigram');`,
];

export function openHistory() {
  const file = path.join(app.getPath('userData'), 'history.db');
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  migrate(db);
  return file;
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
  if (!db) throw new Error('이력 DB가 열려 있지 않습니다.');
  return db;
}

export interface JobRecord {
  folder: string;
  total: number;
  status: JobStatus;
  message: string;
  items: { from: string; to: string }[];
}

// 작업 한 건을 저장한다. 세 테이블에 나눠 쓰므로 트랜잭션으로 묶는다
export function addJob(job: JobRecord) {
  const d = conn();
  const folderName = path.basename(job.folder);
  d.exec('BEGIN');
  try {
    const { lastInsertRowid } = d
      .prepare(
        `INSERT INTO jobs (started_at, folder, folder_name, total, status, message)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        new Date().toISOString(),
        job.folder,
        folderName,
        job.total,
        job.status,
        job.message,
      );
    const insertItem = d.prepare(
      'INSERT INTO job_items (job_id, from_name, to_name) VALUES (?, ?, ?)',
    );
    for (const it of job.items) insertItem.run(lastInsertRowid, it.from, it.to);
    const names = job.items.map((it) => `${it.from} ${it.to}`).join('\n');
    d.prepare(
      'INSERT INTO jobs_fts (rowid, folder_name, names) VALUES (?, ?, ?)',
    ).run(lastInsertRowid, folderName, names);
    d.exec('COMMIT');
    return Number(lastInsertRowid);
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

interface JobRow {
  id: number;
  started_at: string;
  folder_name: string;
  total: number;
  status: JobStatus;
  message: string;
}

// 검색어가 없으면 최근 작업, 3글자 이상이면 FTS5, 1~2글자면 LIKE로 찾는다
// 목록 화면과 CSV 내보내기가 함께 쓰는 검색 조건. sample은 조회하지 않는다
function findJobs(query: string, limit: number): Omit<JobSummary, 'sample'>[] {
  const d = conn();
  const q = query.trim();
  let rows: JobRow[];
  if (q === '') {
    rows = d
      .prepare('SELECT * FROM jobs ORDER BY id DESC LIMIT ?')
      .all(limit) as unknown as JobRow[];
  } else if ([...q].length >= 3) {
    // 사용자 입력을 FTS5 문법으로 해석하지 않도록 큰따옴표로 감싼다
    const phrase = `"${q.replaceAll('"', '""')}"`;
    rows = d
      .prepare(
        `SELECT jobs.* FROM jobs_fts JOIN jobs ON jobs.id = jobs_fts.rowid
         WHERE jobs_fts MATCH ? ORDER BY jobs.id DESC LIMIT ?`,
      )
      .all(phrase, limit) as unknown as JobRow[];
  } else {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    rows = d
      .prepare(
        `SELECT DISTINCT jobs.* FROM jobs LEFT JOIN job_items ON job_items.job_id = jobs.id
         WHERE jobs.folder_name LIKE ?1 ESCAPE '\\'
            OR job_items.from_name LIKE ?1 ESCAPE '\\'
            OR job_items.to_name LIKE ?1 ESCAPE '\\'
         ORDER BY jobs.id DESC LIMIT ?2`,
      )
      .all(like, limit) as unknown as JobRow[];
  }
  return rows.map((r) => ({
    id: r.id,
    startedAt: r.started_at,
    folderName: r.folder_name,
    total: r.total,
    status: r.status,
    message: r.message,
  }));
}

// 화면 목록용 검색. 작업마다 바뀐 이름 예시(sample)를 3개까지 붙인다
export function searchJobs(query: string, limit = 50): JobSummary[] {
  const sampleStmt = conn().prepare(
    'SELECT from_name, to_name FROM job_items WHERE job_id = ? LIMIT 3',
  );
  return findJobs(query, limit).map((job) => ({
    ...job,
    sample: (
      sampleStmt.all(job.id) as { from_name: string; to_name: string }[]
    ).map((s) => `${s.from_name} → ${s.to_name}`),
  }));
}

// 검색어로 걸러진 이력을 CSV로 저장한다. 저장 위치는 Main이 대화상자로 받고, 경로는 Renderer에 알리지 않는다
// 화면 목록은 50건까지만 보이지만, 내보내기는 검색 결과 전체를 쓴다
const EXPORT_LIMIT = 100_000;

export async function exportJobs(
  win: BrowserWindow,
  query: string,
): Promise<ExportResult> {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: path.join(
      app.getPath('documents'),
      historyFileName(new Date()),
    ),
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (canceled || !filePath) return { status: 'canceled' };
  try {
    const jobs = findJobs(query, EXPORT_LIMIT);
    await fs.writeFile(filePath, historyToCsv(jobs), 'utf8');
    return { status: 'saved', count: jobs.length };
  } catch (err) {
    console.error('CSV 저장 실패', err);
    return { status: 'failed', message: '파일을 저장하지 못했습니다.' };
  }
}

export function clearJobs() {
  const d = conn();
  d.exec('BEGIN');
  const { changes } = d.prepare('DELETE FROM jobs').run();
  d.exec('DELETE FROM jobs_fts');
  d.exec('COMMIT');
  return Number(changes);
}

export function closeHistory() {
  db?.close();
  db = null;
}
