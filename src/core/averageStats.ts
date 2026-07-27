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
