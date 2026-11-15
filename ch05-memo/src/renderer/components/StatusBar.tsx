interface StatusBarProps {
  text: string;
  dirty: boolean;
  notice: string;
}

export function StatusBar({ text, dirty, notice }: StatusBarProps) {
  const lines = text === '' ? 1 : text.split('\n').length;
  return (
    <div className="status-bar">
      <span>{lines}줄</span>
      <span>{text.length}자</span>
      <span>{dirty ? '수정됨' : '저장됨'}</span>
      {notice && <span className="notice">{notice}</span>}
    </div>
  );
}
