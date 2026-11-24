// 13-2: assets/icon.png(1024×1024) 하나로 Windows용 icon.ico와 macOS용 icon.icns를 만든다
//   npx electron scripts/make-icons.cjs
// 별도 패키지 없이 Electron의 nativeImage로 크기를 줄인다.
// ICNS는 모든 크기를 PNG로 담는다. ICO는 256만 PNG, 나머지는 BMP로 담는다
// (작은 크기까지 PNG로 담았더니 탐색기는 잘 그렸지만 .NET의 System.Drawing은 깨진 점으로 그렸다)
const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'assets');
const source = nativeImage.createFromPath(path.join(dir, 'icon.png'));

function png(size) {
  return source.resize({ width: size, height: size, quality: 'best' }).toPNG();
}

// ICO 안의 BMP: 정보 머리(40바이트) + 아래쪽 줄부터 BGRA 픽셀 + 투명 마스크(1비트, 모두 0)
function bmp(size) {
  const pixels = source
    .resize({ width: size, height: size, quality: 'best' })
    .toBitmap(); // BGRA, 위쪽 줄부터
  const info = Buffer.alloc(40);
  info.writeUInt32LE(40, 0);
  info.writeInt32LE(size, 4);
  info.writeInt32LE(size * 2, 8); // ICO에서는 그림 + 마스크 높이
  info.writeUInt16LE(1, 12);
  info.writeUInt16LE(32, 14);
  const rows = [];
  for (let y = size - 1; y >= 0; y--)
    rows.push(pixels.subarray(y * size * 4, (y + 1) * size * 4));
  const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size); // 줄마다 4바이트 단위로 맞춘다
  return Buffer.concat([info, ...rows, mask]);
}

// ICO: 머리(6바이트) + 항목(16바이트씩) + 그림 데이터
function makeIco(sizes) {
  const images = sizes.map((size) => (size >= 256 ? png(size) : bmp(size)));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2); // 형식 1 = 아이콘
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, at); // 256은 0으로 쓴다
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt16LE(1, at + 4); // 색 평면
    header.writeUInt16LE(32, at + 6); // 픽셀당 비트
    header.writeUInt32LE(images[i].length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += images[i].length;
  });
  return Buffer.concat([header, ...images]);
}

// ICNS: 'icns' + 전체 길이, 항목마다 종류(4바이트) + 길이 + PNG 데이터 (길이는 빅 엔디언)
function makeIcns(entries) {
  const chunks = entries.map(([type, size]) => {
    const data = png(size);
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(8 + chunks.reduce((n, c) => n + c.length, 0), 4);
  return Buffer.concat([head, ...chunks]);
}

app.whenReady().then(() => {
  if (source.isEmpty()) throw new Error('assets/icon.png를 읽지 못했습니다');
  const { width, height } = source.getSize();
  if (width !== 1024 || height !== 1024)
    throw new Error(
      `icon.png는 1024×1024여야 합니다 (지금 ${width}×${height})`,
    );

  fs.writeFileSync(
    path.join(dir, 'icon.ico'),
    makeIco([16, 24, 32, 48, 64, 128, 256]),
  );
  fs.writeFileSync(
    path.join(dir, 'icon.icns'),
    makeIcns([
      ['icp4', 16],
      ['icp5', 32],
      ['icp6', 64],
      ['ic07', 128],
      ['ic08', 256],
      ['ic09', 512],
      ['ic11', 32],
      ['ic12', 64],
      ['ic13', 256],
      ['ic14', 512],
      ['ic10', 1024], // ic11~ic14, ic10은 Retina(2배) 크기
    ]),
  );
  console.log('assets/icon.ico, assets/icon.icns를 만들었습니다');
  app.quit();
});
