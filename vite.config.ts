import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: GitHub Pages 배포 시 '/YachtDice_Helper/' 로 바꾸면 됨. 기본은 상대 경로.
export default defineConfig({
  base: './',
  plugins: [react()],
});
