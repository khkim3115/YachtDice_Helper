# 🎲 Yacht Dice Helper (요트다이스)

웹에서 즐기는 **요트다이스(Yacht Dice)** 게임. **혼자 하기**(솔로 점수 도전),
**온라인 멀티플레이**(방 만들기 + 초대코드로 턴제 경쟁), **리더보드**(헬퍼 없이 달성한 Top 10)를 지원합니다.
설정에서 **헬퍼**를 켜면, 게임 전체를 고려한 **진짜 최적 기댓값(EV)** 으로
"지금 어떤 선택이 점수를 가장 높게 가져갈지"를 확률과 함께 알려줍니다.

🔗 **라이브 데모**: <https://khkim3115.github.io/YachtDice_Helper/>

React + Vite + TypeScript. 헬퍼 엔진은 Verhoeff 2단계 동적계획을 사용하며,
가치 함수를 오프라인에서 사전계산해(~1MB) 브라우저에서는 매 결정마다 가벼운 턴 내부 DP만 돌립니다.

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
```

> 헬퍼용 가치 테이블 `public/V.bin` 은 저장소에 포함되어 있습니다. 없거나 룰을 바꿨다면 재생성하세요:
>
> ```bash
> npm run build:table   # 약 10초, public/V.bin 생성
> ```

빌드 / 미리보기 / 테스트:

```bash
npm run build      # prebuild 로 V.bin 재생성 후 타입체크 + vite build → dist/
npm run preview
npm test           # vitest (채점·확률·솔버 정합성)
```

### 배포
- **GitHub Pages (자동화 완료)**: `main` 에 푸시하면 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
  가 자동으로 빌드 후 게시 → <https://khkim3115.github.io/YachtDice_Helper/>.
  `base` 가 `'./'`(상대 경로)라 하위 경로 게시에서도 그대로 동작합니다.
- **Vercel**: 그대로 import → build 명령 `npm run build`, 출력 `dist`.

## 🌐 온라인 멀티플레이 (방 + 초대코드)

홈 화면에서 **방을 만들고 초대코드**로 친구를 초대해 **턴제 경쟁**(각자 점수판, 차례대로 굴리고 카테고리 선택,
12라운드 후 최고점 승리)을 즐길 수 있습니다. 최대 4명, 방장이 헬퍼 허용 여부를 선택합니다.

정적 프론트엔드(GitHub Pages)는 그대로 두고, 실시간 동기화·방 관리는 **Supabase**(Postgres + Realtime + 익명 로그인)가
담당합니다. 서버가 권위(주사위는 서버 RNG, 모든 변경은 `SECURITY DEFINER` RPC, 클라이언트 직접 쓰기 차단 + RLS)를 가집니다.

### 환경변수 (둘 다 공개용 — anon 키는 RLS 로 보호됨)
로컬은 `.env.local`(이미 `.gitignore` 처리됨)에:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

> `service_role` 키는 **절대** 넣지 마세요(RLS 우회). 멀티플레이 값이 없으면 솔로는 정상 동작하고 멀티 UI 만 비활성화됩니다.

### Supabase 설정 (1회)
1. 프로젝트 생성 후 **Authentication → Sign In / Providers → Anonymous sign-ins 활성화**. *(필수 — 없으면 입장 시 "익명 로그인이 비활성화" 오류)*
2. DB 스키마/RLS/RPC/Realtime 마이그레이션 적용 (이 저장소 작업 시 Supabase MCP 로 적용됨).
3. **Authentication → URL Configuration** 의 Site URL 목록에 `https://khkim3115.github.io` 추가.

### GitHub Pages 배포에 주입
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) 의 빌드 스텝이 두 값을 **repo Variables** 에서 읽습니다.
**Settings → Secrets and variables → Actions → Variables** 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 를 추가하세요.

## 🏆 리더보드 (Top 10)

홈 화면의 **리더보드** 버튼으로 진입합니다. 솔로·멀티·데스크톱(트레이 앱)을 아우르는 **통합 단일 Top 10**
이며, 각 기록 옆 **모드 배지(솔로/멀티/데스크톱)** 로 출처를 구분합니다.
**헬퍼를 쓰지 않고 달성한 점수만** 등록 대상입니다(솔로/멀티 게임 종료 화면에서 닉네임과 함께 등록).

