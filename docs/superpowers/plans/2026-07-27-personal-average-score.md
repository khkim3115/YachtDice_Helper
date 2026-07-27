# 개인 평균 점수 + 게임별 포함 토글 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게임별 "평균에 포함" 토글로 개인 평균 점수를 로컬 집계·표시한다(솔로·멀티, 웹·데스크톱). 시작 시점 고정, 룰별 분리, 순수 게임만 집계, 중도 포기는 부분 점수 반영(floor 3칸).

**Architecture:** 순수 집계 로직을 `src/core/averageStats.ts`(브라우저·React 비의존, 단위 테스트 대상)에 두고, localStorage 브릿지 `src/store/averageStorage.ts`가 감싼다. 웹은 `gameStore`(솔로)·`multiplayerStore`(멀티)가 이 모듈을 호출해 기록/역산하고 UI는 스토어에서 읽는다. 데스크톱(`desktop/popup.html`)은 완전 독립이라 동일 규칙을 인라인 JS로 재구현하며, 반드시 데스크톱 자체 채점(`total()`/mp 채점)을 사용한다. Supabase(서버) 변경 없음.

**Tech Stack:** React 19 + Vite + TypeScript + Zustand, Vitest(node env, `src/**/*.test.ts`), 바닐라 JS 인라인(데스크톱 Electron 렌더러).

## Global Constraints

- **V.bin/룰 인덱스 불변식 손대지 않음.** `CATEGORY_IDS` 순서·`stateIndex` 패킹·`RuleConfig`/`DEFAULT_RULES` 변경 금지(이 기능은 룰과 무관).
- **Supabase 스키마/RLS/RPC 변경 없음.** 멀티 평균은 클라가 이미 아는 `scorecard`·`room.rulePreset`·`room.helperAllowed`로만 계산.
- **`zustand persist` 미들웨어 사용 금지.** 기존 `yd_*` 관례(모듈 init 시 1회 읽기 + 모든 접근 `try/catch`) 그대로.
- **`src/core/`는 React/DOM/localStorage 비의존 유지.** `averageStats.ts`는 순수 함수만. localStorage 접근은 `src/store/averageStorage.ts`에만.
- **기록은 스토어 액션 안에서.** React 효과 훅에서 기록 금지(`main.tsx`의 `<StrictMode>`가 효과를 2회 호출 → 이중 집계). 예외: 멀티는 `mpAvgRecorded` 가드로 멱등한 액션을 효과에서 호출.
- **데스크톱은 독립.** 웹 `src/core`를 import하지 않고 인라인 재구현. 기록 값은 데스크톱 `total()`(달인 보너스 포함)/mp 채점 사용.
- **저장 키:** `yd_avg_stats`(버킷별 통계), `yd_avg_include`(포함 기본, `"1"`/`"0"`, 기본 `"1"`).
- **버킷 키:** `solo:default`, `solo:additional`, `multi:default`, `multi:additional` — 절대 합산 금지(기대평균 192 vs 227).
- **floor:** 부분(미완료) 게임은 **기록 칸 수 ≥ 3**일 때만 집계(상수 `MIN_PARTIAL_CATEGORIES`).
- **완료 검증:** `npm run typecheck` + `npm test` 통과. 코드 주석은 한국어.

## File Structure

- **Create** `src/core/averageStats.ts` — 순수 집계 로직(타입·버킷·record/reverse/reset·parse/serialize·floor).
- **Create** `src/core/averageStats.test.ts` — 위 모듈 단위 테스트(TDD).
- **Create** `src/store/averageStorage.ts` — localStorage 브릿지(load/save stats·include).
- **Modify** `src/store/gameStore.ts` — 솔로: 필드·시작고정·완료기록·부분기록·undo역산·설정/리셋 액션.
- **Modify** `src/ui/SettingsPanel.tsx` — 포함 토글 + 현재 프리셋 평균 + 리셋.
- **Modify** `src/ui/GameOver.tsx` — "내 평균" 줄 + 이번 판 반영 뱃지.
- **Modify** `src/ui/Home.tsx` — 솔로 버튼 하위 통계 노출.
- **Modify** `src/ui/App.tsx` — 진행 중 "포기하고 종료" 버튼.
- **Modify** `src/index.css` — 신규 클래스 소량(`.avg-*`).
- **Modify** `src/store/multiplayerStore.ts` — 멀티: 시작고정·완료기록 액션.
- **Modify** `src/ui/MpGameOver.tsx` — 멀티 평균 표시 + 기록 액션 호출.
- **Modify** `desktop/popup.html` — 솔로+멀티 동일 규칙 인라인 재구현 + 표시/토글.
- **Modify** `src/data/changelog.ts` — 패치노트 1건.
- **Modify** `CLAUDE.md` — `yd_avg_*` 키·`averageStats` 규칙 한 줄.

---

## Task 1: 순수 집계 모듈 `averageStats.ts` (TDD)

**Files:**
- Create: `src/core/averageStats.ts`
- Test: `src/core/averageStats.test.ts`

