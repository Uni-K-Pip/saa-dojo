import { expect, test } from '@playwright/test';

// 保留模試（mockA・mockB）はテストで開かない

test('演習で1問解く', async ({ page }) => {
  await page.goto('./#/practice');
  await expect(page.getByRole('heading', { name: '演習', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /問を解く$/ }).click();

  await expect(page.getByRole('button', { name: '回答する' })).toBeDisabled();
  const options = page.locator('.options input');
  const multiple = (await options.first().getAttribute('type')) === 'checkbox';
  const hint = page.locator('.sticky-actions .hint');
  // single は1つ、multiple は指定された数だけ選ぶ
  await options.nth(0).check();
  if (multiple) {
    let i = 1;
    while (/あと/.test((await hint.textContent()) ?? '') && i < 6) await options.nth(i++).check();
  }
  await page.getByRole('radio', { name: '確信' }).check();
  await page.getByRole('button', { name: '回答する' }).click();

  await expect(page.locator('.result-banner')).toBeVisible();
  await expect(page.getByRole('heading', { name: '解説' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'ChatGPT に聞く' })).toHaveAttribute('href', /^https:\/\/chatgpt\.com\/\?q=/);
});

test('5問のミニ模試を解いて見直し画面を開く', async ({ page }) => {
  await page.goto('./#/mock');
  await page.getByRole('radio', { name: /ミニ 5 問/ }).check();
  await page.getByRole('button', { name: '5 問で始める' }).click();

  for (let i = 1; i <= 5; i++) {
    await expect(page.getByText(`問 ${i} / 5`)).toBeVisible();
    // 回答は保存してから反映されるので、クリックして選択状態を待つ
    const first = page.locator('.options input').first();
    await first.click();
    await expect(first).toBeChecked();
    if (i < 5) await page.getByRole('button', { name: '次へ →' }).click();
  }
  await page.getByRole('button', { name: '見直しへ' }).click();
  await expect(page.getByRole('heading', { name: '見直し', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '提出する' })).toBeVisible();
});
