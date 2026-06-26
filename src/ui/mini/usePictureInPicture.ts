// Document Picture-in-Picture 로 임의 React 콘텐츠를 별도 창에 띄우는 컨트롤러 훅.
// 위장(제목/파비콘/테마)·스타일 복제·정리(pagehide)·토글을 담당한다. 게임 로직은 포함하지 않는다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// 비표준 API라 사용하는 표면만 최소 선언.
interface DocumentPiP {
  requestWindow(opts?: {
    width?: number;
    height?: number;
    disallowReturnToOpener?: boolean;
  }): Promise<Window>;
  readonly window: Window | null;
}
declare global {
  interface Window {
    documentPictureInPicture?: DocumentPiP;
  }
}

export const PIP_SUPPORTED =
  typeof window !== 'undefined' && 'documentPictureInPicture' in window;

const MINI_W = 280;
const MINI_H = 400;
const NEUTRAL_TITLE = 'Settings';
// 중립 회색 원형 파비콘(데이터 URL) — 게임명/로고 노출 방지.
const NEUTRAL_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#808080"/></svg>',
  );

// 같은 출처 스타일시트는 cssRules 를 통째로 복제, 접근 불가(cross-origin)면 <link> 로 대체.
function copyStyles(srcDoc: Document, destDoc: Document) {
  for (const sheet of Array.from(srcDoc.styleSheets)) {
    try {
      const cssText = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join('\n');
      const style = destDoc.createElement('style');
      style.textContent = cssText;
      destDoc.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = destDoc.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        destDoc.head.appendChild(link);
      }
    }
  }
}

export function usePictureInPicture(content: React.ReactElement) {
  const [open, setOpen] = useState(false);
  const winRef = useRef<Window | null>(null);
  const rootRef = useRef<Root | null>(null);
  const savedTitleRef = useRef<string | null>(null);
  const pendingRef = useRef(false);
  const contentRef = useRef(content);
  contentRef.current = content;

  const cleanup = useCallback(() => {
    rootRef.current?.unmount();
    rootRef.current = null;
    winRef.current = null;
    if (savedTitleRef.current !== null) {
      document.title = savedTitleRef.current; // 여는 탭 제목 원복
      savedTitleRef.current = null;
    }
    setOpen(false);
  }, []);

  const close = useCallback(() => {
    const win = winRef.current;
    if (win && !win.closed) win.close(); // → pagehide → cleanup
  }, []);

  const openPip = useCallback(async () => {
    if (!PIP_SUPPORTED) return;
    if (winRef.current) {
      close(); // 이미 열려 있으면 토글로 닫기
      return;
    }
    // 제스처 연타로 requestWindow 가 동시에 두 번 호출되는 것 방지
    if (pendingRef.current) return;
    pendingRef.current = true;
    try {
      const pip = await window.documentPictureInPicture!.requestWindow({
        width: MINI_W,
        height: MINI_H,
        disallowReturnToOpener: true,
      });
      winRef.current = pip;
      // 위장: 제목 + 파비콘 + 테마(데이터셋) 1회 설정.
      pip.document.title = NEUTRAL_TITLE;
      pip.document.documentElement.dataset.theme =
        document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
      const icon = pip.document.createElement('link');
      icon.rel = 'icon';
      icon.href = NEUTRAL_ICON;
      pip.document.head.appendChild(icon);
      copyStyles(document, pip.document); // mini.css 포함 모든 번들 CSS 복제
      pip.document.body.classList.add('mini-body');
      // 여는 탭 제목도 중립화(흘깃 단서 완화).
      savedTitleRef.current = document.title;
      document.title = NEUTRAL_TITLE;
      // 별도 React 루트 마운트 — content(<MiniApp/>) 내부 훅이 스토어 변화를 자체 반영.
      const root = createRoot(pip.document.body);
      rootRef.current = root;
      root.render(contentRef.current);
      pip.addEventListener('pagehide', cleanup, { once: true });
      setOpen(true);
    } catch {
      // NotAllowedError(제스처 없음) 등 — 무시(앱 영향 없음).
    } finally {
      pendingRef.current = false;
    }
  }, [close, cleanup]);

  // 컴포넌트 언마운트(화면 전환) 시 PiP 닫고 정리.
  useEffect(() => () => close(), [close]);

  return { open, toggle: openPip, close, supported: PIP_SUPPORTED };
}
