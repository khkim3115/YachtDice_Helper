import { useEffect } from 'react';
import { RULE_PRESETS } from '../core/rules';
import { grandTotal } from '../core/gameState';
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

  const advice = useAdvice();
  const total = grandTotal(card, rules);

  // 조언이 실제로 표시되는 순간 "헬퍼 사용"으로 기록(리더보드 등록 자격 판단).
  useEffect(() => {
    if (advice) markHelperUsed();
  }, [advice, markHelperUsed]);

  // 헬퍼 데이터는 백그라운드로 미리 받아둔다(토글 시 즉시 동작). 추가 룰에서는 건너뛴다.
  useEffect(() => {
    if (helperSupported) void loadTable();
  }, [loadTable, helperSupported]);

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