**Interfaces:**
- Consumes: `RulePresetId` from `src/core/rules.ts` (`'default' | 'additional'`).
- Produces:
  - Types `AvgMode`(`'solo'|'multi'`), `AvgBucketKey`, `AvgBucket`(`{count,sum,best,partialCount}`), `AvgStats`(`Record<AvgBucketKey,AvgBucket>`).
  - `MIN_PARTIAL_CATEGORIES = 3`, `AVG_BUCKET_KEYS: AvgBucketKey[]`.
  - `bucketKey(mode, preset): AvgBucketKey`, `emptyBucket()`, `emptyStats()`.
  - `averageOf(bucket): number | null`, `meetsPartialFloor(filledCount): boolean`.
  - `recordCompleted(stats, key, score): AvgStats`, `recordPartial(stats, key, score): AvgStats`, `reverseRecord(stats, key, amount): AvgStats`, `resetBucket(stats, key): AvgStats` (모두 불변).
  - `parseStats(raw: string | null): AvgStats`, `serializeStats(stats): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/averageStats.test.ts
import { describe, it, expect } from 'vitest';
import {
  MIN_PARTIAL_CATEGORIES, AVG_BUCKET_KEYS, bucketKey, emptyBucket, emptyStats,
  averageOf, meetsPartialFloor, recordCompleted, recordPartial, reverseRecord,
  resetBucket, parseStats, serializeStats,
} from './averageStats';

describe('averageStats', () => {
  it('emptyStats 는 4개 버킷을 0으로 만든다', () => {
    const s = emptyStats();
    expect(Object.keys(s).sort()).toEqual([...AVG_BUCKET_KEYS].sort());
    expect(s['solo:default']).toEqual({ count: 0, sum: 0, best: 0, partialCount: 0 });
  });

  it('bucketKey 는 모드:프리셋 형태', () => {
    expect(bucketKey('solo', 'default')).toBe('solo:default');
    expect(bucketKey('multi', 'additional')).toBe('multi:additional');
  });

  it('recordCompleted 는 count/sum 증가·best 는 최댓값·partialCount 불변', () => {
    let s = emptyStats();
    s = recordCompleted(s, 'solo:default', 100);
    s = recordCompleted(s, 'solo:default', 200);
    s = recordCompleted(s, 'solo:default', 150);
    expect(s['solo:default']).toEqual({ count: 3, sum: 450, best: 200, partialCount: 0 });
    expect(averageOf(s['solo:default'])).toBe(150);
  });

  it('recordPartial 는 count/sum/partialCount 증가·best 불변', () => {
    let s = recordCompleted(emptyStats(), 'solo:default', 200); // best=200
    s = recordPartial(s, 'solo:default', 40);
    expect(s['solo:default']).toEqual({ count: 2, sum: 240, best: 200, partialCount: 1 });
  });

  it('reverseRecord 는 count/sum 감소(0 하한)·best 유지', () => {
    let s = recordCompleted(emptyStats(), 'solo:default', 200);
    s = reverseRecord(s, 'solo:default', 200);
    expect(s['solo:default']).toEqual({ count: 0, sum: 0, best: 200, partialCount: 0 });
    // 과도 역산 방지(음수 금지)
    s = reverseRecord(s, 'solo:default', 999);
    expect(s['solo:default'].count).toBe(0);
    expect(s['solo:default'].sum).toBe(0);
  });

  it('resetBucket 은 해당 버킷만 0으로, 나머지는 유지', () => {
    let s = recordCompleted(emptyStats(), 'solo:default', 100);
    s = recordCompleted(s, 'multi:default', 300);
    s = resetBucket(s, 'solo:default');
    expect(s['solo:default'].count).toBe(0);
    expect(s['multi:default']).toEqual({ count: 1, sum: 300, best: 300, partialCount: 0 });
  });

  it('averageOf 는 count 0 이면 null', () => {
    expect(averageOf(emptyBucket())).toBeNull();
  });

  it('meetsPartialFloor 는 3칸 경계', () => {
    expect(MIN_PARTIAL_CATEGORIES).toBe(3);
    expect(meetsPartialFloor(2)).toBe(false);
    expect(meetsPartialFloor(3)).toBe(true);
    expect(meetsPartialFloor(11)).toBe(true);
  });

  it('parseStats: null·손상·부분키 결손을 0으로 방어', () => {
    expect(parseStats(null)).toEqual(emptyStats());
    expect(parseStats('{ not json')).toEqual(emptyStats());
    const partial = parseStats(JSON.stringify({ 'solo:default': { count: 2, sum: 300, best: 200, partialCount: 1 } }));
    expect(partial['solo:default']).toEqual({ count: 2, sum: 300, best: 200, partialCount: 1 });
    expect(partial['multi:additional']).toEqual(emptyBucket());
    // 음수·NaN·문자 필드는 0
    const bad = parseStats(JSON.stringify({ 'solo:default': { count: -5, sum: 'x', best: NaN } }));
    expect(bad['solo:default']).toEqual({ count: 0, sum: 0, best: 0, partialCount: 0 });
  });

  it('serializeStats/parseStats 왕복', () => {
    let s = recordPartial(recordCompleted(emptyStats(), 'multi:additional', 227), 'multi:additional', 50);
    expect(parseStats(serializeStats(s))).toEqual(s);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/averageStats.test.ts`
Expected: FAIL — `Cannot find module './averageStats'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/averageStats.ts
// 개인 평균 점수 통계(순수 로직 — UI·저장소·브라우저 비의존, 단위 테스트 대상).
// localStorage 로드/저장은 src/store/averageStorage.ts 담당. 여기선 문자열 파싱만.
import type { RulePresetId } from './rules';

export type AvgMode = 'solo' | 'multi';
export type AvgBucketKey = `${AvgMode}:${RulePresetId}`;

export interface AvgBucket {
  /** 집계 게임 수(부분판 포함). */
  count: number;
  /** 점수 합(평균 = sum/count). */
  sum: number;
  /** 완료 게임 최고점(부분판은 갱신 안 함). */
  best: number;
  /** 그중 미완료(부분) 게임 수. */
  partialCount: number;
}

export type AvgStats = Record<AvgBucketKey, AvgBucket>;

/** 부분(미완료) 게임을 집계하는 최소 기록 칸 수(25% = 3칸). 미만 포기는 미집계. */
export const MIN_PARTIAL_CATEGORIES = 3;

export const AVG_BUCKET_KEYS: AvgBucketKey[] = [
  'solo:default',
  'solo:additional',
  'multi:default',
  'multi:additional',
];

export function bucketKey(mode: AvgMode, preset: RulePresetId): AvgBucketKey {
  return `${mode}:${preset}`;
}

export function emptyBucket(): AvgBucket {
  return { count: 0, sum: 0, best: 0, partialCount: 0 };
}

export function emptyStats(): AvgStats {
  return {
    'solo:default': emptyBucket(),
    'solo:additional': emptyBucket(),
    'multi:default': emptyBucket(),
    'multi:additional': emptyBucket(),
  };
}

/** count===0 이면 null(기록 없음), 아니면 평균. */
export function averageOf(bucket: AvgBucket): number | null {
  return bucket.count > 0 ? bucket.sum / bucket.count : null;
}

/** filledCount 가 floor 이상이면 부분 집계 대상. */
export function meetsPartialFloor(filledCount: number): boolean {
  return filledCount >= MIN_PARTIAL_CATEGORIES;
}

function patch(stats: AvgStats, key: AvgBucketKey, next: AvgBucket): AvgStats {
  return { ...stats, [key]: next };
}

/** 완료 게임 기록(불변): count++·sum+=score·best=max. */
export function recordCompleted(stats: AvgStats, key: AvgBucketKey, score: number): AvgStats {
  const b = stats[key] ?? emptyBucket();
  return patch(stats, key, {
    count: b.count + 1,
    sum: b.sum + score,
    best: Math.max(b.best, score),
    partialCount: b.partialCount,
  });
}

/** 부분 게임 기록(불변): count++·sum+=score·partialCount++, best 불변. */
export function recordPartial(stats: AvgStats, key: AvgBucketKey, score: number): AvgStats {
  const b = stats[key] ?? emptyBucket();
  return patch(stats, key, {
    count: b.count + 1,
    sum: b.sum + score,
    best: b.best,
    partialCount: b.partialCount + 1,
  });
}

/** 기록 역산(불변): count·sum 감소(0 하한). best 는 집계값이라 롤백 안 함. */
export function reverseRecord(stats: AvgStats, key: AvgBucketKey, amount: number): AvgStats {
  const b = stats[key] ?? emptyBucket();
  return patch(stats, key, {
    count: Math.max(0, b.count - 1),
    sum: Math.max(0, b.sum - amount),
    best: b.best,
    partialCount: b.partialCount,
  });
}

/** 한 버킷만 초기화(불변). */
export function resetBucket(stats: AvgStats, key: AvgBucketKey): AvgStats {
  return patch(stats, key, emptyBucket());
}

function sanitizeBucket(v: unknown): AvgBucket {
  const o = (v ?? {}) as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);
  return { count: num(o.count), sum: num(o.sum), best: num(o.best), partialCount: num(o.partialCount) };
}

/** localStorage 원문 → AvgStats. null·손상·부분키 결손 시 0으로 방어. */
export function parseStats(raw: string | null): AvgStats {
  const base = emptyStats();
  if (!raw) return base;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown> | null;
    if (!obj || typeof obj !== 'object') return base;
    for (const key of AVG_BUCKET_KEYS) {
      if (key in obj) base[key] = sanitizeBucket(obj[key]);
    }
    return base;
  } catch {
    return base;
  }
}

export function serializeStats(stats: AvgStats): string {
  return JSON.stringify(stats);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/averageStats.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/core/averageStats.ts src/core/averageStats.test.ts
git commit -m "feat(core): 개인 평균 통계 순수 집계 모듈 + 테스트"
```

