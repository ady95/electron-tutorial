import { useEffect, useState } from 'react';
import type { LlmSettingsView, SecretStatus } from '../../shared/ipc';

export default function SettingsPanel() {
  const [view, setView] = useState<LlmSettingsView | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState<SecretStatus | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [notice, setNotice] = useState('');

  const reload = async () => {
    const v = await window.api.getLlmSettings();
    setView(v);
    setBaseUrl(v.saved.baseUrl);
    setModel(v.saved.model);
    setStatus(await window.api.secretStatus());
  };
  useEffect(() => {
    reload();
  }, []);

  const saveLlm = async () => {
    const ok = await window.api.saveLlmSettings({ baseUrl, model });
    setNotice(
      ok ? 'LLM 설정을 저장했습니다.' : '주소 형식이 올바르지 않습니다.',
    );
    reload();
  };

  const saveKey = async () => {
    const r = await window.api.saveSecret(keyInput);
    setKeyInput(''); // 저장한 뒤에는 입력란에서 바로 지운다
    setNotice(
      r.ok ? 'API 키를 암호화해서 저장했습니다.' : `저장 실패: ${r.message}`,
    );
    reload();
  };

  const clearKey = async () => {
    await window.api.clearSecret();
    setNotice('API 키를 삭제했습니다.');
    reload();
  };

  // 비워 두면 환경 변수를 쓴다는 것을 입력란 안내 문구로 알려 준다 (값은 보여 주지 않는다)
  const hint = (fromEnv: boolean | undefined, example: string) =>
    fromEnv ? '비워 두면 환경 변수 값을 씁니다' : example;

  return (
    <div className="panel settings">
      <h3>LLM 연결</h3>
      <label>
        서버 주소
        <input
          className="wide"
          value={baseUrl}
          placeholder={hint(view?.fromEnv.baseUrl, 'https://api.openai.com/v1')}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </label>
      <label>
        모델
        <input
          className="wide"
          value={model}
          placeholder={hint(view?.fromEnv.model, '사용할 모델 이름')}
          onChange={(e) => setModel(e.target.value)}
        />
      </label>
      <div className="controls">
        <button onClick={saveLlm}>LLM 설정 저장</button>
      </div>

      <h3>API 키</h3>
      <p>
        상태:{' '}
        {!status
          ? '확인 중...'
          : status.saved
            ? `저장됨 (끝자리 ...${status.last4})`
            : view?.fromEnv.apiKey
              ? '저장된 키 없음 (환경 변수 OPENAI_API_KEY 사용)'
              : '저장된 키 없음'}
      </p>
      <div className="controls">
        <input
          className="wide"
          type="password"
          placeholder="API 키 붙여넣기"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
        />
        <button onClick={saveKey} disabled={keyInput.trim() === ''}>
          저장
        </button>
        <button onClick={clearKey} disabled={!status?.saved}>
          삭제
        </button>
      </div>
      {notice && <p className="result">{notice}</p>}

      <h3>데이터 폴더</h3>
      <div className="controls">
        <button onClick={() => window.api.openDataFolder()}>
          데이터 폴더 열기
        </button>
      </div>
    </div>
  );
}
