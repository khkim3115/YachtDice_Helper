# macOS 미니 위젯(Document PiP 미니 모드) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹앱에 Document Picture-in-Picture로 띄우는 작고 위장된 "미니 모드"를 추가해, macOS(및 모든 PiP 지원 브라우저) 사용자가 항상-위 저채도 미니 패널로 요트다이스를 즐기게 한다.

**Architecture:** 신규 React 미니 뷰(`MiniApp`)를 별도 React 루트로 Document PiP 창에 렌더링한다(접근 A). 게임 로직은 기존 웹 `core`(rules·gameState·dice·scoring) + Zustand 스토어(`gameStore`=싱글, `multiplayerStore`=멀티)를 그대로 재사용한다(새 게임 로직 0). PiP 창 열기·스타일 복제·위장·빠른숨김·정리는 `usePictureInPicture` 훅이 담당한다.

**Tech Stack:** React 19, TypeScript, Vite, Zustand, Document Picture-in-Picture API(Chrome/Edge 116+).

**Spec:** [docs/superpowers/specs/2026-06-26-macos-pip-mini-mode-design.md](../specs/2026-06-26-macos-pip-mini-mode-design.md) · **이슈** #57 · **마일스톤** #6.

## Global Constraints

- **게임 로직 추가 금지.** 미니 뷰는 기존 `core`/스토어만 호출한다(점수·룰·멀티 RPC 재구현 금지).
- **헬퍼 없음.** 미니 뷰는 advisor/EV/추천을 표시하지 않는다(트레이 앱과 동일 범위).
- **전역 `manifest`(name/short_name/icon) 변경 금지.** 위장은 미니 창의 `document.title`·콘텐츠 안에서만.
- **기능 감지로 노출.** `'documentPictureInPicture' in window` 가 false면 진입 버튼을 렌더하지 않는다(Safari/Firefox<151 등).
- **CSS 변수 재사용.** 색은 `src/index.css`의 토큰(`--bg-1`,`--surface`,`--surface-2`,`--border`,`--text`,`--muted`,`--faint`,`--accent`,`--good`,`--die-face` 등)만 사용. 새 색상 하드코딩 금지.
- **테마**: PiP 문서 `<html data-theme>` 를 여는 시점의 메인 테마로 1회 설정(라이트/다크 CSS 변수 적용용).
- **검증**: Document PiP는 vitest/jsdom(node 환경)로 구동 불가 → UI/PiP는 **Chrome 수동 검증**(preview 도구), 게임 로직은 기존 `core`/`engine` 테스트가 커버. 각 태스크의 자동 게이트는 `npm run typecheck` + `npm run build`(타입+번들) + `npm test`(기존 회귀) 통과.
- **커밋**: 태스크마다 1커밋. 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **언어**: 코드 주석/사용자 문구는 한국어(레포 관례), 식별자는 영어.

---

## 파일 구조

**신규 (Phase 1)**
- `src/ui/mini/usePictureInPicture.ts` — PiP 컨트롤러 훅 + `PIP_SUPPORTED` 플래그 + 스타일 복제 util.
- `src/ui/mini/MiniApp.tsx` — 미니 루트: 모드(싱글/멀티) 전환 + 빠른숨김(blur/visibility/Esc) + 닫기.
- `src/ui/mini/MiniHeader.tsx` — "⚙ 설정" 위장 헤더 + 싱글/멀티 탭 + 닫기.
- `src/ui/mini/MiniSolo.tsx` — 축소 싱글(주사위 + 콤팩트 점수판), `gameStore` + `Die` 재사용.
- `src/ui/mini/mini.css` — 미니 위장 스타일(`.mini-*`), CSS 토큰만 사용.
- `src/ui/MiniLauncherButton.tsx` — 헤더 진입 버튼(기능 감지).

**수정 (Phase 1)**
- `src/ui/Header.tsx` — `<MiniLauncherButton/>` 삽입(`<InstallButton/>` 앞).
- `src/ui/DownloadCards.tsx` — macOS "미니 창" 안내 카드 추가.
- `src/data/changelog.ts` — 패치노트 1건 prepend.

**신규 (Phase 2)**
- `src/ui/mini/MiniMultiplayer.tsx` — 축소 멀티(로비 + 게임 + 종료), `multiplayerStore` 재사용.