---

## Task 2: localStorage 브릿지 `averageStorage.ts`

**Files:**
- Create: `src/store/averageStorage.ts`

**Interfaces:**
- Consumes: `parseStats`, `serializeStats`, `AvgStats` from Task 1.
- Produces: `loadStats(): AvgStats`, `saveStats(stats: AvgStats): void`, `loadIncludeDefault(): boolean`, `saveIncludeDefault(on: boolean): void`.

- [ ] **Step 1: Write the implementation**

```ts
// src/store/averageStorage.ts
// 개인 평균 통계 localStorage 브릿지(코어 averageStats 파싱/직렬화를 감싸 저장소 접근만 담당).
// 기존 yd_* 관례: 접근은 전부 try/catch. 파싱 로직은 코어(테스트 대상)에 있다.
import { parseStats, serializeStats, type AvgStats } from '../core/averageStats';

const STATS_KEY = 'yd_avg_stats';
const INCLUDE_KEY = 'yd_avg_include';

export function loadStats(): AvgStats {
  try {
    return parseStats(localStorage.getItem(STATS_KEY));
  } catch {
    return parseStats(null);
  }
}

export function saveStats(stats: AvgStats): void {
  try {
    localStorage.setItem(STATS_KEY, serializeStats(stats));
  } catch {
    // 저장 불가(사파리 사생활 모드 등) — 무시.
  }
}

/** 포함 기본 토글. 미저장이면 true(포함). */
export function loadIncludeDefault(): boolean {
  try {
    return localStorage.getItem(INCLUDE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveIncludeDefault(on: boolean): void {
  try {
    localStorage.setItem(INCLUDE_KEY, on ? '1' : '0');
  } catch {
    // 무시.
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/store/averageStorage.ts
git commit -m "feat(store): 평균 통계 localStorage 브릿지"
```

---

## Task 3: 솔로 스토어 배선 `gameStore.ts`

> 이 태스크는 순수 로직(Task 1) 위에 "언제 기록/역산하는가"만 배선한다. 스토어는 브라우저 전역 의존이라 vitest(node) 단위 테스트 대상이 아니다 — 정확성은 Task 1 테스트 + Task 4의 프리뷰 검증으로 확인한다.

**Files:**
- Modify: `src/store/gameStore.ts`

**Interfaces:**
- Consumes: Task 1(`AvgStats`, `AvgMode`, `bucketKey`, `recordCompleted`, `recordPartial`, `reverseRecord`, `resetBucket`, `meetsPartialFloor`), Task 2(`loadStats`, `saveStats`, `loadIncludeDefault`, `saveIncludeDefault`), `filledCount`/`grandTotal`/`isGameOver` from `gameState.ts`.
- Produces (store shape 추가): `includeInAverage: boolean`, `includeThisGame: boolean`, `avgRecorded: boolean`, `recordedAmount: number`, `avgStats: AvgStats`, `setIncludeInAverage(on): void`, `resetAvgBucket(mode: AvgMode, preset: RulePresetId): void`.

- [ ] **Step 1: Imports 추가** (상단 import 블록)

```ts
import {
  createScorecard, filledCount, grandTotal, isCategoryFilled, isGameOver,
  recordMasterYachtBonus, recordScore,
} from '../core/gameState';
import type { AvgMode, AvgStats } from '../core/averageStats';
import {
  bucketKey, meetsPartialFloor, recordCompleted, recordPartial, resetBucket, reverseRecord,
} from '../core/averageStats';
import {
  loadIncludeDefault, loadStats, saveIncludeDefault, saveStats,
} from './averageStorage';
```
(`filledCount` 를 기존 `gameState` import에 추가한다. 나머지 기존 import은 유지.)

- [ ] **Step 2: 모듈 스코프 상수 + commit 헬퍼 추가** (기존 `INITIAL_PRESET` 근처)

```ts
const INITIAL_INCLUDE = loadIncludeDefault();
const INITIAL_STATS = loadStats();

/**
 * 진행 중(미종료)·미기록·순수(헬퍼·되돌리기 미사용)·floor 충족·포함 게임이면
 * 현재 부분 점수를 solo 버킷에 기록하고 저장한 새 avgStats 를 반환. 아니면 현재 avgStats.
 * newGame/setRulePreset 진입 시(리셋 직전) 호출 — setRulePreset 은 반드시 전환 전(옛 프리셋)에 호출.
 */
function commitOutgoingPartial(s: GameStore): { avgStats: AvgStats; recorded: boolean } {
  if (
    s.avgRecorded ||
    !s.includeThisGame ||
    s.helperUsedThisGame ||
    s.undoUsedThisGame ||
    isGameOver(s.card) ||               // 완료 게임은 완료 경로에서 이미 처리
    !meetsPartialFloor(filledCount(s.card))
  ) {
    return { avgStats: s.avgStats, recorded: false };
  }
  const key = bucketKey('solo', s.rulePreset);
  const score = grandTotal(s.card, s.rules);
  const next = recordPartial(s.avgStats, key, score);
  saveStats(next);
  return { avgStats: next, recorded: true };
}
```

- [ ] **Step 3: GameStore 인터페이스에 필드/액션 추가** (interface 내부, 적절한 위치)

