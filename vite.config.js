import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement:(tag) => tag === 'model-viewer',
        },
      },
    }),
    vueDevTools(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    // Aceita requisições vindas de fora da rede local (ex: por um túnel
    // ngrok/Cloudflare) — sem isso, versões recentes do Vite bloqueiam por
    // padrão qualquer host que não seja localhost/IP da rede local.
    allowedHosts: true,
    proxy: {
      // Encaminha toda chamada "/api/..." pro backend local, na porta 3001.
      // Assim o front-end sempre chama caminhos relativos (ex: "/api/login"),
      // que funcionam iguais acessando por localhost, pelo IP da rede local
      // ou por um túnel público — sem precisar saber a porta do backend.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
