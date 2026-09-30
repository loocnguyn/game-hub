// Copies Royal Poker's static app (../royal-poker/public) into public/poker and re-applies the
// hub-specific tweaks: absolute asset paths (the page is served at /poker) and a "back to hub" button.
// Usage: node scripts/sync-poker.mjs [path-to-royal-poker]
import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve(process.argv[2] || '../royal-poker', 'public');
const dst = path.resolve('public/poker');
if (!fs.existsSync(path.join(src, 'index.html'))) throw new Error(`Royal Poker not found at ${src}`);

fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });

const indexPath = path.join(dst, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');
const replace = (from, to) => {
  if (!html.includes(from)) throw new Error(`index.html no longer contains: ${from}`);
  html = html.replace(from, to);
};
replace('href="css/style.css"', 'href="/poker/css/style.css"');
replace('src="js/app.js"', 'src="/poker/js/app.js"');
replace(
  '      <div class="brand small"><span>ROYAL</span> POKER</div>\n      <div class="topbar-right">\n        <button class="icon-btn" data-open="settings"',
  '      <div style="display:flex;align-items:center;gap:12px"><a href="/hub" class="btn btn-ghost btn-sm">← Sảnh game</a><div class="brand small"><span>ROYAL</span> POKER</div></div>\n      <div class="topbar-right">\n        <button class="icon-btn" data-open="settings"',
);
fs.writeFileSync(indexPath, html);
console.log(`synced ${src} -> ${dst}`);