```ts
  /** 개인 평균 포함 기본값(설정에서 변경, yd_avg_include). */
  includeInAverage: boolean;
  /** 이 게임의 포함 여부(시작 시 스냅샷 — 되돌리기 스냅샷 밖). */
  includeThisGame: boolean;
  /** 이 게임을 평균에 이미 기록했는지(1회 가드 — 스냅샷 밖). */
  avgRecorded: boolean;
  /** 기록한 값(되돌리기 정확 역산용 — 스냅샷 밖). */
  recordedAmount: number;
  /** 화면 갱신용 통계 미러(단일 출처는 localStorage yd_avg_stats). */
  avgStats: AvgStats;

  /** 포함 기본 토글 변경(다음 게임부터 적용). */
  setIncludeInAverage: (on: boolean) => void;
  /** 한 버킷 통계 초기화. */
  resetAvgBucket: (mode: AvgMode, preset: RulePresetId) => void;
```

- [ ] **Step 4: 초기 상태에 필드 추가** (`create<GameStore>` 초기값, 기존 `scoreSubmittedThisGame: false,` 근처)

```ts
  includeInAverage: INITIAL_INCLUDE,
  includeThisGame: INITIAL_INCLUDE,
  avgRecorded: false,
  recordedAmount: 0,
  avgStats: INITIAL_STATS,
```

- [ ] **Step 5: `assign` 에 완료 기록 추가** (기존 `assign` 내부, `set({...})` 직전)

기존 `const card = yachtMaster ? ... : recordScore(...)` 다음에:

```ts
    const over = isGameOver(card);
    let avgStats = s.avgStats;
    let avgRecorded = s.avgRecorded;
    let recordedAmount = s.recordedAmount;
    // 완료 순간 1회 기록: 포함 ON·미기록·순수 게임일 때만.
    if (over && !avgRecorded && s.includeThisGame && !s.helperUsedThisGame && !s.undoUsedThisGame) {
      const score = grandTotal(card, s.rules);
      avgStats = recordCompleted(s.avgStats, bucketKey('solo', s.rulePreset), score);
      avgRecorded = true;
      recordedAmount = score;
      saveStats(avgStats);
    }
```

그리고 기존 `set({...})` 를 다음처럼 확장(기존 필드 유지 + 추가):

```ts
    set({
      card,
      dice: [...INITIAL_DICE],
      held: Array(DICE_COUNT).fill(false),
      rollsUsed: 0,
      resultOpen: over,          // 기존 isGameOver(card) 대신 계산해 둔 over 재사용
      avgStats,
      avgRecorded,
      recordedAmount,
      history: [
        ...s.history,
        { card: s.card, dice: [...s.dice], held: [...s.held], rollsUsed: s.rollsUsed, resultOpen: s.resultOpen },
      ],
    });
```

- [ ] **Step 6: `undo` 에 역산 추가** (기존 `undo` 내부, `set({...})` 확장)

`const prev = s.history[s.history.length - 1];` 다음에:

```ts
    // 완료+기록된 게임을 되돌리면 평균에서 정확히 역산.
    // (undoUsedThisGame 이 참이 되므로 재완료해도 순수성 실패로 재기록되지 않는다.)
    let avgStats = s.avgStats;
    let avgRecorded = s.avgRecorded;
    let recordedAmount = s.recordedAmount;
    if (avgRecorded && !isGameOver(prev.card)) {
      avgStats = reverseRecord(s.avgStats, bucketKey('solo', s.rulePreset), s.recordedAmount);
      saveStats(avgStats);
      avgRecorded = false;
      recordedAmount = 0;
    }
```

기존 `set({...})` 에 `avgStats, avgRecorded, recordedAmount,` 추가(기존 `undoUsedThisGame: true` 유지).

- [ ] **Step 7: `newGame` 에 부분 커밋 + 시작 고정 추가**

```ts
  newGame: () => {
    const s = get();
    const { avgStats } = commitOutgoingPartial(s); // 진행 중이었으면 부분 반영
    set({
      card: createScorecard(),
      dice: [...INITIAL_DICE],
      held: Array(DICE_COUNT).fill(false),
      rollsUsed: 0,
      resultOpen: false,
      helperUsedThisGame: false,
      history: [],
      undoUsedThisGame: false,
      scoreSubmittedThisGame: false,
      avgStats,
      includeThisGame: s.includeInAverage, // 시작 고정
      avgRecorded: false,
      recordedAmount: 0,
    });
  },
```

- [ ] **Step 8: `setRulePreset` 에 부분 커밋(전환 전) + 시작 고정 추가**

기존 `if (get().rulePreset === id) return;` 다음:

```ts
    const s = get();
    const { avgStats } = commitOutgoingPartial(s); // 반드시 옛 프리셋 버킷에 기록 후 전환
```

그리고 기존 `set({ rulePreset: id, ... })` 에 다음 필드 추가(기존 필드 유지):

```ts
      avgStats,
      includeThisGame: s.includeInAverage,
      avgRecorded: false,
      recordedAmount: 0,
```

- [ ] **Step 9: 신규 액션 2개 추가** (store 액션 블록 하단, `toggleTheme` 근처)

