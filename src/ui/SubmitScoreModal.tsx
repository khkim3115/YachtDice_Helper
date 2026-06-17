// 리더보드 점수 등록 모달. 솔로/멀티 게임오버에서 띄운다(게임오버 위에 떠야 하므로 z-index 높음).
import { useState } from 'react';
import { submitScore, type LbMode } from '../lib/leaderboard';

export function SubmitScoreModal({
  score,
  mode,
  defaultName,
  onClose,
  onSubmitted,
}: {
  score: number;
  mode: LbMode;
  defaultName?: string;
  onClose: () => void;
  /** 등록 성공 시 1회 호출(부모가 재등록 방지 상태를 기록). */
  onSubmitted?: () => void;
}) {
  const [name, setName] = useState(defaultName ?? '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOk = name.trim().length > 0;

  async function onSubmit() {
    if (!nameOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      await submitScore(name, score, mode);
      try {
        localStorage.setItem('yd_mp_name', name.trim());
      } catch {
        // 저장 실패는 무시.
      }
      setDone(true);
      onSubmitted?.();
    } catch (e) {
      setError((e as { message?: string })?.message ?? '등록에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lb-overlay" onClick={onClose}>
      <div className="settings-card lb-submit" onClick={(e) => e.stopPropagation()}>
        <h3>리더보드 등록</h3>

        {done ? (
          <>
            <p className="lb-submit-done">🏆 {score}점이 리더보드에 등록되었습니다!</p>
            <button className="settings-close" onClick={onClose}>
              닫기
            </button>
          </>
        ) : (
          <>
            <div className="lb-submit-score">
              <span className="label">내 점수</span>
              <b>{score}</b>
            </div>

            <label className="field">
              <span>닉네임</span>
              <input
                value={name}
                maxLength={24}
                placeholder="표시할 이름"
                autoFocus
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onSubmit();
                }}
              />
            </label>

            {error && <div className="mp-error">{error}</div>}

            <div className="go-actions">
              <button className="ghost-btn" onClick={onClose}>
                취소
              </button>
              <button
                className="mp-primary lb-submit-btn"
                disabled={!nameOk || busy}
                onClick={() => void onSubmit()}
              >
                {busy ? '등록 중…' : '등록'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
