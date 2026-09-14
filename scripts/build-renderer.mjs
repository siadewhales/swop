import { build } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const splitTranslations = spawnSync(process.execPath, [path.join(projectRoot, 'scripts', 'split-translations.cjs')], {
  stdio: 'inherit'
});
if (splitTranslations.status !== 0) {
  throw new Error('Could not prepare language files.');
}

await build({
  root: path.join(projectRoot, 'client'),
  base: './',
  plugins: [react()],
  build: {
    outDir: path.join(projectRoot, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@walletconnect') || id.includes('@reown')) return 'walletconnect';
          return 'vendor';
        }
      }
    }
  }
});
