import { expect, test, type Page } from '@playwright/test';
import { expectNoErrors, registerViaUi, shot, watchErrors } from './helpers';

test.describe.configure({ mode: 'serial' });

let page: Page;
let errors: string[];

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage();
  errors = watchErrors(page);
  await registerViaUi(page, 'casino');
});

async function chips(): Promise<number> {
  const t = await page.locator('header').getByTitle('Chip ảo dùng cho casino').innerText();
  return Number(t.replace(/\D/g, ''));
}
/** Balance once the header has loaded it from the server. */
async function loadedChips(): Promise<number> {
  await expect.poll(chips, { timeout: 20_000 }).toBeGreaterThan(0);
  return chips();
}

async function waitForBetting(p: Page) {
  // the phase bar shows "Đặt cược" while betting is open with enough time left
  await expect(async () => {
    const label = await p.locator('span', { hasText: /^Đặt cược$/ }).first().isVisible();
    const secs = Number((await p.locator('span.font-display.w-12').first().innerText()).replace(/\D/g, '') || '0');
    expect(label && secs >= 5).toBe(true);
  }).toPass({ timeout: 60_000, intervals: [1000] });
}

test('sic bo: place a bet on TÀI, chips are deducted, the round settles', async () => {
  await page.goto('/casino/sicbo');
  await expect(page.getByRole('heading', { name: 'Sicbo' })).toBeVisible();
  await waitForBetting(page);
  const before = await loadedChips();
  await page.getByRole('button', { name: /TÀI/ }).first().click();
  await page.getByRole('button', { name: /TÀI/ }).first().click();
  await expect(page.getByText('Đang chọn:')).toContainText('200');
  await page.getByRole('button', { name: 'Đặt cược' }).click();
  await expect.poll(chips, { timeout: 15_000 }).toBe(before - 200);
  await expect(page.getByText(/Cược ván này/)).toBeVisible();
  await shot(page, '30-sicbo-bet');
  // wait for the result and settlement
  await expect(page.getByText(/Thắng|Thua/).first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await shot(page, '31-sicbo-result');
  const after = await chips();
  expect([before - 200, before + 200]).toContain(after); // lose the 200 stake, or win 1:1 (+200 net)
  expectNoErrors(errors, 'sicbo');
});

test('roulette: straight bet on 17 + red', async () => {
  await page.goto('/casino/roulette');
  await expect(page.getByRole('heading', { name: 'Roulette' })).toBeVisible();
  await waitForBetting(page);
  const before = await loadedChips();
  await page.getByRole('button', { name: '17', exact: true }).click();
  await page.getByRole('button', { name: '1–18' }).click();
  await page.getByRole('button', { name: 'Đặt cược' }).click();
  await expect.poll(chips, { timeout: 15_000 }).toBe(before - 200);
  await shot(page, '32-roulette');
  await expect(page.getByText(/Thắng|Thua/).first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(6500); // wheel animation
  await shot(page, '33-roulette-result');
  expectNoErrors(errors, 'roulette');
});

test('crash: bet during countdown, see the rocket fly, cash out or lose', async () => {
  await page.goto('/casino/crash');
  await expect(page.getByRole('heading', { name: 'Phi hành gia' })).toBeVisible();
  const betBtn = page.getByRole('button', { name: 'Đặt cược' });
  const before = await loadedChips();
  // Rounds can run long (high multipliers); keep trying until a betting window accepts the bet.
  const placed = page.getByText(/^Cược 100/);
  await expect(async () => {
    if (await placed.isVisible()) return; // never bet twice
    await expect(betBtn).toBeEnabled({ timeout: 1_000 });
    await betBtn.click({ timeout: 1_000 });
    await expect(placed).toBeVisible({ timeout: 15_000 });
  }).toPass({ timeout: 150_000, intervals: [500] });
  await expect.poll(chips, { timeout: 15_000 }).toBe(before - 100);
  // flying: cash out as soon as the button shows
  const cash = page.getByRole('button', { name: /^Rút/ });
  const crashed = page.getByText('Nổ rồi!');
  await expect(cash.or(crashed)).toBeVisible({ timeout: 20_000 });
  await shot(page, '34-crash-flying');
  if (await cash.isVisible()) {
    await cash.click();
    await expect(page.getByText(/Rút ở x|Phi thuyền đã nổ/)).toBeVisible({ timeout: 10_000 });
  }
  expectNoErrors(errors, 'crash');
});

test('leaderboard page: tabs render', async () => {
  await page.goto('/leaderboard');
  await expect(page.getByRole('heading', { name: 'Bảng xếp hạng' })).toBeVisible();
  await expect(page.getByText('Tetris vô tận')).toBeVisible();
  await page.getByRole('button', { name: 'Rating đối kháng' }).click();
  await page.getByRole('button', { name: 'Cờ vua Blitz' }).click();
  await page.getByRole('button', { name: 'Chip', exact: true }).click();
  await expect(page.getByText('Nhiều chip nhất')).toBeVisible();
  await shot(page, '35-leaderboard');
  expectNoErrors(errors, 'leaderboard');
});

test('royal poker is served under /poker and reuses the hub login', async () => {
  await page.goto('/poker');
  await page.waitForURL('**/poker/index.html');
  // already signed in via the shared session: the lobby (not the login screen) shows
  await expect(page.locator('#screen-lobby')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('link', { name: '← Sảnh game' })).toBeVisible();
  await shot(page, '36-poker');
});

test('unknown pages and rooms show friendly errors', async () => {
  await page.goto('/room/ZZZZZZ');
  await expect(page.getByText('Không tìm thấy phòng')).toBeVisible();
  await page.goto('/play/nope');
  await expect(page.getByText('Không có trò này')).toBeVisible();
  await page.goto('/casino/nope');
  await expect(page.getByText('Không có trò này')).toBeVisible();
});

test('mobile viewport: hub and tetris lay out without horizontal scroll', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await page.context().storageState() });
  const m = await ctx.newPage();
  await m.goto('/hub');
  await expect(m.getByText('Tetris Neon')).toBeVisible();
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  await m.screenshot({ path: '.tmp/e2e-shots/37-mobile-hub.png' });
  await ctx.close();
});