**수정 (Phase 2)**
- `src/ui/mini/MiniApp.tsx` — `mode==='mp'` 분기를 stub → `<MiniMultiplayer/>` 로 교체.

---

# Phase 1 — PiP 인프라 + 싱글 미니 + 다운로드 안내 (단독 출시 가능)

## Task 1: PiP 컨트롤러 훅 (`usePictureInPicture`)

**Files:**
- Create: `src/ui/mini/usePictureInPicture.ts`

**Interfaces:**
- Produces:
  - `export const PIP_SUPPORTED: boolean`
  - `export function usePictureInPicture(content: React.ReactElement): { open: boolean; toggle: () => void; close: () => void; supported: boolean }`

- [ ] **Step 1: 훅 구현**

`src/ui/mini/usePictureInPicture.ts`:

```ts
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
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="%23808080"/></svg>',
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
    }
  }, [close, cleanup]);

  // 컴포넌트 언마운트(화면 전환) 시 PiP 닫고 정리.
  useEffect(() => () => close(), [close]);

  return { open, toggle: openPip, close, supported: PIP_SUPPORTED };
}
```

- [ ] **Step 2: 타입 게이트**

Run: `npm run typecheck`
Expected: PASS (오류 없음). `react-dom/client` import·`Window.documentPictureInPicture` 선언이 컴파일됨.

- [ ] **Step 3: 커밋**

```bash
git add src/ui/mini/usePictureInPicture.ts
git commit -m "feat(mini): Document PiP 컨트롤러 훅 (#57)"
```

---

## Task 2: 위장 헤더 (`MiniHeader`)

**Files:**
- Create: `src/ui/mini/MiniHeader.tsx`

**Interfaces:**
- Produces: `export function MiniHeader(props: { mode: 'solo' | 'mp'; onMode: (m: 'solo' | 'mp') => void; onClose: () => void }): JSX.Element`

- [ ] **Step 1: 구현**

`src/ui/mini/MiniHeader.tsx`:

```tsx
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
```

- [ ] **Step 2: 타입 게이트** — Run: `npm run typecheck` → PASS.
- [ ] **Step 3: 커밋**

```bash
git add src/ui/mini/MiniHeader.tsx
git commit -m "feat(mini): 위장 헤더(설정 룩) + 모드 탭 (#57)"
```

---

## Task 3: 콤팩트 싱글 (`MiniSolo`)

**Files:**
- Create: `src/ui/mini/MiniSolo.tsx`

**Interfaces:**
- Consumes: `useGameStore`(`dice`,`held`,`rollsUsed`,`card`,`rules`,`roll`,`toggleHold`,`assign`,`newGame`,`canRoll()`,`canReroll()`,`gameOver()`,`rerollsLeft()`), `Die`(from `../Die`), `core/gameState`(`grandTotal`,`isCategoryFilled`), `core/scoring`(`scoreDice`), `core/rules`(`CATEGORY_IDS`,`CATEGORY_META`).
- Produces: `export function MiniSolo(): JSX.Element`

- [ ] **Step 1: 구현**

`src/ui/mini/MiniSolo.tsx`:

