import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base: GitHub Pages 배포 시 '/YachtDice_Helper/' 로 바꾸면 됨. 기본은 상대 경로.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // 서비스 워커 등록은 src/ui/PwaStatus.tsx 의 useRegisterSW 훅에서 단일 처리.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Yacht Dice — 요트다이스',
        short_name: 'Yacht Dice',
        description: '요트다이스 게임 + 최적 EV 헬퍼. 설치하면 작업표시줄에서 바로 실행됩니다.',
        lang: 'ko',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        theme_color: '#0c1020',
        background_color: '#0c1020',
        categories: ['games'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // bin 포함이 핵심: V.bin(헬퍼 값 테이블)까지 프리캐시 → 완전 오프라인.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,bin,woff,woff2}'],
        // V.additional.bin(4.0MiB)까지 precache 허용. base 1MB + additional 4MB.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: 'index.html',
      },
      // dev 에서는 SW 비활성(캐싱 혼선 방지). 오프라인 테스트는 build + preview 로.
      devOptions: { enabled: false },
    }),
  ],
});
