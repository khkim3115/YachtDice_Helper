// 트레이 헬퍼(#69) 페이지 내부 테스트 — scripts/test-helper.cjs 가 popup.html 에 주입해 단계별로 실행한다.
// popup.html 의 전역(state·render·helper*·mp* 등)을 직접 다룬다. 공용 도우미는 전역 이름 충돌을 피하려
// window.__ydT 하나에, 단계는 window.__ydTest.<단계> 에 둔다. 각 단계는 [{ name, ok, detail }] 를 돌려준다.
window.__ydT = (() => {
  const $ = (s) => document.querySelector(s);
  function collector() {
    const list = [];
    function check(name, cond, detail) {
      list.push(cond ? { name, ok: true } : { name, ok: false, detail: detail === undefined ? undefined : String(detail) });
    }
    return { list, check };
  }
  // 헬퍼 요약 줄 읽기.
  function line(id) {
    const el = $(id);
    return { hidden: el.classList.contains('hidden'), muted: el.classList.contains('muted'), act: el.querySelector('.act').textContent, exp: el.querySelector('.exp').textContent };
  }
  // 창(문서)이 스크롤되지 않는지 — 프레임 없는 고정 크기 창이라 넘치면 스크롤이 생긴다.
  function fits() { const se = document.scrollingElement; return se.scrollHeight <= se.clientHeight && window.scrollY === 0; }
  function sizeOf() { const se = document.scrollingElement; return se.scrollHeight + '/' + se.clientHeight; }
  function key(code, k, extra) {
    document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ code, key: k, bubbles: true, cancelable: true }, extra || {})));
  }
  function setHelper(on) { if (helperOn !== on) toggleHelper(); }
  // 솔로 상태 주입(지정 필드만 덮어씀) 후 다시 그리기.
  function soloState(o) {
    state = Object.assign({ dice: [1, 1, 1, 1, 1], held: [false, false, false, false, false], rolls: 3, rolled: false, filled: {}, master: [], turn: 0 }, o);
    render();
  }
  function marks(sel) { return [...document.querySelectorAll(sel)].map((d) => d.classList.contains('rec')).join(); }
  // fetch 를 가로채 URL 에 needle 이 든 호출 수를 센다(리더보드 등록 2차 방어 검증 — 네트워크 없이).
  function stubFetch(needle) {
    const real = window.fetch;
    const s = { calls: 0, restore() { window.fetch = real; } };
    window.fetch = (url, opts) => {
      if (String(url).includes(needle)) { s.calls++; return Promise.resolve(new Response('{}', { status: 200 })); }
      return real(url, opts);
    };
    return s;
  }
  return { $, collector, line, fits, sizeOf, key, setHelper, soloState, marks, stubFetch };
})();
window.__ydTest = window.__ydTest || {};

