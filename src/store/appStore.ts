// 화면 전환(라이트 라우팅). 정적 SPA 라 react-router 대신 뷰 상태로 충분.
import { create } from 'zustand';

export type Screen = 'home' | 'solo' | 'lobby' | 'mpgame' | 'leaderboard';

interface AppState {
  screen: Screen;
  setScreen: (s: Screen) => void;
}

export const useAppStore = create<AppState>((set) => ({
  screen: 'home',
  setScreen: (screen) => set({ screen }),
}));
