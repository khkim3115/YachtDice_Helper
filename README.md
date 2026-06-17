# 🎲 Yacht Dice Helper (요트다이스)

웹에서 즐기는 **요트다이스(Yacht Dice)** 솔로 점수 도전 게임.
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

## 게임 규칙 (한국 모바일 앱 관례)

> 게임 안에서 우측 상단 **❓ 도움말** 버튼으로 규칙·플레이 방법·사이트 설명을 볼 수 있습니다.
> 처음 방문 시 한 번 자동으로 열립니다.

주사위 5개, 턴당 최대 3회 굴림(최초 1 + 리롤 2), 12턴 12 카테고리.

| 카테고리 | 점수 |
|---|---|
| 원~식스 (상단) | 해당 눈의 합. **상단 소계 ≥ 63 이면 +35 보너스** |
| 초이스 | 주사위 5개 합 |
| 포카드 | 같은 눈 4개 이상 → 5개 합 |
| 풀하우스 | 서로 다른 두 눈 3+2 → 5개 합 |
| 스몰 스트레이트 | 연속 4개 → 15 |
| 라지 스트레이트 | 연속 5개 → 30 |
| 야추 | 같은 눈 5개 → 50 |

룰 변형(포카드/풀하우스/스트레이트 점수 등)은 [`src/core/rules.ts`](src/core/rules.ts)
의 `RuleConfig` 한 곳에서 바꿀 수 있습니다. **룰을 바꾸면 `npm run build:table` 로 V.bin 을 다시 만들어야** 헬퍼가 정확합니다.

## 헬퍼가 보여주는 것
- **최적 행동 배너**: "지금 «카테고리»에 기록" 또는 "«주사위» 보관하고 다시 굴리기".
- **추천 주사위/칸 하이라이트**.
- **카테고리별 EV**: 지금 기록 시 점수 vs 리롤 시 기대 점수(+증가폭).
- **콤보 확률**: 야추·라지·스몰·풀하우스·포카드 달성 확률.
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
  store/         Zustand 게임 상태 + useAdvice 훅
  ui/            React 컴포넌트
public/V.bin     사전계산 가치 테이블 (~1MB)
```

## 검증 (sanity checks)
- 채점·엣지케이스 단위 테스트.
- 콤보 확률 문헌값 대조: `P(야추 | 첫 굴림, 리롤 2, 최적) = 0.04603`,
  `P(스몰 | (1,2,3,3,6), 리롤 2) ≈ 0.518`.
- 솔버 정합성: 최적 정책 3000판 시뮬 평균 ≈ 테이블 예측값.
  이 룰셋의 **최적 기대 평균 ≈ 191.8점**.
