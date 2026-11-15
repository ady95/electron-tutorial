import { useEffect } from 'react';
import { Editor } from './components/Editor';
import { StatusBar } from './components/StatusBar';
import { Toolbar } from './components/Toolbar';
import { useDocument } from './useDocument';

export default function App() {
  const { doc, dirty, dispatch } = useDocument();

  // 문서 이름이나 수정 상태가 바뀌면 창 제목을 바꾼다 (Main에 요청)
  useEffect(() => {
    window.api.setTitle(`${dirty ? '* ' : ''}${doc.name} - 메모장`);
  }, [doc.name, dirty]);

  const handleNew = () => {
    if (
      dirty &&
      !window.confirm('저장하지 않은 내용이 있습니다. 새 문서를 만들까요?')
    ) {
      return;
    }
    dispatch({ type: 'new' });
  };

  return (
    <div className="app">
      <Toolbar onNew={handleNew} />
      <Editor
        text={doc.text}
        onChange={(text) => dispatch({ type: 'edit', text })}
      />
      <StatusBar text={doc.text} dirty={dirty} />
    </div>
  );
}
