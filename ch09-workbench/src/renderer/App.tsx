import { useEffect, useState } from 'react';
import type {
  DocDetail,
  DocSummary,
  ImportResult,
  SearchHit,
} from '../shared/ipc';
import DocList from './components/DocList';
import DocPreview from './components/DocPreview';
import AnalysisPanel from './components/AnalysisPanel';
import SettingsPanel from './components/SettingsPanel';
import SearchResults from './components/SearchResults';

export default function App() {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<DocDetail | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [llmReady, setLlmReady] = useState(true);

  // 서버 주소와 모델이 어디에도 없으면 첫 화면에서 안내한다
  useEffect(() => {
    if (showSettings) return;
    window.api.getLlmSettings().then(({ saved, fromEnv }) => {
      setLlmReady(
        (saved.baseUrl !== '' || fromEnv.baseUrl) &&
          (saved.model !== '' || fromEnv.model),
      );
    });
  }, [showSettings]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [focusAnalysisId, setFocusAnalysisId] = useState<number | null>(null);

  const reload = () => window.api.listDocuments().then(setDocs);
  useEffect(() => {
    reload();
  }, []);

  // 입력이 멈추고 0.3초 뒤에 검색한다
  useEffect(() => {
    const timer = setTimeout(() => {
      window.api.search(query).then(setHits);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (selectedId === null) return setSelected(null);
    window.api.getDocument(selectedId).then(setSelected);
  }, [selectedId]);

  // 불러오기 결과를 알림 한 줄로 정리하고, 마지막으로 추가된 문서를 선택한다
  const afterImport = async (r: ImportResult) => {
    await reload();
    const parts: string[] = [];
    if (r.added.length) parts.push(`${r.added.length}개 문서를 불러왔습니다.`);
    if (r.duplicates.length) {
      parts.push(`이미 있는 문서: ${r.duplicates.join(', ')}`);
    }
    for (const e of r.errors) parts.push(`${e.name}: ${e.message}`);
    setNotice(parts.join(' '));
    if (r.added.length) setSelectedId(r.added[r.added.length - 1].id);
  };

  const run = async (job: () => Promise<ImportResult>) => {
    setBusy(true);
    try {
      await afterImport(await job());
    } finally {
      setBusy(false);
    }
  };

  // 끌어다 놓은 파일은 경로가 아니라 내용(바이트)을 읽어 Main으로 보낸다
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = [...e.dataTransfer.files];
    if (files.length === 0) return;
    run(async () =>
      window.api.importDocuments(
        await Promise.all(
          files.map(async (f) => ({
            name: f.name,
            data: new Uint8Array(await f.arrayBuffer()),
          })),
        ),
      ),
    );
  };

  const openHit = (hit: SearchHit) => {
    setSelectedId(hit.docId);
    setFocusAnalysisId(hit.source === 'analysis' ? hit.refId : null);
  };

  const remove = async (id: number) => {
    await window.api.removeDocument(id);
    if (id === selectedId) setSelectedId(null);
    reload();
  };

  return (
    <div
      className={`app ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <header className="toolbar">
        <button onClick={() => run(window.api.openDocuments)} disabled={busy}>
          문서 열기
        </button>
        <span className="hint">
          PDF·TXT·MD 파일을 창에 끌어다 놓아도 됩니다
        </span>
        {busy && <span>읽는 중...</span>}
        {notice && <span className="notice">{notice}</span>}
        <button className="right" onClick={() => setShowSettings((v) => !v)}>
          {showSettings ? '문서로 돌아가기' : '설정'}
        </button>
      </header>
      {!llmReady && !showSettings && (
        <p className="banner">
          AI 분석을 쓰려면 먼저 LLM 서버 주소와 모델을 설정하세요.{' '}
          <button onClick={() => setShowSettings(true)}>설정 열기</button>
        </p>
      )}
      {showSettings ? (
        <SettingsPanel />
      ) : (
        <main className="workspace">
          <aside className="sidebar">
            <input
              className="search"
              placeholder="문서·분석 결과 검색"
              value={query}
              maxLength={100}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query.trim() ? (
              <SearchResults hits={hits} onOpen={openHit} />
            ) : (
              <DocList
                docs={docs}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedId(id);
                  setFocusAnalysisId(null);
                }}
                onRemove={remove}
              />
            )}
          </aside>
          <DocPreview doc={selected} />
          <AnalysisPanel
            doc={selected}
            focusAnalysisId={focusAnalysisId}
            onSaved={() =>
              query.trim() && window.api.search(query).then(setHits)
            }
          />
        </main>
      )}
    </div>
  );
}
