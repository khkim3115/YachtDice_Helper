// 리더보드(Top10) 읽기/제출. 솔로·멀티·데스크톱 공용.
// 읽기는 공개(anon select), 제출은 submit_score RPC(anon/authenticated 모두 호출 가능).
// 세션이 있으면 user_id 가 기록되지만 없어도 동작(익명).

import type { RulePresetId } from '../core/rules';
import { supabase, isSupabaseConfigured } from './supabase';

export type LbMode = 'solo' | 'multi' | 'desktop';

export interface LbEntry {
  nickname: string;
  score: number;
  mode: LbMode;
  created_at: string;
}

/** 규칙(rule_preset)별 점수 desc, 동점은 먼저 등록한 순으로 상위 10개. */
export async function fetchTopScores(rulePreset: RulePresetId = 'default'): Promise<LbEntry[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('leaderboard')
    .select('nickname, score, mode, created_at')
    .eq('rule_preset_id', rulePreset)
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as LbEntry[];
}

/** 점수 제출(서버가 규칙별 Top10 초과분 정리). */
export async function submitScore(
  nickname: string,
  score: number,
  mode: LbMode,
  rulePreset: RulePresetId = 'default',
): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('리더보드 서버가 설정되지 않았습니다.');
  const { error } = await supabase.rpc('submit_score', {
    p_nickname: nickname.trim().slice(0, 24),
    p_score: Math.round(score),
    p_mode: mode,
    p_rule_preset: rulePreset,
  });
  if (error) throw error;
}
