import { useEffect, useRef, useState } from 'react';
import type { FileResult, MenuCommand } from '../shared/ipc';
import { Editor } from './components/Editor';
import { StatusBar } from './components/StatusBar';
import { Toolbar } from './components/Toolbar';
import { useDocument } from './useDocument';

export default function App() {
  const { doc, dirty, dispatch } = useDocument();
  const [notice, setNotice] = useState('');

  useEffect(() => {
    window.api.setTitle(`${dirty ? '* ' : ''}${doc.name} - 메모장`);
    window.api.setDirty(dirty);
  }, [doc.name, dirty]);

  const confirmDiscard = () =>
    !dirty || window.confirm('저장하지 않은 내용이 있습니다. 계속할까요?');

  const applyOpenResult = (result: FileResult) => {
    if (result.ok) {
      dispatch({ type: 'loaded', name: result.name, text: result.text });
      setNotice(`${result.name} 열기 완료`);
    } else if (result.reason === 'error') {
      setNotice(`열기 실패: ${result.message}`);
    }
  };

  const handleNew = () => {
    if (!confirmDiscard()) return;
    window.api.resetFile();
    dispatch({ type: 'new' });
    setNotice('');
  };

  const handleOpen = async () => {
    if (!confirmDiscard()) return;
    applyOpenResult(await window.api.openFile());
  };

  const handleDropFile = async (file: File) => {
    if (!confirmDiscard()) return;
    applyOpenResult(await window.api.openDroppedFile(file));
  };

  const handleSave = async (saveAs = false) => {
    const result = await window.api.saveFile(doc.text, saveAs);
    if (result.ok) {
      dispatch({ type: 'saved', name: result.name });
      setNotice(`${result.name} 저장 완료`);
    } else if (result.reason === 'error') {
      setNotice(`저장 실패: ${result.message}`);
    }
  };

  // 메뉴 명령은 항상 최신 핸들러로 처리되도록 ref에 담아 둔다
  const handlers = useRef<Record<MenuCommand, () => void>>(null!);
  handlers.current = {
    new: handleNew,
    open: handleOpen,
    save: () => handleSave(false),
    'save-as': () => handleSave(true),
  };

  useEffect(() => {
    return window.api.onMenuCommand((command) => handlers.current[command]());
  }, []);

  return (
    <div className="app">
      <Toolbar
        onNew={handleNew}
        onOpen={handleOpen}
        onSave={() => handleSave(false)}
      />
      <Editor
        text={doc.text}
        onChange={(text) => dispatch({ type: 'edit', text })}
        onDropFile={handleDropFile}
      />
      <StatusBar text={doc.text} dirty={dirty} notice={notice} />
    </div>
  );
}
