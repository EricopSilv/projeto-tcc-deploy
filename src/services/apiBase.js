// URL base da API.
//
// Em produção, defina VITE_API_URL no momento do build (ex: uma variável de
// ambiente configurada no painel da Vercel) apontando pro domínio do
// backend, por exemplo "https://api.seusite.com".
//
// Em desenvolvimento, deixe sem definir: as chamadas viram caminhos
// relativos (ex: "/api/login"), que o proxy configurado no vite.config.js
// encaminha automaticamente para o backend local na porta 3001 — e isso
// funciona tanto acessando por "localhost" quanto pelo IP da rede local ou
// por um túnel (ngrok/Cloudflare Tunnel), porque o proxy roda no próprio
// servidor de desenvolvimento, não depende de qual endereço o navegador usou.
export const API_BASE = import.meta.env.VITE_API_URL || '';