```ts
  setIncludeInAverage: (on) => {
    saveIncludeDefault(on);
    set({ includeInAverage: on }); // includeThisGame 은 건드리지 않음 → 다음 게임부터
  },

  resetAvgBucket: (mode, preset) => {
    const next = resetBucket(get().avgStats, bucketKey(mode, preset));
    saveStats(next);
    set({ avgStats: next });
  },
```

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/store/gameStore.ts
git commit -m "feat(store): 솔로 평균 기록/역산·시작고정·포함 토글 배선"
```

---

## Task 4: 웹 솔로 UI (설정 토글·게임오버·홈·포기 버튼)

**Files:**
- Modify: `src/ui/SettingsPanel.tsx`, `src/ui/GameOver.tsx`, `src/ui/Home.tsx`, `src/ui/App.tsx`, `src/index.css`

**Interfaces:**
- Consumes: gameStore(`includeInAverage`, `setIncludeInAverage`, `avgStats`, `rulePreset`, `resetAvgBucket`, `includeThisGame`, `avgRecorded`, `newGame`, `card`, `rollsUsed`, `gameOver`), `averageOf`/`bucketKey` from core, appStore(`setScreen`), `filledCount` from gameState.

- [ ] **Step 1: SettingsPanel — 포함 토글 + 평균 + 리셋** (`콤보 확률 표시` toggle 블록 아래, 108행 상태표시 위)

상단 import/훅 추가:
```tsx
import { averageOf, bucketKey } from '../core/averageStats';
// 훅:
const includeInAverage = useGameStore((s) => s.includeInAverage);
const setIncludeInAverage = useGameStore((s) => s.setIncludeInAverage);
const avgStats = useGameStore((s) => s.avgStats);
const resetAvgBucket = useGameStore((s) => s.resetAvgBucket);
const bucket = avgStats[bucketKey('solo', rulePreset)];
const avg = averageOf(bucket);
```

JSX(콤보/하이라이트 토글 뒤):
```tsx
        <div className="toggle">
          <div className="tinfo">
            <div className="t-name">평균에 포함</div>
            <div className="t-desc">시작 시점 기준 적용 · 변경은 다음 게임부터</div>
          </div>
          <Switch on={includeInAverage} onClick={() => setIncludeInAverage(!includeInAverage)} />
        </div>

        <div className="setting-group avg-summary">
          <div className="t-name">내 평균 ({RULE_PRESETS[rulePreset].ko})</div>
          <div className="avg-line">
            {avg === null
              ? '기록 없음'
              : `평균 ${Math.round(avg)} · ${bucket.count}판${bucket.partialCount ? ` (미완료 ${bucket.partialCount})` : ''} · 최고 ${bucket.best}`}
          </div>
          <button
            className="ghost-btn"
            disabled={bucket.count === 0}
            onClick={() => {
              if (window.confirm(`'${RULE_PRESETS[rulePreset].ko}' 평균 기록을 초기화할까요?`)) {
                resetAvgBucket('solo', rulePreset);
              }
            }}
          >
            통계 초기화
          </button>
        </div>
```

- [ ] **Step 2: GameOver — "내 평균" 줄 + 이번 판 뱃지** (기존 `compare` div 아래, 67-69행 근처)

훅/계산 추가(컴포넌트 상단):
```tsx
import { averageOf, bucketKey } from '../core/averageStats';
const avgStats = useGameStore((s) => s.avgStats);
const includeThisGame = useGameStore((s) => s.includeThisGame);
const avgRecorded = useGameStore((s) => s.avgRecorded);
const bucket = avgStats[bucketKey('solo', rulePreset)];
const avg = averageOf(bucket);
const avgBadge = avgRecorded
  ? '이 게임 평균 반영됨 ✓'
  : includeThisGame
    ? '평균 미반영 (헬퍼·되돌리기 사용)'
    : '평균 미반영 (연습)';
```

JSX(`<div className="compare">…</div>` 바로 아래):
```tsx
        <div className="go-myavg">
          {avg !== null && <span className="go-avg-val">내 평균 {Math.round(avg)} · {bucket.count}판</span>}
          <span className={`go-avg-badge ${avgRecorded ? 'on' : ''}`}>{avgBadge}</span>
        </div>
```
> GameOver 는 완료 시에만 열리므로 부분판 라벨은 여기서 불필요(부분 반영은 포기 경로에서만 발생, 그땐 GameOver 안 뜸).

- [ ] **Step 3: Home — 솔로 버튼 하위 통계** (56-62행 `home-solo` 버튼)

```tsx
import { useGameStore } from '../store/gameStore';
import { averageOf, bucketKey } from '../core/averageStats';
// 컴포넌트 내부:
const avgStats = useGameStore((s) => s.avgStats);
const soloPreset = useGameStore((s) => s.rulePreset);
const soloBucket = avgStats[bucketKey('solo', soloPreset)];
const soloAvg = averageOf(soloBucket);
```

`home-solo` 버튼의 `<small>` 교체:
```tsx
            <small>
              {soloAvg === null
                ? '최적 EV 헬퍼와 함께 점수 도전'
                : `내 평균 ${Math.round(soloAvg)} · ${soloBucket.count}판 · 최고 ${soloBucket.best}`}
            </small>
```

- [ ] **Step 4: App — "포기하고 종료" 버튼** (Header children, 45-49행 result-btn 근처)

훅 추가:
```tsx
import { useAppStore } from '../store/appStore';
import { filledCount } from '../core/gameState';
const setScreen = useAppStore((s) => s.setScreen);
const newGame = useGameStore((s) => s.newGame);
const rollsUsed = useGameStore((s) => s.rollsUsed);
const started = filledCount(card) > 0 || rollsUsed > 0;
```

Header children(기존 result-btn 뒤):
```tsx
        {started && !gameOver && (
          <button
            className="result-btn quit-btn"
            title="포기하고 종료"
            onClick={() => {
              if (window.confirm('게임을 포기하고 종료할까요?\n진행 중 점수는 평균 규칙(3칸 이상·포함 ON·순수)에 따라 반영됩니다.')) {
                newGame();          // 현재 부분 점수 커밋 + 새 게임
                setScreen('home');  // 홈으로 나가 통계 확인
              }
            }}
          >
            🏳️ 포기
          </button>
        )}
```

- [ ] **Step 5: CSS — 신규 클래스** (`src/index.css` 말미에 추가)

```css
/* 개인 평균 표시 */
.avg-summary .avg-line { color: var(--mut); font-size: 13px; margin: 4px 0 8px; }
.go-myavg { display: flex; gap: 8px; align-items: center; justify-content: center; flex-wrap: wrap; margin-top: 4px; }
.go-avg-val { color: var(--txt); font-weight: 600; }
.go-avg-badge { font-size: 12px; color: var(--mut); border: 1px solid var(--line, var(--mut)); border-radius: 999px; padding: 1px 8px; }
.go-avg-badge.on { color: var(--good); border-color: var(--good); }
```
> `--txt/--mut/--good` 등은 기존 변수. `--line` 없으면 `--mut` 로 폴백. 필요 시 기존 팔레트에 맞춰 조정.

- [ ] **Step 6: 빌드 검증 (프리뷰)**

- Run: `npm run typecheck` → PASS.
- 프리뷰 실행(dev): Browser 도구 `preview_start {name:"dev"}`(없으면 `.claude/launch.json`에 vite dev 등록: runtimeExecutable `npm`, runtimeArgs `["run","dev"]`, port 5173). `http://localhost:5173` 로 이동.
- 시나리오: 솔로 게임 완료 → GameOver에 "내 평균/판수" + "평균 반영됨 ✓" 확인. 설정 열어 토글 OFF → 새 게임 완료 → "평균 미반영 (연습)" + 판수 안 늘어남 확인. 3칸만 채우고 🏳️포기 → 홈 통계 판수 +1(미완료 1). 2칸만 채우고 포기 → 판수 불변(floor). `read_console_messages` 로 에러 없음 확인, `computer{screenshot}` 로 증빙.

- [ ] **Step 7: Commit**

