// 토큰 수 어림. 정확한 수는 모델의 토크나이저만 안다.
// 보내기 전에 "컨텍스트를 넘길까"를 판단하는 용도라, 실제보다 넉넉하게(많게) 센다.
// 실측(qwen3.5:9b): 한국어 위주 36,852자 → 실제 22,436토큰, 이 함수 27,912 / 영어 4,550자 → 실제 813, 이 함수 1,517
export function estimateTokens(text: string): number {
  let ascii = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) < 128) ascii++;
    else other++;
  }
  // 한글 등은 글자당 1토큰, 영문·숫자·기호는 3글자당 1토큰으로 센다
  return other + Math.ceil(ascii / 3);
}
