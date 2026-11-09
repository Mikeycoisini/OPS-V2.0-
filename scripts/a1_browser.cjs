// 显式验证本机A1实例；Playwright仅作为独立验证工具安装。
const { chromium } = require(process.env.A1_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.A1_FRONTEND_URL || 'http://127.0.0.1:5174';
const parsed = new URL(base);
if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)
    || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
  throw Error('Only loopback frontend origins are permitted');
}
if (!process.env.A1_TEST_PASSWORD) throw Error('Set protected A1_TEST_PASSWORD');
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.A1_CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true, args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/login');
    await page.getByPlaceholder('请输入账号').fill('a1_admin');
    await page.getByPlaceholder('请输入密码').fill(process.env.A1_TEST_PASSWORD);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('heading', { name: '选择工作企业' }).waitFor();
    await page.getByRole('button', { name: /A1验证企业A/ }).click();
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: /企业成员/ }).waitFor();
    await page.locator('.tenant-switch').click();
    await page.getByRole('dialog').getByRole('button', { name: /A1验证企业B/ }).click();
    await page.locator('.tenant-switch').filter({ hasText: 'A1验证企业B' }).waitFor();
    if (await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: /企业成员/ }).count()) {
      throw Error('Old tenant admin navigation leaked');
    }
    await page.goto(base + '/members');
    await page.waitForURL('**/workspace*');
    const denied = await page.evaluate(async () => (await fetch('/api/tenant-members')).status);
    if (denied !== 403) throw Error('B tenant admin endpoint was not denied');
    await page.locator('.tenant-switch').click();
    await page.getByRole('dialog').getByRole('button', { name: /A1验证企业A/ }).click();
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: /企业成员/ }).waitFor();
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await page.getByRole('heading', { name: '登录工作空间' }).waitFor();
    if (errors.length) throw Error('Browser runtime errors: ' + errors.length);
    console.log(JSON.stringify({ login: true, tenantSwitch: 'A-B-A', roleIsolation: true,
      directRouteDenied: true, apiDenied: denied, logout: true, pageErrors: 0 }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exit(1); });
