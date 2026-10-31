/** Completes only the immutable historical 1.9.1 setup using synthetic data. */
export async function finishSetup(page) {
  const start = page.locator('.start-cards');
  if (await start.isVisible()) await start.locator('button.start-card').first().click();
  await page.locator('.calendar-modes').waitFor();
  await page.locator('.calendar-mode[role="radio"][data-mode="rolling"]').click();
  const actions = page.locator('.onboarding-actions button');
  await actions.last().click();
  await page.locator('.direction-input').waitFor();
  await page.locator('.onboarding-content').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
  await actions.last().click();
  await page.getByRole('button', { name: '暂时跳过', exact: true }).click();
  await page.locator('.board').waitFor();
}
