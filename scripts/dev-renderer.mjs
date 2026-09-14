import { createServer } from 'vite';
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

const server = await createServer({
  root: path.join(projectRoot, 'client'),
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173
  }
});

await server.listen();
server.printUrls();
