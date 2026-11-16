import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import fs from 'node:fs';

// PyInstaller로 만든 Python 작업자 (npm run build:python)
const PYTHON_DIST = 'python-dist/sales-worker';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // asar 밖, 앱의 resources 폴더에 그대로 복사한다 (실행 파일은 asar 안에서 실행할 수 없다)
    extraResource: [PYTHON_DIST],
  },
  rebuildConfig: {},
  hooks: {
    // Python 작업자를 빌드하지 않고 패키징하면, Python 없는 앱이 조용히 만들어진다. 미리 막는다
    prePackage: async () => {
      if (!fs.existsSync(PYTHON_DIST)) {
        throw new Error(
          `${PYTHON_DIST}가 없습니다. 먼저 npm run build:python을 실행하세요.`,
        );
      }
    },
  },
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
        {
          // Python 관리자 (UtilityProcess). Main과 같은 Node 환경이므로 Main 설정으로 빌드한다
          entry: 'src/python-host.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
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
