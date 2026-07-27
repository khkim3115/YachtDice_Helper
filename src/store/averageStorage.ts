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
