import { expect, test, type Page } from '@playwright/test';

const WIDTH = 7;
const SAVE_KEY = 'maw:save:v1';

interface SavedCell {
  item: { chain: string; level: number; pinned?: boolean } | null;
  blocker: string | null;
}
interface Saved {
  energy: number;
  coins: number;
  board: { cells: SavedCell[] };
}

async function save(page: Page): Promise<Saved> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
}

async function cellPoint(page: Page, cell: number) {
  const box = (await page.locator('canvas').boundingBox())!;
  const cs = box.width / WIDTH;
  return { x: box.x + (cell % WIDTH) * cs + cs / 2, y: box.y + Math.floor(cell / WIDTH) * cs + cs / 2 };
}

async function tapCell(page: Page, cell: number) {
  const p = await cellPoint(page, cell);
  await page.mouse.click(p.x, p.y);
}

async function drag(page: Page, from: number, to: number) {
  const a = await cellPoint(page, from);
  const b = await cellPoint(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/play');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(300);
});

test('landing page is server-rendered with a play link', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Merge Around the World');
  await expect(page.locator('a[href="/play"]')).toBeVisible();
});

test('board cells are at least 48px on touch screens', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch-only requirement');
  const box = (await page.locator('canvas').boundingBox())!;
  expect(box.width / WIDTH).toBeGreaterThanOrEqual(48);
});

test('tap-tap merges two identical items', async ({ page }) => {
  // Paris start: coffee beans on cells 24 and 32.
  await tapCell(page, 24);
  await tapCell(page, 32);
  await page.waitForTimeout(300);
  const s = await save(page);
  expect(s.board.cells[32]!.item).toMatchObject({ chain: 'bakery', level: 2 });
  expect(s.board.cells[24]!.item).toBeNull();
});

test('double tap merges the closest identical item onto the tapped one', async ({ page }) => {
  // Coffee beans on 24 and 32: double tap on 24 pulls 32 onto it.
  const p = await cellPoint(page, 24);
  await page.mouse.dblclick(p.x, p.y);
  await page.waitForTimeout(300);
  const s = await save(page);
  expect(s.board.cells[24]!.item).toMatchObject({ chain: 'bakery', level: 2 });
  expect(s.board.cells[32]!.item).toBeNull();
});

test('drag and drop merges and moves items', async ({ page }) => {
  await drag(page, 30, 38); // seed onto seed
  await page.waitForTimeout(300);
  let s = await save(page);
  expect(s.board.cells[38]!.item).toMatchObject({ chain: 'flowers', level: 2 });
  await drag(page, 38, 45); // move to empty cell
  await page.waitForTimeout(300);
  s = await save(page);
  expect(s.board.cells[45]!.item).toMatchObject({ chain: 'flowers', level: 2 });
});

test('selecting then tapping the generator spends energy and spawns an item', async ({ page }) => {
  const before = await save(page);
  const itemsBefore = before.board.cells.filter((c) => c.item).length;
  await tapCell(page, 31);
  await page.getByRole('button', { name: /Produ/ }).click();
  await tapCell(page, 31);
  await page.waitForTimeout(400);
  const s = await save(page);
  expect(s.energy).toBe(before.energy - 2);
  expect(s.board.cells.filter((c) => c.item).length).toBe(itemsBefore + 2);
});

test('the whole board and recycle zone fit on screen', async ({ page }) => {
  const box = (await page.locator('canvas').boundingBox())!;
  const panel = (await page.locator('section.panel').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(panel.y + 1);
});

test('selling through the recycle zone grants coins', async ({ page }) => {
  const box = (await page.locator('canvas').boundingBox())!;
  const cs = box.width / WIDTH;
  await tapCell(page, 24);
  await page.mouse.click(box.x + box.width / 2, box.y + 9 * cs + cs * 0.6);
  await page.waitForTimeout(300);
  const s = await save(page);
  expect(s.coins).toBe(1);
  expect(s.board.cells[24]!.item).toBeNull();
});

test('city panel opens and lists renovation tasks', async ({ page }) => {
  await page.getByRole('button', { name: /Ville|City/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').locator('li')).toHaveCount(7);
});
