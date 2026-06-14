// 턴 내부 동적계획. 게임 전체 가치(full-optimal), 카테고리별 EV, 콤보 확률이 모두
// 동일한 재귀를 공유한다 — 0-리롤 leaf 값만 갈아끼우면 된다.
//
//   value[0][h] = leaf[h]                                  (반드시 기록해야 하는 상태)
//   value[r][h] = max over keeps K⊆h of Σ prob·value[r-1][child]   (r≥1)
//
// keep 전체 보관(=리롤 안 함)이 keep 집합에 포함되므로 "지금 멈추고 기록" 선택지는
// value[r-1] 로 자연히 흡수된다(value[r] ≥ value[r-1], 단조).

import {
  HAND_COUNT,
  KEEP_COUNT,
  handKeeps,
  keepChildren,
  keepSizes,
  firstRollProb,
} from '../core/dice';

/** leaf(길이 HAND_COUNT)로부터 value[0..maxRerolls] 레이어들을 계산. */
export function solveLayers(leaf: Float64Array, maxRerolls: number): Float64Array[] {
  const layers: Float64Array[] = [leaf];
  for (let r = 1; r <= maxRerolls; r++) {
    const prev = layers[r - 1];
    const keepEV = new Float64Array(KEEP_COUNT);
    for (let k = 0; k < KEEP_COUNT; k++) {
      const children = keepChildren[k];
      let ev = 0;
      for (let j = 0; j < children.length; j++) {
        ev += children[j].prob * prev[children[j].childHand];
      }
      keepEV[k] = ev;
    }
    const cur = new Float64Array(HAND_COUNT);
    for (let h = 0; h < HAND_COUNT; h++) {
      const keeps = handKeeps[h];
      let best = -Infinity;
      for (let i = 0; i < keeps.length; i++) {
        const v = keepEV[keeps[i]];
        if (v > best) best = v;
      }
      cur[h] = best;
    }
    layers.push(cur);
  }
  return layers;
}

const EPS = 1e-9;

export interface BestKeepResult {
  keepIndex: number;
  ev: number;
}

/**
 * 현재 손패에서 리롤 1회 이상 남았을 때, prevLayer(value[r-1])를 이용해 최적 보관셋을 찾는다.
 * 동점 시 더 많이 보관(리롤 최소)하는 쪽을 선호 → 무의미한 리롤 권장 방지.
 */
export function bestKeep(prevLayer: Float64Array, handIndex: number): BestKeepResult {
  const keeps = handKeeps[handIndex];
  let bestK = -1;
  let bestEV = -Infinity;
  for (let i = 0; i < keeps.length; i++) {
    const k = keeps[i];
    const children = keepChildren[k];
    let ev = 0;
    for (let j = 0; j < children.length; j++) {
      ev += children[j].prob * prevLayer[children[j].childHand];
    }
    if (ev > bestEV + EPS || (ev > bestEV - EPS && bestK >= 0 && keepSizes[k] > keepSizes[bestK])) {
      bestEV = ev;
      bestK = k;
    }
  }
  return { keepIndex: bestK, ev: bestEV };
}

/** 턴 시작값: 신규 굴림 분포에 대한 value[maxRerolls] 의 기댓값. */
export function turnStartValue(topLayer: Float64Array): number {
  let v = 0;
  for (let h = 0; h < HAND_COUNT; h++) v += firstRollProb[h] * topLayer[h];
  return v;
}
