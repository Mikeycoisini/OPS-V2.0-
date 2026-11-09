import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { effectScope, reactive, nextTick } from 'vue'
import * as contract from '../services/inventory-export.ts'

// 执行真实组件script，替换网络和消息弹窗，确定性复现企业切换/关闭后的晚到响应。
const require = createRequire(import.meta.url)
const source = (await readFile(new URL('../components/InventoryExports.vue', import.meta.url), 'utf8')).match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
const js = ts.transpileModule(source + '\nreturn { open, rows, error, loading, load, download, submit };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const page = id => ({ records: [{ id, status: 'SUCCEEDED' }], current: 1, size: 10, total: 1, pages: 1 })
function mount(api) {
  const store = reactive({ epoch: 0, isAdmin: false, mutate: operation => operation() })
  const scope = effectScope()
  const model = scope.run(() => new Function('require', 'defineProps', 'exports', js)(name => {
    if (name === '@/services/api') return { api, ApiError: class extends Error {} }
    if (name === '@/services/backend-contract') return { errorMessage: e => e.message }
    if (name === '@/stores/app') return { useAppStore: () => store }
    if (name === '@/services/inventory-export') return contract
    if (name === 'element-plus') return { ElMessage: { success() {} }, ElMessageBox: { confirm: async () => {} } }
    return require(name)
  }, () => ({ filters: {} }), {}))
  return { model, store, stop: () => scope.stop() }
}
test('导出面板丢弃旧企业晚到任务，切换企业关闭并清空面板', async () => {
  const old = deferred()
  const s = mount({ inventoryExports: () => old.promise })
  try {
    s.model.open.value = true; await nextTick()
    s.store.epoch++; await nextTick()
    old.resolve(page(101)); await new Promise(r => setImmediate(r))
    assert.equal(s.model.open.value, false)
    assert.deepEqual(s.model.rows.value, [])
    assert.equal(s.model.loading.value, false)
  } finally { s.stop() }
})
test('面板关闭后，晚到的任务响应不能重新显示或安排轮询', async () => {
  const pending = deferred(); let calls = 0
  const s = mount({ inventoryExports: () => { calls++; return pending.promise } })
  try {
    s.model.open.value = true; await nextTick()
    s.model.open.value = false; await nextTick()
    pending.resolve({ ...page(1), records: [{ id: 1, status: 'RUNNING' }] })
    await new Promise(r => setImmediate(r))
    assert.deepEqual(s.model.rows.value, [])
    assert.equal(calls, 1)
  } finally { s.stop() }
})
test('切换企业中止下载，旧文件返回后不生成下载链接', async () => {
  const pending = deferred(); let signal
  const s = mount({ inventoryExports: async () => page(1), downloadInventoryExport: (id, abort) => { signal = abort; return pending.promise } })
  const original = URL.createObjectURL
  let links = 0; URL.createObjectURL = () => { links++; return 'blob:test' }
  try {
    s.model.open.value = true; await nextTick()
    const operation = s.model.download({ id: 1 })
    s.store.epoch++; await nextTick()
    assert.equal(signal.aborted, true)
    pending.resolve({ blob: new Blob(['xlsx']), fileName: 'test.xlsx' }); await operation
    assert.equal(links, 0)
  } finally { URL.createObjectURL = original; s.stop() }
})