```tsx
// 축소 싱글플레이 — gameStore + Die 재사용. 헬퍼 없음.
import { CATEGORY_IDS, CATEGORY_META } from '../../core/rules';
import { grandTotal, isCategoryFilled } from '../../core/gameState';
import { scoreDice } from '../../core/scoring';
import { useGameStore } from '../../store/gameStore';
import { Die } from '../Die';

export function MiniSolo() {
  const dice = useGameStore((s) => s.dice);
  const held = useGameStore((s) => s.held);
  const rollsUsed = useGameStore((s) => s.rollsUsed);
  const card = useGameStore((s) => s.card);
  const rules = useGameStore((s) => s.rules);
  const roll = useGameStore((s) => s.roll);
  const toggleHold = useGameStore((s) => s.toggleHold);
  const assign = useGameStore((s) => s.assign);
  const newGame = useGameStore((s) => s.newGame);
  const canRoll = useGameStore((s) => s.canRoll());
  const canReroll = useGameStore((s) => s.canReroll());
  const gameOver = useGameStore((s) => s.gameOver());
  const rerollsLeft = useGameStore((s) => s.rerollsLeft());

  const rolled = rollsUsed > 0;
  const total = grandTotal(card, rules);

  return (
    <div className="mini-game">
      <div className="mini-dice">
        {dice.map((v, i) => (
          <Die
            key={i}
            value={v}
            active={rolled}
            held={held[i]}
            suggested={false}
            clickable={canReroll}
            animKey={`${i}-${v}-${rollsUsed}`}
            onClick={() => toggleHold(i)}
          />
        ))}
      </div>

      <button
        className="mini-roll"
        onClick={gameOver ? newGame : roll}
        disabled={!gameOver && !canRoll}
      >
        {gameOver ? '다시 시작' : rollsUsed === 0 ? '굴리기' : `리롤 (${rerollsLeft})`}
      </button>

      <div className="mini-card">
        {CATEGORY_IDS.map((id) => {
          const filled = isCategoryFilled(card, id);
          const preview = !filled && rolled && !gameOver ? scoreDice(id, dice, rules) : null;
          return (
            <button
              key={id}
              className={`mini-cat ${filled ? 'filled' : ''}`}
              disabled={filled || !rolled || gameOver}
              onClick={() => assign(id)}
            >
              <span className="k">{CATEGORY_META[id].ko}</span>
              <span className="v">
                {filled ? (card.scores[id] ?? 0) : preview === null ? '·' : preview}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mini-foot-total">합계 {total}</div>
    </div>
  );
}
```

- [ ] **Step 2: 타입 게이트** — Run: `npm run typecheck` → PASS. (`card.scores[id]` 는 `Scorecard.scores: Partial<Record<CategoryId, number>>` 라 `?? 0` 로 좁힘.)
- [ ] **Step 3: 커밋**

```bash
git add src/ui/mini/MiniSolo.tsx
git commit -m "feat(mini): 콤팩트 싱글(주사위+점수판), gameStore 재사용 (#57)"
```

---

## Task 4: 미니 루트 + 빠른숨김 (`MiniApp`, mp는 stub)

**Files:**
- Create: `src/ui/mini/MiniApp.tsx`

**Interfaces:**
- Consumes: `MiniHeader`, `MiniSolo`.
- Produces: `export function MiniApp(): JSX.Element`
- 비고: `mode==='mp'` 는 Phase 2에서 `<MiniMultiplayer/>` 로 교체. Phase 1에선 안내 stub.

- [ ] **Step 1: 구현 (빠른숨김 = blur/visibilitychange→블랭크, Esc→닫기; 자동 블랭크 기본 ON)**

`src/ui/mini/MiniApp.tsx`:

```tsx
// 미니 창의 React 루트. 모드(싱글/멀티) 전환 + 빠른숨김(자동 블랭크/Esc) + 닫기.
// 자기 ownerDocument/defaultView(=PiP 창)에 리스너를 단다(여기서 window 는 여는 탭이므로 사용 금지).
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
```

- [ ] **Step 2: 타입 게이트** — Run: `npm run typecheck` → PASS.
- [ ] **Step 3: 커밋**

```bash
git add src/ui/mini/MiniApp.tsx
git commit -m "feat(mini): 미니 루트 + 빠른숨김(블랭크/Esc) (#57)"
```

---

## Task 5: 미니 위장 스타일 (`mini.css`)

**Files:**
- Create: `src/ui/mini/mini.css`
- Modify: `src/ui/mini/MiniApp.tsx` (상단에 `import './mini.css';` 추가)

- [ ] **Step 1: 스타일 작성 (CSS 토큰만 사용, 어두운 "설정" 룩)**

`src/ui/mini/mini.css`:

