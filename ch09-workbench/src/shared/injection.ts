// 문서 안에 "AI에게 내리는 지시"처럼 보이는 문장이 있는지 찾는다 (순수 함수).
// 프롬프트만으로는 주입을 완전히 막지 못하므로, 사람이 알아챌 수 있게 표시하는 용도다.
// 완벽한 탐지기가 아니다. 놓치는 문장도, 잘못 걸리는 문장도 있을 수 있다.
const PATTERNS: RegExp[] = [
  /(이전|앞|위)의?\s*(모든\s*)?(지시|명령|지침)/,
  /(지시|명령|지침)(을|를|은|는)?\s*(모두\s*)?무시/,
  /(AI|인공지능|어시스턴트|챗봇|분석\s*도구|언어\s*모델)\s*(에게|는|은|야)/i,
  /(시스템|system)\s*(프롬프트|prompt)/i,
  /ignore\s+(all\s+)?(the\s+)?(previous|prior|above)\s+(instructions|prompts?)/i,
  /you\s+are\s+now\b/i,
];

// 의심되는 줄을 최대 limit개까지 돌려준다
export function findSuspiciousLines(text: string, limit = 5): string[] {
  const found: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line && PATTERNS.some((re) => re.test(line))) {
      found.push(line.length > 120 ? `${line.slice(0, 120)}…` : line);
      if (found.length >= limit) break;
    }
  }
  return found;
}
