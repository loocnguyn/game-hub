// Bundles the `hub` edge function into one file for deployment (npm deps stay as npm: imports).
// Usage: node scripts/bundle-fn.mjs  ->  .tmp/hub.bundle.js
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

mkdirSync('.tmp', { recursive: true });
await build({
  entryPoints: ['supabase/functions/hub/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: '.tmp/hub.bundle.js',
  external: ['@supabase/supabase-js', 'chess.js'],
  minifySyntax: true,
  legalComments: 'none',
  charset: 'utf8',
});
let code = readFileSync('.tmp/hub.bundle.js', 'utf8');
code = code
  .replaceAll('"@supabase/supabase-js"', '"npm:@supabase/supabase-js@2"')
  .replaceAll('"chess.js"', '"npm:chess.js@1.4.0"');
// Drop indentation and blank lines (the sources have no multi-line template literals).
code = code
  .split('\n')
  .map((l) => l.trimStart())
  .filter((l) => l.length && !l.startsWith('//') && !(l.startsWith('/*') && l.endsWith('*/')) && !l.startsWith('* ') && l !== '*' && l !== '*/' && !l.startsWith('/**'))
  .join('\n') + '\n';
writeFileSync('.tmp/hub.bundle.js', code);
console.log('bytes', code.length);