```css
/* 미니 창(Document PiP) 위장 스타일 — 저채도 '설정 패널' 룩. 색은 index.css 토큰만 사용. */
.mini-body {
  margin: 0;
  background: var(--bg-2);
  color: var(--text);
  font-family: 'Segoe UI', system-ui, -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic',
    sans-serif;
  -webkit-font-smoothing: antialiased;
}
.mini-root {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 8px;
  gap: 8px;
}
.mini-top {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.mini-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}
.mini-tabs {
  margin-left: auto;
  display: flex;
  gap: 2px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 2px;
}
.mini-tabs button {
  background: transparent;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 12px;
  color: var(--faint);
}
.mini-tabs button.on {
  background: var(--surface-3);
  color: var(--text);
}
.mini-x {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  width: 22px;
  height: 22px;
  font-size: 11px;
  color: var(--muted);
}
.mini-game {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.mini-dice {
  display: flex;
  justify-content: space-between;
  gap: 4px;
}
/* 미니 창에서 기존 .die 를 작게 — 핍 레이아웃은 그대로, 한 변만 축소. */
.mini-dice .die {
  width: 40px;
  height: 40px;
}
.mini-roll {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 7px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.mini-card {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  overflow-y: auto;
  min-height: 0;
}
.mini-cat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 7px;
  font-size: 12px;
  color: var(--text);
}
.mini-cat .k {
  color: var(--muted);
}
.mini-cat.filled {
  opacity: 0.55;
}
.mini-cat.filled .v {
  color: var(--faint);
}
.mini-foot-total {
  text-align: right;
  font-size: 12px;
  color: var(--muted);
  padding-top: 2px;
  border-top: 1px solid var(--border);
}
.mini-mp-stub {
  margin: auto;
  color: var(--faint);
  font-size: 13px;
}
/* 빠른숨김 오버레이 — 전체를 덮는 무채색 '설정' 패널. */
.mini-blank {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-2);
  color: var(--faint);
  font-size: 14px;
  border: none;
}
```

- [ ] **Step 2: MiniApp 에 import 추가**

`src/ui/mini/MiniApp.tsx` 최상단(첫 import 위)에:

```tsx
import './mini.css';
```

- [ ] **Step 3: 빌드 게이트** — Run: `npm run build`
Expected: PASS. mini.css 가 번들에 포함(→ Task 1의 `copyStyles` 가 PiP로 복제).

- [ ] **Step 4: 커밋**

```bash
git add src/ui/mini/mini.css src/ui/mini/MiniApp.tsx
git commit -m "feat(mini): 위장 미니 스타일(mini.css) (#57)"
```

---

## Task 6: 진입 버튼 + 헤더 통합 (`MiniLauncherButton`)

**Files:**
- Create: `src/ui/MiniLauncherButton.tsx`
- Modify: `src/ui/Header.tsx` (`<InstallButton/>` 바로 앞에 `<MiniLauncherButton/>` 삽입; import 추가)

**Interfaces:**
- Consumes: `usePictureInPicture`, `PIP_SUPPORTED`, `MiniApp`.
- Produces: `export function MiniLauncherButton(): JSX.Element | null`

- [ ] **Step 1: 버튼 구현**

`src/ui/MiniLauncherButton.tsx`:

```tsx
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
```

- [ ] **Step 2: 헤더에 삽입**

`src/ui/Header.tsx`:
- import 블록(`import { InstallButton } from './InstallButton';` 아래)에 추가:

```tsx
import { MiniLauncherButton } from './MiniLauncherButton';
```

- `<InstallButton />` 바로 앞 줄에 삽입:

```tsx
          <MiniLauncherButton />
          <InstallButton />
```

- [ ] **Step 3: 빌드 게이트** — Run: `npm run typecheck && npm run build` → PASS.

- [ ] **Step 4: Chrome 수동 검증 (핵심)**

```
npm run build && npm run preview   # preview 서버(서비스워커 포함) — PiP는 Chrome에서만
```
Chrome preview 도구로:
1. `preview_start` 후 홈/솔로 화면에서 헤더에 🔳 버튼이 보이는지(`preview_snapshot`).
2. 🔳 클릭 → 별도 미니 창이 뜨고, **창 제목이 'Settings'**, 어두운 "⚙ 설정" 헤더 + 주사위 + 점수판이 보이는지.
3. 미니 창에서 굴리기/주사위 보관/카테고리 기록이 동작하고 합계가 갱신되는지.
4. 미니 창 포커스 잃기(메인 클릭) → 블랭크 오버레이로 가려지는지, 다시 포커스 시 해제되는지.
5. 미니 창에서 Esc → 닫히는지. 헤더 🔳(🔲) 재클릭 → 토글 동작.
6. `preview_screenshot` 으로 위장 패널 증빙 캡처.

> 비고: PiP는 jsdom 비대상이라 단위 테스트 없음 — 위 Chrome 수동 검증이 게이트. 게임 로직은 기존 `core` 테스트가 커버.

