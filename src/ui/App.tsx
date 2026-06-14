import { useEffect, useState } from 'react';
import { grandTotal } from '../core/gameState';
import { useGameStore } from '../store/gameStore';
import { useAdvice } from '../store/useAdvice';
import { DiceTray } from './DiceTray';
import { Scorecard } from './Scorecard';
import { HelperPanel } from './HelperPanel';
import { SettingsPanel } from './SettingsPanel';
import { GameOver } from './GameOver';

export default function App() {
  const card = useGameStore((s) => s.card);
  const rules = useGameStore((s) => s.rules);
  const helperEnabled = useGameStore((s) => s.settings.helperEnabled);
  const loadTable = useGameStore((s) => s.loadTable);
  const gameOver = useGameStore((s) => s.gameOver());
  const resultOpen = useGameStore((s) => s.resultOpen);
  const setResultOpen = useGameStore((s) => s.setResultOpen);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const advice = useAdvice();
  const total = grandTotal(card, rules);

  // 헬퍼 데이터는 백그라운드로 미리 받아둔다(토글 시 즉시 동작).
  useEffect(() => {
    void loadTable();
  }, [loadTable]);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <h1>YACHT DICE</h1>
          <span className="sub">요트다이스</span>
        </div>
        <div className="topbar-right">
          <div className="score-pill">
            <span className="label">총점</span>
            <span className="value">{total}</span>
          </div>
          {gameOver && !resultOpen && (
            <button className="result-btn" onClick={() => setResultOpen(true)}>
              🏁 결과
            </button>
          )}
          <button className="gear" onClick={() => setSettingsOpen(true)} aria-label="설정">
            ⚙️
          </button>
        </div>
      </div>

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

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {gameOver && resultOpen && <GameOver />}
    </div>
  );
}
