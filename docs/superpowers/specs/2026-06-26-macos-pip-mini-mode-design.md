# macOS 미니 위젯 — Document PiP 미니 모드 설계

- **이슈:** #57 — macOS 트레이 앱 지원(Windows판과 동일 동작) → PWA + Document PiP 미니 모드로 방향 확정
- **마일스톤:** #6 macOS 미니 위젯 지원
- **규모:** M (신규 미니 UI + PiP 컨트롤러, 게임 로직은 재사용)
- **날짜:** 2026-06-26
- **상태:** 합의 완료(접근 A·범위·위장/빠른숨김·위치 처리) → 구현 계획 단계로

## 1. 배경 / 결정 경위

Windows 전용 Electron 트레이 앱(`desktop/`)의 macOS판 요청에서 출발했다. 조사(이슈 #57의 3개 리포트) 결과:

- **네이티브 mac 트레이 앱은 무료로는 부적합.** 자동 업데이트(electron-updater)·Gatekeeper 통과에 Apple Developer($99/년) 코드 서명+공증이 사실상 필수. 미서명 배포는 자동 업데이트 파손 + 첫 실행 차단(+ Homebrew도 2026-09-01부터 미서명 cask 제거)으로 Windows보다 나쁜 경험.
- 사용자는 $99 서명도, 미서명 네이티브 출시도 거부 → **웹/PWA 경로**로 확정.
- **기능 동등성은 이미 충족·초과**: 루트 웹앱은 풀 PWA(오프라인·헬퍼·멀티·리더보드)로, 트레이 축소판보다 기능이 많다.
- 사용자 핵심 요구는 폼팩터가 아니라 **저채도·작은·항상-위 + "화면을 흘깃 봐도 게임으로 안 보이는"** 미니 위젯(기존 `popup.html`이 "설정처럼 보이게" 설계된 것과 동일 목적).
- 무료 웹에서 이를 가장 잘 만족하는 것은 **Document Picture-in-Picture**(Chrome/Edge 116+, Safari 미지원): 창 본문은 우리 HTML 100% 제어, 모든 앱 위로 뜨는 작은 패널, 별도 Dock 아이콘 없음.

## 2. 목표 / 비목표

**목표**
- 웹앱에 "미니 모드"를 추가: 작고 위장된 게임 UI를 Document PiP 창에 렌더링.
- 미니 뷰 기능 범위 = **트레이 앱과 동일**(싱글 + 멀티, **헬퍼 없음**), 어두운 "설정" 위장 UI.
- 게임 로직은 기존 웹 `core` + 스토어 **재사용**(새 게임 로직 0).
- 진입점은 **Document PiP 지원 브라우저 어디서나**(기능 감지, OS 무관) 노출.
- `DownloadCards`에 macOS 사용법 카드 추가.

**비목표(이번 범위 밖)**
- 네이티브 mac 빌드 / 코드 서명 / `electron-builder` mac 타깃 / CI mac 잡.
- 전역 PWA `manifest` 이름·아이콘 변경(모든 사용자 브랜딩에 영향 → 하지 않음).
- Safari 전용 대체 폼팩터(미지원 안내만; 별도 위장 PWA 빌드 없음).
- 미니 뷰에 헬퍼 탑재.

## 3. 접근 (확정: 접근 A)

신규 React 미니 뷰가 기존 웹 `core`(rules·gameState·dice·scoring)와 Zustand 스토어(`gameStore`=싱글, `multiplayerStore`=멀티)를 그대로 재사용하고, 작고 위장된 전용 레이아웃을 PiP 창에 별도 React 루트로 렌더링한다.

- (기각) 접근 B: `desktop/popup.html` 이식 — Electron `window.yd` preload + 자체 번들 supabase 의존 + 별도 코드베이스(로직 중복).
- (기각) 접근 C: 기존 풀 솔로/멀티 화면 재사용 + 미니 스킨 — 풀사이즈 전제라 조건부 렌더 과다 + 메인 UI 회귀 위험.

```
┌─ 메인 탭 (opener) ─────────────┐        ┌─ Document PiP 창 ──────────┐
│ Header                         │        │ (별도 document/window)     │
│  └ MiniLauncherButton ─────────┼─open()─▶ createRoot(pip.body)       │
│ gameStore / multiplayerStore ◀─┼─shared─▶  <MiniApp/> (위장 미니 UI) │
└────────────────────────────────┘        └────────────────────────────┘
        같은 JS 실행 컨텍스트(스토어·Supabase 클라이언트 단일 인스턴스 공유)
```

## 4. 컴포넌트 / 파일

**신규 (`src/ui/mini/`)**

| 파일 | 역할 | 의존 |
|---|---|---|
| `usePictureInPicture.ts` | PiP 컨트롤러 훅: 기능 감지·창 열기(제스처)·스타일 복제·루트 마운트/언마운트·위장(title/favicon)·빠른숨김 배선·정리·토글 | `react-dom/client` |
| `MiniApp.tsx` | 미니 루트: 싱글/멀티 모드 전환, 스토어 구독 | `MiniSolo`·`MiniMultiplayer`·`MiniHeader` |
| `MiniSolo.tsx` | 축소 싱글: 주사위 행 + 미니 점수판(헬퍼 없음) | `gameStore`, `Die`, (가능 시) `ScorecardMini` |
| `MiniMultiplayer.tsx` | 축소 멀티: 로비 + 게임 | `multiplayerStore` |
| `MiniHeader.tsx` | "설정"처럼 보이는 위장 헤더 + 닫기 + 모드 토글 | — |
| `mini.css` | 스코프 위장 스타일(어두운 단색·"설정" 룩·키 힌트) — `desktop/popup.html` 미감 이식 | — |

**신규 (`src/ui/`)**: `MiniLauncherButton.tsx` — 헤더 진입 버튼(기능 감지 시에만).

**수정**: `src/ui/Header.tsx`(버튼 추가) · `src/ui/DownloadCards.tsx`(macOS 카드).

**재사용(무변경)**: `core/*`, `store/gameStore`, `store/multiplayerStore`, `lib/supabase`, `ui/Die.tsx`, 가능 시 `ui/ScorecardMini.tsx`.

> 미니 UI는 `mini/` 디렉터리로 격리해 메인 화면 컴포넌트와 분리한다. 각 미니 컴포넌트는 단일 책임(헤더/싱글/멀티)으로 작게 유지.

## 5. PiP 렌더링 & 데이터 흐름 (기술 핵심)

**열기 — `open()` (버튼 클릭 = 사용자 제스처 필수)**
1. `const pip = await documentPictureInPicture.requestWindow({ width: 280, height: 380, disallowReturnToOpener: true })`
2. **스타일 복제**: 메인 문서의 `<style>`·`<link rel=stylesheet>`를 `pip.document.head`로 복제 **+ `mini.css` 직접 주입**(복제 실패해도 항상 스타일 유지).
3. **위장**: `pip.document.title = 'Settings'`, 중립 favicon `<link rel=icon>` 삽입.
4. **렌더**: `const root = createRoot(pip.document.body); root.render(<MiniApp/>)`.
5. **빠른숨김 배선**: `pip` 내부 `keydown` Esc → `close()`; `visibilitychange`/`blur` → 블랭크 오버레이.
6. `pip.addEventListener('pagehide', cleanup)`(브라우저 X로 닫아도 정리).
7. 메인 탭 `document.title`을 중립값으로 저장·교체(닫을 때 원복).

**위치/크기**
- **위치는 프로그래밍 지정 불가**(스펙: `moveTo`/`moveBy` 비활성, 안티-스푸핑). **초기 크기(width/height)만** 지정 가능.
- `preferInitialWindowPlacement`는 **미설정(기본 false)** 유지 → Chrome이 사용자가 마지막으로 드래그한 위치·크기를 기억해 재오픈. "구석 고정"은 *사용자 1회 드래그 + Chrome 기억*으로 달성.

**상태 공유**
- 스토어·Supabase 클라이언트는 같은 JS 컨텍스트의 단일 인스턴스 → 미니 창은 메인 탭과 **동일 싱글 게임/멀티 방을 미러링**. 별도 동기화 불필요.

**닫기 — `close()`**: `root.unmount()` → 메인 탭 title 원복 → 리스너 해제. 트리거: Esc · 닫기 버튼 · `pagehide`. 이미 열려 있으면 재오픈 대신 닫기/포커스(토글).

## 6. 위장 & 빠른 숨김

**위장**
- 어두운 단색(검정/회색), 파랑·노랑 없음, `desktop/popup.html`의 "설정 패널" 룩을 `mini.css`로 이식. 각 점수칸 흐린 키 힌트.
- PiP 상단 바: `title='Settings'` + 중립 favicon으로 제목 부분 중립화. (origin 호스트명은 브라우저가 강제 표시 — 못 가림. 현재 `khkim3115.github.io`는 게임명 없어 무난.)
- 여는 탭 단서 완화: 미니 창이 열린 동안 메인 탭 `document.title`도 중립화(닫으면 원복).

**빠른 숨김(3중, 자동 블랭크 기본 ON)**
1. `Esc`(+닫기 버튼) → `window.close()` 즉시.
2. 자동 블랭크 — `visibilitychange`→hidden / `blur` 시 빈 "설정" 오버레이를 덮음. 기본 켜짐.
3. 재표시 시 오버레이 해제.

**정직한 한계(UI/안내에 명시)**: 자동 블랭크는 베스트-에포트(창이 보이는 채 포커스만 잃을 때의 `blur`는 불완전, 확장으로 무력화 가능). origin 호스트명·여는 탭 의존·제스처 필요·Safari 미지원은 무료 웹의 구조적 한계로, **네이티브 트레이만큼 완전히 가려지진 않음**.

## 7. 진입점 & 다운로드 안내

- **`MiniLauncherButton`**(Header, `InstallButton` 옆): `'documentPictureInPicture' in window`일 때만 노출. 중립 라벨/아이콘(예: 🔳 "미니 창"). 클릭 → `open()`/토글.
- **`DownloadCards` macOS 카드**: 기존 Windows `.exe` 트레이 카드 옆에 "Mac" 카드 — ① PWA 설치(Chrome/Edge) ② 헤더 "미니 창" 버튼으로 저채도 패널 사용. Chrome/Edge 권장(Safari 미지원) 명시.

## 8. 에러처리 / 엣지케이스

| 상황 | 처리 |
|---|---|
| 미지원(Safari/구버전) | 버튼 숨김 + 다운로드 카드에 한계 안내 |
| `requestWindow` 실패(NotAllowedError 등) | catch 후 무시(또는 가벼운 토스트), 앱 영향 없음 |
| 이미 열림 | 두 번째 창 안 열고 토글/포커스 |
| 스타일 복제 실패 | `mini.css` 직접 주입이 있어 항상 스타일 유지 |
| 멀티 오프라인 / Supabase 미설정 | 웹과 동일한 우아한 실패(`multiplayerStore` 재사용) |
| 메인 탭 이탈/언마운트 | PiP 닫고 정리(title 원복) |

## 9. 테스트 / 검증

- **게임 로직**: 기존 `core`/`engine` 단위 테스트가 커버(새 로직 없음).
- **순수 헬퍼**(기능 감지·스타일 복제 유틸): 가능 범위에서 소형 단위 테스트(jsdom 한계 인지).
- **수동 검증(Chrome preview)**: 미니 창 열기 → 위장 확인(title 'Settings'·어두운 UI) → 싱글 플레이(굴림/보관/기록) → 빠른숨김(Esc/blur 블랭크) → 멀티 생성·참가가 스토어 미러링. 스크린샷 증빙.
- Document PiP는 vitest/jsdom로 구동 불가 → **Chrome 수동 검증** 의존(프로젝트 수동 검증 관례와 일치).

## 10. 미해결 / 후속

- 후속 PR 후보: Safari 사용자용 위장 standalone PWA 경로(별도 검토), 미니 멀티 UX 다듬기.
- 패치노트(`changelog.ts`) 항목 추가는 구현 PR에서 함께.