- [ ] **Step 5: 커밋**

```bash
git add src/ui/MiniLauncherButton.tsx src/ui/Header.tsx
git commit -m "feat(mini): 헤더 미니 창 진입 버튼(기능 감지) (#57)"
```

---

## Task 7: macOS 다운로드 안내 카드

**Files:**
- Modify: `src/ui/DownloadCards.tsx` (Windows 트레이 카드 옆에 Mac 카드 추가)

- [ ] **Step 1: Mac 카드 추가**

`src/ui/DownloadCards.tsx` 의 `<div className="dl-cards">` 안, 기존 트레이 카드(`</div>` 닫힘) 다음에 Mac 카드를 추가:

```tsx
        <div className="dl-card">
          <span className="dl-icon">🍎</span>
          <span className="dl-text">
            <b>
              미니 창 <small className="dl-os">macOS · Chrome/Edge</small>
            </b>
            <small>
              브라우저에서 헤더의 <b>🔳 미니 창</b> 버튼 → 항상 위에 뜨는 작은 패널. 설치(PWA)
              하면 더 앱처럼 쓸 수 있어요. (Safari는 미니 창 미지원)
            </small>
          </span>
          <button className="dl-btn" onClick={installPwa} disabled={installed}>
            {installed ? '설치됨 ✓' : '⬇ 앱 설치'}
          </button>
        </div>
```

> 비고: Mac은 별도 다운로드 파일이 없고 PWA 설치 + 미니 창 버튼으로 안내한다(전역 manifest 변경 없음). `installPwa`·`installed` 는 컴포넌트에 이미 존재.

- [ ] **Step 2: 빌드 게이트** — Run: `npm run typecheck && npm run build` → PASS.

- [ ] **Step 3: Chrome 수동 검증** — 홈 화면 "앱으로 받기"에 Windows/Mac 카드가 나란히 보이는지(`preview_snapshot`/`preview_screenshot`).

- [ ] **Step 4: 커밋**

```bash
git add src/ui/DownloadCards.tsx
git commit -m "feat(mini): 홈 다운로드에 macOS 미니 창 안내 카드 (#57)"
```

---

## Task 8: 패치노트 + Phase 1 마무리 검증

**Files:**
- Modify: `src/data/changelog.ts` (CHANGELOG[0] 위에 1건 prepend)

- [ ] **Step 1: 패치노트 prepend**

`src/data/changelog.ts` 의 `CHANGELOG` 배열 맨 앞에 새 엔트리를 추가한다(기존 최신 엔트리 형식을 그대로 따른다 — `version`/`date`/변경 타입별 항목). 내용 예:
- 제목/버전: 다음 web 버전으로 bump.
- 항목(feat): "🔳 미니 창 모드 — 브라우저에서 항상 위에 뜨는 작은 저채도 패널로 플레이(Chrome/Edge). macOS 사용자도 가볍게 즐길 수 있어요."

> 실제 필드명·형식은 `src/data/changelog.ts` 의 `CHANGELOG[0]` 를 열어 동일 구조로 작성한다(이 레포의 단일 출처).

- [ ] **Step 2: 전체 게이트** — Run: `npm run typecheck && npm test && npm run build`
Expected: 모두 PASS(기존 `core`/`engine` 테스트 회귀 없음).

