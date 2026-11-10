import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import { effectScope } from 'vue'
import ts from 'typescript'

// 加载真实SFC的setup与选择处理函数，网络仅用空替身；不复制Number转换实现。
const source = await readFile(new URL('../components/RecordPicker.vue', import.meta.url), 'utf8')
const compiled = ts.transpileModule(compileScript(parse(source).descriptor, { id: 'record-picker-contract' }).content, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace(/from ['"]vue['"]/g, `from '${import.meta.resolve('vue')}'`)
  .replace(/from ['"]@\/services\/api['"]/g, `from 'data:text/javascript,export const api={}'`)
  .replace(/from ['"]@\/services\/backend-contract['"]/g, `from '${new URL('./backend-contract.ts', import.meta.url).href}'`)
const { default: Component } = await import('data:text/javascript,' + encodeURIComponent(compiled))
test('成员选择保留BIGINT字符串，设备数字及清空行为兼容', () => {
  const scope = effectScope(), emitted = []
  try {
    const setup = scope.run(() => Component.setup({ kind: 'member', modelValue: null }, { expose() {}, emit: (...args) => emitted.push(args) }))
    setup.select('2119840104873218049'); setup.select(12); setup.select(''); setup.select(undefined)
    assert.deepEqual(emitted, [['update:modelValue', '2119840104873218049'], ['update:modelValue', 12], ['update:modelValue', null], ['update:modelValue', null]])
  } finally { scope.stop() }
})
