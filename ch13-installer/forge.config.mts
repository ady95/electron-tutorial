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

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: FILE_NAME, // ai-chat.exe, macOS는 Contents/MacOS/ai-chat
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      // 설치 폴더(%LOCALAPPDATA%\ai_chat)와 AppUserModelID를 정한다. 첫 배포 뒤에는 바꾸지 않는다
      name: 'ai_chat',
      setupExe: `${FILE_NAME}-setup.exe`,
    }),
    new MakerZIP({}, ['darwin']),
    new MakerDMG({ name: FILE_NAME }, ['darwin']),
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
