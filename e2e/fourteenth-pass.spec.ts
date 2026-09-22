import { expect, test } from '@playwright/test'

test('flight claim and linked maintenance revision persist across routes', async ({ page }) => {
  await page.goto('/fleet/release-workspace?flight=AX418')
  await expect(page.getByLabel('Flight review queue')).toContainText('AX418')
  await page.getByRole('button', { name: 'Claim selected review' }).click()
  await expect(page.getByRole('status')).toContainText('claimed')
  await page.goto('/operations')
  await page.goto('/fleet/release-workspace?flight=AX418')
  await expect(page.getByLabel('Selected flight')).toContainText('eng-lee')
  await page.getByRole('button', { name: 'Revise linked maintenance condition' }).click()
  await expect(page.getByRole('status')).toContainText('related flights updated')
  await expect(page.getByLabel('Selected flight')).toContainText('inspection r2')
  await page.reload()
  await expect(page.getByLabel('Selected flight')).toContainText('inspection r2')
  await page.getByLabel('Flight collection').getByRole('button', { name: /BX210/ }).click()
  await expect(page.getByLabel('Selected flight')).toContainText('inspection r1')
})
