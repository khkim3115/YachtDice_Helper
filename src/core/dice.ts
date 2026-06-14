// 주사위 멀티셋 조합론 — 사전계산과 런타임 솔버가 공유하는 정적 구조.
// 손패(hand)는 "카운트 벡터"(faces 1..6의 개수)로 표현하며, 0..251 인덱스로 매핑한다.

/** 길이 7 배열. index 1..6 = 해당 눈의 개수. index 0 미사용. */
export type Counts = number[];

export const FACES = [1, 2, 3, 4, 5, 6] as const;
export const HAND_SIZE = 5;

const FACT = [1, 1, 2, 6, 24, 120]; // 0!..5!

/** n개 주사위가 faces 1..6 에 분포하는 모든 멀티셋(카운트 벡터)을 열거. */
function enumerateMultisets(n: number): Counts[] {
  const out: Counts[] = [];
  const counts: Counts = [0, 0, 0, 0, 0, 0, 0];
  const rec = (face: number, remaining: number) => {
    if (face === 6) {
      counts[6] = remaining;
      out.push(counts.slice());
      return;
    }
    for (let c = 0; c <= remaining; c++) {
      counts[face] = c;
      rec(face + 1, remaining - c);
    }
    counts[face] = 0;
  };
  rec(1, n);
  return out;
}

/** 다항분포 확률: n개 주사위를 굴렸을 때 정확히 이 카운트가 나올 확률. */
function multinomialProb(counts: Counts, n: number): number {
  let denom = 1;
  for (let v = 1; v <= 6; v++) denom *= FACT[counts[v]];
  return FACT[n] / denom / Math.pow(6, n);
}

/** 카운트 벡터를 정수 키로(base-6, 6자리). 각 자리 0..5. */
function countsKey(counts: Counts): number {
  return (
    counts[1] +
    6 * counts[2] +
    36 * counts[3] +
    216 * counts[4] +
    1296 * counts[5] +
    7776 * counts[6]
  );
}
const KEY_RANGE = 6 ** 6; // 46656

// ── 손패(5개) 테이블 ───────────────────────────────────────────────
export const ALL_HANDS: Counts[] = enumerateMultisets(HAND_SIZE);
export const HAND_COUNT = ALL_HANDS.length; // 252

const handKeyToIndex = new Int16Array(KEY_RANGE).fill(-1);
ALL_HANDS.forEach((c, i) => {
  handKeyToIndex[countsKey(c)] = i;
});

export function handIndexOf(counts: Counts): number {
  const idx = handKeyToIndex[countsKey(counts)];
  if (idx < 0) throw new Error(`invalid hand counts: ${counts.join(',')}`);
  return idx;
}

/** 신규 5개 굴림 시 각 손패가 나올 확률 (index = handIndex). */
export const firstRollProb: Float64Array = (() => {
  const arr = new Float64Array(HAND_COUNT);
  for (let i = 0; i < HAND_COUNT; i++) arr[i] = multinomialProb(ALL_HANDS[i], HAND_SIZE);
  return arr;
})();

// ── 보관(keep) 멀티셋 테이블 (크기 0..5) ───────────────────────────
export const ALL_KEEPS: Counts[] = (() => {
  const out: Counts[] = [];
  for (let n = 0; n <= HAND_SIZE; n++) out.push(...enumerateMultisets(n));
  return out;
})();
export const KEEP_COUNT = ALL_KEEPS.length; // 462

const keepKeyToIndex = new Int16Array(KEY_RANGE).fill(-1);
ALL_KEEPS.forEach((c, i) => {
  keepKeyToIndex[countsKey(c)] = i;
});
function keepIndexOf(counts: Counts): number {
  return keepKeyToIndex[countsKey(counts)];
}

const keepSize = (counts: Counts): number =>
  counts[1] + counts[2] + counts[3] + counts[4] + counts[5] + counts[6];

/** 각 보관셋을 리롤했을 때 도달하는 자식 손패와 확률. */
export interface ChildTransition {
  childHand: number;
  prob: number;
}
export const keepChildren: ChildTransition[][] = ALL_KEEPS.map((keep) => {
  const rerollN = HAND_SIZE - keepSize(keep);
  const outcomes = enumerateMultisets(rerollN);
  return outcomes.map((outcome) => {
    const child: Counts = [0, 0, 0, 0, 0, 0, 0];
    for (let v = 1; v <= 6; v++) child[v] = keep[v] + outcome[v];
    return { childHand: handIndexOf(child), prob: multinomialProb(outcome, rerollN) };
  });
});

/** 각 손패에 대해, 그 손패의 부분 멀티셋인 보관셋 인덱스 목록. */
export const handKeeps: number[][] = ALL_HANDS.map((hand) => {
  const list: number[] = [];
  for (let k = 0; k < KEEP_COUNT; k++) {
    const keep = ALL_KEEPS[k];
    if (
      keep[1] <= hand[1] &&
      keep[2] <= hand[2] &&
      keep[3] <= hand[3] &&
      keep[4] <= hand[4] &&
      keep[5] <= hand[5] &&
      keep[6] <= hand[6]
    ) {
      list.push(k);
    }
  }
  return list;
});

/** 보관셋 인덱스 → 보관 크기(보관한 주사위 개수). */
export const keepSizes: number[] = ALL_KEEPS.map(keepSize);

// ── 변환 유틸 ──────────────────────────────────────────────────────
export function diceToCounts(dice: readonly number[]): Counts {
  const c: Counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d]++;
  return c;
}

/** 카운트를 정렬된 주사위 배열로 펼침. */
export function countsToDice(counts: Counts): number[] {
  const dice: number[] = [];
  for (let v = 1; v <= 6; v++) for (let i = 0; i < counts[v]; i++) dice.push(v);
  return dice;
}

export function handIndexOfDice(dice: readonly number[]): number {
  return handIndexOf(diceToCounts(dice));
}

export { keepIndexOf, keepSize, countsKey };
export const KEEP_COUNTS = ALL_KEEPS;
