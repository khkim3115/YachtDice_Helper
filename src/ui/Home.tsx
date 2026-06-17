import { useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { useAppStore } from '../store/appStore';
import { useMultiplayerStore } from '../store/multiplayerStore';
import { DownloadCards } from './DownloadCards';
import { Header } from './Header';

const MAX_OPTIONS = [2, 3, 4];

export function Home() {
  const setScreen = useAppStore((s) => s.setScreen);
  const createRoom = useMultiplayerStore((s) => s.createRoom);
  const joinRoom = useMultiplayerStore((s) => s.joinRoom);
  const busy = useMultiplayerStore((s) => s.busy);
  const error = useMultiplayerStore((s) => s.error);
  const clearError = useMultiplayerStore((s) => s.clearError);

  const [name, setName] = useState(() => localStorage.getItem('yd_mp_name') ?? '');
  const [helperAllowed, setHelperAllowed] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [code, setCode] = useState('');

  const nameOk = name.trim().length > 0;

  function rememberName() {
    localStorage.setItem('yd_mp_name', name.trim());
  }

  async function onCreate() {
    if (!nameOk || busy) return;
    rememberName();
    const ok = await createRoom(name.trim(), helperAllowed, maxPlayers);
    if (ok) setScreen('lobby');
  }

  async function onJoin() {
    if (!nameOk || !code.trim() || busy) return;
    rememberName();
    const ok = await joinRoom(code, name.trim());
    if (ok) setScreen('lobby');
  }

  return (
    <div className="app">
      <Header title="YACHT DICE" subtitle="요트다이스" />

      <div className="home">
        <button className="home-solo" onClick={() => setScreen('solo')}>
          <span className="hs-icon">🎲</span>
          <span className="hs-text">
            <b>혼자 하기</b>
            <small>최적 EV 헬퍼와 함께 점수 도전</small>
          </span>
        </button>

        <button
          className="home-solo home-leaderboard"
          onClick={() => setScreen('leaderboard')}
        >
          <span className="hs-icon">🏆</span>
          <span className="hs-text">
            <b>리더보드</b>
            <small>헬퍼 없이 달성한 Top 10 점수</small>
          </span>
        </button>

        <div className="home-mp">
          <h2>온라인 멀티플레이</h2>

          {!isSupabaseConfigured ? (
            <div className="mp-disabled">
              멀티플레이 서버가 설정되지 않았습니다. (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
            </div>
          ) : (
            <>
              <label className="field">
                <span>닉네임</span>
                <input
                  value={name}
                  maxLength={24}
                  placeholder="표시할 이름"
                  onChange={(e) => {
                    setName(e.target.value);
                    if (error) clearError();
                  }}
                />
              </label>

              <div className="mp-cards">
                <div className="mp-card">
                  <h3>방 만들기</h3>
                  <div className="mp-row">
                    <span>인원</span>
                    <div className="seg">
                      {MAX_OPTIONS.map((n) => (
                        <button
                          key={n}
                          className={maxPlayers === n ? 'on' : ''}
                          onClick={() => setMaxPlayers(n)}
                        >
                          {n}명
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mp-row">
                    <span>헬퍼 허용</span>
                    <button
                      className={`switch ${helperAllowed ? 'on' : ''}`}
                      role="switch"
                      aria-checked={helperAllowed}
                      onClick={() => setHelperAllowed((v) => !v)}
                    />
                  </div>
                  <button className="mp-primary" disabled={!nameOk || busy} onClick={onCreate}>
                    방 만들기
                  </button>
                </div>

                <div className="mp-card">
                  <h3>방 참여</h3>
                  <label className="field">
                    <span>초대 코드</span>
                    <input
                      value={code}
                      maxLength={6}
                      placeholder="예: K8XCRY"
                      style={{ textTransform: 'uppercase', letterSpacing: '2px' }}
                      onChange={(e) => {
                        setCode(e.target.value.toUpperCase());
                        if (error) clearError();
                      }}
                    />
                  </label>
                  <button
                    className="mp-primary"
                    disabled={!nameOk || !code.trim() || busy}
                    onClick={onJoin}
                  >
                    참여하기
                  </button>
                </div>
              </div>

              {error && <div className="mp-error">{error}</div>}
            </>
          )}
        </div>

        <DownloadCards />
      </div>
    </div>
  );
}
