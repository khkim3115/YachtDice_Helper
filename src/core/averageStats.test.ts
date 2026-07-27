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
