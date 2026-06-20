import { useGameStore } from '../store/gameStore';

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      className={`switch ${on ? 'on' : ''}`}
      onClick={onClick}
      role="switch"
      aria-checked={on}
    />
  );
}

const STATUS_TEXT: Record<string, string> = {
  idle: '대기',
  loading: '로딩 중…',
  ready: '준비됨',
  error: '오류 (V.bin 확인)',
};

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);
  const tableStatus = useGameStore((s) => s.tableStatus);

  return (
    <div className="settings" onClick={onClose}>
      <div className="settings-card" onClick={(e) => e.stopPropagation()}>
        <h3>설정</h3>

        <div className="toggle">
          <div className="tinfo">
            <div className="t-name">헬퍼 사용</div>
            <div className="t-desc">최적의 수와 점수 확률을 표시</div>
          </div>
          <Switch
            on={settings.helperEnabled}
            onClick={() => setSettings({ helperEnabled: !settings.helperEnabled })}
          />
        </div>

        <div className="toggle">
          <div className="tinfo">
            <div className="t-name">콤보 확률 표시</div>
            <div className="t-desc">요트·스트레이트 등 달성 확률</div>
          </div>
          <Switch
            on={settings.showProbabilities}
            onClick={() => setSettings({ showProbabilities: !settings.showProbabilities })}
          />
        </div>

        <div className="toggle">
          <div className="tinfo">
            <div className="t-name">추천 하이라이트</div>
            <div className="t-desc">추천 주사위·칸을 색으로 강조</div>
          </div>
          <Switch
            on={settings.highlightSuggestion}
            onClick={() => setSettings({ highlightSuggestion: !settings.highlightSuggestion })}
          />
        </div>

        {settings.helperEnabled && (
          <div className="settings-status">헬퍼 데이터: {STATUS_TEXT[tableStatus]}</div>
        )}

        <button className="settings-close" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
