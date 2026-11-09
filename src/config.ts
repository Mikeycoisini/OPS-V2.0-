// 正常环境使用后端 Session；只有明确 false 时允许查看本地开发页面。
export const authRequired = import.meta.env.VITE_AUTH_REQUIRED !== 'false'
