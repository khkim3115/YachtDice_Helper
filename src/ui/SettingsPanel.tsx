import { RULE_PRESETS } from '../core/rules';
import type { RulePresetId } from '../core/rules';
import { useGameStore } from '../store/gameStore';

const PRESET_ORDER: RulePresetId[] = ['default', 'additional'];

function Switch({
  on,
  onClick,
  disabled = false,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={`switch ${on ? 'on' : ''}`}
      onClick={disabled ? undefined : onClick}
      role="switch"
      aria-checked={on}
      aria-disabled={disabled}
      disabled={disabled}
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
  const rulePreset = useGameStore((s) => s.rulePreset);
  const setRulePreset = useGameStore((s) => s.setRulePreset);
  const helperSupported = RULE_PRESETS[rulePreset].helperSupported;

  return (
    <div className="settings" onClick={onClose}>
      <div className="settings-card" onClick={(e) => e.stopPropagation()}>
        <h3>설정</h3>

        <div className="setting-group">
          <div className="t-name">규칙</div>
          <div className="preset-seg" role="radiogroup" aria-label="규칙 선택">
            {PRESET_ORDER.map((id) => {
              const p = RULE_PRESETS[id];
              return (
                <button
                  key={id}
                  className={`preset-opt ${rulePreset === id ? 'active' : ''}`}
                  role="radio"
                  aria-checked={rulePreset === id}
                  onClick={() => setRulePreset(id)}
                >
                  {p.ko}
                </button>
              );
            })}
          </div>
          <div className="t-desc preset-desc">{RULE_PRESETS[rulePreset].desc}</div>
          {rulePreset !== 'default' && (
            <div className="preset-warn">⚠️ 규칙을 바꾸면 새 게임으로 시작합니다.</div>
          )}
        </div>

        <div className="toggle">
          <div className="tinfo">
            <div className="t-name">헬퍼 사용</div>
            <div className="t-desc">
              {helperSupported ? '최적의 수와 점수 확률을 표시' : '추가 룰에서는 헬퍼를 지원하지 않습니다'}
            </div>
          </div>
          <Switch
            on={settings.helperEnabled && helperSupported}
            disabled={!helperSupported}
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

        {settings.helperEnabled && helperSupported && (
          <div className="settings-status">헬퍼 데이터: {STATUS_TEXT[tableStatus]}</div>
        )}

        <button className="settings-close" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
