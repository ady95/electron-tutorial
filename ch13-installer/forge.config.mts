import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

// 13-1: 파일 이름에 쓰는 ASCII 이름. 화면에 보이는 이름은 package.json의 productName("AI 채팅")
// 한글 productName을 파일 이름에 그대로 쓰면 Windows에서 자모가 분리된 이름(NFD)이 된다 (12-3)
const FILE_NAME = 'ai-chat';
const ICON_URL =
  'https://raw.githubusercontent.com/ady95/electron-tutorial/main/ch13-installer/assets/icon.ico';

// 13-3: Windows 코드 서명. 인증서 파일과 암호는 저장소에 두지 않고 환경 변수로 받는다
// 값이 없으면 서명하지 않고 만든다 (개발 중, 또는 서명은 CI에서만 할 때)
const { WINDOWS_CERTIFICATE_FILE, WINDOWS_CERTIFICATE_PASSWORD } = process.env;
const windowsSign = WINDOWS_CERTIFICATE_FILE
  ? {
      certificateFile: WINDOWS_CERTIFICATE_FILE,
      certificatePassword: WINDOWS_CERTIFICATE_PASSWORD,
      timestampServer: 'http://timestamp.digicert.com', // 인증서가 만료된 뒤에도 서명이 유효하게
    }
  : undefined;

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // Windows만 ai-chat.exe로. macOS에서 지정하면 Dock·Finder에 쓰이는 CFBundleDisplayName까지
    // "ai-chat"이 된다(@electron/packager가 실행 파일 이름으로 덮어쓴다)
    executableName: process.platform === 'win32' ? FILE_NAME : undefined,
    // 13-2: 아이콘은 확장자 없이 쓰면 OS에 맞는 파일(.ico / .icns)을 고른다
    icon: 'assets/icon',
    // macOS 번들 ID. 정하지 않으면 앱 이름에서 만들어지는데, 한글 이름은 "com.electron.ai-"처럼 잘렸다
    appBundleId: 'com.example.aichat',
    appCopyright: 'Copyright (c) 2026 Electron 따라하기',
    // Windows 실행 파일의 속성(자세히) 탭과 작업 관리자에 보이는 정보
    win32metadata: {
      CompanyName: 'Electron 따라하기',
      FileDescription: 'AI 채팅',
      ProductName: 'AI 채팅',
    },
    // asar 밖, resources 폴더에 그대로 복사할 파일 (알림 아이콘)
    extraResource: ['assets/icon.png'],
    // 앱 폴더의 .exe·.dll·.node에 서명한다 (Fuse를 바꾼 뒤에 서명된다)
    windowsSign,
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      // 설치 폴더(%LOCALAPPDATA%\ai_chat)와 AppUserModelID를 정한다. 첫 배포 뒤에는 바꾸지 않는다
      name: 'ai_chat',
      setupExe: `${FILE_NAME}-setup.exe`,
      setupIcon: 'assets/icon.ico', // 설치 파일(Setup.exe)의 아이콘
      // 앱 목록·제어판의 아이콘. 설치할 때 사용자 PC가 이 주소에서 내려받는다 (file: 주소 불가)
      iconUrl: ICON_URL,
      description: 'AI 채팅', // Setup.exe 속성의 설명 (없으면 package.json의 description)
      windowsSign, // Setup.exe와 설치되는 Update.exe에 서명한다. 메이커에도 따로 넘겨야 한다
    }),
    new MakerZIP({}, ['darwin']),
    new MakerDMG({ name: FILE_NAME, icon: 'assets/icon.icns' }, ['darwin']),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        // 11-4: Local AI Handler (UtilityProcess). Main과 같은 Node 환경이므로 Main 설정으로 빌드한다
        {
          entry: 'src/ai-handler.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.mts' }],
    }),
    // Fuse는 서명하기 전에 바꾼다. 서명한 뒤에 바꾸면 서명이 깨진다 (13-3)
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
