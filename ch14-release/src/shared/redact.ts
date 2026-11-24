// 로그에 쓰기 전에 비밀을 가린다 (12-4). 순수 함수라 Electron 없이 테스트할 수 있다.
// 서버 오류 원문에 키 일부가 들어 있거나(예: "Incorrect API key provided: sk-...") 요청 헤더가 섞일 수 있다
const PATTERNS: [RegExp, string][] = [
  [/(authorization["']?\s*[:=]\s*["']?)(bearer\s+)?[^\s"',}]+/gi, '$1$2***'],
  [/\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer ***'],
  [/\bsk-[A-Za-z0-9_-]{6,}/g, 'sk-***'],
  [/("?(?:api[_-]?key|token|password)"?\s*[:=]\s*"?)[^\s",}]+/gi, '$1***'],
];

export function redact(text: string): string {
  return PATTERNS.reduce((s, [re, to]) => s.replace(re, to), text);
}
