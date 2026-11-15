import type { DragEvent } from 'react';

interface EditorProps {
  text: string;
  onChange: (text: string) => void;
  onDropFile: (file: File) => void;
}

export function Editor({ text, onChange, onDropFile }: EditorProps) {
  const handleDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    const file = e.dataTransfer.files[0];
    if (!file) return; // 파일이 아니라 글자를 끌어 놓은 경우는 기본 동작
    e.preventDefault();
    onDropFile(file);
  };

  return (
    <textarea
      className="editor"
      value={text}
      onChange={(e) => onChange(e.target.value)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      spellCheck={false}
      autoFocus
    />
  );
}
