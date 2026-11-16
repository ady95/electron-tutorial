import { useEffect, useState } from 'react';
import type { SecretStatus } from '../../shared/ipc';

export default function SettingsPanel() {
  const [status, setStatus] = useState<SecretStatus | null>(null);
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState('');

  const reload = () => window.api.secretStatus().then(setStatus);
  useEffect(() => {
    reload();
  }, []);

  const save = async () => {
    const r = await window.api.saveSecret(input);
    setInput(''); // 저장한 뒤에는 입력란에서 바로 지운다
    setNotice(r.ok ? '암호화해서 저장했습니다.' : `저장 실패: ${r.message}`);
    reload();
  };

  const clear = async () => {
    await window.api.clearSecret();
    setNotice('삭제했습니다.');
    reload();
  };

  return (
    <div className="panel">
      <h3>API 키 (9장에서 사용)</h3>
      <p>
        상태:{' '}
        {!status
          ? '확인 중...'
          : !status.available
            ? 'OS 암호화를 쓸 수 없음'
            : status.saved
              ? `저장됨 (끝자리 ...${status.last4})`
              : '저장된 키 없음'}
      </p>
      <section className="controls">
        <input
          className="secret"
          type="password"
          placeholder="API 키 붙여넣기"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button onClick={save} disabled={input.trim() === ''}>
          저장
        </button>
        <button onClick={clear} disabled={!status?.saved}>
          삭제
        </button>
      </section>
      {notice && <p className="result">{notice}</p>}

      <h3>데이터 폴더</h3>
      <p>설정 파일, 작업 이력 DB, 암호화된 키가 저장되는 폴더입니다.</p>
      <button onClick={() => window.api.openDataFolder()}>
        데이터 폴더 열기
      </button>
    </div>
  );
}
