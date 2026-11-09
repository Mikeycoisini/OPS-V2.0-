/** 先结束真实 Session，再去登录页，避免被“已登录但无企业”的守卫送回。 */
export async function exitWorkspace(signOut: () => Promise<void>, goToLogin: () => Promise<unknown>) {
  await signOut()
  await goToLogin()
}