```bash
git add src/ui/SettingsPanel.tsx src/ui/GameOver.tsx src/ui/Home.tsx src/ui/App.tsx src/index.css
git commit -m "feat(ui): 솔로 평균 표시·포함 토글·리셋·포기 버튼"
```

---

## Task 5: 웹 멀티플레이어 (multiplayerStore + MpGameOver)

**Files:**
- Modify: `src/store/multiplayerStore.ts`, `src/ui/MpGameOver.tsx`

**Interfaces:**
- Consumes: `RULE_PRESETS` (from rules), `grandTotal` (gameState), `bucketKey`/`recordCompleted` (core), `loadStats`/`saveStats`/`loadIncludeDefault` (storage).
- Produces (MpState 추가): `mpIncludeThisGame: boolean`, `mpAvgRecorded: boolean`, `recordMpResultIfNeeded(): void`.

- [ ] **Step 1: Imports + 상태 필드**

상단 import:
```ts
import { RULE_PRESETS } from '../core/rules';
import { grandTotal } from '../core/gameState';
import { bucketKey, recordCompleted } from '../core/averageStats';
import { loadStats, saveStats, loadIncludeDefault } from './averageStorage';
```
MpState 인터페이스에 추가:
```ts
  /** 이 멀티 게임 평균 포함 여부(playing 진입 시 스냅샷). */
  mpIncludeThisGame: boolean;
  /** 이 멀티 게임 기록 완료 가드(멱등). */
  mpAvgRecorded: boolean;
  recordMpResultIfNeeded: () => void;
```
초기값(store 생성부):
```ts
  mpIncludeThisGame: false,
  mpAvgRecorded: false,
```

- [ ] **Step 2: playing 진입 시 시작 고정** — room 갱신을 전이 감지로 감싼다.

`mapRoom` 아래에 헬퍼 추가:
```ts
// 방 상태 갱신 시 lobby/finished → playing 전이를 감지해 포함 여부를 시작 시점에 고정.
function setRoomDetectingStart(
  get: () => MpState, set: (p: Partial<MpState>) => void, next: MpRoom,
) {
  const prev = get().room;
  if (next.status === 'playing' && prev?.status !== 'playing') {
    set({ mpIncludeThisGame: loadIncludeDefault(), mpAvgRecorded: false });
  }
  set({ room: next });
}
```
`subscribeRoom` 의 rooms `postgres_changes` 핸들러에서 `set({ room: mapRoom(payload.new) });` → `setRoomDetectingStart(get, set, mapRoom(payload.new));` 로 교체(DELETE 분기는 그대로).
`refetch` 의 `if (roomData) set({ room: mapRoom(roomData) });` → `if (roomData) setRoomDetectingStart(get, set, mapRoom(roomData));`.

- [ ] **Step 3: 완료 기록 액션 + leave 시 플래그 정리**

store 액션에 추가:
```ts
  // 멀티 정상 종료 시 내 최종 점수를 multi 버킷에 1회 기록(멱등 — MpGameOver 효과에서 호출).
  recordMpResultIfNeeded: () => {
    const s = get();
    const room = s.room;
    if (!room || room.status !== 'finished') return;
    if (!s.mpIncludeThisGame || s.mpAvgRecorded || room.helperAllowed) return; // 순수 = 헬퍼 비허용 방
    const me = s.players.find((p) => p.userId === s.myUserId);
    if (!me) return;
    const rules = RULE_PRESETS[room.rulePreset].config;
    const score = grandTotal(me.scorecard, rules);
    const next = recordCompleted(loadStats(), bucketKey('multi', room.rulePreset), score);
    saveStats(next);
    set({ mpAvgRecorded: true });
  },
```
`leave` 에서 상태 초기화 목록에 추가: `mpIncludeThisGame: false, mpAvgRecorded: false`.

- [ ] **Step 4: MpGameOver — 기록 호출 + 평균 표시**

상단 import/훅:
```ts
import { useEffect, useState } from 'react';
import { grandTotal } from '../core/gameState';
import { averageOf, bucketKey } from '../core/averageStats';
import { loadStats } from '../store/averageStorage';
const recordMpResultIfNeeded = useMultiplayerStore((s) => s.recordMpResultIfNeeded);
const [myAvg, setMyAvg] = useState<{ avg: number | null; count: number; best: number } | null>(null);
```
`if (!room) return null;` 아래에 효과 추가(StrictMode 이중 호출은 가드로 무해):
```tsx
  useEffect(() => {
    recordMpResultIfNeeded();
    const b = loadStats()[bucketKey('multi', room.rulePreset)];
    setMyAvg({ avg: averageOf(b), count: b.count, best: b.best });
  }, [recordMpResultIfNeeded, room.rulePreset]);
```
표시(내 랭킹 줄 근처, `mp-ranking` 아래):
```tsx
        {myAvg && myAvg.avg !== null && (
          <div className="go-myavg">
            <span className="go-avg-val">내 멀티 평균 {Math.round(myAvg.avg)} · {myAvg.count}판 · 최고 {myAvg.best}</span>
          </div>
        )}
```

- [ ] **Step 5: 검증 (프리뷰 · 스토어 주입)**

- Run: `npm run typecheck` → PASS.
- dev 프리뷰에 Supabase 미설정이므로, 메모리 `verify-web-multiplayer-store-injection` 방식으로 `main.tsx` dev 전용 window 노출을 통해 `useMultiplayerStore.setState` 로 `room.status:'playing'`(헬퍼 비허용) → `'finished'` + `players`(내 scorecard 채움) 를 주입. `MpGameOver` 렌더 후 `loadStats()['multi:default']` 의 count가 1 증가하는지 콘솔에서 확인. helperAllowed=true 방은 count 불변 확인. 검증 후 임시 주입 코드 원복.

- [ ] **Step 6: Commit**

```bash
git add src/store/multiplayerStore.ts src/ui/MpGameOver.tsx
git commit -m "feat(mp): 멀티 정상 종료 시 개인 평균 집계 + 표시"
```

---

## Task 6: 데스크톱 솔로 (`desktop/popup.html`)

> 데스크톱은 완전 독립 — 웹 모듈 import 금지, 동일 규칙을 인라인 재구현. 기록 값은 반드시 데스크톱 `total()`. 검증은 정적 프리뷰 + 실제 Electron(메모리 `verify-popup-html-static-preview`, `verify-electron-via-real-main`).

**Files:**
- Modify: `desktop/popup.html`

- [ ] **Step 1: 통계 유틸 + 상태 변수** (`loadPreset`/`soloPreset` 정의 근처, 416-425행)

