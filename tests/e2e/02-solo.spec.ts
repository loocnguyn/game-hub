import { expect, test, type Page } from '@playwright/test';
import { expectNoErrors, registerViaUi, shot, watchErrors } from './helpers';

let page: Page;
let errors: string[];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage();
  errors = watchErrors(page);
  await registerViaUi(page, 'solo');
});

test('tetris infinity: play, pause, game over, score saved to the leaderboard', async () => {
  await page.goto('/tetris');
  await expect(page.getByRole('heading', { name: /Tetris/ })).toBeVisible();
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  // wait for the engine to start (Điểm label visible, canvas rendered)
  await expect(page.getByText('Kế tiếp')).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.waitForTimeout(1200);
  // move + rotate + hold + hard drop
  for (const k of ['ArrowLeft', 'ArrowLeft', 'ArrowUp', 'KeyC', 'Space', 'ArrowRight', 'KeyZ', 'Space']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(300);
  await shot(page, '10-tetris-3d');
  const score = async () => Number((await page.locator('text=Điểm').first().locator('xpath=following-sibling::div').innerText()).replace(/\D/g, ''));
  expect(await score()).toBeGreaterThan(0); // hard drops score 2 points per cell
  // pause / resume
  await page.keyboard.press('Escape');
  await expect(page.getByText('Tạm dừng', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Chơi tiếp' }).click();
  // stack pieces until game over (hard drop repeatedly)
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(40);
    if (await page.getByText('Hết game').isVisible()) break;
  }
  await expect(page.getByText('Hết game')).toBeVisible();
  await expect(page.getByText('Đã lưu vào bảng xếp hạng')).toBeVisible({ timeout: 20_000 });
  await shot(page, '11-tetris-over');
  // the leaderboard next to the game shows us
  await expect(page.getByText('E2E solo').first()).toBeVisible();
  await page.getByRole('button', { name: 'Về menu' }).click();
  expectNoErrors(errors, 'tetris');
});

test('tetris settings: 2D mode renders the canvas board', async () => {
  await page.goto('/tetris');
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Cài đặt' }).first().click();
  await page.getByRole('button', { name: '2D (nhẹ)' }).click();
  await page.getByRole('button', { name: 'Lưu' }).click();
  await page.getByRole('button', { name: 'Thoát' }).click();
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  await page.waitForTimeout(800);
  await shot(page, '12-tetris-2d');
  await page.keyboard.press('Escape');
  // restore 3D for later runs
  await page.getByRole('button', { name: 'Cài đặt' }).first().click();
  await page.getByRole('button', { name: '3D (đẹp)' }).click();
  await page.getByRole('button', { name: 'Lưu' }).click();
  expectNoErrors(errors, 'tetris 2d');
});

test('2048: arrow keys move tiles, stop & save records the score', async () => {
  await page.goto('/2048');
  await expect(page.getByRole('heading', { name: '2048', exact: true })).toBeVisible();
  await page.waitForTimeout(800);
  for (let i = 0; i < 40; i++) await page.keyboard.press(['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'][i % 4]);
  await page.waitForTimeout(300);
  await shot(page, '13-2048');
  const saveBtn = page.getByRole('button', { name: 'Dừng & lưu điểm' });
  if (await saveBtn.isVisible()) {
    await saveBtn.click();
    await expect(page.getByText('Đã lưu điểm')).toBeVisible({ timeout: 15_000 });
  }
  expectNoErrors(errors, '2048');
});

test('minesweeper: first click is safe and opens an area; flags work', async () => {
  await page.goto('/minesweeper');
  await expect(page.getByRole('heading', { name: 'Dò mìn' })).toBeVisible();
  const cells = page.locator('div.grid.select-none button');
  await expect(cells).toHaveCount(81);
  await cells.nth(40).click();
  await page.waitForTimeout(300);
  // several cells revealed, none exploded
  await expect(page.getByText('Trúng mìn!')).toHaveCount(0);
  const opened = await cells.evaluateAll((els) => els.filter((e) => e.className.includes('bg-[#10132a]')).length);
  expect(opened).toBeGreaterThan(8);
  // right-click flag on an unopened cell
  const idx = await cells.evaluateAll((els) => els.findIndex((e) => !e.className.includes('bg-[#10132a]')));
  await cells.nth(idx).click({ button: 'right' });
  await expect(cells.nth(idx)).toContainText('⚑');
  await shot(page, '14-minesweeper');
  // switch difficulty
  await page.getByRole('button', { name: /Khó 30×16/ }).click();
  await expect(cells).toHaveCount(480);
  expectNoErrors(errors, 'minesweeper');
});

test('sudoku: grid renders, typing digits fills cells, notes mode', async () => {
  await page.goto('/sudoku');
  await expect(page.getByRole('heading', { name: 'Sudoku' })).toBeVisible();
  const grid = page.locator('div.grid.grid-cols-9 >> nth=0').locator('button');
  await expect(grid).toHaveCount(81, { timeout: 20_000 });
  // find an empty cell and type the digit 5
  const empty = await grid.evaluateAll((els) => els.findIndex((e) => (e.textContent || '').trim() === ''));
  await grid.nth(empty).click();
  await page.keyboard.press('5');
  await expect(grid.nth(empty)).toContainText('5');
  await page.keyboard.press('Backspace');
  await expect(grid.nth(empty)).not.toContainText('5');
  // notes
  await page.keyboard.press('n');
  await page.keyboard.press('3');
  await page.keyboard.press('7');
  await expect(grid.nth(empty)).toContainText('3');
  await shot(page, '15-sudoku');
  expectNoErrors(errors, 'sudoku');
});
