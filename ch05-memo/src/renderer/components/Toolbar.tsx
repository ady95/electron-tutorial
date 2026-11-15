interface ToolbarProps {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
}

export function Toolbar({ onNew, onOpen, onSave }: ToolbarProps) {
  return (
    <div className="toolbar">
      <button onClick={onNew}>새 문서</button>
      <button onClick={onOpen}>열기</button>
      <button onClick={onSave}>저장</button>
    </div>
  );
}
