import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { TangibleScene } from '@itch/protocol';

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

async function scene(page: Page): Promise<TangibleScene> {
  return JSON.parse(await page.getByTestId('scene-json').innerText()) as TangibleScene;
}

test('synthetic CAT/DOG updates, motion preserves track IDs, and removal/restoration works', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('word')).toHaveText('CAT');
  await expect(page.getByTestId('piece-count')).toHaveText('3');
  const before = (await scene(page)).objects.find((object) => object.pieceId === 'letter:A');
  await page.getByRole('slider', { name: 'Move A horizontally' }).fill('0.55');
  const after = (await scene(page)).objects.find((object) => object.pieceId === 'letter:A');
  expect(after?.trackId).toBe(before?.trackId);
  expect(after?.x).toBe(0.55);
  await page.getByRole('button', { name: 'Remove A', exact: true }).click();
  await expect(page.getByTestId('word')).toHaveText('CT');
  await expect(page.getByTestId('piece-count')).toHaveText('2');
  await page.getByRole('button', { name: 'Restore A', exact: true }).click();
  await expect(page.getByTestId('word')).toHaveText('CAT');
  await page.getByRole('button', { name: 'DOG', exact: true }).click();
  await expect(page.getByTestId('word')).toHaveText('DOG');
  await expect(page.locator('#scratch-response')).toHaveText('Scratch bridge: Woof!');
  await page.getByRole('button', { name: 'Clear scene' }).click();
  await expect(page.getByTestId('piece-count')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('explicit recording exports only changes and replays/rewinds without a camera', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('word')).toHaveText('CAT');
  await page.getByRole('button', { name: 'Record scene', exact: true }).click();
  await page.getByLabel('Debug overlay').uncheck();
  await page.getByRole('button', { name: 'Remove A', exact: true }).click();
  await page.getByRole('button', { name: 'Restore A', exact: true }).click();
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export session', exact: true }).click();
  const download = await downloadEvent;
  const path = await download.path();
  expect(path).toBeTruthy();
  const recorded = JSON.parse(await readFile(path!, 'utf8')) as { scenes: TangibleScene[] };
  expect(recorded.scenes.map((snapshot) => snapshot.derived?.['currentWord'])).toEqual([
    'CAT',
    'CT',
    'CAT',
  ]);
  await page.getByRole('button', { name: 'Replay recorded session', exact: true }).click();
  await expect(page.getByTestId('word')).toHaveText('CAT');
  await expect(page.getByRole('button', { name: 'Record scene', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Next scene', exact: true }).click();
  await expect(page.getByTestId('word')).toHaveText('CT');
  await page.getByRole('button', { name: 'Rewind', exact: true }).click();
  await expect(page.getByTestId('word')).toHaveText('CAT');
  await expect(page.locator('#camera-status')).toHaveText('Camera: idle');
});

test('permission denial is recoverable and leaves synthetic data usable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: async () => {
          throw new DOMException('Camera permission denied for test', 'NotAllowedError');
        },
        enumerateDevices: async () => [],
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await expect(page.locator('#camera-status')).toContainText('error');
  await expect(page.locator('#notice')).toContainText('Camera permission denied');
  await expect(page.getByRole('button', { name: 'Start camera', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'DOG', exact: true }).click();
  await expect(page.getByTestId('word')).toHaveText('DOG');
});

test('missing media APIs explain the secure-context requirement', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await expect(page.locator('#camera-status')).toContainText('HTTPS or localhost');
  await page.getByLabel('Scene source').selectOption('camera');
  await expect(page.getByTestId('piece-count')).toHaveText('0');
  await expect(page.locator('#workspace-status')).toContainText('uncalibrated');
});

test('mobile viewport keeps controls reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start camera', exact: true })).toBeVisible();
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasOverflow).toBe(false);
});

test.describe('mocked browser camera acquisition', () => {
  test('streams frames, saves an explicit PNG, remains uncalibrated, and stops the stream', async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.grantPermissions(['camera']);
    await page.goto('/');
    await page.getByRole('button', { name: 'Start camera', exact: true }).click();
    await expect(page.locator('#camera-status')).toHaveText('Camera: running');
    await expect
      .poll(async () => Number((await page.locator('#frames').innerText()).split(' / ')[0]))
      .toBeGreaterThan(0);
    await expect(page.locator('#resolution')).not.toHaveText('—');
    await page.getByLabel('Scene source').selectOption('camera');
    await expect(page.locator('#workspace-status')).toContainText('uncalibrated');
    await expect(page.getByTestId('piece-count')).toHaveText('0');
    const downloadEvent = page.waitForEvent('download', {
      predicate: (download) => download.suggestedFilename().endsWith('.png'),
    });
    await page.getByRole('button', { name: 'Save camera still', exact: true }).click();
    const download = await downloadEvent;
    expect(await download.failure()).toBeNull();
    const png = await readFile((await download.path())!);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
    await expect(page.locator('#camera-status')).toHaveText('Camera: stopped');
    expect(
      await page.locator('#camera').evaluate((video: HTMLVideoElement) => video.srcObject === null),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
});
