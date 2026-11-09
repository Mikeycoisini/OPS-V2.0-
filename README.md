# EquipOps V2.0 前端

A0配套基线与后续差距记录位于[后端仓库](https://github.com/Mikeycoisini/EquipOps)的`docs/plan/55-A0基线差距来源与迁移映射.md`。本地双仓检出可在后端执行`python3 scripts/check_a0.py --frontend ../OPS-V2.0-`复核配套源码与迁移基线；报告随本次分支交付，本地路径为`../EquipOps/docs/plan/55-A0基线差距来源与迁移映射.md`。

A1使用`.nvmrc`指定Node22.18，GitHub CI执行锁定安装、契约测试及构建。工程验证与隔离测试账号说明见后端`docs/plan/57-A1工程底座与实际验证.md`；`scripts/a1_browser.cjs`可对真实本机前后端执行登录、企业切换及权限检查，不在业务运行时注入假身份。

Vue 3 + TypeScript + Vite + Pinia + Element Plus 的企业设备运维后台。采用白色导航、浅灰内容背景和蓝色强调；不包含运行时业务 mock、演示账号或伪造汇总。

## 本地运行

在当前仓库目录运行，需要 Node.js 22.18+ 或 24.12+：

```bash
npm install
npm run dev
```

默认 `http://localhost:5174`，端口占用时直接提示。开发服务将 `/api` 代理到 `http://localhost:8082`。`VITE_API_BASE_URL` 留空即可走代理；如指定另一个源地址，需由后端允许该源携带 Cookie 的跨域请求。

```bash
npm run test:contracts
npm run build
npm run preview
```

## 登录与企业

- 默认启用真实登录，使用 `POST /api/auth/login` 的账号、密码与后端 Session。
- 请求携带 Cookie，写入前自动通过 `GET /api/auth/csrf` 获取最新 CSRF；不保存 Bearer token 或密码。
- 登录后读取 `/api/auth/me`；未选企业时进入企业选择页，企业列表来自 `/api/tenants/mine`。
- 切换企业调用 `/api/auth/active-tenant`，清空旧页面上下文并忽略旧请求结果。业务操作期间禁止切换企业。
- 401 回登录；403 显示原始权限/CSRF 原因，不把正常会话直接退出。
- 只有明确配置 `VITE_AUTH_REQUIRED=false` 才允许本地布局检查，页面显示“未登录”提示。该配置不替代后端授权，不生成假身份。用户现有 `.env.local` 本次不改。

## 已接入页面

| 页面 | 当前后端接口与行为 |
| --- | --- |
| 工作台 | `/workspace/summary`；待办统计与最新工单。低库存汇总不可用时不显示 0 |
| 维修工单 | `/work-orders` 服务端分页、详情、用料与日志；报修、派单、开始维修、维修记录、提交验收、通过/退回 |
| 设备档案 | `/equipment` 分页、增改删；`/{id}/status?targetStatus=` 启停；`/equipment/history?equipmentId=` 完成履历 |
| 备件库存 | `/spare-parts` 目录、`/warehouses` 已启用默认仓库、`/warehouse-stocks` 余额、`/inventory/transactions` 流水 |
| 出入库 | `/inventory/stock-ins` 入库、`/inventory/issues` 工单领料、`/inventory/returns` 按原领料退回 |
| 操作审计 | 管理员读取`/audit-events`分页与详情，按动作、操作者、对象、结果及时间筛选；仅展示后端脱敏数据，无编辑删除 |
| 企业成员 | 管理员使用 `/tenant-members` 分页、添加已有账号和启停成员；角色只读展示 |

### 保留的业务边界

- 工单枚举与动作按后端定义，不通过通用编辑接口直接修改状态。派单后仍为 `PENDING`；负责人不能验收自己工单，管理员不自动拥有验收角色。
- 待派单和待开工的汇总点击均进入待处理列表；通过负责人是否为空区分，不伪造后端未提供的筛选。
- 列表返回 MyBatis-Plus `records/current/size/total/pages`；统计不从当前页推算全企业数量。
- 设备资料编辑不提交运行状态，启停使用独立接口。新设备初始为未运行；运行中不能删除，需关注状态不直接启停。
- 目录资料不修改库存。余额逐仓库、逐备件显示，不相加不同单位；缺少余额记录不代表已确认库存为零。
- 库存请求带 `Idempotency-Key`。失败参数和请求号按用户、企业、操作及关联工单/流水保留在 sessionStorage，关闭或刷新后可继续原请求。开始新操作前需核对上次流水，不自动重试写入。
- 退料关联原领料流水，由后端检查剩余可退数量及当前工单负责人；工单维修中、待验收、完成后均可退料。
- 当前未提供完整角色目录接口，成员页面不猜测角色 ID。添加已有账号使用空 `roleIds`，不自动授予角色。

## 源码与验证范围

`src/services/http.ts` 处理会话/CSRF/错误；`api.ts` 表达接口；`backend-contract.ts` 集中状态权限、查询及库存请求快照；`composables/usePage.ts` 处理分页和旧响应保护。浅色样式位于 `admin.css` 与 `admin-details.css`。

配套后端为[Mikeycoisini/EquipOps](https://github.com/Mikeycoisini/EquipOps)。本仓库为[Mikeycoisini/OPS-V2.0-](https://github.com/Mikeycoisini/OPS-V2.0-)。当前源码与构建结果各自记录，实际数据库写入和角色场景以真实联调结果为准。

新增页面包括日期周期维护、维修统计与导出故障告警处置，访问权限和状态流转由配套后端核验。后续功能按完整系统阶段路线交付。

审计事件和对象ID兼容BIGINT字符串，页面不转换为JavaScript Number。可按后端59号报告配置本机环境，运行`scripts/a2_browser.cjs`复核真实详情与企业切换晚到响应隔离。
