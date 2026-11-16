// 이름 바꾸기 규칙과 계획 계산. Main과 Renderer가 같은 함수를 쓴다.

export interface RenameRule {
  prefix: string; // 새 이름 앞부분
  start: number; // 시작 번호
  digits: number; // 번호 자릿수 (0으로 채움)
  extFilter: string; // 이 확장자만 대상 (빈 문자열이면 전체). 예: ".jpg"
}

export interface PlanItem {
  from: string;
  to: string;
}

export interface Plan {
  items: PlanItem[];
  problems: string[]; // 실행을 막는 문제 (중복, 금지 문자 등)
}

const INVALID = /[\\/:*?"<>|]/;

function extOf(name: string) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i) : '';
}

export function makePlan(
  fileNames: string[],
  rule: RenameRule,
  otherNames: string[] = [],
): Plan {
  const problems: string[] = [];
  if (INVALID.test(rule.prefix)) {
    problems.push('접두어에 파일 이름으로 쓸 수 없는 문자가 있습니다.');
  }
  const digits = Math.min(Math.max(Math.trunc(rule.digits) || 1, 1), 6);
  const start = Math.max(Math.trunc(rule.start) || 0, 0);
  const filter = rule.extFilter.trim().toLowerCase();

  const targets = fileNames
    .filter((n) => !filter || extOf(n).toLowerCase() === filter)
    .sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));

  const items = targets.map((from, i) => ({
    from,
    to: `${rule.prefix}${String(start + i).padStart(digits, '0')}${extOf(from)}`,
  }));

  // 이름을 바꾸지 않는 다른 항목(하위 폴더 등)과 새 이름이 겹치면 막는다.
  // Windows·macOS는 기본적으로 대소문자를 구분하지 않으므로 소문자로 비교한다
  const others = new Set(otherNames.map((n) => n.toLowerCase()));
  for (const item of items) {
    if (others.has(item.to.toLowerCase())) {
      problems.push(`같은 이름의 항목이 이미 있습니다: ${item.to}`);
    }
  }
  return { items: items.filter((it) => it.from !== it.to), problems };
}
