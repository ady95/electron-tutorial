// 검색어가 나오는 곳의 앞뒤를 잘라 한 줄 미리보기를 만든다 (순수 함수)
export function makeSnippet(text: string, query: string, radius = 40): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = flat.toLowerCase().indexOf(query.trim().toLowerCase());
  if (at < 0)
    return flat.slice(0, radius * 2) + (flat.length > radius * 2 ? '…' : '');
  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + query.trim().length + radius);
  return (
    (start > 0 ? '…' : '') +
    flat.slice(start, end) +
    (end < flat.length ? '…' : '')
  );
}