```js
      // ── 개인 평균 통계(웹 averageStats·store 와 동일 규칙, 여기선 인라인 재구현) ──
      var AVG_STATS_KEY = 'yd_avg_stats', AVG_INCLUDE_KEY = 'yd_avg_include', AVG_MIN_PARTIAL = 3;
      function avgEmptyBucket() { return { count: 0, sum: 0, best: 0, partialCount: 0 }; }
      function avgEmptyStats() {
        return { 'solo:default': avgEmptyBucket(), 'solo:additional': avgEmptyBucket(),
                 'multi:default': avgEmptyBucket(), 'multi:additional': avgEmptyBucket() };
      }
      function avgLoadStats() {
        try {
          var o = JSON.parse(localStorage.getItem(AVG_STATS_KEY) || '{}') || {}, out = avgEmptyStats();
          Object.keys(out).forEach(function (k) {
            var b = o[k] || {}, num = function (x) { return (typeof x === 'number' && isFinite(x) && x >= 0) ? x : 0; };
            out[k] = { count: num(b.count), sum: num(b.sum), best: num(b.best), partialCount: num(b.partialCount) };
          });
          return out;
        } catch (_) { return avgEmptyStats(); }
      }
      function avgSaveStats(s) { try { localStorage.setItem(AVG_STATS_KEY, JSON.stringify(s)); } catch (_) {} }
      function avgLoadInclude() { try { return localStorage.getItem(AVG_INCLUDE_KEY) !== '0'; } catch (_) { return true; } }
      function avgSaveInclude(on) { try { localStorage.setItem(AVG_INCLUDE_KEY, on ? '1' : '0'); } catch (_) {} }

      var avgStats = avgLoadStats();
      var avgIncludeDefault = avgLoadInclude();
      var avgIncludeThisGame = avgIncludeDefault; // reset()에서 재스냅샷
      var avgCounted = false, avgRecordedAmount = 0;

      // 진행 중·미기록·순수(되돌리기 미사용)·floor·포함이면 현재 부분 점수를 solo 버킷에 기록.
      function avgCommitOutgoing() {
        if (avgCounted || !avgIncludeThisGame || undoUsed) return;
        if (!state || state.turn >= 12 || state.turn < AVG_MIN_PARTIAL) return;
        var k = 'solo:' + soloPreset, sc = total();
        avgStats[k].count++; avgStats[k].sum += sc; avgStats[k].partialCount++;
        avgSaveStats(avgStats); avgCounted = true; avgRecordedAmount = sc;
      }
```

- [ ] **Step 2: `reset()` 에 시작 고정** (432-438행, `render();` 앞)

```js
        avgIncludeThisGame = avgIncludeDefault;
        avgCounted = false; avgRecordedAmount = 0;
```

- [ ] **Step 3: `setSoloPreset` 에 전환 전 커밋** (421-425행)

`soloPreset = ...` 앞에 한 줄:
```js
        avgCommitOutgoing(); // 옛 프리셋 버킷에 부분 반영 후 전환
```

- [ ] **Step 4: `gameOver()` 에 완료 기록 + 표시** (519-521행, `finalScore`/`finalPreset` 설정 직후)

```js
        if (avgIncludeThisGame && !avgCounted && !undoUsed) {
          var _k = 'solo:' + finalPreset;
          avgStats[_k].count++; avgStats[_k].sum += finalScore;
          avgStats[_k].best = Math.max(avgStats[_k].best, finalScore);
          avgSaveStats(avgStats); avgCounted = true; avgRecordedAmount = finalScore;
        }
        renderAvg();
```

- [ ] **Step 5: `undo()` 에 역산** (485-498행, `undoUsed = true;` 뒤)

```js
        if (avgCounted && p.turn < 12) { // 완료 기록 되돌림(재완료 시 undoUsed 로 재기록 안 됨)
          var _k = 'solo:' + soloPreset;
          avgStats[_k].count = Math.max(0, avgStats[_k].count - 1);
          avgStats[_k].sum = Math.max(0, avgStats[_k].sum - avgRecordedAmount);
          avgSaveStats(avgStats); avgCounted = false; avgRecordedAmount = 0;
          renderAvg();
        }
```

- [ ] **Step 6: `#new` 핸들러에 커밋** (607행)

`document.getElementById('new').onclick = reset;` →
```js
      document.getElementById('new').onclick = function () { avgCommitOutgoing(); reset(); };
```
(`#again` 608행은 그대로 `reset` — 완료 후라 가드로 무해.)

- [ ] **Step 7: 오버카드에 평균 표시 + 포함 토글** (HTML `#over` overcard, 351행 `<div class="ko">완료</div>` 아래)

```html
        <div class="avg-line" id="avg-line"></div>
        <label class="avg-inc"><input type="checkbox" id="avg-include" tabindex="-1"> 평균 집계(다음 게임부터)</label>
```
JS `renderAvg()` 정의(예: `render()` 함수 아래) + 토글 배선(핸들러 블록 605-611행 근처):
```js
      function renderAvg() {
        var el = document.getElementById('avg-line'); if (!el) return;
        var b = avgStats['solo:' + soloPreset] || avgEmptyBucket();
        var avg = b.count > 0 ? Math.round(b.sum / b.count) : null;
        var badge = avgCounted ? '평균 반영됨' : (avgIncludeThisGame ? '평균 미반영(되돌리기)' : '평균 미반영(연습)');
        el.textContent = (avg === null ? '기록 없음'
          : '내 평균 ' + avg + ' · ' + b.count + '판' + (b.partialCount ? ' (미완료 ' + b.partialCount + ')' : '') + ' · 최고 ' + b.best)
          + ' · ' + badge;
      }
      (function () {
        var inc = document.getElementById('avg-include');
        if (inc) { inc.checked = avgIncludeDefault; inc.onchange = function () { avgIncludeDefault = inc.checked; avgSaveInclude(avgIncludeDefault); }; }
      })();
```
CSS(문서 `<style>` 말미): `.avg-line{font-size:12px;color:var(--mut);margin:6px 0}` `.avg-inc{font-size:12px;color:var(--mut);display:flex;gap:6px;align-items:center;justify-content:center}` (기존 무채색 변수 사용).

- [ ] **Step 8: 검증 (정적 프리뷰 + 실제 Electron)**

- 정적 프리뷰: `desktop/`에서 간이 정적 서버로 `popup.html` 을 열고(메모리 `verify-popup-html-static-preview`), 콘솔에서 `localStorage`에 `yd_avg_stats` 주입/초기화하며 솔로 완료·3칸 포기·2칸 포기(floor)·룰 변경·되돌리기 시 `yd_avg_stats` 변화와 `#avg-line` 텍스트를 확인.
- 실제 Electron: `cd desktop && npm install && npm start` 로 트레이 팝업 구동, 솔로 한 판 완료 후 오버카드 평균 표시·토글 동작 확인.

- [ ] **Step 9: Commit**

