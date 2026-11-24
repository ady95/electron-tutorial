import { useEffect, useRef, useState } from 'react';

// 11-4: 웹 표준 Prompt API(LanguageModel)를 직접 쓰는 화면.
// window.api(preload)를 거치지 않는다. 요청은 Electron이 Local AI Handler(UtilityProcess)로 보낸다
type Session = Awaited<
  ReturnType<NonNullable<Window['LanguageModel']>['create']>
>;

export default function PromptApiPanel() {
  const [availability, setAvailability] = useState('확인 중...');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [usage, setUsage] = useState('');
  const [running, setRunning] = useState(false);
  const session = useRef<Session | null>(null);
  const abort = useRef<AbortController | null>(null);

  const check = async () => {
    const lm = window.LanguageModel;
    if (!lm) return setAvailability('이 창에는 LanguageModel이 없습니다.');
    setAvailability(await lm.availability());
  };
  useEffect(() => {
    // 12-1: 핸들러 프로세스는 이 화면을 처음 열 때 시작한다
    window.api.enableLocalAi().then(check);
    return () => session.current?.destroy();
  }, []);

  const run = async () => {
    const lm = window.LanguageModel;
    if (!lm || input.trim() === '') return;
    setRunning(true);
    setOutput('');
    abort.current = new AbortController();
    try {
      // 세션은 이전 대화를 기억한다. [새 세션]을 누르기 전까지 같은 세션을 쓴다
      session.current ??= await lm.create({
        initialPrompts: [
          { role: 'system', content: '한국어로 간결하게 답하세요.' },
        ],
      });
      const stream = session.current.promptStreaming(input, {
        signal: abort.current.signal,
      });
      let text = '';
      for await (const chunk of stream) {
        text += chunk;
        setOutput(text);
      }
      const s = session.current;
      setUsage(
        `컨텍스트 ${s.contextUsage.toLocaleString()} / ${s.contextWindow.toLocaleString()}토큰`,
      );
    } catch (err) {
      const e = err as Error;
      setOutput((t) => `${t}\n[${e.name}] ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    session.current?.destroy();
    session.current = null;
    setOutput('');
    setUsage('');
  };

  return (
    <div className="panel settings prompt-api">
      <h3>Prompt API (실험)</h3>
      <p>
        상태: {availability}{' '}
        <button onClick={check} disabled={running}>
          다시 확인
        </button>
      </p>
      <textarea
        rows={3}
        value={input}
        placeholder="LanguageModel에 보낼 질문"
        onChange={(e) => setInput(e.target.value)}
      />
      <div className="controls">
        {running ? (
          <button onClick={() => abort.current?.abort()}>중지</button>
        ) : (
          <button onClick={run} disabled={input.trim() === ''}>
            실행
          </button>
        )}
        <button onClick={reset} disabled={running}>
          새 세션
        </button>
      </div>
      <pre className="api-output">{output}</pre>
      {usage && <p className="meta">{usage}</p>}
    </div>
  );
}
