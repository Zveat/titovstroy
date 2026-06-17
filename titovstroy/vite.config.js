import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2018',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Выносим тяжёлые зависимости в отдельные чанки —
        // грузятся параллельно и кешируются между деплоями
        manualChunks: {
          react: ['react', 'react-dom'],
          firebase: ['firebase/app', 'firebase/database'],
        },
      },
    },
  },
})
