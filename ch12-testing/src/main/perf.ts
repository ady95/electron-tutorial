// 시작 시간과 메모리 측정 (12-1). 환경 변수 CHAT_PERF=1일 때만 기록한다.
// performance.now()는 Main 프로세스가 시작된 순간부터 지난 시간(ms)이다
import { app } from 'electron';

const enabled = process.env.CHAT_PERF === '1';
const marks: { name: string; ms: number }[] = [];

export function mark(name: string) {
  if (enabled) marks.push({ name, ms: Math.round(performance.now()) });
}

// 시점 기록과 프로세스별 메모리를 한 번에 출력한다
export function report(label: string) {
  if (!enabled) return;
  const metrics = app.getAppMetrics().map((m) => ({
    type: m.type,
    name: m.name ?? '',
    // 작업 집합(working set): 지금 실제 메모리에 올라와 있는 양
    memoryMB: Math.round(m.memory.workingSetSize / 1024),
  }));
  const total = metrics.reduce((sum, m) => sum + m.memoryMB, 0);
  console.log(
    `[perf] ${label} ${JSON.stringify({ marks, metrics, totalMB: total })}`,
  );
}

mark('main-loaded'); // 이 파일이 처음 불린 시점 = Main 코드를 읽기 시작한 직후
