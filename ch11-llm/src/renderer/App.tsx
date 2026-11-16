import { useEffect, useRef, useState } from 'react';
import MessageView from './components/MessageView';
import SettingsPanel from './components/SettingsPanel';
import { useChat } from './useChat';

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [input, setInput] = useState('');
  const { messages, busy, send, stop, reset } = useChat('openai');
  const bottom = useRef<HTMLDivElement>(null);

  // 새 조각이 붙으면 맨 아래로 스크롤한다
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const submit = () => {
    if (busy || input.trim() === '') return;
    send(input.trim());
    setInput('');
  };

  return (
    <div className="app">
      <header className="toolbar">
        <strong>AI 채팅</strong>
        <span className="spacer" />
        <button onClick={reset} disabled={busy || messages.length === 0}>
          새 대화
        </button>
        <button onClick={() => setShowSettings((v) => !v)}>설정</button>
      </header>

      {showSettings ? (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      ) : (
        <main className="messages">
          {messages.length === 0 && (
            <p className="empty">
              무엇이든 물어보세요. Enter로 보내고 Shift+Enter로 줄을 바꿉니다.
            </p>
          )}
          {messages.map((m) => (
            <MessageView key={m.id} message={m} />
          ))}
          <div ref={bottom} />
        </main>
      )}

      <footer className="composer">
        <textarea
          value={input}
          rows={3}
          placeholder="메시지 입력"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // 한글 입력 중(조합 중)의 Enter는 글자 확정이므로 보내지 않는다
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {busy ? (
          <button className="stop" onClick={stop}>
            중지
          </button>
        ) : (
          <button onClick={submit} disabled={input.trim() === ''}>
            보내기
          </button>
        )}
      </footer>
    </div>
  );
}
