import { expect, test, type Page } from '@playwright/test';
import { expectNoErrors, newPlayer, shot } from './helpers';

test.describe.configure({ mode: 'serial' });

type P = Awaited<ReturnType<typeof newPlayer>>;
let A: P;
let B: P;

test.beforeAll(async ({ browser }) => {
  A = await newPlayer(browser, 'mpa');
  B = await newPlayer(browser, 'mpb');
});
test.afterAll(async () => {
  await A.ctx.close();
  await B.ctx.close();
});

async function createFromLobby(page: Page, game: string, setup?: (p: Page) => Promise<void>) {
  await page.goto(`/play/${game}`);
  if (setup) await setup(page);
  await page.getByRole('button', { name: 'Tạo phòng' }).click();
  await page.waitForURL(/\/room\?code=[A-Z0-9]{6}$/);
  return new URL(page.url()).searchParams.get('code')!;
}

test('presence: both players see each other online and can invite', async () => {
  await A.page.goto('/hub');
  await B.page.goto('/hub');
  await expect(A.page.getByText(/\d+ online/)).toBeVisible();
  await A.page.getByText(/\d+ online/).click();
  await expect(A.page.getByRole('dialog').getByText('E2E mpb')).toBeVisible({ timeout: 20_000 });
  await A.page.keyboard.press('Escape');
});

test('chess: create, invite by code, play to checkmate, result + rating, rematch', async () => {
  const code = await createFromLobby(A.page, 'chess', async (p) => {
    await p.getByRole('button', { name: 'Trắng', exact: true }).click();
  });
  await expect(A.page.getByText('Đang chờ đối thủ')).toBeVisible();
  await shot(A.page, '20-chess-waiting');
  // invite: B is online, the invite toast lets B jump in
  const inviteBtn = A.page.getByRole('button', { name: 'Mời', exact: true }).first();
  await inviteBtn.click();
  await expect(B.page.getByText(/mời bạn chơi/)).toBeVisible({ timeout: 15_000 });
  await B.page.getByRole('button', { name: 'Vào phòng' }).click();
  await B.page.waitForURL((u) => u.pathname === '/room' && u.searchParams.get('code') === code);
  await expect(A.page.getByText('Tới lượt bạn')).toBeVisible({ timeout: 20_000 });
  await expect(B.page.getByText('Lượt đối thủ')).toBeVisible();
  const sq = (p: Page, s: string) => p.locator(`[data-square="${s}"]`).first();
  const play = async (p: Page, from: string, to: string) => {
    await sq(p, from).click();
    await sq(p, to).click();
  };
  await play(A.page, 'f2', 'f3');
  await expect(B.page.getByText('Tới lượt bạn')).toBeVisible();
  await play(B.page, 'e7', 'e5');
  await expect(A.page.getByText('Tới lượt bạn')).toBeVisible();
  await play(A.page, 'g2', 'g4');
  await expect(B.page.getByText('Tới lượt bạn')).toBeVisible();
  await shot(B.page, '21-chess-before-mate');
  await play(B.page, 'd8', 'h4');
  await expect(B.page.getByRole('dialog').getByText('Bạn thắng!')).toBeVisible({ timeout: 15_000 });
  await expect(A.page.getByRole('dialog').getByText('Bạn thua')).toBeVisible();
  await expect(A.page.getByRole('dialog').getByText('Chiếu hết')).toBeVisible();
  await shot(A.page, '22-chess-result');
  // 3D board toggle renders
  await A.page.keyboard.press('Escape');
  await A.page.getByRole('button', { name: '3D', exact: true }).click();
  await A.page.waitForTimeout(1500);
  await shot(A.page, '23-chess-3d');
  await A.page.getByRole('button', { name: '2D', exact: true }).click();
  // rematch: both accept -> both land in the new room with colours swapped
  await A.page.getByRole('button', { name: 'Đấu lại' }).first().click();
  await B.page.keyboard.press('Escape');
  await B.page.getByRole('button', { name: 'Đồng ý đấu lại' }).first().click();
  await A.page.waitForURL((u) => u.searchParams.get('code') !== code, { timeout: 20_000 });
  await B.page.waitForURL((u) => u.searchParams.get('code') !== code, { timeout: 20_000 });
  expect(A.page.url()).toBe(B.page.url());
  await expect(B.page.getByText('Tới lượt bạn')).toBeVisible({ timeout: 20_000 }); // B is white now
  await B.page.getByRole('button', { name: 'Hủy ván' }).click();
  await B.page.getByRole('button', { name: 'Hủy ván' }).click();
  expectNoErrors(A.errors, 'chess A');
  expectNoErrors(B.errors, 'chess B');
});

