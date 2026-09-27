import { expect, test } from '@playwright/test';
import { expectNoErrors, newUsername, PASSWORD, registerViaUi, shot, watchErrors } from './helpers';

test('landing page renders the cover wall and the auth form', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Sảnh game/ })).toBeVisible();
  await expect(page.locator('img[src="/covers/tetris.jpg"]').first()).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, '01-landing');
  expectNoErrors(errors, 'landing');
});

test('auth form validates input before calling the server', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('vd: loc.nguyen').fill('A!');
  await page.locator('input[type="password"]').first().fill('123456');
  await page.getByRole('button', { name: 'Đăng nhập' }).last().click();
  await expect(page.locator('form [role=alert]')).toContainText('Tên đăng nhập');
  await page.getByPlaceholder('vd: loc.nguyen').fill('valid_user');
  await page.locator('input[type="password"]').first().fill('123');
  await page.getByRole('button', { name: 'Đăng nhập' }).last().click();
  await expect(page.locator('form [role=alert]')).toContainText('ít nhất 6');
  // register: mismatched passwords
  await page.getByRole('button', { name: 'Đăng ký' }).first().click();
  await page.getByPlaceholder('Tên bạn bè sẽ thấy').fill('Ai đó');
  const pw = page.locator('input[type="password"]');
  await pw.nth(0).fill('abcdef');
  await pw.nth(1).fill('abcdeg');
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.locator('form [role=alert]')).toContainText('không khớp');
});

test('wrong password shows an error', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('vd: loc.nguyen').fill(newUsername('nobody'));
  await page.locator('input[type="password"]').first().fill('wrong-password');
  await page.getByRole('button', { name: 'Đăng nhập' }).last().click();
  await expect(page.locator('form [role=alert]')).toContainText(/Sai tên đăng nhập|Invalid/);
});

test('register -> hub -> filters -> bonus -> logout -> login again', async ({ page }) => {
  const errors = watchErrors(page);
  const username = await registerViaUi(page, 'hub');
  await expect(page.getByRole('heading', { name: 'Tetris Neon', level: 3 })).toBeVisible();
  await expect(page.getByText('Cờ tỉ phú')).toBeVisible();
  // chip balance from the server (10.000)
  await expect(page.getByText('10.000').first()).toBeVisible({ timeout: 15_000 });
  await shot(page, '02-hub');
  // category filter
  await page.getByRole('button', { name: 'Giải đố' }).click();
  await expect(page.getByText('Sudoku')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tetris Neon', level: 3 })).toHaveCount(0);
  await page.getByRole('button', { name: 'Tất cả' }).click();
  // daily bonus
  await page.getByRole('button', { name: /Nhận 5.000 chip/ }).click();
  await expect(page.getByText('Đã nhận 5.000 chip')).toBeVisible();
  await expect(page.getByText('15.000').first()).toBeVisible();
  await page.getByRole('button', { name: /Nhận 5.000 chip/ }).click();
  await expect(page.getByText(/đã nhận quà hôm nay/)).toBeVisible();
  // protected page redirects when signed out
  await page.locator('header').getByText('E2E hub').click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await page.waitForURL((u) => u.pathname === '/');
  await page.goto('/leaderboard');
  await page.waitForURL(/\/\?next=/);
  // log back in and get redirected to the page we wanted
  await page.getByPlaceholder('vd: loc.nguyen').fill(username);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).last().click();
  await page.waitForURL('**/leaderboard');
  await expect(page.getByRole('heading', { name: 'Bảng xếp hạng' })).toBeVisible();
  expectNoErrors(errors, 'auth/hub');
});
