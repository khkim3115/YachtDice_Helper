// 모든 화면 공통 상단 바: 브랜드 + (홈/화면별 추가요소) + 테마전환·도움말·설치·설정.
// 설정/도움말 모달 상태는 헤더 로컬 보유(화면 전환 시 언마운트되므로 스토어 불필요).
import { useEffect, useState, type ReactNode } from 'react';
import { useAppStore } from '../store/appStore';
import { useGameStore } from '../store/gameStore';
import { SettingsPanel } from './SettingsPanel';
import { HelpPanel } from './HelpPanel';
import { InstallButton } from './InstallButton';

interface HeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** 🏠 메뉴(홈) 버튼 표시. */
  showHome?: boolean;
  /** 최초 방문 시 도움말 자동 표시(솔로 화면만 사용). */
  autoHelp?: boolean;
  /** 공통 버튼 앞에 끼워 넣을 화면별 요소(점수칩·결과·나가기 등). */
  children?: ReactNode;
}

export function Header({ title, subtitle, showHome, autoHelp, children }: HeaderProps) {
  const setScreen = useAppStore((s) => s.setScreen);
  const theme = useGameStore((s) => s.theme);
  const toggleTheme = useGameStore((s) => s.toggleTheme);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // 처음 방문한 사용자에게는 도움말을 한 번 자동으로 띄운다(솔로 화면 한정).
  useEffect(() => {
    if (!autoHelp) return;
    try {
      if (!localStorage.getItem('yd_seen_guide')) setHelpOpen(true);
    } catch {
      // localStorage 사용 불가(사파리 사생활 모드 등) — 자동 표시만 생략.
    }
  }, [autoHelp]);

  const handleHelpClose = () => {
    setHelpOpen(false);
    try {
      localStorage.setItem('yd_seen_guide', '1');
    } catch {
      // 저장 실패는 무시(다음 방문에 다시 떠도 무방).
    }
  };

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <h1>{title}</h1>
          {subtitle && <span className="sub">{subtitle}</span>}
        </div>
        <div className="topbar-right">
          {showHome && (
            <button className="theme-btn" onClick={() => setScreen('home')} aria-label="메뉴" title="메뉴로">
              🏠
            </button>
          )}
          {children}
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

      {helpOpen && <HelpPanel onClose={handleHelpClose} />}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
