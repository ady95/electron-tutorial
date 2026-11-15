import './index.css';

const infoButton = document.querySelector<HTMLButtonElement>('#info-button')!;
const infoOutput = document.querySelector<HTMLPreElement>('#info-output')!;
const clock = document.querySelector<HTMLSpanElement>('#clock')!;
const memoryUsage = document.querySelector<HTMLSpanElement>('#memory-usage')!;

infoButton.addEventListener('click', async () => {
  infoButton.disabled = true;
  try {
    const info = await window.api.getSystemInfo();
    infoOutput.textContent = JSON.stringify(info, null, 2);
    window.api.logMessage(`시스템 정보 조회: ${info.platform}/${info.arch}`);
  } finally {
    infoButton.disabled = false;
  }
});

window.api.onClockTick((time) => {
  clock.textContent = time;
});

// 구독 해제 함수를 받아 두었다가, 페이지를 떠날 때 리스너를 정리한다
const unsubscribeMemory = window.api.onMemoryUsage((usage) => {
  memoryUsage.textContent = `${usage.totalMB} MB (프로세스 ${usage.processCount}개)`;
});
window.addEventListener('beforeunload', unsubscribeMemory);

// Renderer에서는 Node.js를 직접 쓸 수 없다는 것을 확인
console.log(
  'typeof require =',
  typeof (globalThis as { require?: unknown }).require,
);
console.log(
  'typeof process =',
  typeof (globalThis as { process?: unknown }).process,
);
