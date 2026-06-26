// 미니 창 상단 — "설정"처럼 보이는 위장 헤더. 싱글/멀티 탭 + 닫기.
export function MiniHeader({
  mode,
  onMode,
  onClose,
}: {
  mode: 'solo' | 'mp';
  onMode: (m: 'solo' | 'mp') => void;
  onClose: () => void;
}) {
  return (
    <div className="mini-top">
      <span className="mini-title">⚙ 설정</span>
      <div className="mini-tabs" role="tablist">
        <button
          className={mode === 'solo' ? 'on' : ''}
          role="tab"
          aria-selected={mode === 'solo'}
          onClick={() => onMode('solo')}
        >
          싱글
        </button>
        <button
          className={mode === 'mp' ? 'on' : ''}
          role="tab"
          aria-selected={mode === 'mp'}
          onClick={() => onMode('mp')}
        >
          멀티
        </button>
      </div>
      <button className="mini-x" onClick={onClose} aria-label="닫기" title="닫기">
        ✕
      </button>
    </div>
  );
}
