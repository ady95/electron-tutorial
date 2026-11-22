import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '../index.css';

// 12-4: 화면에서 처리되지 않은 오류를 Main 로그로 보낸다 (개발자 도구가 없는 배포본에서도 원인을 남기려고)
window.addEventListener('error', (e) => {
  const where = `${e.filename}:${e.lineno}`;
  window.api.reportError(
    [`${e.message} (${where})`, e.error?.stack ?? ''].join(' | '),
  );
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason as { stack?: string } | undefined;
  window.api.reportError(
    `처리되지 않은 Promise 거부: ${r?.stack ?? String(e.reason)}`,
  );
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
