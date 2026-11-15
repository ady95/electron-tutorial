interface ToolbarProps {
  onNew: () => void;
}

export function Toolbar({ onNew }: ToolbarProps) {
  return (
    <div className="toolbar">
      <button onClick={onNew}>새 문서</button>
    </div>
  );
}
