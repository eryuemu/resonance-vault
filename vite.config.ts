import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Developer-only album symlinks must never be copied into desktop installers.
  publicDir: mode === 'desktop' ? false : 'public',
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    watch: { ignored: ['**/native/target/**', '**/release/**'] },
    fs: {
      allow: ['..']
    }
  }
}));
