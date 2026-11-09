import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { ElButton, ElCheckbox, ElDatePicker, ElDialog, ElDrawer, ElForm, ElFormItem, ElInput, ElInputNumber, ElOption, ElPagination, ElSelect, ElSwitch } from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import { router } from './router'
import './admin.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
const components = { ElButton, ElCheckbox, ElDatePicker, ElDialog, ElDrawer, ElForm, ElFormItem, ElInput, ElInputNumber, ElOption, ElPagination, ElSelect, ElSwitch }
for (const [name, component] of Object.entries(components)) app.component(name, component)
app.mount('#app')
