// 초보자용 게임 가이드 + 사이트 설명 모달. SettingsPanel 패턴을 따르되 내용이 길어 카드 스크롤.
// 점수/카테고리는 모두 rules.ts(단일 진실원본)에서 가져와 보간한다 — 룰을 바꿔도 자동 일치.

import { useEffect } from 'react';
import { CATEGORY_IDS, CATEGORY_META, DEFAULT_RULES, DICE_COUNT, ROLLS_PER_TURN } from '../core/rules';
import type { CategoryId } from '../core/rules';

const UPPER_IDS = CATEGORY_IDS.filter((id) => CATEGORY_META[id].section === 'upper');
const LOWER_IDS = CATEGORY_IDS.filter((id) => CATEGORY_META[id].section === 'lower');
const { upperBonusThreshold, upperBonusAmount, smallStraightScore, largeStraightScore, yachtScore } =
  DEFAULT_RULES;

/** 하단 조합별 점수 규칙 설명(룰 값에서 보간). */
const LOWER_RULE: Partial<Record<CategoryId, string>> = {
  choice: '주사위 5개 합',
  fourKind: '같은 눈 4개 이상 → 5개 합',
  fullHouse: '3개 + 2개 → 5개 합',
  smallStraight: `연속된 눈 4개 → ${smallStraightScore}점`,
  largeStraight: `연속된 눈 5개 → ${largeStraightScore}점`,
  yacht: `같은 눈 5개 → ${yachtScore}점`,
};

/** 카테고리 한 줄(이름 + 점수 규칙). */
function RuleRow({ id, rule }: { id: CategoryId; rule: string }) {
  const meta = CATEGORY_META[id];
  return (
    <div className="help-rule">
      <span className="name">
        {meta.ko} <span className="en">{meta.en}</span>
      </span>
      <span className="pts">{rule}</span>
    </div>
  );
}