- [ ] **Step 3: Phase 1 통합 수동 검증** — Task 6 Step 4의 1~6을 한 번 더 통과(빌드본 기준) + Mac 카드 노출 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/data/changelog.ts
git commit -m "docs(changelog): 미니 창 모드 패치노트 (#57)"
```

> **Phase 1 종료 = 단독 PR 가능**: PiP 미니 모드(싱글) + 진입 버튼 + 위장/빠른숨김 + Mac 안내가 동작. 멀티는 Phase 2.

---

# Phase 2 — 콤팩트 멀티 (`MiniMultiplayer`)

> `multiplayerStore` 는 서버 권위(주사위/턴/점수 모두 RPC + Realtime). 미니 멀티는 **새 멀티 로직 없이** 스토어의 `createRoom/joinRoom/startGame/rollDice/setHeld/assignCategory/leave` 와 파생 셀렉터(`selectMySeat`,`selectActivePlayer`)만 호출한다. `room.dice/held/rollsUsed/currentSeat/status` 가 단일 출처.

## Task 9: 콤팩트 멀티 — 로비 + 게임 + 종료 (`MiniMultiplayer`)

**Files:**
- Create: `src/ui/mini/MiniMultiplayer.tsx`

**Interfaces:**
- Consumes: `useMultiplayerStore`(상태 + 액션), `selectMySeat`, `selectActivePlayer`, `MpPlayer`(타입), `core/rules`(`CATEGORY_IDS`,`CATEGORY_META`,`RULE_PRESETS`), `core/gameState`(`grandTotal`,`isCategoryFilled`), `core/scoring`(`scoreDice`), `Die`.
- Produces: `export function MiniMultiplayer(): JSX.Element`

- [ ] **Step 1: 구현 (로비/게임/종료 3상태)**

`src/ui/mini/MiniMultiplayer.tsx`:

```tsx
// 축소 멀티플레이 — multiplayerStore(서버 권위) 재사용. 헬퍼 없음.
import { useState } from 'react';
import { CATEGORY_IDS, CATEGORY_META, RULE_PRESETS } from '../../core/rules';
import { grandTotal, isCategoryFilled } from '../../core/gameState';
import { scoreDice } from '../../core/scoring';
import {
  selectActivePlayer,
  selectMySeat,
  useMultiplayerStore,
} from '../../store/multiplayerStore';
import { Die } from '../Die';

export function MiniMultiplayer() {
  const room = useMultiplayerStore((s) => s.room);
  if (!room) return <MiniMpLobby />;
  if (room.status === 'finished') return <MiniMpOver />;
  return <MiniMpGame />;
}

// ── 로비: 닉네임 + 방 만들기/참가 ──
function MiniMpLobby() {
  const createRoom = useMultiplayerStore((s) => s.createRoom);
  const joinRoom = useMultiplayerStore((s) => s.joinRoom);
  const startGame = useMultiplayerStore((s) => s.startGame);
  const leave = useMultiplayerStore((s) => s.leave);
  const room = useMultiplayerStore((s) => s.room);
  const players = useMultiplayerStore((s) => s.players);
  const busy = useMultiplayerStore((s) => s.busy);
  const error = useMultiplayerStore((s) => s.error);
  const myUserId = useMultiplayerStore((s) => s.myUserId);
  const [name, setName] = useState(() => localStorage.getItem('yd_mp_name') ?? '');
  const [code, setCode] = useState('');

  const remember = () => localStorage.setItem('yd_mp_name', name.trim());
  const amHost = !!room && players.find((p) => p.userId === myUserId)?.isHost;

  // 방에 들어와 있고(대기) 시작 전이면 코드/명단/시작 표시.
  if (room) {
    return (
      <div className="mini-mp">
        <div className="mini-mp-code">방 코드 {room.code}</div>
        <div className="mini-mp-list">
          {players.map((p) => (
            <div key={p.id} className="mini-mp-pl">
              {p.displayName}
              {p.isHost && ' 👑'}
            </div>
          ))}
        </div>
        {amHost ? (
          <button className="mini-roll" disabled={players.length < 2} onClick={() => void startGame()}>
            게임 시작
          </button>
        ) : (
          <div className="mini-mp-wait">방장이 시작하길 기다리는 중…</div>
        )}
        <button className="mini-mp-leave" onClick={() => void leave()}>
          나가기
        </button>
        {error && <div className="mini-mp-err">{error}</div>}
      </div>
    );
  }

  return (
    <div className="mini-mp">
      <input
        className="mini-mp-in"
        placeholder="닉네임"
        value={name}
        maxLength={12}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        className="mini-roll"
        disabled={busy || !name.trim()}
        onClick={() => {
          remember();
          void createRoom(name.trim(), false, 4, 'default');
        }}
      >
        방 만들기
      </button>
      <div className="mini-mp-join">
        <input
          className="mini-mp-in"
          placeholder="방 코드"
          value={code}
          maxLength={6}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button
          className="mini-roll"
          disabled={busy || !name.trim() || code.trim().length < 4}
          onClick={() => {
            remember();
            void joinRoom(code.trim(), name.trim());
          }}
        >
          참가
        </button>
      </div>
      {error && <div className="mini-mp-err">{error}</div>}
    </div>
  );
}

