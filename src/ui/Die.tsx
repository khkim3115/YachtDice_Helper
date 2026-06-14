// 주사위 한 개(핍 렌더링). 고정/추천 상태와 클릭 처리.

const PIP_MAP: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

interface DieProps {
  value: number;
  /** 이번 턴에 굴렸는지(아니면 흐리게). */
  active: boolean;
  held: boolean;
  /** 헬퍼가 보관 추천한 주사위. */
  suggested: boolean;
  clickable: boolean;
  /** 애니메이션 리플레이용 키(값이 바뀌면 애니메이션 재생). */
  animKey: string;
  onClick: () => void;
}

export function Die({ value, active, held, suggested, clickable, animKey, onClick }: DieProps) {
  const pips = PIP_MAP[value] ?? [];
  const cls = [
    'die',
    active ? 'die-anim' : 'idle',
    held ? 'held' : '',
    suggested ? 'suggested' : '',
    clickable ? 'clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      key={animKey}
      className={cls}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      aria-label={`주사위 ${value}${held ? ', 고정됨' : ''}`}
    >
      {held && <span className="die-tag hold">고정</span>}
      {!held && suggested && <span className="die-tag keep">보관 추천</span>}
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`pip ${pips.includes(i) ? 'on' : ''}`} />
      ))}
    </div>
  );
}
