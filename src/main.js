import '@google/model-viewer'
import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

// Aplica a preferência de "reduzir animações" ANTES de montar o app, senão
// a página apareceria animada por um instante antes de a regra valer.
if (localStorage.getItem('reduzirAnimacoes') === '1') {
  document.documentElement.setAttribute('data-reduce-motion', 'true')
}

const app = createApp(App)

app.use(router)

app.mount('#app')
