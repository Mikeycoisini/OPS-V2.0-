import test from 'node:test'
import assert from 'node:assert/strict'
import { exitWorkspace } from './session-actions.ts'

test('changing account waits for the old session to end before opening login', async () => {
  let endSession
  let page = 'select-tenant'
  const operation = exitWorkspace(() => new Promise(resolve => endSession = resolve), async () => { page = 'login' })
  assert.equal(page, 'select-tenant')
  endSession()
  await operation
  assert.equal(page, 'login')
})

test('a failed logout stays on the current page instead of looping through the login guard', async () => {
  let page = 'select-tenant'
  await assert.rejects(exitWorkspace(async () => { throw new Error('无法退出会话') }, async () => { page = 'login' }), /无法退出会话/)
  assert.equal(page, 'select-tenant')
})
