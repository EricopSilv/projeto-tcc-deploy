import { reactive } from 'vue';

const usuarioSalvo = localStorage.getItem('usuarioLogado');
const tokenSalvo = localStorage.getItem('tokenAcesso');

export const estadoUsuario = reactive({
  login: usuarioSalvo || null,
  // Token JWT emitido pelo backend no login/atualização de perfil.
  // É enviado no header Authorization das rotas que exigem dono da conta.
  token: tokenSalvo || null,
});

export function definirUsuarioLogado(login, token) {
  estadoUsuario.login = login;
  estadoUsuario.token = token || null;

  localStorage.setItem('usuarioLogado', login);
  if (token) {
    localStorage.setItem('tokenAcesso', token);
  } else {
    localStorage.removeItem('tokenAcesso');
  }
}

export function limparUsuarioLogado() {
  estadoUsuario.login = null;
  estadoUsuario.token = null;
  localStorage.removeItem('usuarioLogado');
  localStorage.removeItem('tokenAcesso');
}
