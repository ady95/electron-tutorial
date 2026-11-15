interface EditorProps {
  text: string;
  onChange: (text: string) => void;
}

export function Editor({ text, onChange }: EditorProps) {
  return (
    <textarea
      className="editor"
      value={text}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      autoFocus
    />
  );
}