export function HelpPanel({ onClose }: { onClose: () => void }) {
  // ESC 로 닫기(기존 모달엔 없던 작은 개선).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="help" onClick={onClose}>
      <div
        className="help-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="도움말"
      >
        <h3>도움말 — 요트다이스 처음이라면</h3>

        <h4>🎲 이 사이트는?</h4>
        <p>
          혼자서 즐기는 요트다이스(Yacht Dice) 점수 도전 게임이에요. 다른 사람과 겨루는 게 아니라,
          {' '}12번의 턴 동안 주사위를 잘 굴려 최종 총점을 최대한 높이는 솔로 플레이입니다.
        </p>
        <p>
          처음이라면 그냥 굴리고 점수칸을 채우며 익히면 돼요. 상단의 ⚙️ 설정에서 <b>헬퍼</b>를 켜면,
          {' '}게임 전체를 내다본 최적 기댓값(EV)으로 “지금 어떤 선택이 점수를 가장 높게 가져갈지”를
          {' '}확률과 함께 알려줍니다.
        </p>

        <h4>🎯 게임 목표</h4>
        <p>
          12턴이 끝났을 때의 <b>총점을 최대한 높이는 것</b>이 목표예요.
          <br />
          총점 = 상단 점수 + 상단 보너스(조건 충족 시 +{upperBonusAmount}) + 하단 점수.
          <br />
          참고로 최적 플레이의 기대 평균은 <b>약 192점</b>이에요. 이걸 넘기는 걸 목표로 삼아도 좋아요.
        </p>

        <h4>🔁 한 턴은 이렇게 흘러가요</h4>
        <p>
          주사위는 {DICE_COUNT}개, 한 턴에 최대 {ROLLS_PER_TURN}번 굴릴 수 있어요
          {' '}(최초 1번 + 다시 굴리기 2번).
        </p>
        <ol className="help-steps">
          <li>먼저 5개를 모두 굴립니다.</li>
          <li>마음에 드는 주사위는 남겨두고(보관), 나머지만 다시 굴립니다. 최대 2번 더 굴릴 수 있어요.</li>
          <li>결과가 마음에 들면 점수칸 하나를 골라 기록합니다.</li>
        </ol>
        <p>
          게임은 총 12턴 = 12칸이에요. 한 번 기록한 칸은 다시 쓸 수 없고(0점 기록도 가능), 12칸을
          {' '}모두 채우면 끝나요.
        </p>

        <h4>🕹️ 이 화면에서 플레이하는 법</h4>
        <ul className="help-list">
          <li><b>굴리기 버튼</b>: 주사위를 굴려요. 첫 굴림 후엔 ‘다시 굴리기’로 바뀌고 턴당 2번까지 눌러요.</li>
          <li><b>주사위 클릭</b>: 남기고 싶은 주사위를 클릭하면 보관돼요. 다시 클릭하면 보관이 풀려요.</li>
          <li><b>점수칸 클릭</b>: 오른쪽 점수표의 빈 칸을 클릭하면 지금 주사위로 기록되고 다음 턴으로 넘어가요.</li>
          <li><b>총점</b>: 화면 상단의 ‘총점’ 표시에서 현재 점수를 항상 확인할 수 있어요.</li>
        </ul>

        <h4>⬆️ 상단 점수 (원 ~ 식스)</h4>
        <p>각 칸은 “그 숫자의 눈만” 모아서 합을 냅니다.</p>
        {UPPER_IDS.map((id) => (
          <RuleRow key={id} id={id} rule={CATEGORY_META[id].desc} />
        ))}
        <p>예: 주사위가 3,3,3,5,1 이면 쓰리 칸은 3+3+3 = 9점.</p>

        <h4>⭐ 상단 보너스 (+{upperBonusAmount}점)</h4>
        <p>
          상단(원~식스) 6칸의 합계가 <b>{upperBonusThreshold}점 이상</b>이면 보너스 {upperBonusAmount}점을
          {' '}추가로 받아요. 대략 “각 숫자를 3개씩 맞춘 정도”의 기준선이니, 초반부터 신경 써서 채우는 게 좋아요.
        </p>

        <h4>⬇️ 하단 점수 (조합)</h4>
        {LOWER_IDS.map((id) => (
          <RuleRow key={id} id={id} rule={LOWER_RULE[id] ?? CATEGORY_META[id].desc} />
        ))}

        <h4>💡 초보자 팁</h4>
        <ul className="help-list">
          <li>채울 게 없으면 점수 낮은 상단 칸(원·투 등)에 0점을 넣는 ‘버리기’도 전략이에요.</li>
          <li>상단 보너스({upperBonusThreshold}점→+{upperBonusAmount})는 꽤 크니, 식스·파이브부터 챙기면 유리해요.</li>
          <li>요트·라지 스트레이트는 욕심내볼 만하지만, 남은 굴림 횟수를 보고 무리하지 마세요.</li>
        </ul>

        <h4>🤖 헬퍼는 무엇을 알려주나요 (⚙️ 설정에서 켜기)</h4>
        <ul className="help-list">
          <li><b>최적 행동 배너</b>: “지금 «카테고리»에 기록” 또는 “«주사위» 보관하고 다시 굴리기”.</li>
          <li><b>추천 주사위·칸 하이라이트</b>: 무엇을 남기고 어떤 칸에 넣으면 좋은지 표시.</li>
          <li><b>카테고리별 EV</b>: 지금 기록할 때 점수 vs 다시 굴렸을 때 기대 점수(+증가폭).</li>
          <li><b>콤보 확률</b>: 요트·라지·스몰·풀하우스·포카드 달성 확률.</li>
          <li><b>예상 최종 점수</b>: 지금부터 최적으로 플레이했을 때 기대 총점.</li>
        </ul>
        <p>헬퍼는 정답을 강요하지 않아요. 따라 해보며 “왜 이게 더 좋은지” 감을 익히는 학습 도구로 쓰면 좋아요.</p>

        <button className="help-close" onClick={onClose} autoFocus>
          닫기
        </button>
      </div>
    </div>
  );
}
