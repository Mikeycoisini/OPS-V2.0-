// A3浏览器契约演练：网络由固定响应控制，仅验证真实Vue页面与传输契约，不代表后端授权验收。
const { chromium } = require(process.env.A1_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = new URL(process.env.A3_FRONTEND_URL || 'http://127.0.0.1:5176');
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw Error('Only loopback origins allowed');
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.A1_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
 try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [], writes = [], unexpected = []; page.on('pageerror', error => errors.push(error.message));
  const memberId = '2119840104873218049', siteId = '2119840104873218051';
  let version = 1, siteIds = [siteId], conflict = true;
  const sites = [{ id: siteId, tenantId: '101', siteCode: 'S1', name: '授权厂区一', address: '演练地址', enabled: true, isDefault: true }, { id: '2119840104873218052', tenantId: '101', siteCode: 'S2', name: '授权厂区二', address: null, enabled: true, isDefault: false }];
  await page.route('**/api/**', async route => {
   const req = route.request(), url = new URL(req.url()), method = req.method(); let data;
   if (url.pathname === '/api/auth/me') data = { userId: 10, account: 'ui_admin', name: '演练管理员', activeTenant: { id: 101, tenantCode: 'UI-A3', name: 'A3浏览器契约企业', enabled: true }, roleCodes: ['TENANT_ADMIN'] };
   else if (url.pathname === '/api/auth/csrf') data = { headerName: 'X-CSRF-TOKEN', token: 'ui-contract-token' };
   else if (url.pathname === '/api/sites/catalog') data = sites;
   else if (url.pathname === '/api/sites' && method === 'POST') { const body = req.postDataJSON(); writes.push({ path: url.pathname, body }); data = { id: '2119840104873218053', tenantId: '101', ...body, isDefault: false }; sites.push(data); }
   else if (url.pathname === '/api/tenant-members') data = { records: [{ id: memberId, tenantId: '101', userId: '11', account: 'ui_member', displayName: '范围演练成员', enabled: true, roles: [], joinedAt: '2026-11-10T01:00:00' }], current: 1, size: 10, total: 1, pages: 1 };
   else if (url.pathname === `/api/tenant-members/${memberId}/site-scopes`) {
    if (method === 'PUT') {
     writes.push({ path: url.pathname, body: req.postDataJSON() });
     if (conflict) { conflict = false; version++; return route.fulfill({ status: 409, json: { message: '范围已被其他管理员修改，请重新加载' } }); }
     assert.equal(req.postDataJSON().expectedVersion, version); siteIds = req.postDataJSON().siteIds; version++;
    }
    data = { membershipId: memberId, version, siteIds };
   } else { unexpected.push(`${method} ${url.pathname}`); return route.fulfill({ status: 500, json: { message: 'Unexpected UI contract route' } }); }
   return route.fulfill({ json: { code: 200, data } });
  });
  await page.goto(new URL('/sites', base).href);
  await page.getByRole('heading', { name: '厂区管理', exact: true }).waitFor();
  await page.getByRole('cell', { name: '授权厂区一', exact: true }).waitFor();
  await page.getByRole('button', { name: '新增厂区', exact: true }).click();
  const siteDialog = page.getByRole('dialog', { name: '新增厂区' });
  await siteDialog.getByPlaceholder('企业内唯一，创建后不可修改').fill('S3');
  await siteDialog.getByPlaceholder('填写厂区名称').fill('浏览器新增厂区');
  await siteDialog.getByRole('button', { name: '保存厂区', exact: true }).click();
  await page.getByRole('cell', { name: '浏览器新增厂区', exact: true }).waitFor();
  assert.deepEqual(writes[0].body, { siteCode: 'S3', name: '浏览器新增厂区', address: null, enabled: true });
  await page.getByRole('link', { name: /企业成员/ }).click();
  await page.getByRole('button', { name: '厂区范围', exact: true }).click();
  const scopeDialog = page.getByRole('dialog', { name: '成员厂区访问范围' });
  const first = scopeDialog.locator('.el-checkbox').filter({ hasText: '授权厂区一 · S1' });
  await first.waitFor(); assert.equal(await first.locator('input').isChecked(), true);
  await first.click();
  await scopeDialog.getByRole('button', { name: '保存范围', exact: true }).click();
  await scopeDialog.getByText('范围已被其他管理员修改，请重新加载', { exact: true }).waitFor();
  assert.equal(await scopeDialog.getByRole('button', { name: '保存范围', exact: true }).isDisabled(), true);
  await scopeDialog.getByRole('button', { name: '重新加载', exact: true }).click();
  await first.waitFor(); await first.click();
  await scopeDialog.getByText('当前未选择厂区，保存将撤销该成员的全部普通厂区访问权。', { exact: true }).waitFor();
  await scopeDialog.getByRole('button', { name: '保存范围', exact: true }).click();
  await scopeDialog.waitFor({ state: 'hidden' });
  assert.deepEqual(writes.at(-1).body, { expectedVersion: 2, siteIds: [] });
  assert.equal(writes.at(-1).path, `/api/tenant-members/${memberId}/site-scopes`);
  fs.mkdirSync('artifacts/a3', { recursive: true });
  await page.screenshot({ path: 'artifacts/a3/members-desktop-contract.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '展开导航', exact: true }).click();
  const navLink = page.getByRole('link', { name: /厂区管理/ }); await navLink.scrollIntoViewIfNeeded(); await navLink.click();
  await page.getByRole('heading', { name: '厂区管理', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('.admin-sidebar').getBoundingClientRect().right <= 1);
  await page.getByRole('cell', { name: '授权厂区一', exact: true }).waitFor();
  await page.locator('.el-message').first().waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: 'artifacts/a3/sites-mobile-contract.png', fullPage: true });
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ mode: 'mocked-http-ui-contract', siteCreate: true, stringMemberId: true, emptyScopeRevocation: true, conflictRequiresReload: true, mobileNavigation: true, runtimeErrors: 0 }));
 } finally { await browser.close(); }
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
