import { useEffect, useState } from 'react';

// 트레이 앱 설치 파일은 GitHub Releases 에 올라가며, 'latest' URL 로 항상 최신본을 받는다.
// (자산 이름을 고정해야 이 링크가 계속 유효 — Windows: YachtDice-Tray-Setup.exe, macOS: YachtDice-Tray.dmg)
const TRAY_EXE_URL =
  'https://github.com/khkim3115/YachtDice_Helper/releases/latest/download/YachtDice-Tray-Setup.exe';
const TRAY_DMG_URL =
  'https://github.com/khkim3115/YachtDice_Helper/releases/latest/download/YachtDice-Tray.dmg';

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

/** 홈 화면 "앱으로 받기" — PWA 설치 · Windows 트레이(.exe) · macOS 트레이(.dmg) · 무설치 미니 창(PiP). */
export function DownloadCards() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [showGuide, setShowGuide] = useState(false);
  const [showMacGuide, setShowMacGuide] = useState(false);

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
            <small>브라우저에 설치 — 작업표시줄·시작 메뉴/Dock 에서 실행</small>
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
            <small>시스템 트레이에서 작게 즐기는 미니 버전 (항상 위·투명도 조절)</small>
          </span>
          <a className="dl-btn" href={TRAY_EXE_URL}>
            ⬇ 다운로드
          </a>
        </div>

        <div className="dl-card">
          <span className="dl-icon">🍎</span>
          <span className="dl-text">
            <b>
              트레이 앱 <small className="dl-os">macOS</small>
            </b>
            <small>메뉴 막대에 상주 — Windows판과 동일한 항상 위·투명도 조절·무채색 위장</small>
          </span>
          <a className="dl-btn" href={TRAY_DMG_URL} onClick={() => setShowMacGuide(true)}>
            ⬇ 다운로드
          </a>
        </div>

        <div className="dl-card">
          <span className="dl-icon">🔳</span>
          <span className="dl-text">
            <b>
              미니 창 <small className="dl-os">모든 Chromium · 무설치</small>
            </b>
            <small>
              헤더의 <b>🔳 미니 창</b> 버튼 → 항상 위에 뜨는 작은 저채도 패널을 설치 없이 바로 띄워요
              (Windows·macOS·Linux 의 Chrome·Edge). Safari·Firefox 는 미지원이에요.
            </small>
          </span>
        </div>
      </div>

      {showMacGuide && (
        <div className="dl-guide">
          <b>macOS 첫 실행 안내</b> — 무료 배포라 코드 서명이 없어, 처음 한 번만 Gatekeeper 허용이
          필요해요. <b>Yacht Dice</b> 를 <b>응용 프로그램</b> 폴더로 옮긴 뒤 실행 → 차단되면{' '}
          <b>설정 ▸ 개인정보 보호 및 보안</b> 맨 아래의 <b>“무시하고 열기”</b>. 또는 터미널에{' '}
          <code>xattr -dr com.apple.quarantine /Applications/'Yacht Dice.app'</code> 한 줄을 붙여넣으면
          돼요. 한 번 허용하면 이후엔 평범하게 실행됩니다. (자동 업데이트는 없어 새 버전은 여기서 다시
          받아주세요.)
        </div>
      )}

      {showGuide && !installed && (
        <div className="dl-guide">
          주소창의 설치 아이콘(⊕), 또는 브라우저 메뉴 → <b>앱 설치 / Install</b> 를 선택하세요.
          (Chrome·Edge 지원)
        </div>
      )}
    </div>
  );
}