- **정렬**: 점수 내림차순, 동점은 먼저 등록한 순(`created_at` 오름차순)으로 상위 10개.
- **권위**: 읽기는 공개(anon select)지만 쓰기는 `SECURITY DEFINER` `submit_score` RPC 로만 — 클라이언트
  직접 insert/update/delete 는 RLS 로 차단됩니다. RPC 가 제출 후 Top10 초과분을 정리해 항상 10개만 유지합니다.
- 멀티플레이와 **같은 Supabase 설정**(`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`)을 사용합니다.
  값이 없으면 리더보드도 비활성화됩니다.

## 🖥️ 작업표시줄에서 플레이하기 (PWA 설치)

이 앱은 **설치 가능한 PWA** 라서, 윈도우 작업표시줄/시작 메뉴에서 클릭 한 번으로 바로 띄울 수 있습니다.

1. **Edge / Chrome** 으로 [라이브 데모](https://khkim3115.github.io/YachtDice_Helper/) 접속.
2. 주소창 오른쪽의 **설치(⊕) 아이콘** 또는 게임 화면 우상단의 **"⬇ 앱 설치"** 버튼 클릭.
   (메뉴 → "앱 설치 / Install Yacht Dice" 도 가능)
3. 설치되면 시작 메뉴에 아이콘이 생깁니다. 아이콘 **우클릭 → "작업 표시줄에 고정"**.
4. 이제 작업표시줄 아이콘을 누르면 **주소창 없는 독립 창**으로 실행됩니다.

> **완전 오프라인 지원** — 서비스 워커가 앱과 헬퍼 데이터(`V.bin`)까지 캐싱하므로,
> 한 번 실행한 뒤에는 **인터넷 없이도** 작업표시줄에서 바로 플레이할 수 있습니다.
> 새 버전이 배포되면 하단에 "업데이트" 토스트가 떠서 최신본으로 갱신할 수 있습니다.

아이콘을 바꾸려면 [`public/icon.svg`](public/icon.svg) 를 수정한 뒤 다시 생성합니다:

```bash
npm run generate-pwa-assets   # public/ 에 pwa-*.png, maskable, apple-touch, favicon 재생성
```

> PWA(서비스 워커)는 `npm run dev` 에서는 꺼져 있습니다. 설치·오프라인을 로컬에서 확인하려면
> `npm run build && npm run preview` 로 띄워 Edge/Chrome 에서 테스트하세요.

## 📥 앱으로 받기 (홈 다운로드 카드)

홈 화면 하단의 **"앱으로 받기"** 섹션([`src/ui/DownloadCards.tsx`](src/ui/DownloadCards.tsx))에서 두 가지로 받습니다.

- **데스크탑 앱 (PWA)** — `⬇ 앱 설치` 버튼으로 브라우저에 설치(위 PWA 섹션과 동일, 작업표시줄/시작 메뉴에서 실행).
  설치 프롬프트를 쓸 수 없는 브라우저에서는 주소창 설치 아이콘(⊕)/메뉴 사용을 안내합니다.
- **트레이 앱 (Windows)** — `⬇ 다운로드` 버튼이 시스템 트레이에 상주하는 미니 Electron 버전 설치파일을 받습니다.
  빌드·실행·배포는 [`desktop/README.md`](desktop/README.md) 참고.

> 트레이 설치파일은 GitHub Releases 의 고정 자산 이름 **`YachtDice-Tray-Setup.exe`**
> (`releases/latest/download/YachtDice-Tray-Setup.exe`)로 받습니다([`DownloadCards.tsx`](src/ui/DownloadCards.tsx) 의 `TRAY_EXE_URL`).
> 데스크톱 빌드(`desktop/`)가 이 이름으로 산출물을 내도록 설정돼 있으니, 릴리스에 **그 이름 그대로 업로드**하면 링크가 유지됩니다.

## 게임 규칙 (한국 모바일 앱 관례)

> 게임 안에서 우측 상단 **❓ 도움말** 버튼으로 규칙·플레이 방법·사이트 설명을 볼 수 있습니다.
> 처음 방문 시 한 번 자동으로 열립니다. 우측 상단 **🌙/☀️ 버튼**으로 **다크/라이트 테마**를 전환할 수 있고,
> 선택한 테마는 브라우저에 저장되어 다음 방문에도 유지됩니다.

주사위 5개, 턴당 최대 3회 굴림(최초 1 + 리롤 2), 12턴 12 카테고리.

| 카테고리 | 점수 |
|---|---|
| 원~식스 (상단) | 해당 눈의 합. **상단 소계 ≥ 63 이면 +35 보너스** |
| 초이스 | 주사위 5개 합 |
| 포카드 | 같은 눈 4개 이상 → 5개 합 |
| 풀하우스 | 서로 다른 두 눈 3+2 → 5개 합 |
| 스몰 스트레이트 | 연속 4개 → 15 |
| 라지 스트레이트 | 연속 5개 → 30 |
| 요트 | 같은 눈 5개 → 50 |

룰 변형(포카드/풀하우스/스트레이트 점수 등)은 [`src/core/rules.ts`](src/core/rules.ts)
의 `RuleConfig` 한 곳에서 바꿀 수 있습니다. **룰을 바꾸면 `npm run build:table` 로 V.bin 을 다시 만들어야** 헬퍼가 정확합니다.

## 헬퍼가 보여주는 것
- **최적 행동 배너**: "지금 «카테고리»에 기록" 또는 "«주사위» 보관하고 다시 굴리기".
- **추천 주사위/칸 하이라이트**.
- **카테고리별 EV**: 지금 기록 시 점수 vs 리롤 시 기대 점수(+증가폭).
- **콤보 확률**: 요트·라지·스몰·풀하우스·포카드 달성 확률.
- **예상 최종 점수**: 현재 위치에서 최적 플레이 시 기대 총점.

## 구조

```
src/
  core/        순수 로직 (UI 무관, 테스트 대상)
    rules.ts        룰 단일 진실원본 (RuleConfig)
    dice.ts         주사위 멀티셋·리롤 분포·보관/자식 매핑
    scoring.ts      12 카테고리 채점
    gameState.ts    스코어카드/소계/보너스
    stateIndex.ts   가치테이블 상태 패킹 (2^12 × 64)
  engine/      헬퍼 (UI 무관)
    withinTurnDP.ts 턴 내부 DP (보관/카테고리 argmax)
    optimalLeaf.ts  "지금 기록" 가치 (V 사용)
    valueTable.ts   V 로드/인덱싱
    probability.ts  콤보 확률 (지시함수 재귀)
    advisor.ts      공개 API: advise(card, dice, rerollsLeft)
    simulate.ts     최적 정책 시뮬(검증용)
  precompute/
    buildValueTable.ts  후방귀납 → public/V.bin (Node)
  lib/         외부 서비스 클라이언트 (멀티플레이·리더보드 — 솔로는 네트워크 불필요)
    supabase.ts     Supabase 클라이언트 + 익명 세션 (ensureAnonSession)
    leaderboard.ts  Top10 리더보드 조회/제출 (fetchTopScores / submitScore)
  store/       Zustand 상태 + 훅
    appStore.ts         화면 전환 (home·solo·lobby·mpgame·leaderboard)
    gameStore.ts        솔로 게임 상태 + 설정 + 테마 + advisor
    multiplayerStore.ts 서버 권위 멀티 방/턴 상태 (Supabase RPC·Realtime)
    useBoard.ts         솔로/멀티 공통 보드 어댑터 훅
    useAdvice.ts        헬퍼 조언 훅 (메모이즈)
  ui/          React 컴포넌트
    App.tsx            솔로 게임 화면 (헬퍼·설정·도움말·결과 오케스트레이션)
    Home.tsx           시작 화면 (모드 선택 + 리더보드·다운로드 진입)
    Die · DiceTray · Scorecard · ScorecardMini   주사위·점수판
    HelperPanel · TurnBanner                      헬퍼 조언 패널·최적 행동 배너
    SettingsPanel · HelpPanel · GameOver          설정·도움말·솔로 결과
    Lobby · MultiplayerGame · MpGameOver          멀티 로비·게임·결과
    Leaderboard · SubmitScoreModal                Top10 리더보드·점수 등록
    DownloadCards      앱 다운로드 (PWA 설치 + 트레이 .exe)
    InstallButton      PWA 설치 버튼 (beforeinstallprompt)
    PwaStatus          서비스 워커 등록 + 오프라인/업데이트 토스트
public/V.bin     사전계산 가치 테이블 (~1MB)
public/icon.svg  앱 아이콘 소스 (PWA 아이콘 생성 원본)
```

## 검증 (sanity checks)
- 채점·엣지케이스 단위 테스트.
- 콤보 확률 문헌값 대조: `P(요트 | 첫 굴림, 리롤 2, 최적) = 0.04603`,
  `P(스몰 | (1,2,3,3,6), 리롤 2) ≈ 0.518`.
- 솔버 정합성: 최적 정책 3000판 시뮬 평균 ≈ 테이블 예측값.
  이 룰셋의 **최적 기대 평균 ≈ 191.8점**.
