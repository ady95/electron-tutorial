import { dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  DocDetail,
  DocKind,
  DocSummary,
  DroppedFile,
  ImportResult,
} from '../shared/ipc';
import { decodeText } from '../shared/text';
import { extractPdfText } from './pdf';

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
const TEXT_EXTS = ['.txt', '.md'];

// 1단계에서는 메모리에만 둔다 (3단계에서 SQLite로 옮긴다)
const docs = new Map<number, DocDetail>();
let nextId = 1;

function kindOf(name: string): DocKind | null {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (TEXT_EXTS.includes(ext)) return 'text';
  return null;
}

// 파일 하나를 읽어 글자를 뽑는다. 실패하면 사용자에게 보여 줄 메시지를 던진다
async function extract(name: string, data: Uint8Array) {
  const kind = kindOf(name);
  if (!kind) throw new Error('지원하지 않는 형식입니다 (PDF, TXT, MD만 가능).');
  if (data.byteLength > MAX_FILE_BYTES) {
    throw new Error('파일이 너무 큽니다 (20MB 이하만 가능).');
  }
  if (kind === 'text') {
    const { text, encoding } = decodeText(data);
    return { kind, text, pages: null, encoding, warning: null };
  }
  let result;
  try {
    result = await extractPdfText(data);
  } catch (err) {
    console.error('PDF 읽기 실패', name, err);
    throw new Error(
      'PDF를 읽지 못했습니다. 손상되었거나 암호가 걸린 파일일 수 있습니다.',
    );
  }
  const warning =
    result.text.length === 0
      ? '글자를 찾지 못했습니다. 스캔한 이미지로만 된 PDF일 수 있습니다.'
      : null;
  return {
    kind,
    text: result.text,
    pages: result.pages,
    encoding: null,
    warning,
  };
}

async function addOne(name: string, data: Uint8Array): Promise<DocSummary> {
  const extracted = await extract(name, data);
  const doc: DocDetail = {
    id: nextId++,
    name,
    chars: extracted.text.length,
    addedAt: new Date().toISOString(),
    ...extracted,
  };
  docs.set(doc.id, doc);
  return summary(doc);
}

const summary = ({ text: _text, ...rest }: DocDetail): DocSummary => rest;

async function importAll(
  files: { name: string; load: () => Promise<Uint8Array> }[],
): Promise<ImportResult> {
  const result: ImportResult = { added: [], errors: [] };
  for (const f of files) {
    try {
      result.added.push(await addOne(f.name, await f.load()));
    } catch (err) {
      result.errors.push({ name: f.name, message: (err as Error).message });
    }
  }
  return result;
}

// [문서 열기] 경로는 Main이 대화상자로 받는다
export async function openWithDialog(
  win: BrowserWindow,
): Promise<ImportResult> {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '문서', extensions: ['pdf', 'txt', 'md'] }],
  });
  if (canceled) return { added: [], errors: [] };
  return importAll(
    filePaths.map((p) => ({
      name: path.basename(p),
      load: async () => {
        const { size } = await fs.stat(p);
        // 큰 파일을 통째로 읽기 전에 크기부터 확인한다
        if (size > MAX_FILE_BYTES)
          throw new Error('파일이 너무 큽니다 (20MB 이하만 가능).');
        return new Uint8Array(await fs.readFile(p));
      },
    })),
  );
}

// [드래그 앤 드롭] Renderer가 보낸 이름과 내용을 검사한 뒤 처리한다
export function parseDropped(value: unknown): DroppedFile[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20)
    return null;
  const files: DroppedFile[] = [];
  for (const v of value) {
    const f = (v ?? {}) as Record<string, unknown>;
    if (
      typeof f.name !== 'string' ||
      f.name.length === 0 ||
      f.name.length > 255
    )
      return null;
    if (!(f.data instanceof Uint8Array)) return null;
    // 이름은 표시용일 뿐이다. 경로 구분자가 들어 있으면 마지막 부분만 쓴다
    files.push({ name: path.basename(f.name), data: f.data });
  }
  return files;
}

export function importDropped(files: DroppedFile[]): Promise<ImportResult> {
  return importAll(
    files.map((f) => ({ name: f.name, load: async () => f.data })),
  );
}

export function listDocuments(): DocSummary[] {
  return [...docs.values()].reverse().map(summary);
}

export function getDocument(id: number): DocDetail | null {
  return docs.get(id) ?? null;
}

export function removeDocument(id: number): boolean {
  return docs.delete(id);
}