// ── 단계 solo: 표시·값·표시자·레이아웃·H 키·비정상 입력·로드 실패 (270×358) ──
window.__ydTest.solo = async () => {
  const { $, collector, line, fits, sizeOf, key, setHelper, soloState, marks } = window.__ydT;
  const { list, check } = collector();
  showScreen('solo');
  document.documentElement.dataset.theme = 'dark';

  // 0) 엔진 번들 + 카테고리 순서(V.bin 비트 인덱스) 일치
  check('엔진 번들 로드', typeof window.YDEngine === 'object' && typeof YDEngine.createAdvisor === 'function');
  check('ENGINE_IDS = CATEGORY_IDS', !!window.YDEngine && YDEngine.CATEGORY_IDS.join() === ENGINE_IDS.join());

  // 1) 기본 OFF — 줄 숨김, 버튼 ◇
  setSoloPreset('default');
  setHelper(false);
  check('OFF: 헬퍼 줄 숨김', line('#helper-line').hidden);
  check('OFF: 버튼 ◇ · aria-pressed=false', $('#helper-solo').textContent.includes('◇') && $('#helper-solo').getAttribute('aria-pressed') === 'false');

  // 2) ON — 저장 + (첫 로드 중) 로딩 문구 → 로드 완료 후 굴리기 전 안내
  setHelper(true);
  check('ON: yd_helper=1 저장', localStorage.getItem('yd_helper') === '1');
  check('ON: 버튼 ◆ · on', $('#helper-solo').textContent.includes('◆') && $('#helper-solo').classList.contains('on'));
  check('ON 직후: 로딩 문구', line('#helper-line').act === '헬퍼 데이터 로딩 중…', line('#helper-line').act);
  await helperLoad('default');
  check('기본 테이블 ready', helperTables.default.status === 'ready', helperTables.default.status);
  let L = line('#helper-line');
  check('굴리기 전: 안내 문구(흐림)', !L.hidden && L.muted && L.act === '주사위를 굴리면 최적의 수를 추천해 드려요.', L.act);

  // 3) 리롤 추천 — 기본 룰 빈 카드 [1,2,3,4,6], 굴림 2회 남음(엔진: 1·2·3·4 보관, +3.9192, 188.9306)
  soloState({ dice: [1, 2, 3, 4, 6], rolls: 2, rolled: true });
  L = line('#helper-line');
  check('리롤 문구', L.act === '1, 2, 3, 4 보관하고 다시 굴리기 · +3.9', L.act);
  check('예상 189', L.exp === '예상 189', L.exp);
  check('추천 보관 밑줄 1~4번', marks('#dice .die') === 'true,true,true,true,false', marks('#dice .die'));
  check('리롤 추천 땐 칸 표시 없음', document.querySelectorAll('#cats .cat.rec').length === 0);

  // 4) 다중집합 표시 — [1,1,2,3,4] 는 1을 하나만 보관(엔진 hold 10111). 두 번째 1을 이미 고정했으면 그쪽을 표시.
  soloState({ dice: [1, 1, 2, 3, 4], held: [false, true, false, false, false], rolls: 2, rolled: true });
  check('이미 고정한 같은 눈 우선 표시', marks('#dice .die') === 'false,true,true,true,true', marks('#dice .die'));

  // 5) 지금 기록 — [6,6,6,6,6], 굴림 0회 남음 → 요트 50(엔진 225.3394)
  soloState({ dice: [6, 6, 6, 6, 6], rolls: 0, rolled: true });
  L = line('#helper-line');
  check('지금 기록 문구', L.act === '지금 요트에 기록 · 50점', L.act);
  check('예상 225', L.exp === '예상 225', L.exp);
  check('요트 칸만 테두리', document.querySelectorAll('#cats .cat')[11].classList.contains('rec') && document.querySelectorAll('#cats .cat.rec').length === 1);
  check('지금 기록 땐 주사위 표시 없음', document.querySelectorAll('#dice .die.rec').length === 0);

  // 6) 추가 룰 — 요트의 달인 칸은 masterCells 에만(엔진 357.106; 순진 변환이면 492)
  setSoloPreset('additional');
  await helperLoad('additional');
  check('추가 테이블 ready', helperTables.additional.status === 'ready', helperTables.additional.status);
  soloState({ dice: [2, 3, 4, 5, 5], rolls: 1, rolled: true, filled: { yacht: 50, sixes: 100, fourkind: 24 }, master: ['sixes'], turn: 3 });
  check('어댑터: 달인 칸 분리', JSON.stringify(soloEngineCard()) === JSON.stringify({ scores: { fourKind: 24, yacht: 50 }, masterCells: ['sixes'] }), JSON.stringify(soloEngineCard()));
  L = line('#helper-line');
  check('추가 룰 문구', L.act === '2, 3, 4, 5 보관하고 다시 굴리기 · +7.3', L.act);
  check('추가 룰 예상 357', L.exp === '예상 357', L.exp);

  // 7) 요트의 달인 윈드폴 — 요트 50 기록 + 5개 같은 눈 → 원 칸에 +100(엔진 360.5238)
  soloState({ dice: [3, 3, 3, 3, 3], rolls: 2, rolled: true, filled: { yacht: 50 }, turn: 1 });
  L = line('#helper-line');
  check('윈드폴 문구', L.act === '요트의 달인! 원 칸에 기록 · +100', L.act);
  check('윈드폴 예상 361', L.exp === '예상 361', L.exp);
  check('윈드폴 칸 테두리(원)', document.querySelectorAll('#cats .cat')[0].classList.contains('rec'));

  // 8) 레이아웃 — 두 테마 × 최악 상태들(추가 룰 힌트 + 헬퍼 줄)
  const layoutStates = [
    ['추가 룰 4/4 ✓ +50 + 헬퍼', 'additional', { dice: [2, 3, 4, 5, 5], rolls: 1, rolled: true, filled: { fourkind: 24, fullhouse: 25, small: 15, large: 30 }, turn: 4 }],
    ['추가 룰 달인 안내 + 헬퍼', 'additional', { dice: [3, 3, 3, 3, 3], rolls: 2, rolled: true, filled: { yacht: 50 }, turn: 1 }],
    ['기본 룰 리롤 + 헬퍼', 'default', { dice: [1, 2, 3, 4, 6], rolls: 2, rolled: true }],
  ];
  for (const theme of ['dark', 'light']) {
    document.documentElement.dataset.theme = theme;
    for (const [name, preset, st] of layoutStates) {
      if (soloPreset !== preset) setSoloPreset(preset);
      await helperLoad(preset);
      soloState(st);
      check(`레이아웃 ${theme} · ${name}: 스크롤 없음`, fits() && !line('#helper-line').hidden, sizeOf());
    }
  }
  document.documentElement.dataset.theme = 'dark';

  // 9) H 키 — 토글, Ctrl+H 무시, 한글 IME('ㅗ'·Process 조합)도 동작, 물리 H 가 'y' 를 내면(비QWERTY) 식스 단축키 우선
  setSoloPreset('default');
  setHelper(false);
  key('KeyH', 'h');
  check('H → ON', helperOn === true);
  key('KeyH', 'h', { ctrlKey: true });
  check('Ctrl+H 무시', helperOn === true);
  key('KeyH', 'ㅗ');
  check('IME ㅗ(KeyH) → OFF', helperOn === false);
  key('KeyH', 'Process', { isComposing: true });
  check('IME 조합 중(Process) → ON', helperOn === true);
  setHelper(false);
  soloState({ dice: [6, 6, 6, 1, 2], rolls: 2, rolled: true });
  key('KeyH', 'y');
  check("물리 H 가 'y' → 식스 기록(토글 안 함)", state.filled.sixes === 18 && helperOn === false, JSON.stringify(state.filled));
  $('#over').classList.remove('hidden');
  key('KeyH', 'h');
  check('게임오버 오버레이 중 H 무시', helperOn === false);
  $('#over').classList.add('hidden');

  // 10) 비정상 엔진 입력 — 조언 null, 예외 없음
  await helperLoad('default');
  let threw = false, r1, r2, r3;
  try {
    r1 = helperAdvise('default', { scores: {}, masterCells: [] }, [0, 0, 0, 0, 0], 2);
    r2 = helperAdvise('default', { scores: {}, masterCells: [] }, [], 2);
    r3 = helperAdvise('default', { scores: {}, masterCells: [] }, [1, 2, 3, 4, 5], 3);
  } catch (_) { threw = true; }
  check('비정상 입력: null · 예외 없음', !threw && r1 === null && r2 === null && r3 === null, JSON.stringify([threw, r1, r2, r3]));

  // 11) 로드 실패 — 테이블이 없으면 오류 문구, 게임은 계속
  const savedUrl = HELPER_TABLE.additional.url;
  HELPER_TABLE.additional.url = '../public/__missing__.bin';
  helperTables.additional = { status: 'idle', advisor: null, promise: null };
  setHelper(true);
  setSoloPreset('additional');
  await helperLoad('additional');
  L = line('#helper-line');
  check('로드 실패: 오류 문구(흐림)', helperTables.additional.status === 'error' && L.act === '헬퍼 데이터를 불러오지 못했습니다' && L.muted, L.act);
  soloState({ dice: [1, 2, 3, 4, 5], rolls: 2, rolled: true });
  check('로드 실패여도 12칸 기록 가능', document.querySelectorAll('#cats .cat.able').length === 12);
  HELPER_TABLE.additional.url = savedUrl;
  helperTables.additional = { status: 'idle', advisor: null, promise: null };

  // 정리
  setHelper(false);
  setSoloPreset('default');
  return list;
};
