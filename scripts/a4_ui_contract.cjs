// 固定HTTP响应驱动真实Vue/Chromium，验证A4页面、版本、UUID与ID契约；不代表后端授权/事务验收。
const { chromium } = require(process.env.A1_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), assert = require('node:assert/strict');
const base = new URL(process.env.A4_FRONTEND_URL || 'http://127.0.0.1:5178');
if (base.protocol !== 'http:' || !['127.0.0.1','localhost'].includes(base.hostname) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw Error('Only loopback origins allowed');
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.A1_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
 try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errors = [], warnings = [], writes = [], unexpected = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'warning' && m.text().includes('Failed to resolve component')) warnings.push(m.text()); });
  const teamId = '2119840104873218049', createdId = '2119840104873218050', orderId = '2119840104873218051', userId = '2119840104873218052';
  const initial = { id: teamId, tenantId: '101', teamCode: 'T1', name: '原有交接团队', enabled: true, version: 1, membershipIds: ['3'], siteIds: ['11'] }, teams = [initial], operations = new Map();
  let admin = true, uncertain = true, reassignConflict = true, inventoryQuery;
  let order = { id: orderId, tenantId: '101', siteId: '11', teamId: null, version: 1, orderNo: 'A4-UI-001', title: 'A4页面工单', equipmentId: '12', description: '固定响应工单', priority: 'NORMAL', status: 'IN_PROGRESS', assigneeUserId: '15', createdBy: '16', createdAt: '2026-11-10T01:00:00', updatedAt: '2026-11-10T01:00:00' };
  await page.route('**/api/**', async route => {
   const req=route.request(), url=new URL(req.url()), method=req.method(), path=url.pathname; let data;
   if (path === '/api/auth/me') data = { userId: 99, account: admin ? 'ui_admin' : 'ui_member', name: 'A4页面契约', activeTenant: { id: 101, tenantCode: 'UI-A4', name: 'A4页面契约企业', enabled: true }, roleCodes: admin ? ['TENANT_ADMIN'] : [] };
   else if (path === '/api/auth/csrf') data = { headerName:'X-CSRF-TOKEN', token:'ui-only-token' };
   else if (path === '/api/sites/catalog') data = [{ id:'11', siteCode:'S1', name:'工单厂区', enabled:true }];
   else if (path === '/api/tenant-members') data = { records:[{id:'3',userId,tenantId:'101',account:'ui_target',displayName:'目标成员',enabled:true,roles:[]}], current:1,size:100,total:1,pages:1 };
   else if (path === '/api/teams' && method === 'GET') data=admin?teams:[initial];
   else if (path === '/api/teams' && method === 'POST') { const body=req.postDataJSON();writes.push({path,body});assert.match(body.requestId,/^[0-9a-f-]{36}$/);data={id:createdId,tenantId:'101',teamCode:body.teamCode,name:body.name,enabled:body.enabled,version:0,membershipIds:[],siteIds:[]};teams.push(data); }
   else if (path.startsWith('/api/teams/')) {
    const target=teams.find(t=>path.split('/')[3]===t.id);assert.ok(target);
    if(method==='GET')data=target;
    else {const body=req.postDataJSON();writes.push({path,body});assert.match(body.requestId,/^[0-9a-f-]{36}$/);
     if(operations.has(body.requestId))data=operations.get(body.requestId);
     else {assert.equal(body.expectedVersion,target.version);if(path.endsWith('/members'))target.membershipIds=body.membershipIds;else if(path.endsWith('/site-scopes'))target.siteIds=body.siteIds;else {target.name=body.name;target.enabled=body.enabled;}target.version++;data={...target};operations.set(body.requestId,data);
      if(!path.endsWith('/members')&&!path.endsWith('/site-scopes')&&uncertain){uncertain=false;return route.fulfill({status:500,json:{message:'响应未能确认，请按原号重试'}});}
     }
    }
   }
   else if (path === '/api/warehouses') data=[];
   else if (path === '/api/inventory/exports') data={records:[],current:1,size:10,total:0,pages:0};
   else if (path === '/api/inventory/transactions') {inventoryQuery=url.searchParams.get('workOrderId');data={records:[],current:1,size:10,total:0,pages:0};}
   else if (path === '/api/work-orders') data={records:[order],current:1,size:10,total:1,pages:1};
   else if(path===`/api/work-orders/${orderId}`)data=order;
   else if(path===`/api/work-orders/${orderId}/logs`||path===`/api/work-orders/${orderId}/parts`)data=[];
   else if(path===`/api/work-orders/${orderId}/reassign`){const body=req.postDataJSON();writes.push({path,body});if(reassignConflict){reassignConflict=false;order.version++;return route.fulfill({status:409,json:{message:'工单已被其他管理员更新，请重新加载'}});}assert.equal(body.expectedVersion,order.version);order={...order,assigneeUserId:body.targetAssigneeUserId,teamId:body.targetTeamId,version:order.version+1};data=order;}
   else {unexpected.push(`${method} ${path}`);return route.fulfill({status:500,json:{message:'Unexpected UI contract request'}});}
   return route.fulfill({json:{code:200,data}});
  });
  await page.goto(new URL('/teams',base).href);await page.getByRole('heading',{name:'团队管理',exact:true}).waitFor();
  await page.getByRole('button',{name:'新建团队',exact:true}).click();const create=page.getByRole('dialog',{name:'新建团队'});
  await create.getByPlaceholder('企业内唯一，创建后不可修改').fill('T2');await create.getByPlaceholder('填写团队名称').fill('新增演练团队');await create.getByRole('button',{name:'保存团队',exact:true}).click();await create.waitFor({state:'hidden'});
  const row=page.locator('.data-table tbody tr').filter({hasText:'新增演练团队'});await row.getByRole('button',{name:'成员',exact:true}).click();const members=page.getByRole('dialog',{name:'团队成员'});
  const memberLabel=members.locator('.el-checkbox').filter({hasText:'目标成员'});await memberLabel.click();await members.getByRole('button',{name:'保存团队',exact:true}).click();await members.waitFor({state:'hidden'});
  assert.deepEqual(teams[1].membershipIds,['3']);
  await row.getByRole('button',{name:'工作厂区',exact:true}).click();const sites=page.getByRole('dialog',{name:'团队工作厂区'});await sites.locator('.el-checkbox').filter({hasText:'工单厂区'}).click();await sites.getByRole('button',{name:'保存团队',exact:true}).click();await sites.waitFor({state:'hidden'});assert.deepEqual(teams[1].siteIds,['11']);
  await row.getByRole('button',{name:'资料',exact:true}).click();const meta=page.getByRole('dialog',{name:'团队资料'});await meta.getByPlaceholder('填写团队名称').fill('新名称等待核对');await meta.getByRole('button',{name:'保存团队',exact:true}).click();await meta.getByText('响应未能确认，请按原号重试',{exact:true}).waitFor();assert.equal(await meta.getByRole('button',{name:'取消',exact:true}).isDisabled(),true);
  await meta.getByRole('button',{name:'按原请求重试',exact:true}).click();await meta.waitFor({state:'hidden'});const metadataWrites=writes.filter(w=>w.path===`/api/teams/${createdId}`);assert.equal(metadataWrites.length,2);assert.deepEqual(metadataWrites[0].body,metadataWrites[1].body);
  await page.getByRole('link',{name:/维修工单/}).click();await page.getByRole('button',{name:'查看详情',exact:true}).click();await page.getByRole('button',{name:'受控改派',exact:true}).click();const handoff=page.getByRole('dialog',{name:'工单受控改派'});
  await handoff.getByPlaceholder('说明责任交接原因，1—1000个字符').fill('第一次交接');await handoff.getByRole('button',{name:'确认交接',exact:true}).click();await handoff.getByText('工单已被其他管理员更新，请重新加载',{exact:true}).waitFor();assert.equal(await handoff.getByRole('button',{name:'确认交接',exact:true}).isDisabled(),true);
  await handoff.getByRole('button',{name:'重新加载',exact:true}).click();await handoff.getByRole('combobox').first().click();await page.getByRole('option',{name:`目标成员 · #${userId}`,exact:true}).click();
  await handoff.getByRole('combobox').nth(1).click();await page.getByRole('option',{name:'原有交接团队 · T1',exact:true}).click();await handoff.getByPlaceholder('说明责任交接原因，1—1000个字符').fill('  班组现场交接  ');
  fs.mkdirSync('artifacts/a4',{recursive:true});await page.screenshot({path:'artifacts/a4/handoff-ui-contract.png',fullPage:true});await handoff.getByRole('button',{name:'确认交接',exact:true}).click();await handoff.waitFor({state:'hidden'});
  const result=writes.filter(w=>w.path.endsWith('/reassign')).at(-1);assert.equal(result.body.targetAssigneeUserId,userId);assert.equal(result.body.targetTeamId,teamId);assert.equal(result.body.reason,'班组现场交接');assert.equal(result.body.expectedVersion,2);assert.equal(order.status,'IN_PROGRESS');
  admin=false;await page.goto(new URL('/teams',base).href);await page.getByRole('heading',{name:'我的协作团队',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'新建团队',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'资料',exact:true}).count(),0);
  await page.getByRole('button',{name:'详情',exact:true}).click();await page.getByRole('dialog',{name:'团队详情'}).getByText(teamId,{exact:true}).waitFor();await page.getByRole('dialog',{name:'团队详情'}).getByRole('button',{name:'关闭',exact:true}).click();
  await page.goto(new URL(`/inventory?tab=transactions&workOrderId=${orderId}`,base).href);await page.getByRole('heading',{name:'备件库存',exact:true}).waitFor();await page.waitForLoadState('networkidle');assert.equal(inventoryQuery,orderId);
  await page.goto(new URL('/teams',base).href);await page.getByRole('heading',{name:'我的协作团队',exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'artifacts/a4/teams-mobile-ui-contract.png',fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);assert.deepEqual(unexpected,[]);console.log(JSON.stringify({mode:'mocked-http-ui-contract',teamCreate:true,membershipIdsPreserved:true,teamSites:true,uncertainSameRequestRetry:true,reassignConflictReload:true,stringOrderTargetIds:true,personalTeamIntersectionHint:true,ordinaryTeamReadOnly:true,mobileNoOverflow:true,runtimeErrors:0}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error.stack||error.message);process.exit(1)});