// ── 게임: 내 차례에만 굴림/보관/기록 ──
function MiniMpGame() {
  const room = useMultiplayerStore((s) => s.room)!;
  const players = useMultiplayerStore((s) => s.players);
  const mySeat = useMultiplayerStore(selectMySeat);
  const active = useMultiplayerStore(selectActivePlayer);
  const rollDice = useMultiplayerStore((s) => s.rollDice);
  const setHeld = useMultiplayerStore((s) => s.setHeld);
  const assignCategory = useMultiplayerStore((s) => s.assignCategory);
  const leave = useMultiplayerStore((s) => s.leave);
  const error = useMultiplayerStore((s) => s.error);

  const rules = RULE_PRESETS[room.rulePreset].config;
  const myTurn = mySeat !== null && room.currentSeat === mySeat;
  const me = players.find((p) => p.seat === mySeat);
  const dice = room.dice.length ? room.dice : [1, 2, 3, 4, 5];
  const held = room.held.length ? room.held : [false, false, false, false, false];
  const rolled = room.rollsUsed > 0;
  const canRoll = myTurn && room.rollsUsed < 3;
  const canReroll = myTurn && rolled && room.rollsUsed < 3;

  const toggleHold = (i: number) => {
    if (!canReroll) return;
    const next = held.slice();
    next[i] = !next[i];
    void setHeld(next);
  };

  return (
    <div className="mini-mp">
      <div className="mini-mp-turn">
        {myTurn ? '내 차례' : `${active?.displayName ?? '상대'} 차례`} · {room.rollsUsed}/3
      </div>
      <div className="mini-dice">
        {dice.map((v, i) => (
          <Die
            key={i}
            value={v}
            active={rolled}
            held={held[i]}
            suggested={false}
            clickable={canReroll}
            animKey={`${i}-${v}-${room.rollsUsed}`}
            onClick={() => toggleHold(i)}
          />
        ))}
      </div>
      <button className="mini-roll" disabled={!canRoll} onClick={() => void rollDice()}>
        {room.rollsUsed === 0 ? '굴리기' : `리롤 (${3 - room.rollsUsed})`}
      </button>
      {me && (
        <div className="mini-card">
          {CATEGORY_IDS.map((id) => {
            const filled = isCategoryFilled(me.scorecard, id);
            const preview =
              myTurn && rolled && !filled ? scoreDice(id, dice, rules) : null;
            return (
              <button
                key={id}
                className={`mini-cat ${filled ? 'filled' : ''}`}
                disabled={!myTurn || filled || !rolled}
                onClick={() => void assignCategory(id)}
              >
                <span className="k">{CATEGORY_META[id].ko}</span>
                <span className="v">
                  {filled ? (me.scorecard.scores[id] ?? 0) : preview === null ? '·' : preview}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="mini-mp-scores">
        {players.map((p) => (
          <span key={p.id} className={p.seat === room.currentSeat ? 'cur' : ''}>
            {p.displayName} {grandTotal(p.scorecard, rules)}
          </span>
        ))}
      </div>
      <button className="mini-mp-leave" onClick={() => void leave()}>
        나가기
      </button>
      {error && <div className="mini-mp-err">{error}</div>}
    </div>
  );
}

// ── 종료: 승자 + 나가기 ──
function MiniMpOver() {
  const room = useMultiplayerStore((s) => s.room)!;
  const players = useMultiplayerStore((s) => s.players);
  const leave = useMultiplayerStore((s) => s.leave);
  const rules = RULE_PRESETS[room.rulePreset].config;
  const winner = players.find((p) => p.seat === room.winnerSeat);

  return (
    <div className="mini-mp">
      <div className="mini-mp-result">
        {room.isTie ? '무승부' : `🏆 ${winner?.displayName ?? '?'} 승리`}
      </div>
      <div className="mini-mp-scores">
        {players.map((p) => (
          <span key={p.id}>
            {p.displayName} {grandTotal(p.scorecard, rules)}
          </span>
        ))}
      </div>
      <button className="mini-mp-leave" onClick={() => void leave()}>
        나가기
      </button>
    </div>
  );
}
```

- [ ] **Step 2: MiniApp stub 교체**

`src/ui/mini/MiniApp.tsx`:
- import 추가: `import { MiniMultiplayer } from './MiniMultiplayer';`
- `mode === 'solo' ? <MiniSolo /> : (...)` 의 mp 분기를 `<MiniMultiplayer />` 로 교체(stub div 제거).

- [ ] **Step 3: 멀티용 스타일 추가**

`src/ui/mini/mini.css` 끝에 추가:

```css
.mini-mp {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}
.mini-mp-in {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
  color: var(--text);
}
.mini-mp-join {
  display: flex;
  gap: 4px;
}
.mini-mp-code {
  font-size: 13px;
  color: var(--muted);
  text-align: center;
}
.mini-mp-list,
.mini-mp-scores {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--faint);
}
.mini-mp-scores .cur {
  color: var(--accent);
}
.mini-mp-turn {
  font-size: 12px;
  color: var(--muted);
  text-align: center;
}
.mini-mp-leave {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px;
  font-size: 11px;
  color: var(--faint);
}
.mini-mp-err {
  font-size: 11px;
  color: var(--bad);
}
.mini-mp-wait,
.mini-mp-result {
  font-size: 12px;
  color: var(--muted);
  text-align: center;
}
```

- [ ] **Step 4: 빌드 게이트** — Run: `npm run typecheck && npm test && npm run build` → 모두 PASS.

- [ ] **Step 5: Chrome 수동 검증(2-클라이언트)**

`npm run build && npm run preview` 후(Supabase env 필요 — `.env.local`):
1. 미니 창에서 멀티 탭 → 닉네임 입력 → "방 만들기" → 방 코드 표시.
2. 다른 브라우저(또는 배포 웹앱)에서 같은 코드로 참가 → 미니 창 명단에 2명.
3. 방장이 "게임 시작" → 양쪽 게임 화면 전환.
4. 내 차례에만 굴리기/보관/기록 동작, 상대 차례엔 비활성. 점수/턴 실시간 동기화.
5. 종료 후 승자 표시 + "나가기" → 로비 복귀.
6. `preview_screenshot` 증빙.

> Supabase 미설정(`isSupabaseConfigured=false`) 환경에선 멀티 탭이 스토어의 우아한 실패 메시지를 표시(웹과 동일) — 싱글은 정상.

- [ ] **Step 6: 커밋**

```bash
git add src/ui/mini/MiniMultiplayer.tsx src/ui/mini/MiniApp.tsx src/ui/mini/mini.css
git commit -m "feat(mini): 콤팩트 멀티(로비/게임/종료), multiplayerStore 재사용 (#57)"
```

---

## Self-Review (작성자 체크 — 완료)

- **스펙 커버리지**: ① 미니 뷰(싱글+멀티, 헬퍼 없음)=Task 3·9 ② PiP 렌더링/스타일복제/위장/정리=Task 1·4 ③ 빠른숨김(자동블랭크 ON·Esc)=Task 4 ④ 진입점(기능감지)=Task 6 ⑤ DownloadCards mac=Task 7 ⑥ 위치 처리(크기만 지정·preferInitialWindowPlacement 미설정)=Task 1 ⑦ 전역 manifest 불변=설계상 미수정 ⑧ 패치노트=Task 8. 누락 없음.
- **플레이스홀더**: 없음(각 코드 블록은 실제 컴파일 코드). 단 Task 8 패치노트는 레포의 `CHANGELOG[0]` 형식을 단일 출처로 따르라고 명시(형식 중복 방지).
- **타입 일관성**: `usePictureInPicture(content: React.ReactElement)` ↔ Task 6의 `useMemo(() => <MiniApp/>)`; `MiniHeader` props ↔ Task 4 호출부; 스토어 메서드명(`toggleHold`,`assign`,`rollDice`,`setHeld`,`assignCategory`,`leave`,`createRoom`,`joinRoom`,`startGame`)·셀렉터(`selectMySeat`,`selectActivePlayer`)·`MpPlayer.scorecard.scores` 모두 실제 정의와 일치.

## 미해결 / 후속(이 계획 밖)
- Safari 사용자용 위장 standalone PWA 경로(별도 검토·후속 이슈).
- 메인에서 테마 변경 시 열려 있는 PiP 테마 실시간 동기화(현재 열 때 1회 고정 — 소소한 한계).
- 자동 블랭크 끄기 토글(현재 항상 ON; 필요 시 후속).
