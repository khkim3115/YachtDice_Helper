// 헤더 진입 버튼 — Document PiP 지원 시에만 노출. 클릭 시 미니 창 열기/닫기 토글.
import { useMemo } from 'react';
import { PIP_SUPPORTED, usePictureInPicture } from './mini/usePictureInPicture';
import { MiniApp } from './mini/MiniApp';

export function MiniLauncherButton() {
  // <MiniApp/> 엘리먼트는 1회 고정(열 때 한 번 렌더, 이후 내부 훅이 갱신).
  const element = useMemo(() => <MiniApp />, []);
  const { toggle, open } = usePictureInPicture(element);
  if (!PIP_SUPPORTED) return null;
  return (
    <button
      className="theme-btn"
      onClick={toggle}
      aria-label="미니 창"
      aria-pressed={open}
      title={open ? '미니 창 닫기' : '미니 창으로 띄우기'}
    >
      {open ? '🔲' : '🔳'}
    </button>
  );
}
