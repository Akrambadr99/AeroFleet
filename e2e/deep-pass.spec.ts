import { expect, test } from '@playwright/test'
test('release requires evidence, authority, and a rationale', async ({ page }) => {
  await page.goto('/fleet/N742AX/availability')
  await expect(page.getByText('UNSIGNED_INSPECTION')).toBeVisible()
  await page.getByLabel('Engineering signature present').check()
  await page.getByLabel('Authority').selectOption('approver')
  await page.getByLabel('Release rationale').fill('Engineering inspection signed and flight window verified.')
  await page.getByRole('button', { name: 'Record return to service' }).click()
  await expect(page.getByRole('status')).toContainText('release recorded')
})
