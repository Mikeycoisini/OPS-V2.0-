const { chromium } = require(process.env.A1_PLAYWRIGHT_MODULE || 'playwright');
const base = new URL(process.env.A1_FRONTEND_URL || 'http://127.0.0.1:5174');
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw Error('Only loopback origins allowed');
if (!process.env.A1_TEST_PASSWORD) throw Error('Set protected A1_TEST_PASSWORD');
(async () => {
 const browser = await chromium.launch({executablePath:process.env.A1_CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  const page = await browser.newPage({viewport:{width:1280,height:720}}); const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(new URL('/login',base).href);
  await page.getByPlaceholder('请输入账号').fill('a1_admin');
  await page.getByPlaceholder('请输入密码').fill(process.env.A1_TEST_PASSWORD);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('button',{name:/A1验证企业A/}).click();
  await page.getByRole('link',{name:/操作审计/}).click();
  await page.getByRole('heading',{name:'操作审计',exact:true}).waitFor();
  await page.getByRole('button',{name:'查看',exact:true}).first().click();
  await page.getByRole('dialog').getByText('变更详情',{exact:true}).waitFor();
  const eventText=await page.getByRole('dialog').innerText();
  if(eventText.includes('changesJson')) throw Error('Raw JSON exposed');
  await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
  // 延迟真实详情响应，在请求尚未完成时切企业，核对旧弹窗与旧响应不会重现。
  let intercepted;
  const received=new Promise(resolve=>{intercepted=resolve});
  let release;
  const proceed=new Promise(resolve=>{release=resolve});
  await page.route('**/api/audit-events/*',async route=>{const response=await route.fetch();intercepted();await proceed;await route.fulfill({response});});
  await page.getByRole('button',{name:'查看',exact:true}).first().click();
  await Promise.race([received,new Promise((_,reject)=>setTimeout(()=>reject(Error("Detail interception timeout")),10000))]);
  // 真实用户先关闭加载中的模态框，再切企业，旧请求仍被保持为在途。
  await page.getByRole('dialog',{name:'审计事件详情'}).getByRole('button',{name:'关闭',exact:true}).click();
  await page.locator('.tenant-switch').click();
  await page.getByRole('dialog',{name:'切换工作企业'}).getByRole('button',{name:/A1验证企业B/}).click();
  await page.waitForURL('**/workspace');
  release();
  await page.waitForLoadState('networkidle');
  if(await page.getByRole('dialog',{name:'审计事件详情'}).count()) throw Error('Old tenant dialog survived');
  if(await page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:/操作审计/}).count()) throw Error('Admin menu survived tenant switch');
  await page.goto(new URL('/audit',base).href); await page.waitForURL('**/workspace*');
  const denied=await page.evaluate(async()=> (await fetch('/api/audit-events')).status);
  if(denied!==403) throw Error('Unauthorized audit query accepted');
  if(errors.length) throw Error('Browser runtime errors: '+errors.length);
  await page.getByRole('button',{name:'退出登录',exact:true}).click();
  await page.getByRole('heading',{name:'登录工作空间',exact:true}).waitFor();
  console.log(JSON.stringify({auditPage:true,detail:true,tenantSwitchClears:true,lateResponseDiscarded:true,adminMenuHidden:true,directRouteDenied:true,apiDenied:denied,pageErrors:0}));
 } finally {await browser.close();}
})().catch(error=>{console.error(error.message);process.exit(1)});
