import type { SearchHit } from '../../shared/ipc';

export default function SearchResults({
  hits,
  onOpen,
}: {
  hits: SearchHit[];
  onOpen: (hit: SearchHit) => void;
}) {
  return (
    <div className="doc-list search-results">
      <h3>검색 결과 {hits.length}건</h3>
      {hits.length === 0 && <p className="empty">찾은 결과가 없습니다.</p>}
      <ul>
        {hits.map((h) => (
          <li key={`${h.source}-${h.refId}`} onClick={() => onOpen(h)}>
            <div className="doc-name">
              <span className={`badge ${h.source}`}>
                {h.source === 'doc' ? '문서' : '분석'}
              </span>{' '}
              {h.docName}
            </div>
            {h.source === 'analysis' && (
              <div className="doc-meta">{h.title}</div>
            )}
            <div className="snippet">{h.snippet}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
