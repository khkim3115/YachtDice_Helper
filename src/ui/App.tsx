import { useEffect } from 'react';
import { RULE_PRESETS } from '../core/rules';
import { filledCount, grandTotal } from '../core/gameState';
import { useAppStore } from '../store/appStore';
import { useGameStore } from '../store/gameStore';
import { useAdvice } from '../store/useAdvice';
import { Header } from './Header';
import { DiceTray } from './DiceTray';
import { Scorecard } from './Scorecard';
import { HelperPanel } from './HelperPanel';
import { GameOver } from './GameOver';
import { PwaStatus } from './PwaStatus';

export default function App() {
  const card = useGameStore((s) => s.card);
  const rules = useGameStore((s) => s.rules);
  const rulePreset = useGameStore((s) => s.rulePreset);
  const helperSupported = RULE_PRESETS[rulePreset].helperSupported;
  const helperEnabled = useGameStore((s) => s.settings.helperEnabled) && helperSupported;
  const loadTable = useGameStore((s) => s.loadTable);
  const gameOver = useGameStore((s) => s.gameOver());
  const resultOpen = useGameStore((s) => s.resultOpen);
  const setResultOpen = useGameStore((s) => s.setResultOpen);
  const markHelperUsed = useGameStore((s) => s.markHelperUsed);
  const setScreen = useAppStore((s) => s.setScreen);
  const newGame = useGameStore((s) => s.newGame);
  const rollsUsed = useGameStore((s) => s.rollsUsed);
  const started = filledCount(card) > 0 || rollsUsed > 0;

  const advice = useAdvice();
  const total = grandTotal(card, rules);

  // 조언이 실제로 표시되는 순간 "헬퍼 사용"으로 기록(리더보드 등록 자격 판단).
  useEffect(() => {
    if (advice) markHelperUsed();
  }, [advice, markHelperUsed]);

  // 헬퍼 데이터는 백그라운드로 미리 받아둔다(토글 시 즉시 동작). 프리셋이 바뀌면 다시 로드.
  useEffect(() => {
    if (helperSupported) void loadTable();
  }, [loadTable, helperSupported, rulePreset]);

  return (
    <div className="app">
      <Header title="YACHT DICE" subtitle="요트다이스" showHome autoHelp>
        <div className="score-pill">
          <span className="label">총점</span>
          <span className="value">{total}</span>
        </div>
        {gameOver && !resultOpen && (
          <button className="result-btn" onClick={() => setResultOpen(true)}>
            🏁 결과
          </button>
        )}
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
      </Header>

      <div className="layout">
        <div className="left">
          <div className="panel">
            <DiceTray advice={advice} />
          </div>
          {helperEnabled && <HelperPanel advice={advice} />}
        </div>
        <div className="panel">
          <Scorecard advice={advice} />
        </div>
      </div>

      {gameOver && resultOpen && <GameOver />}
      <PwaStatus />
    </div>
  );
}
