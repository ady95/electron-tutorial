import { useEffect, useState } from 'react';
import {
  NUM_CTX_CHOICES,
  type LlmSettings,
  type ProviderId,
  type SecretStatus,
  type SettingsView,
} from '../../shared/ipc';
import { KEY_LABELS, PROVIDER_LABELS } from '../labels';

// 헤더에서 고른 요청 경로(provider)의 서버 주소·모델·자격 증명을 편집한다
export default function SettingsPanel({
  provider: id,
  onClose,
}: {
  provider: ProviderId;
  onClose: () => void;
}) {
  const [view, setView] = useState<SettingsView | null>(null);
  const [draft, setDraft] = useState<LlmSettings | null>(null);
  const [status, setStatus] = useState<SecretStatus | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [notice, setNotice] = useState('');
  // 11-3: Ollama에 설치된 대화 모델 목록
  const [models, setModels] = useState<string[] | null>(null);

  const loadModels = async () => {
    const r = await window.api.listLocalModels();
    setModels(r.ok ? r.models : []);
    if (!r.ok) setNotice(r.message);
  };

  const reload = async () => {
    const v = await window.api.getSettings();
    setView(v);
    setDraft(v.saved);
    setStatus(await window.api.secretStatus(id));
  };
  useEffect(() => {
    reload();
    if (id === 'ollama') loadModels();
  }, [id]);

  if (!draft || !view)
    return <div className="panel settings">불러오는 중...</div>;

  const current = draft.providers[id];
  const defaults = view.defaults[id];
  const update = (patch: Partial<typeof current>) =>
    setDraft({
      ...draft,
      providers: { ...draft.providers, [id]: { ...current, ...patch } },
    });

  const save = async () => {
    const ok = await window.api.saveSettings({ ...draft, active: id });
    setNotice(ok ? '설정을 저장했습니다.' : '주소 형식이 올바르지 않습니다.');
    reload();
  };

  const saveKey = async () => {
    const r = await window.api.saveSecret(id, keyInput);
    setKeyInput(''); // 저장한 뒤에는 입력란에서 바로 지운다
    setNotice(
      r.ok ? '키를 암호화해서 저장했습니다.' : `저장 실패: ${r.message}`,
    );
    reload();
  };

  const clearKey = async () => {
    await window.api.clearSecret(id);
    setNotice('키를 삭제했습니다.');
    reload();
  };

  // 비워 두면 환경 변수를 쓴다는 것을 입력란 안내 문구로 알려 준다
  const hint = (fromEnv: string, example: string) =>
    fromEnv ? `비워 두면 환경 변수 값을 씁니다` : example;

  return (
    <div className="panel settings">
      <h3>{PROVIDER_LABELS[id]}</h3>
      <label>
        서버 주소
        <input
          value={current.baseUrl}
          placeholder={hint(
            defaults.baseUrl,
            id === 'proxy'
              ? 'https://ai.example.com/v1'
              : id === 'ollama'
                ? 'http://localhost:11434'
                : 'https://api.openai.com/v1',
          )}
          onChange={(e) => update({ baseUrl: e.target.value })}
        />
      </label>
      <label>
        모델
        {id === 'ollama' && models && models.length > 0 ? (
          <select
            value={current.model}
            onChange={(e) => update({ model: e.target.value })}
          >
            <option value="">(선택)</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={current.model}
            placeholder={hint(defaults.model, '사용할 모델 이름')}
            onChange={(e) => update({ model: e.target.value })}
          />
        )}
      </label>
      {id === 'ollama' && (
        <>
          <div className="controls">
            <button onClick={loadModels}>모델 목록 새로고침</button>
          </div>
          <label>
            컨텍스트 크기 (토큰)
            <select
              value={draft.local.numCtx}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  local: { ...draft.local, numCtx: Number(e.target.value) },
                })
              }
            >
              {NUM_CTX_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.local.think}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  local: { ...draft.local, think: e.target.checked },
                })
              }
            />
            추론(thinking) 켜기 — 답이 느려지고 컨텍스트를 많이 씁니다
          </label>
        </>
      )}
      <div className="controls">
        <button onClick={save}>설정 저장</button>
      </div>

      {id !== 'ollama' && (
        <>
          <h3>{KEY_LABELS[id]}</h3>
          <p>
            상태:{' '}
            {!status
              ? '확인 중...'
              : status.saved
                ? `저장됨 (끝자리 ...${status.last4}, ${status.origin} 전용)`
                : defaults.hasKey
                  ? '저장된 키 없음 (환경 변수 사용)'
                  : '저장된 키 없음'}
          </p>
          <div className="controls">
            <input
              type="password"
              placeholder={`${KEY_LABELS[id]} 붙여넣기`}
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
        </>
      )}
      {notice && <p className="result">{notice}</p>}
      <div className="controls">
        <button onClick={onClose}>대화로 돌아가기</button>
      </div>
    </div>
  );
}