```bash
git add desktop/popup.html
git commit -m "feat(desktop): 솔로 평균 집계·표시·포함 토글(인라인)"
```

---

## Task 7: 데스크톱 멀티플레이어 (`desktop/popup.html`)

> 데스크톱 MP 채점·상태 변수명은 조사에서 근사만 확인됨 — **Step 1에서 실제 코드를 먼저 읽어** 정확한 이름/좌표를 잡은 뒤 배선한다. 규칙은 웹 Task 5와 동일: playing 진입 시 포함 스냅샷, 정상 종료(#mp-over) 시 내 최종 점수를 `multi:<preset>` 버킷에 1회 기록, 순수 = `!helperAllowed`.

**Files:**
- Modify: `desktop/popup.html`

- [ ] **Step 1: 데스크톱 MP 코드 정독**

Grep/Read `desktop/popup.html` 로 다음을 확정: MP 방 객체(`helperAllowed`·`rulePreset` 대응 필드), 내 좌석/`myUserId` 대응, MP 내 최종 점수 계산 함수(조사상 `scorecardTotal`/`mpSubmitScore` 부근, `#mp-total` 803-870행대), `#mp-over` 표시 지점(319-330행 + 이를 여는 로직), playing 시작(=`#mp-game` 표시/상태 전이) 지점.

- [ ] **Step 2: MP 상태 변수 추가** (솔로 avg 변수 근처)

```js
      var avgMpIncludeThisGame = false, avgMpCounted = false;
```

- [ ] **Step 3: MP 시작 고정** — MP 게임이 playing 으로 진입(=`#mp-game` 활성/상태 전이)하는 지점에 삽입:

```js
        avgMpIncludeThisGame = avgLoadInclude(); avgMpCounted = false;
```

- [ ] **Step 4: MP 완료 기록** — `#mp-over` 를 여는(정상 종료) 지점에서, 내 최종 점수(Step 1에서 확인한 함수, 예 `myMpTotal`)와 방 규칙/헬퍼 여부로:

```js
        if (avgMpIncludeThisGame && !avgMpCounted && !mpRoom.helperAllowed) {
          var _mk = 'multi:' + (mpRoom.rulePreset === 'additional' ? 'additional' : 'default');
          var _ms = myMpTotal(); // Step 1에서 확정한 내 최종 점수 계산
          avgStats[_mk].count++; avgStats[_mk].sum += _ms;
          avgStats[_mk].best = Math.max(avgStats[_mk].best, _ms);
          avgSaveStats(avgStats); avgMpCounted = true;
        }
```
(변수명 `mpRoom`/`myMpTotal` 은 Step 1에서 확인한 실제 이름으로 치환.)

- [ ] **Step 5: 표시(선택)** — `#mp-over` overcard(320-329행)에 `<div class="avg-line" id="mp-avg-line"></div>` 추가하고 기록 직후 텍스트 세팅(솔로 `renderAvg` 패턴 재사용, `multi:<preset>` 버킷).

- [ ] **Step 6: 검증** — 실제 Electron 2-인스턴스 또는 웹↔데스크톱 교차(메모리 `multiplayer-realtime-interop`)로 헬퍼 비허용 방 정상 종료 시 `yd_avg_stats['multi:default'].count` +1, 헬퍼 허용 방은 불변 확인.

- [ ] **Step 7: Commit**

```bash
git add desktop/popup.html
git commit -m "feat(desktop): 멀티 정상 종료 시 개인 평균 집계(인라인)"
```

---

## Task 8: 문서 · 패치노트

**Files:**
- Modify: `src/data/changelog.ts`, `CLAUDE.md`

- [ ] **Step 1: changelog 항목 추가** — `CHANGELOG` 배열 맨 앞에 새 엔트리(버전은 기존 최신에서 patch 범프, 형식은 기존 엔트리 그대로 모방: `version`/`date`/`changes[]`). 내용 예: "개인 평균 점수 통계 추가(솔로·멀티, 룰별) · 게임별 '평균에 포함' 토글 · 중도 포기 부분 반영(3칸 이상) · 순수 게임만 집계".

- [ ] **Step 2: CLAUDE.md 한 줄 추가** — 저장/PWA 관련 절에 `yd_avg_stats`/`yd_avg_include` 키와 "집계 순수 로직은 `src/core/averageStats.ts`(테스트 대상), localStorage 브릿지는 `src/store/averageStorage.ts`; 데스크톱은 동일 규칙 인라인 재구현" 을 명시.

- [ ] **Step 3: 최종 검증**

Run: `npm run typecheck && npm test`
Expected: PASS(신규 `averageStats.test.ts` 포함 전체 통과). `npm run build` 로 프리빌드(V.bin 재생성)·빌드까지 무오류 확인.

- [ ] **Step 4: Commit**

```bash
git add src/data/changelog.ts CLAUDE.md
git commit -m "docs: 개인 평균 점수 기능 패치노트·CLAUDE.md"
```

---

## Self-Review (작성자 점검 결과)

- **Spec 커버리지:** 이슈 #65의 수용 기준 전부 태스크에 대응 — 토글/기본 ON(T4·T6), 완료 반영(T3·T6), 미반영 뱃지(T4·T6), 다음 게임 적용(T3 setIncludeInAverage·T6 avgSaveInclude), 중도 포기 floor 3칸(T3 commitOutgoingPartial·T6 avgCommitOutgoing), 룰 변경 옛 버킷(T3 Step8·T6 Step3), undo 역산(T3 Step6·T6 Step5), 순수 게임(완료·부분 가드), 멀티 정상 종료만(T5·T7), 홈·게임오버 표시(T4·T5), 리셋(T4), 영속·미동기화(T2 로컬 키), typecheck/test(T1·T8), 서버 무변경(전역 제약).
- **플레이스홀더:** 코어/웹은 실제 코드로 명시. 데스크톱 MP(T7)만 실제 변수명이 미확정이라 Step 1 "정독" 스텝으로 좌표를 먼저 확정하도록 설계(의도된 read-first, 접근·기록 코드는 구체 제시).
- **타입 일관성:** `bucketKey`/`recordCompleted`/`recordPartial`/`reverseRecord`/`resetBucket`/`averageOf`/`meetsPartialFloor`/`parseStats`/`serializeStats` 시그니처가 T1 정의와 T2~T5 사용처에서 일치. 저장 키(`yd_avg_stats`/`yd_avg_include`)·버킷 키 문자열이 웹/데스크톱에서 동일.
- **범위:** 하나의 응집 기능이라 단일 플랜 유지. 실행은 T1~T4(코어+웹솔로) → T5(웹멀티) → T6~T7(데스크톱) → T8(문서) 순으로 단계별 커밋·검증 가능.
