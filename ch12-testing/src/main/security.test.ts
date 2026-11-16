// IPC 송신자 검증 테스트 (12-2). electron 모듈을 가짜로 바꿔 Electron 없이 실행한다
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { handle, isAppUrl, setAppUrl } from './security';

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    whenReady: vi.fn(() => new Promise(() => {})),
    enableSandbox: vi.fn(),
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  session: {},
  shell: { openExternal: vi.fn() },
}));

// handle()이 ipcMain.handle에 등록한 함수를 꺼내, 가짜 이벤트로 부른다
function register() {
  const listener = vi.fn(() => 'ok');
  handle('test:channel', listener);
  const registered = vi.mocked(ipcMain.handle).mock.calls.at(-1)![1];
  const call = (senderFrame: unknown) =>
    registered({ senderFrame } as never, 'arg');
  return { listener, call };
}

const frame = (url: string, parent: unknown = null) => ({
  url,
  origin: new URL(url).origin,
  parent,
});

describe('개발 서버(http) 앱', () => {
  beforeEach(() => setAppUrl('http://localhost:5173/'));

  it('앱 화면의 최상위 프레임은 통과', () => {
    const { listener, call } = register();
    expect(call(frame('http://localhost:5173/#/settings'))).toBe('ok');
    expect(listener).toHaveBeenCalledWith(expect.anything(), 'arg');
  });

  it('다른 출처는 차단', () => {
    const { listener, call } = register();
    expect(() => call(frame('http://localhost:5174/'))).toThrow(
      '허용되지 않은 요청',
    );
    expect(() => call(frame('https://evil.example/'))).toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('앱 화면 안의 iframe은 출처가 같아도 차단', () => {
    const { call } = register();
    expect(() =>
      call(frame('http://localhost:5173/', { url: 'parent' })),
    ).toThrow();
  });

  it('이미 닫힌 프레임(null)은 차단', () => {
    const { call } = register();
    expect(() => call(null)).toThrow();
  });
});

describe('배포된 앱(file://)', () => {
  beforeEach(() =>
    setAppUrl(
      'file:///C:/App/resources/app.asar/.vite/renderer/main_window/index.html',
    ),
  );

  it('앱 폴더 안의 파일만 앱 화면으로 본다', () => {
    expect(
      isAppUrl(
        'file:///C:/App/resources/app.asar/.vite/renderer/main_window/index.html',
      ),
    ).toBe(true);
    expect(isAppUrl('file:///C:/Users/me/Downloads/evil.html')).toBe(false);
    expect(isAppUrl('https://example.com/')).toBe(false);
    expect(isAppUrl('이상한 주소')).toBe(false);
  });

  it('file:// 프레임은 경로까지 비교한다', () => {
    const { call } = register();
    const ok = {
      url: 'file:///C:/App/resources/app.asar/.vite/renderer/main_window/index.html',
      origin: 'file://',
      parent: null,
    };
    const evil = {
      url: 'file:///C:/Users/me/Downloads/evil.html',
      origin: 'file://',
      parent: null,
    };
    expect(call(ok)).toBe('ok');
    expect(() => call(evil)).toThrow();
  });
});
