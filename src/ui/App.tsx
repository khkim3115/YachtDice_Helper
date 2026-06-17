import { useEffect, useState } from 'react';
import { grandTotal } from '../core/gameState';
import { useAppStore } from '../store/appStore';
import { useGameStore } from '../store/gameStore';
import { useAdvice } from '../store/useAdvice';
import { DiceTray } from './DiceTray';
import { Scorecard } from './Scorecard';
import { HelperPanel } from './HelperPanel';
import { SettingsPanel } from './SettingsPanel';
import { HelpPanel } from './HelpPanel';
import { GameOver } from './GameOver';
import { InstallButton } from './InstallButton';
import { PwaStatus } from './PwaStatus';

export default function App() {
  const card = useGameStore((s) => s.card);
  const rules = useGameStore((s) => s.rules);
  const helperEnabled = useGameStore((s) => s.settings.helperEnabled);
  const loadTable = useGameStore((s) => s.loadTable);
  const gameOver = useGameStore((s) => s.gameOver());
  const resultOpen = useGameStore((s) => s.resultOpen);
  const setResultOpen = useGameStore((s) => s.setResultOpen);
  const theme = useGameStore((s) => s.theme);
  const toggleTheme = useGameStore((s) => s.toggleTheme);
  const setScreen = useAppStore((s) => s.setScreen);
  const markHelperUsed = useGameStore((s) => s.markHelperUsed);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const advice = useAdvice();
  const total = grandTotal(card, rules);

  // 조언이 실제로 표시되는 순간 "헬퍼 사용"으로 기록(리더보드 등록 자격 판단).
  useEffect(() => {
    if (advice) markHelperUsed();
  }, [advice, markHelperUsed]);

  // 헬퍼 데이터는 백그라운드로 미리 받아둔다(토글 시 즉시 동작).
  useEffect(() => {
    void loadTable();
  }, [loadTable]);

  // 처음 방문한 사용자에게는 도움말을 한 번 자동으로 띄운다.
  useEffect(() => {
    try {
      if (!localStorage.getItem('yd_seen_guide')) setHelpOpen(true);
    } catch {
      // localStorage 사용 불가(사파리 사생활 모드 등) — 자동 표시만 생략.
    }
  }, []);

  const handleHelpClose = () => {
    setHelpOpen(false);
    try {
      localStorage.setItem('yd_seen_guide', '1');
    } catch {
      // 저장 실패는 무시(다음 방문에 다시 떠도 무방).
    }
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <h1>YACHT DICE</h1>
          <span className="sub">요트다이스</span>
        </div>
        <div className="topbar-right">
          <button className="theme-btn" onClick={() => setScreen('home')} aria-label="메뉴" title="메뉴로">
            🏠
          </button>
          <div className="score-pill">
            <span className="label">총점</span>
            <span className="value">{total}</span>
          </div>
          {gameOver && !resultOpen && (
            <button className="result-btn" onClick={() => setResultOpen(true)}>
              🏁 결과
            </button>
          )}
          <button
            className="theme-btn"
            onClick={toggleTheme}
            aria-label="테마 전환"
            title={theme === 'dark' ? '라이트 모드로' : '다크 모드로'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button className="help-btn" onClick={() => setHelpOpen(true)} aria-label="도움말">
            ❓
          </button>
          <InstallButton />
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

      {helpOpen && <HelpPanel onClose={handleHelpClose} />}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {gameOver && resultOpen && <GameOver />}
      <PwaStatus />
    </div>
  );
}
