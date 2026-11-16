import { useState } from 'react';
import HistoryPanel from './components/HistoryPanel';
import RenamePanel from './components/RenamePanel';
import SettingsPanel from './components/SettingsPanel';

type Tab = 'rename' | 'history' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'rename', label: '이름 바꾸기' },
  { id: 'history', label: '작업 이력' },
  { id: 'settings', label: '설정' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('rename');
  const [historyVersion, setHistoryVersion] = useState(0);

  return (
    <div className="app">
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {/* 이름 바꾸기 화면은 탭을 옮겨도 상태가 유지되도록 숨기기만 한다 */}
      <div hidden={tab !== 'rename'}>
        <RenamePanel onJobDone={() => setHistoryVersion((v) => v + 1)} />
      </div>
      {tab === 'history' && <HistoryPanel refreshKey={historyVersion} />}
      {tab === 'settings' && <SettingsPanel />}
    </div>
  );
}
