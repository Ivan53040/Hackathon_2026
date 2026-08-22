import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

// mkcert 讓 dev server 走 https。
// 這不是為了好看 —— getUserMedia() 只在 secure context 可用，
// 第二台筆電連 http://192.168.x.x 會拿不到 webcam。見 frontend/PLAN.md §7.1
export default defineConfig({
  plugins: [mkcert()],
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
  build: { target: 'es2022' },
});
