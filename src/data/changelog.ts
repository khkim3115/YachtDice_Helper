// 패치노트(체인지로그)의 단일 진실원본. 순수 데이터 모듈 — React/DOM 의존 없음.
// 새 버전을 낼 때 CHANGELOG 맨 위(index 0)에 항목을 추가하면 LATEST_VERSION 이 자동 갱신되고
// 헤더 NEW 배지·자동 노출이 동작한다. (package.json 버전과는 분리 — 여기가 사용자에게 보이는 버전.)

/** 변경 종류. 칩 색/아이콘/라벨의 키. 순서가 곧 상세 화면의 그룹 표시 순서. */
export const CHANGE_TYPES = ['feature', 'improvement', 'fix'] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

/** 종류별 표시 메타(라벨·이모지). 색은 index.css 의 .pn-chip-{type} 가 담당. */
export const CHANGE_TYPE_META: Record<ChangeType, { ko: string; emoji: string }> = {
  feature: { ko: '새 기능', emoji: '✨' },
  improvement: { ko: '개선', emoji: '🔧' },
  fix: { ko: '버그 수정', emoji: '🐛' },
};

export interface ChangeItem {
  type: ChangeType;
  text: string;
}

export interface ChangelogEntry {
  /** 사용자에게 보이는 버전(단일 진실원본). 'seen' 추적 키로도 쓰임. */
  version: string;
  /** 배포일 ISO 'YYYY-MM-DD'. */
  date: string;
  /** 목록에 노출되는 한 줄 요약. */
  title: string;
  changes: ChangeItem[];
}

/** 최신이 [0]. 날짜 내림차순 유지(테스트로 강제). 콘텐츠는 git 이력 기반. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.5.0',
    date: '2026-06-26',
    title: '피드백 보내기 추가',
    changes: [
      {
        type: 'feature',
        text: '상단 💬 버튼으로 버그 제보·기능 건의를 보낼 수 있어요. 계정 없이 익명으로 보내져요.',
      },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-06-24',
    title: '패치노트 화면 추가',
    changes: [
      { type: 'feature', text: '앱 안에서 업데이트 내역을 확인할 수 있는 패치노트 화면을 추가했어요.' },
      {
        type: 'feature',
        text: '새 버전이 나오면 처음 한 번 자동으로 보여주고, 헤더 버튼에 NEW 배지가 표시돼요.',
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-06-21',
    title: "명칭 정리 · 트레이 앱 테마 전환",
    changes: [
      { type: 'improvement', text: "사이트 곳곳의 '야추' 표기를 '요트'로 통일했어요." },
      { type: 'feature', text: '트레이 앱에서도 라이트/다크 모드를 전환할 수 있어요.' },
      { type: 'fix', text: '트레이 창 크기가 간혹 잘못 잡히던 문제를 고쳤어요.' },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-06-18',
    title: '편의 기능 강화',
    changes: [
      { type: 'feature', text: '설정·테마·도움말 버튼을 모든 화면 공통 상단바로 정리했어요.' },
      { type: 'feature', text: '싱글플레이에 되돌리기 버튼을 추가했어요. (리더보드 등록은 무효)' },
      { type: 'fix', text: '한 게임 점수가 리더보드에 중복 등록되던 문제를 막았어요.' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-06-17',
    title: '멀티플레이 · 리더보드 · 앱 설치',
    changes: [
      { type: 'feature', text: '친구와 같은 방에서 겨루는 온라인 멀티플레이(방 + 초대코드)를 추가했어요.' },
      { type: 'feature', text: '헬퍼 없이 달성한 Top 10 리더보드를 추가했어요.' },
      { type: 'feature', text: 'PWA 설치와 오프라인 플레이를 지원해요. (작업표시줄에서 바로 실행)' },
      { type: 'feature', text: '라이트/다크 테마 전환과 시스템 트레이 데스크톱 앱을 추가했어요.' },
    ],
  },
  {
    version: '0.0.1',
    date: '2026-06-14',
    title: '첫 공개 — 솔로 플레이 + EV 헬퍼',
    changes: [
      {
        type: 'feature',
        text: '요트다이스 솔로 점수 도전과 게임 전체를 내다본 최적 기댓값(EV) 헬퍼를 처음 공개했어요.',
      },
    ],
  },
];

/** 가장 최신 버전 문자열. NEW 배지·자동 노출의 기준값. */
export const LATEST_VERSION = CHANGELOG[0].version;

/**
 * seenVersion(마지막으로 확인한 버전) 기준 '아직 못 본' 최신 항목 개수.
 * 목록 상단부터 이 개수만큼 NEW 로 표시한다.
 * - 확인 버전을 목록에서 찾으면: 그 위(더 최신)에 있는 항목 수.
 * - 못 찾으면(최초 방문 '' 또는 알 수 없는 버전): 최신 1개만 — 전부 NEW 는 과하므로.
 */
export function unseenCount(seenVersion: string): number {
  const idx = CHANGELOG.findIndex((e) => e.version === seenVersion);
  return idx >= 0 ? idx : 1;
}

const MS_PER_DAY = 86_400_000;

function isoToUtcDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/**
 * 'YYYY-MM-DD' 를 한국어 상대 시간으로. UTC 기준 일수 차이로 계산해 TZ 에 무관하게 결정적.
 * (테스트 위해 now 주입 가능; 런타임에선 Date.now() 기본값.)
 */
export function relativeTime(iso: string, nowMs: number = Date.now()): string {
  const days = Math.floor(nowMs / MS_PER_DAY) - isoToUtcDay(iso);
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}