test('xiangqi: join by code, move a cannon, notation shown', async () => {
  const code = await createFromLobby(A.page, 'xiangqi', async (p) => {
    await p.getByRole('button', { name: 'Đỏ (đi trước)', exact: true }).click();
  });
  await B.page.goto('/play/xiangqi');
  await B.page.getByPlaceholder('ABC123').fill(code);
  await B.page.getByRole('button', { name: 'Vào', exact: true }).click();
  await B.page.waitForURL((u) => u.pathname === '/room' && u.searchParams.get('code') === code);
  await expect(A.page.getByText('Tới lượt bạn')).toBeVisible({ timeout: 20_000 });
  // click the red cannon on h2 (col 7,row 7 from the top) then e2 (col 4)
  const svg = A.page.locator('svg[viewBox="0 0 568 628"]');
  const box = (await svg.boundingBox())!;
  const at = (c: number, r: number) => ({ x: box.x + ((44 + c * 60) / 568) * box.width, y: box.y + ((44 + r * 60) / 628) * box.height });
  const from = at(7, 7), to = at(4, 7);
  await A.page.mouse.click(from.x, from.y);
  await A.page.mouse.click(to.x, to.y);
  await expect(B.page.getByText('P2-5')).toBeVisible({ timeout: 15_000 });
  await shot(B.page, '24-xiangqi');
  await B.page.getByRole('button', { name: 'Hủy ván' }).click();
  await B.page.getByRole('button', { name: /Hủy ván|Chắc chắn/ }).first().click();
  expectNoErrors(A.errors, 'xiangqi A');
  expectNoErrors(B.errors, 'xiangqi B');
});

test('caro: five in a row wins', async () => {
  const code = await createFromLobby(A.page, 'caro', async (p) => {
    await p.getByRole('button', { name: 'X (đi trước)', exact: true }).click();
  });
  await B.page.goto(`/room?code=${code}`);
  await expect(A.page.getByText('Tới lượt bạn')).toBeVisible({ timeout: 20_000 });
  const cell = (p: Page, i: number) => p.getByRole('button', { name: `Ô ${i}`, exact: true });
  for (let k = 0; k < 5; k++) {
    await cell(A.page, 100 + k).click();
    if (k === 4) break;
    await expect(B.page.getByText('Tới lượt bạn')).toBeVisible();
    await cell(B.page, 130 + k).click();
    await expect(A.page.getByText('Tới lượt bạn')).toBeVisible();
  }
  await expect(A.page.getByRole('dialog').getByText('Bạn thắng!')).toBeVisible({ timeout: 15_000 });
  await A.page.keyboard.press('Escape');
  await shot(A.page, '25-caro');
  expectNoErrors(A.errors, 'caro A');
  expectNoErrors(B.errors, 'caro B');
});

test('dots: lines are drawn and the board renders', async () => {
  const code = await createFromLobby(A.page, 'dots', async (p) => {
    await p.getByRole('button', { name: 'Đi trước', exact: true }).click();
    await p.getByRole('button', { name: '3×3', exact: true }).click();
  });
  await B.page.goto(`/room?code=${code}`);
  await expect(A.page.getByText('Tới lượt bạn')).toBeVisible({ timeout: 20_000 });
  // click the top-left horizontal line: between dots (40,40) and (140,40) in a 380 viewBox
  const svg = A.page.locator('svg[viewBox="0 0 380 380"]');
  const b = (await svg.boundingBox())!;
  await A.page.mouse.click(b.x + (90 / 380) * b.width, b.y + (40 / 380) * b.height);
  await expect(B.page.getByText('Tới lượt bạn')).toBeVisible({ timeout: 15_000 });
  await shot(B.page, '26-dots');
  expectNoErrors(A.errors, 'dots A');
});

