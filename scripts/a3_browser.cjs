// A3真实浏览器验收：1.验证隔离环境；2.管理员维护厂区和范围；3.旧会话动态撤权；4.晚到响应切企业隔离；5.恢复原范围和测试厂区状态。
const { chromium } = require(process.env.A1_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = new URL(process.env.A3_FRONTEND_URL || 'http://127.0.0.1:5177');
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw Error('Only loopback origins allowed');
if (!process.env.A1_TEST_PASSWORD || !/^equipops_a[13]_[a-z_]+$/.test(process.env.A1_DB_CONFIRM || '')) throw Error('Set protected A1_TEST_PASSWORD and isolated A1_DB_CONFIRM');
async function request(page, path, method = 'GET', body) {
 return page.evaluate(async ({ path, method, body }) => {
  const headers = {};
  if (method !== 'GET') { const csrf = await (await fetch('/api/auth/csrf')).json(); const token = csrf.data || csrf; headers[token.headerName] = token.token; headers['Content-Type'] = 'application/json'; }
  const response = await fetch(path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok || (result.code && result.code !== 200)) throw Error(`HTTP ${response.status}: ${result.message || result.msg || path}`);
  return result.data === undefined ? result : result.data;
 }, { path, method, body });
}
async function login(page, account) {
 await page.goto(new URL('/login', base).href);
 await page.getByPlaceholder('请输入账号').fill(account);
 await page.getByPlaceholder('请输入密码').fill(process.env.A1_TEST_PASSWORD);
 await page.getByRole('button', { name: '登录', exact: true }).click();
 await page.getByRole('button', { name: /A1验证企业A/ }).click();
 await page.waitForURL('**/workspace');
 await page.locator('.tenant-switch').filter({ hasText: 'A1验证企业A' }).waitFor();
 await page.waitForLoadState('networkidle');
}
async function setChoices(dialog, ids) {
 await dialog.locator('.site-scope-options').waitFor();
 const labels = dialog.locator('label.el-checkbox'), wanted = new Set(ids.map(String));
 for (let i = 0; i < await labels.count(); i++) {
  const input = labels.nth(i).locator('input'), id = await input.getAttribute('value');
  if ((await input.isChecked()) !== wanted.has(id)) await labels.nth(i).click();
 }
}
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.A1_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
 const adminContext = await browser.newContext({ viewport: { width: 1280, height: 720 } }), memberContext = await browser.newContext();
 const admin = await adminContext.newPage(), member = await memberContext.newPage(), errors = [];
 for (const page of [admin, member]) page.on('pageerror', error => errors.push(error.message));
 let original, scopePath, tenantId, testSite, previousSite, release, summary;
 try {
  await login(admin, 'a1_admin');
  const me = await request(admin, '/api/auth/me'); assert.ok(me.activeTenant, 'UI选择企业后身份接口必须保留当前企业'); tenantId = me.activeTenant.id;
  const members = await request(admin, '/api/tenant-members');
  const target = members.records.find(row => row.account === 'a1_member'); assert.ok(target);
  scopePath = `/api/tenant-members/${target.id}/site-scopes`; original = await request(admin, scopePath);
  const defaultSite = (await request(admin, '/api/sites'))[0];
  previousSite = (await request(admin, '/api/sites/catalog')).find(site => site.siteCode === 'A3_BROWSER');
  await admin.getByRole('link', { name: /厂区管理/ }).click();
  await admin.getByRole('heading', { name: '厂区管理', exact: true }).waitFor();
  if (previousSite) await admin.locator('.data-table tbody tr').filter({ hasText: 'A3_BROWSER' }).getByRole('button', { name: '编辑', exact: true }).click();
  else await admin.getByRole('button', { name: '新增厂区', exact: true }).click();
  const siteDialog = admin.getByRole('dialog', { name: previousSite ? '编辑厂区' : '新增厂区' });
  if (!previousSite) await siteDialog.getByPlaceholder('企业内唯一，创建后不可修改').fill('A3_BROWSER');
  await siteDialog.getByPlaceholder('填写厂区名称').fill('A3真实浏览器验证厂区');
  const enabled = siteDialog.getByRole('switch'); if (await enabled.getAttribute('aria-checked') !== 'true') await enabled.click();
  await siteDialog.getByRole('button', { name: '保存厂区', exact: true }).click();
  await siteDialog.waitFor({ state: 'hidden' });
  await admin.getByRole('cell', { name: 'A3真实浏览器验证厂区', exact: true }).waitFor();
  testSite = (await request(admin, '/api/sites/catalog')).find(site => site.siteCode === 'A3_BROWSER'); assert.ok(testSite);
  await admin.getByRole('link', { name: /企业成员/ }).click();
  const row = admin.locator('.data-table tbody tr').filter({ hasText: 'a1_member' });
  await row.getByRole('button', { name: '厂区范围', exact: true }).click();
  const dialog = admin.getByRole('dialog', { name: '成员厂区访问范围' });
  await setChoices(dialog, [defaultSite.id, testSite.id]);
  await dialog.getByRole('button', { name: '保存范围', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual((await request(admin, scopePath)).siteIds.map(String).sort(), [defaultSite.id, testSite.id].map(String).sort());
  await login(member, 'a1_member');
  assert.equal((await request(member, '/api/sites/catalog')).length, 2);
  assert.equal(await member.getByRole('link', { name: /厂区管理/ }).count(), 0);
  await row.getByRole('button', { name: '厂区范围', exact: true }).click();
  await setChoices(dialog, []);
  await dialog.getByText('当前未选择厂区，保存将撤销该成员的全部普通厂区访问权。', { exact: true }).waitFor();
  fs.mkdirSync('artifacts/a3', { recursive: true }); await admin.screenshot({ path: 'artifacts/a3/real-member-scope.png', fullPage: true });
  await dialog.getByRole('button', { name: '保存范围', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(await request(member, '/api/sites/catalog'), []);
  const page = await request(member, '/api/equipment?current=1&size=10'); assert.equal(page.total, 0);
  let received, completed, routeError; const arrived = new Promise(resolve => { received = resolve; }); const hold = new Promise(resolve => { release = resolve; }); const fulfilled = new Promise(resolve => { completed = resolve; });
  await admin.route(`**${scopePath}`, async route => { try { const response = await route.fetch(); received(); await hold; await route.fulfill({ response }); } catch (reason) { routeError = reason; } finally { completed(); } });
  await row.getByRole('button', { name: '厂区范围', exact: true }).click(); await arrived;
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await admin.locator('.tenant-switch').click();
  await admin.getByRole('dialog', { name: '切换工作企业' }).getByRole('button', { name: /A1验证企业B/ }).click();
  await admin.waitForURL('**/workspace'); release(); await fulfilled; assert.equal(routeError, undefined); await admin.unroute(`**${scopePath}`);
  await admin.waitForLoadState('networkidle');
  assert.equal(await admin.getByRole('dialog', { name: '成员厂区访问范围' }).count(), 0);
  assert.equal(await admin.getByRole('link', { name: /厂区管理/ }).count(), 0);
  await member.goto(new URL('/sites', base).href); await member.waitForURL('**/workspace*');
  assert.deepEqual(errors, []);
  summary = { mode: 'real-backend-http-browser', sitePersisted: true, memberScopeSaved: true, oldSessionRevoked: true, emptyScopeNoEquipment: true, lateResponseDiscarded: true, adminRouteHidden: true, runtimeErrors: 0 };
 } finally {
  if (release) release();
  try {
  if (original && scopePath && tenantId) {
   await request(admin, '/api/auth/active-tenant', 'POST', { tenantId });
   const current = await request(admin, scopePath); await request(admin, scopePath, 'PUT', { expectedVersion: current.version, siteIds: original.siteIds });
   if (testSite) await request(admin, `/api/sites/${testSite.id}`, 'PUT', previousSite ? { siteCode: previousSite.siteCode, name: previousSite.name, address: previousSite.address, enabled: previousSite.enabled } : { siteCode: testSite.siteCode, name: testSite.name, address: testSite.address, enabled: false });
  }
  } finally { await browser.close(); }
 }
 console.log(JSON.stringify(summary));
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
