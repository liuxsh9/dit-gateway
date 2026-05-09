// Copyright 2025 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

// @watch start
// templates/shared/label_filter.tmpl
// templates/repo/issue/filter_list.tmpl
// web_src/css/repo/issue-list.css
// web_src/js/features/repo-issue-sidebar-list.ts
// @watch end

import {expect} from '@playwright/test';
import {test} from './utils_e2e.ts';

test.use({user: 'user2'});

test('Label filter exclusion', async ({page}) => {
  const response = await page.goto('/user2/repo1/issues');
  expect(response?.status()).toBe(200);

  await expect(
    page.getByRole('link', {name: 'issue1'}),
  ).toBeVisible();

  // open label filter dropdown
  await page.getByRole('combobox').filter({has: page.getByText('Label')}).click();

  // exclude the label1 label attached to issue1
  const labelOption = page
    .getByRole('option').filter({has: page.getByText('label1')});
  await expect(labelOption).toBeVisible();
  await labelOption.hover();
  await labelOption.getByRole('button', {name: 'Exclude label'}).click();

  await expect(
    page.getByRole('link', {name: 'issue1'}),
  ).toBeHidden();

  // open label filter dropdown
  await page.getByRole('combobox').filter({has: page.getByText('Label')}).click();

  // clear exclusion
  await expect(labelOption).toBeVisible();
  await labelOption.hover();
  await labelOption.getByRole('button', {name: 'Clear exclusion'}).click();

  await expect(
    page.getByRole('link', {name: 'issue1'}),
  ).toBeVisible();
});

test('Issue and pull list Type and Sort filters open visible menus', async ({page}) => {
  for (const listPath of ['/user2/repo1/issues', '/user2/repo1/pulls']) {
    const response = await page.goto(listPath);
    expect(response?.status()).toBe(200);

    for (const selector of ['.list-header-type.ui.dropdown', '.list-header-sort.ui.dropdown']) {
      const dropdown = page.locator(selector);
      const menu = dropdown.locator('> .menu');
      await expect(menu).toBeHidden();

      await dropdown.click();
      await expect(menu).toBeVisible();

      await expect(async () => {
        expect(await menu.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 20) return false;
          const probe = document.elementFromPoint(rect.left + 10, rect.top + 10);
          return el.contains(probe);
        })).toBe(true);
      }).toPass();

      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
    }
  }
});
