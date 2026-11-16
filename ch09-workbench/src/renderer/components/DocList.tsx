import type { DocSummary } from '../../shared/ipc';

interface Props {
  docs: DocSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onRemove: (id: number) => void;
}

export const describeDoc = (d: DocSummary) =>
  d.kind === 'pdf'
    ? `PDF ${d.pages}쪽 · ${d.chars.toLocaleString()}자`
    : `텍스트(${d.encoding}) · ${d.chars.toLocaleString()}자`;

export default function DocList({
  docs,
  selectedId,
  onSelect,
  onRemove,
}: Props) {
  return (
    <aside className="doc-list">
      <h3>문서 {docs.length}개</h3>
      {docs.length === 0 && <p className="empty">불러온 문서가 없습니다.</p>}
      <ul>
        {docs.map((d) => (
          <li
            key={d.id}
            className={d.id === selectedId ? 'selected' : ''}
            onClick={() => onSelect(d.id)}
          >
            <div className="doc-name">{d.name}</div>
            <div className="doc-meta">
              {describeDoc(d)}
              {d.warning && <span className="warn"> · 확인 필요</span>}
            </div>
            <button
              className="remove"
              title="목록에서 지우기"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(d.id);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
