import { BrowserWindow, dialog } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  IPC,
  type BatchResult,
  type FolderInfo,
  type Progress,
} from '../shared/ipc';
import { makePlan, type RenameRule } from '../shared/rename';

// 창마다 선택된 폴더와 진행 중인 작업의 취소 신호를 기억한다
const folders = new Map<number, string>();
const running = new Map<number, AbortController>();

const fail = (errors: string[]): BatchResult => ({
  renamed: 0,
  canceled: false,
  rolledBack: false,
  errors,
});

async function listEntries(folder: string) {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  return {
    files: entries.filter((e) => e.isFile()).map((e) => e.name),
    others: entries.filter((e) => !e.isFile()).map((e) => e.name),
  };
}

export async function pickFolder(
  win: BrowserWindow,
): Promise<FolderInfo | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
  });
  if (canceled || filePaths.length === 0) return null;
  folders.set(win.id, filePaths[0]);
  return {
    folderName: path.basename(filePaths[0]),
    files: (await listEntries(filePaths[0])).files,
  };
}

export function cancel(win: BrowserWindow) {
  running.get(win.id)?.abort();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function start(
  win: BrowserWindow,
  rule: RenameRule,
  slow: boolean,
): Promise<BatchResult> {
  const folder = folders.get(win.id);
  if (!folder) return fail(['폴더를 먼저 선택하세요.']);
  if (running.has(win.id)) return fail(['이미 실행 중입니다.']);

  // Renderer가 보여 준 미리보기를 믿지 않고, Main이 실제 폴더 내용으로 다시 계산한다
  // 하위 폴더 이름까지 포함해서 충돌을 검사한다 (Renderer는 파일 목록만 안다)
  const { files, others } = await listEntries(folder);
  const plan = makePlan(files, rule, others);
  if (plan.problems.length > 0) return fail(plan.problems);

  const controller = new AbortController();
  running.set(win.id, controller);
  const total = plan.items.length;
  const report = (p: Progress) => {
    if (!win.isDestroyed()) win.webContents.send(IPC.progress, p);
  };

  // 1단계: 모두 임시 이름으로 바꾼다 (a→b, b→c처럼 이름이 맞물려도 안전하게)
  // 2단계: 임시 이름에서 최종 이름으로 바꾼다
  const tmpName = (i: number) => `.__rename_tmp_${process.pid}_${i}`;
  const done: { from: string; at: string }[] = []; // 되돌리기용 기록
  const errors: string[] = [];
  let canceled = false;

  try {
    for (const [i, item] of plan.items.entries()) {
      if (controller.signal.aborted) {
        canceled = true;
        break;
      }
      await fs.rename(
        path.join(folder, item.from),
        path.join(folder, tmpName(i)),
      );
      done.push({ from: item.from, at: tmpName(i) });
      report({ done: i + 1, total: total * 2, current: item.from });
      if (slow) await sleep(150);
    }
    if (!canceled) {
      for (const [i, item] of plan.items.entries()) {
        if (controller.signal.aborted) {
          canceled = true;
          break;
        }
        await fs.rename(
          path.join(folder, tmpName(i)),
          path.join(folder, item.to),
        );
        done[i].at = item.to;
        report({ done: total + i + 1, total: total * 2, current: item.to });
        if (slow) await sleep(150);
      }
    }
  } catch (err) {
    errors.push((err as Error).message);
  } finally {
    running.delete(win.id);
  }

  // 취소되었거나 오류가 나면 바꾼 것을 모두 원래 이름으로 되돌린다
  if (canceled || errors.length > 0) {
    for (const d of done.reverse()) {
      try {
        await fs.rename(path.join(folder, d.at), path.join(folder, d.from));
      } catch (err) {
        errors.push(
          `되돌리기 실패: ${d.at} → ${d.from} (${(err as Error).message})`,
        );
      }
    }
    return { renamed: 0, canceled, rolledBack: true, errors };
  }
  return { renamed: total, canceled: false, rolledBack: false, errors };
}

export function forget(win: BrowserWindow) {
  folders.delete(win.id);
  running.get(win.id)?.abort();
}
