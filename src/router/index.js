import { createRouter, createWebHistory } from 'vue-router'
import { estadoUsuario } from '../stores/usuario'

// Rotas que só fazem sentido pra quem já está logado. As de "gerar-3d" estão
// aqui porque o backend agora exige login pra gerar modelos (evita que
// qualquer visitante gaste os créditos da conta na Meshy/Gemini) — sem isso
// aqui também, a pessoa chegaria até a tela e só descobriria que precisa
// logar ao tentar gerar algo.
const ROTAS_PROTEGIDAS = [
  'perfil',
  'configuracoes',
  'usuarios',
  'gerar-3d',
  'gerar-3d-texto',
  'gerar-3d-imagem',
  'gerar-3d-multi-imagem',
  'mudar-visual',
]

// Só essa conta específica pode acessar a tela de gerenciar usuários — nem
// todo administrador, só o "dono" do sistema.
const LOGIN_SUPER_ADMIN = 'ericopererinha123@gmail.com'

// Rotas exclusivas dessa conta.
const ROTAS_ADMIN = ['usuarios']

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/login',
    },
    {
      path: '/gerar-3d',
      name: 'gerar-3d',
      component: () => import('../views/Tripo3DView.vue'),
    },
    {
      path: '/gerar-3d/texto',
      name: 'gerar-3d-texto',
      component: () => import('../views/TextoParaImagemView.vue'),
    },
    {
      path: '/gerar-3d/imagem',
      name: 'gerar-3d-imagem',
      component: () => import('../views/ImagemParaModeloView.vue'),
    },
    {
      path: '/gerar-3d/multi-imagem',
      name: 'gerar-3d-multi-imagem',
      component: () => import('../views/MultiImagemParaModeloView.vue'),
    },
    {
      path: '/gerar-3d/visual',
      name: 'mudar-visual',
      component: () => import('../views/MudarVisualView.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
    },
    {
      path: '/esqueci-senha',
      name: 'esqueci-senha',
      component: () => import('../views/EsqueciSenhaView.vue'),
    },
    {
      path: '/redefinir-senha',
      name: 'redefinir-senha',
      component: () => import('../views/RedefinirSenhaView.vue'),
    },
    {
      path: '/termos',
      name: 'termos',
      component: () => import('../views/TermosView.vue'),
    },
    {
      path: '/perfil',
      name: 'perfil',
      component: () => import('../views/ProfileView.vue'),
    },
    {
      path: '/configuracoes',
      name: 'configuracoes',
      component: () => import('../views/ConfiguracoesView.vue'),
    },
    // A tela de "Alterar dados" virou uma seção dentro de Configurações.
    // O redirecionamento evita que links/favoritos antigos quebrem.
    {
      path: '/perfil/editar',
      redirect: '/configuracoes',
    },
    {
      path: '/perfil/usuarios',
      name: 'usuarios',
      component: () => import('../views/UsuariosView.vue'),
    },
    // A captura pelo celular fica de fora das rotas protegidas de propósito:
    // quem abre pelo QR code normalmente não está logado nesse aparelho.
    {
      path: '/captura-movel/:sessionId',
      name: 'captura-movel',
      component: () => import('../views/CapturaMovelView.vue'),
    },
    // Qualquer caminho que não bate com nenhuma rota acima cai aqui.
    {
      path: '/:pathMatch(.*)*',
      redirect: '/gerar-3d',
    },
  ],
})

// Sem isso, dava pra abrir /perfil ou /perfil/editar direto pela URL mesmo
// sem estar logado, e a tela quebrava (estadoUsuario.login vindo undefined).
router.beforeEach((to) => {
  if (ROTAS_PROTEGIDAS.includes(to.name) && !estadoUsuario.login) {
    return { name: 'login' }
  }

  if (ROTAS_ADMIN.includes(to.name) && estadoUsuario.login !== LOGIN_SUPER_ADMIN) {
    return { name: 'perfil' }
  }
})

export default router