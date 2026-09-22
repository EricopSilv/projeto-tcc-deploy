import '@google/model-viewer'
import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { API_BASE } from './services/apiBase'

// Aplica a preferência de "reduzir animações" ANTES de montar o app, senão
// a página apareceria animada por um instante antes de a regra valer.
if (localStorage.getItem('reduzirAnimacoes') === '1') {
  document.documentElement.setAttribute('data-reduce-motion', 'true')
}

// Acorda o backend assim que o site abre (ver a rota /api/ping no servidor).
// O plano gratuito do Render hiberna após 15 minutos parado, e subir de novo
// leva perto de um minuto. Disparando isso já no carregamento, o servidor sobe
// enquanto a pessoa faz login e escolhe a imagem — a espera sai do caminho
// dela, em vez de aparecer bem na hora de gerar o modelo.
//
// Sem await e com o erro engolido de propósito: isso é só um aquecimento, e
// não pode atrasar nem quebrar a página se o backend estiver fora do ar.
fetch(`${API_BASE}/api/ping`).catch(() => {})

const app = createApp(App)

app.use(router)

app.mount('#app')
