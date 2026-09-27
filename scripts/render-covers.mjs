// Renders the 3D cover scenes (src/components/three/covers.tsx) to images in public/covers.
// Needs the dev server running: npx next dev -p 3100, then: node scripts/render-covers.mjs [id ...]
import { chromium } from '@playwright/test';

const BASE = process.env.COVER_BASE || 'http://localhost:3100';
const COVERS = ['tetris', 'chess', 'xiangqi', 'caro', 'dots', 'monopoly', 'tienlen', 'poker', 'minesweeper', '2048', 'sudoku', 'sicbo', 'roulette', 'crash', 'dungeon'];
const MARKS = { logo: 256, chip: 128 };
const only = process.argv.slice(2);
const want = (id) => !only.length || only.includes(id);

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  for (const id of COVERS.filter(want)) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 750 } });
    await page.goto(`${BASE}/dev/covers?id=${id}`);
    await page.waitForFunction(() => window.__coverReady === true, null, { timeout: 120_000 });
    await page.screenshot({ path: `public/covers/${id}.jpg`, type: 'jpeg', quality: 84 });
    await page.close();
    console.log('rendered', id);
  }
  for (const [id, size] of Object.entries(MARKS).filter(([id]) => want(id))) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 2 });
    await page.goto(`${BASE}/dev/covers?id=${id}&transparent`);
    await page.waitForFunction(() => window.__coverReady === true, null, { timeout: 120_000 });
    await page.screenshot({ path: `public/covers/${id}.png`, omitBackground: true });
    await page.close();
    console.log('rendered', id);
  }
} finally {
  await browser.close();
}