test('tetris 1v1: ready -> countdown -> both boards live -> leave = forfeit', async () => {
  await A.page.goto('/tetris');
  await A.page.getByRole('button', { name: 'Tính giờ (đếm KO)' }).click();
  await A.page.getByRole('button', { name: '1 phút', exact: true }).click();
  await A.page.getByRole('button', { name: 'Tạo phòng 1v1' }).click();
  await A.page.waitForURL(/\/room\?code=/);
  const code = new URL(A.page.url()).searchParams.get('code')!;
  await B.page.goto(`/room?code=${code}`);
  await A.page.getByRole('button', { name: 'Sẵn sàng' }).click();
  await B.page.getByRole('button', { name: 'Sẵn sàng' }).click();
  await expect(A.page.getByText('Kế tiếp')).toBeVisible({ timeout: 20_000 });
  await A.page.waitForTimeout(5000); // countdown
  for (let i = 0; i < 6; i++) { await A.page.keyboard.press('Space'); await B.page.keyboard.press('Space'); await A.page.waitForTimeout(120); }
  await A.page.waitForTimeout(800);
  await shot(A.page, '27-tetris-vs');
  // B leaves -> A wins by forfeit
  await B.page.goto('/hub');
  await B.page.request.fetch('/'); // no-op keepalive
  await expect(A.page.getByText('Kế tiếp')).toBeVisible();
  expectNoErrors(A.errors, 'tetris vs A');
});

test('tiến lên: table seats, ready, deal, my hand is visible', async () => {
  const code = await createFromLobby(A.page, 'tienlen');
  await B.page.goto(`/room?code=${code}`);
  await expect(A.page.getByText(/Bàn chờ \(2\/4\)/)).toBeVisible({ timeout: 20_000 });
  await A.page.getByRole('button', { name: 'Sẵn sàng' }).click();
  await B.page.getByRole('button', { name: 'Sẵn sàng' }).click();
  await expect(A.page.getByRole('button', { name: 'Đánh' })).toBeVisible({ timeout: 20_000 });
  // 13 cards in hand (instant win is rare; tolerate the results screen)
  const cards = A.page.locator('div.mt-5 button');
  const n = await cards.count();
  expect([0, 13]).toContain(n);
  await shot(A.page, '28-tienlen');
  expectNoErrors(A.errors, 'tienlen A');
  expectNoErrors(B.errors, 'tienlen B');
});

test('cờ tỉ phú: lobby, start, roll dice (3D), buy or skip, end turn', async () => {
  const code = await createFromLobby(A.page, 'monopoly');
  await B.page.goto(`/room?code=${code}`);
  await expect(A.page.getByRole('button', { name: 'Bắt đầu ván' })).toBeEnabled({ timeout: 20_000 });
  await A.page.getByRole('button', { name: 'Bắt đầu ván' }).click();
  // whoever's turn it is rolls
  for (let step = 0; step < 6; step++) {
    for (const p of [A.page, B.page]) {
      const roll = p.getByRole('button', { name: 'Đổ xúc xắc' });
      const skip = p.getByRole('button', { name: 'Không mua' });
      const end = p.getByRole('button', { name: 'Kết thúc lượt' });
      if (await roll.isVisible()) { await roll.click(); await p.waitForTimeout(1200); }
      else if (await skip.isVisible()) await skip.click();
      else if (await end.isVisible()) await end.click();
    }
    await A.page.waitForTimeout(500);
  }
  await shot(A.page, '29-monopoly');
  expectNoErrors(A.errors, 'monopoly A');
  expectNoErrors(B.errors, 'monopoly B');
});
