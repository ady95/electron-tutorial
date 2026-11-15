import { BrowserWindow, dialog } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FileResult, SaveResult } from '../shared/ipc';

// 창마다 현재 열린 파일 경로를 Main이 기억한다.
// Renderer는 경로를 직접 다루지 않고 "열기", "저장"만 요청한다.
const currentPaths = new Map<number, string>();

const TEXT_FILTERS = [
  { name: '텍스트 문서', extensions: ['txt', 'md'] },
  { name: '모든 파일', extensions: ['*'] },
];
const ALLOWED_EXT = new Set(['.txt', '.md', '.log', '.csv', '.json']);
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function forgetWindow(win: BrowserWindow) {
  currentPaths.delete(win.id);
}

async function readTextFile(
  win: BrowserWindow,
  filePath: string,
): Promise<FileResult> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile())
      return { ok: false, reason: 'error', message: '파일이 아닙니다.' };
    if (stat.size > MAX_SIZE) {
      return {
        ok: false,
        reason: 'error',
        message: '10MB가 넘는 파일은 열 수 없습니다.',
      };
    }
    let text = await fs.readFile(filePath, 'utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // UTF-8 BOM 제거
    currentPaths.set(win.id, filePath);
    return { ok: true, name: path.basename(filePath), text };
  } catch (err) {
    return { ok: false, reason: 'error', message: (err as Error).message };
  }
}

export async function openWithDialog(win: BrowserWindow): Promise<FileResult> {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: TEXT_FILTERS,
  });
  if (canceled || filePaths.length === 0)
    return { ok: false, reason: 'canceled' };
  return readTextFile(win, filePaths[0]);
}

// 드래그 앤 드롭은 Renderer가 경로를 보내므로 Main에서 한 번 더 검사한다
export async function openDropped(
  win: BrowserWindow,
  filePath: unknown,
): Promise<FileResult> {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
    return {
      ok: false,
      reason: 'error',
      message: '올바른 파일 경로가 아닙니다.',
    };
  }
  if (!ALLOWED_EXT.has(path.extname(filePath).toLowerCase())) {
    return {
      ok: false,
      reason: 'error',
      message: '텍스트 파일만 열 수 있습니다.',
    };
  }
  return readTextFile(win, filePath);
}

export async function save(
  win: BrowserWindow,
  text: unknown,
  saveAs: unknown,
): Promise<SaveResult> {
  if (typeof text !== 'string')
    return { ok: false, reason: 'error', message: '잘못된 요청' };
  let filePath = currentPaths.get(win.id);
  if (saveAs === true || !filePath) {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: filePath ?? '제목 없음.txt',
      filters: TEXT_FILTERS,
    });
    if (result.canceled || !result.filePath)
      return { ok: false, reason: 'canceled' };
    filePath = result.filePath;
  }
  try {
    await fs.writeFile(filePath, text, 'utf8');
    currentPaths.set(win.id, filePath);
    return { ok: true, name: path.basename(filePath) };
  } catch (err) {
    return { ok: false, reason: 'error', message: (err as Error).message };
  }
}

export function resetPath(win: BrowserWindow) {
  currentPaths.delete(win.id);
}
