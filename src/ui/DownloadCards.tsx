import { useEffect, useState } from 'react';

// 트레이 앱 설치 파일은 GitHub Releases 에 올라가며, 'latest' URL 로 항상 최신본을 받는다.
// (자산 이름을 YachtDice-Tray-Setup.exe 로 고정하면 이 링크가 계속 유효)
const TRAY_EXE_URL =
  'https://github.com/khkim3115/YachtDice_Helper/releases/latest/download/YachtDice-Tray-Setup.exe';

interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  prompt(): Promise<void>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** 홈 화면 "앱으로 받기" — 데스크탑 앱(PWA 설치) + 트레이 앱(.exe 다운로드). */
export function DownloadCards() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const installPwa = async () => {
    if (promptEvent) {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      setPromptEvent(null);
    } else {
      // 프롬프트가 없으면(이미 설치/미지원 브라우저 등) 수동 설치 안내를 토글.
      setShowGuide((v) => !v);
    }
  };

  return (
    <div className="home-downloads">
      <h2>앱으로 받기</h2>
      <div className="dl-cards">
        <div className="dl-card">
          <span className="dl-icon">🖥️</span>
          <span className="dl-text">
            <b>데스크탑 앱</b>
            <small>브라우저에 설치 — 작업표시줄·시작 메뉴에서 실행</small>
          </span>
          <button className="dl-btn" onClick={installPwa} disabled={installed}>
            {installed ? '설치됨 ✓' : '⬇ 앱 설치'}
          </button>
        </div>

        <div className="dl-card">
          <span className="dl-icon">🔔</span>
          <span className="dl-text">
            <b>
              트레이 앱 <small className="dl-os">Windows</small>
            </b>
            <small>시스템 트레이에서 작게 즐기는 미니 버전</small>
          </span>
          <a className="dl-btn" href={TRAY_EXE_URL}>
            ⬇ 다운로드
          </a>
        </div>
      </div>

      {showGuide && !installed && (
        <div className="dl-guide">
          주소창의 설치 아이콘(⊕), 또는 브라우저 메뉴 → <b>앱 설치 / Install</b> 를 선택하세요.
          (Chrome·Edge 지원)
        </div>
      )}
    </div>
  );
}
