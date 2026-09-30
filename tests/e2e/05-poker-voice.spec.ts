import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { expectNoErrors, registerViaUi, shot, watchErrors } from './helpers';

// Chromium's fake microphone plays a steady beep, which is enough to test the "speaking" indicator.
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['microphone'],
});

type Player = { ctx: BrowserContext; page: Page; errors: string[] };
let A: Player;
let B: Player;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const make = async (label: string): Promise<Player> => {
    const ctx = await browser.newContext({ permissions: ['microphone'] });
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    await registerViaUi(page, label);
    return { ctx, page, errors };
  };
  A = await make('vA');
  B = await make('vB');
});

test.afterAll(async () => {
  await A?.ctx.close();
  await B?.ctx.close();
});

const bar = (p: Page) => p.locator('#voice-bar');

test('poker voice chat: auto-join, hear each other, device menu, mute mic/speaker, leave', async () => {
  test.setTimeout(150_000);
  // A creates a fresh table (so the test never shows up at real players' tables); cleanup deletes it with the account
  await A.page.goto('/poker/index.html');
  await expect(A.page.locator('#screen-lobby')).toBeVisible({ timeout: 20_000 });
  await A.page.locator('#btn-create').click();
  await A.page.locator('#create-submit').click();
  await A.page.waitForURL(/#\/t\//, { timeout: 20_000 });
  const tableId = new URL(A.page.url()).hash.replace('#/t/', '');
  await B.page.goto(`/poker/index.html#/t/${tableId}`);

  // entering the table joins voice automatically; the controls sit in the bottom bar
  for (const p of [A.page, B.page]) {
    await expect(bar(p).getByRole('button', { name: 'Tắt mic' })).toBeVisible({ timeout: 20_000 });
    await expect(p.locator('#voice-panel')).toContainText('Voice · 2 người', { timeout: 15_000 });
  }

  // audio flows both ways: each side sees the other "speaking" (fake mic beep)
  await expect(A.page.locator('#voice-panel li.speaking', { hasText: 'E2E vB' })).toBeVisible({ timeout: 30_000 });
  await expect(B.page.locator('#voice-panel li.speaking', { hasText: 'E2E vA' })).toBeVisible({ timeout: 30_000 });
  await shot(A.page, '40-poker-voice');

  // the arrow next to the mic opens the input menu: devices, volume, live level
  await bar(A.page).getByRole('button', { name: 'Chọn micro' }).click();
  const menu = A.page.locator('.voice-menu');
  await expect(menu).toContainText('Micro');
  await expect(menu.getByRole('menuitemradio', { name: 'Mặc định của máy' })).toBeVisible();
  expect(await menu.getByRole('menuitemradio').count()).toBeGreaterThan(1); // default + the fake device
  await expect.poll(async () => Number((await menu.locator('#vm-level').getAttribute('style'))?.match(/width: (\d+)%/)?.[1] ?? 0), { timeout: 10_000 }).toBeGreaterThan(0);
  await menu.locator('#vm-vol').fill('150');
  await expect(menu.locator('#vm-val')).toHaveText('150%');
  await shot(A.page, '41-poker-voice-mic-menu');
  // picking the other mic keeps the call working
  await menu.getByRole('menuitemradio').nth(1).click();
  await A.page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(B.page.locator('#voice-panel li.speaking', { hasText: 'E2E vA' })).toBeVisible({ timeout: 30_000 });
  // the arrow next to the headphones opens the output menu
  await bar(A.page).getByRole('button', { name: 'Chọn loa' }).click();
  await expect(menu).toContainText('Loa / tai nghe');
  await expect(menu.locator('#vm-vol')).toBeVisible();
  await A.page.mouse.click(5, 5); // click outside closes it
  await expect(menu).toHaveCount(0);

  // B mutes the mic -> A sees B muted and no longer speaking
  await bar(B.page).getByRole('button', { name: 'Tắt mic' }).click();
  await expect(bar(B.page).getByRole('button', { name: 'Bật mic' })).toBeVisible();
  const bOnA = A.page.locator('#voice-panel li', { hasText: 'E2E vB' });
  await expect(bOnA.locator('.vp-state svg')).toBeVisible({ timeout: 10_000 });
  await A.page.waitForTimeout(1000);
  await expect(bOnA).not.toHaveClass(/speaking/);

  // A turns the speaker off (deafen) -> A's own mic goes quiet too, B sees it
  await bar(A.page).getByRole('button', { name: 'Tắt loa' }).click();
  await expect(bar(A.page).getByRole('button', { name: 'Bật loa' })).toBeVisible();
  await expect(bar(A.page).getByRole('button', { name: 'Bật mic' })).toBeVisible();
  await expect(B.page.locator('#voice-panel li', { hasText: 'E2E vA' }).locator('.vp-state svg')).toBeVisible({ timeout: 10_000 });
  // turning the mic back on also turns the speaker back on, like Discord
  await bar(A.page).getByRole('button', { name: 'Bật mic' }).click();
  await expect(bar(A.page).getByRole('button', { name: 'Tắt loa' })).toBeVisible();

  // B leaves voice -> A is alone, B can join again from the bottom bar
  await bar(B.page).getByRole('button', { name: 'Rời voice' }).click();
  await expect(A.page.locator('#voice-panel')).toContainText('Voice · 1 người', { timeout: 15_000 });
  await expect(bar(B.page).getByRole('button', { name: 'Vào voice' })).toBeVisible();
  await expect(bar(B.page)).toContainText('1 người đang trong voice');

  // B turns auto-join off in Settings: coming back to the table no longer joins voice
  await B.page.locator('#screen-table [data-open="settings"]').click();
  await B.page.getByText('Tự vào voice khi vào bàn').click();
  await B.page.keyboard.press('Escape');
  await B.page.goto('/poker/index.html');
  await expect(B.page.locator('#screen-lobby')).toBeVisible({ timeout: 20_000 });
  await B.page.goto(`/poker/index.html#/t/${tableId}`);
  await expect(bar(B.page).getByRole('button', { name: 'Vào voice' })).toBeVisible({ timeout: 20_000 });
  await B.page.waitForTimeout(1500);
  await expect(A.page.locator('#voice-panel')).toContainText('Voice · 1 người');

  expectNoErrors(A.errors, 'poker voice A');
  expectNoErrors(B.errors, 'poker voice B');
});
