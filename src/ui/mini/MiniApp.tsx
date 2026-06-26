// 미니 창의 React 루트. 모드(싱글/멀티) 전환 + 빠른숨김(자동 블랭크/Esc) + 닫기.
// 자기 ownerDocument/defaultView(=PiP 창)에 리스너를 단다(여기서 window 는 여는 탭이므로 사용 금지).
import './mini.css';
import { useEffect, useRef, useState } from 'react';
import { MiniHeader } from './MiniHeader';
import { MiniSolo } from './MiniSolo';

export function MiniApp() {
  const [mode, setMode] = useState<'solo' | 'mp'>('solo');
  const [blanked, setBlanked] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    const doc = el?.ownerDocument;
    const win = doc?.defaultView;
    if (!doc || !win) return;
    const onVis = () => {
      if (doc.hidden) setBlanked(true);
    };
    const onBlur = () => setBlanked(true); // 포커스 상실 시 즉시 가림(베스트-에포트)
    const onFocus = () => setBlanked(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') win.close();
    };
    doc.addEventListener('visibilitychange', onVis);
    win.addEventListener('blur', onBlur);
    win.addEventListener('focus', onFocus);
    win.addEventListener('keydown', onKey);
    return () => {
      doc.removeEventListener('visibilitychange', onVis);
      win.removeEventListener('blur', onBlur);
      win.removeEventListener('focus', onFocus);
      win.removeEventListener('keydown', onKey);
    };
  }, []);

  const close = () => rootRef.current?.ownerDocument.defaultView?.close();

  return (
    <div className="mini-root" ref={rootRef}>
      <MiniHeader mode={mode} onMode={setMode} onClose={close} />
      {mode === 'solo' ? (
        <MiniSolo />
      ) : (
        <div className="mini-mp-stub">멀티는 곧 추가됩니다.</div>
      )}
      {blanked && (
        <button className="mini-blank" onClick={() => setBlanked(false)} aria-label="다시 보기">
          ⚙ 설정
        </button>
      )}
    </div>
  );
}
