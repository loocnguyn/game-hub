import { expect, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';

export const SHOTS = '.tmp/e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const RUN = Date.now().toString(36).slice(-5);
let n = 0;
export function newUsername(label: string) {
  return `ze_${RUN}_${label}_${n++}`.slice(0, 20);
}
export const PASSWORD = `e2e-${RUN}-pass`;

// Noise we tolerate: dev-only warnings and WebGL/driver chatter from headless GPUs.
const IGNORED = [/Download the React DevTools/i, /WebGL/i, /GPU stall/i, /THREE\.WebGLRenderer/i, /favicon/i, /Failed to load resource.*(404|net::ERR_ABORTED|status of 400)/i, /\[Fast Refresh\]/i, /HMR/i];

/** Collects console errors and uncaught exceptions for a page. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (IGNORED.some((r) => r.test(t))) return;
    errors.push(t);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

export async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Registers a new account through the UI and lands on /hub. */
export async function registerViaUi(page: Page, label: string) {
  const username = newUsername(label);
  await page.goto('/');
  await page.getByRole('button', { name: 'Đăng ký' }).first().click();
  await page.getByPlaceholder('vd: loc.nguyen').fill(username);
  await page.getByPlaceholder('Tên bạn bè sẽ thấy').fill(`E2E ${label}`);
  const pw = page.locator('input[type="password"]');
  await pw.nth(0).fill(PASSWORD);
  await pw.nth(1).fill(PASSWORD);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await page.waitForURL('**/hub', { timeout: 30_000 });
  await expect(page.getByText(`E2E ${label}`).first()).toBeVisible();
  return username;
}

export async function newPlayer(browser: Browser, label: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  const username = await registerViaUi(page, label);
  return { ctx, page, errors, username };
}

export function expectNoErrors(errors: string[], context: string) {
  expect(errors, `console errors on ${context}:\n${errors.join('\n')}`).toEqual([]);
}
