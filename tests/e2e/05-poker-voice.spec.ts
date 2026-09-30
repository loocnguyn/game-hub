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

test('poker voice chat: join, hear each other, mute mic, mute speaker, leave', async () => {
  test.setTimeout(120_000);
  // A creates a fresh table (so the test never shows up at real players' tables); cleanup deletes it with the account
  await A.page.goto('/poker/index.html');
  await expect(A.page.locator('#screen-lobby')).toBeVisible({ timeout: 20_000 });
  await A.page.locator('#btn-create').click();
  await A.page.locator('#create-submit').click();
  await A.page.waitForURL(/#\/t\//, { timeout: 20_000 });
  const tableId = new URL(A.page.url()).hash.replace('#/t/', '');
  await B.page.goto(`/poker/index.html#/t/${tableId}`);
  for (const p of [A.page, B.page]) await expect(p.locator('#screen-table')).toBeVisible({ timeout: 20_000 });

  // both join voice
  await A.page.getByRole('button', { name: /Vào voice/ }).click();
  await expect(B.page.getByRole('button', { name: /Vào voice · 1/ })).toBeVisible({ timeout: 15_000 }); // B sees A is in voice
  await B.page.getByRole('button', { name: /Vào voice/ }).click();
  for (const p of [A.page, B.page]) await expect(p.locator('#voice-panel')).toContainText('Voice · 2 người', { timeout: 15_000 });

  // audio flows both ways: each side sees the other "speaking" (fake mic beep)
  await expect(A.page.locator('#voice-panel li.speaking', { hasText: 'E2E vB' })).toBeVisible({ timeout: 30_000 });
  await expect(B.page.locator('#voice-panel li.speaking', { hasText: 'E2E vA' })).toBeVisible({ timeout: 30_000 });
  await shot(A.page, '40-poker-voice');

  // B mutes the mic -> A sees B muted and no longer speaking
  await B.page.getByRole('button', { name: 'Tắt mic' }).click();
  await expect(B.page.getByRole('button', { name: 'Bật mic' })).toBeVisible();
  const bOnA = A.page.locator('#voice-panel li', { hasText: 'E2E vB' });
  await expect(bOnA.locator('.vp-state svg')).toBeVisible({ timeout: 10_000 });
  await A.page.waitForTimeout(1000);
  await expect(bOnA).not.toHaveClass(/speaking/);

  // A turns the speaker off (deafen) -> A's own mic goes quiet too, B sees it
  await A.page.getByRole('button', { name: 'Tắt loa' }).click();
  await expect(A.page.getByRole('button', { name: 'Bật loa' })).toBeVisible();
  await expect(A.page.getByRole('button', { name: 'Bật mic' })).toBeVisible();
  await expect(B.page.locator('#voice-panel li', { hasText: 'E2E vA' }).locator('.vp-state svg')).toBeVisible({ timeout: 10_000 });
  // turning the mic back on also turns the speaker back on, like Discord
  await A.page.getByRole('button', { name: 'Bật mic' }).click();
  await expect(A.page.getByRole('button', { name: 'Tắt loa' })).toBeVisible();

  // B leaves voice -> A is alone
  await B.page.getByRole('button', { name: 'Rời voice' }).click();
  await expect(A.page.locator('#voice-panel')).toContainText('Voice · 1 người', { timeout: 15_000 });
  await expect(B.page.getByRole('button', { name: /Vào voice · 1/ })).toBeVisible();

  expectNoErrors(A.errors, 'poker voice A');
  expectNoErrors(B.errors, 'poker voice B');
});
