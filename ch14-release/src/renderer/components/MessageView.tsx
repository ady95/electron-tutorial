import { useEffect, useMemo, useState } from 'react';
import { renderMarkdown } from '../markdown';
import type { UiMessage } from '../useChat';

// 첫 조각이 오기 전에는 몇 초째 기다리는지 보여 준다 (모델을 불러오는 중일 수 있다)
function Waiting({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  return (
    <p className="waiting">
      응답 기다리는 중... {Math.floor((now - since) / 1000)}초
    </p>
  );
}

export default function MessageView({ message }: { message: UiMessage }) {
  const { role, content, reasoning, state } = message;
  // 마크다운 변환은 내용이 바뀔 때만 한다
  const html = useMemo(
    () => (role === 'assistant' ? renderMarkdown(content) : ''),
    [role, content],
  );

  if (role === 'user') {
    return <div className="msg user">{content}</div>;
  }
  return (
    <div className={`msg assistant ${state}`}>
      {reasoning && (
        <details className="reasoning">
          <summary>생각 과정 ({reasoning.length.toLocaleString()}자)</summary>
          <pre>{reasoning}</pre>
        </details>
      )}
      {message.dropped ? (
        <p className="notice">
          길이 제한 때문에 앞의 대화 {message.dropped}개는 보내지 않았습니다.
        </p>
      ) : null}
      {message.notice && <p className="notice">{message.notice}</p>}
      {state === 'streaming' && content === '' && reasoning === '' && (
        <Waiting since={message.startedAt} />
      )}
      {/* renderMarkdown이 DOMPurify로 정화한 HTML만 넣는다 */}
      <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
      {message.error && <p className="error">{message.error}</p>}
      {message.meta && <p className="meta">{message.meta}</p>}
    </div>
  );
}
