import { reactive } from 'vue';

const usuarioSalvo = localStorage.getItem('usuarioLogado');
const tokenSalvo = localStorage.getItem('tokenAcesso');
const nomeSalvo = localStorage.getItem('usuarioNome');
const telefoneSalvo = localStorage.getItem('usuarioTelefone');
const nivelAcessoSalvo = localStorage.getItem('usuarioNivelAcesso');
const fotoSalva = localStorage.getItem('usuarioFoto');
const emailSalvo = localStorage.getItem('usuarioEmail');
// Guardado como '1'/'0' porque o localStorage só grava texto: o booleano
// false viraria a string "false", que é verdadeira em JavaScript.
const notificarEmailSalvo = localStorage.getItem('usuarioNotificarEmail');

export const estadoUsuario = reactive({
  login: usuarioSalvo || null,
  // Token JWT emitido pelo backend no login/atualização de perfil.
  // É enviado no header Authorization das rotas que exigem dono da conta.
  token: tokenSalvo || null,
  nome: nomeSalvo || null,
  telefone: telefoneSalvo || null,
  nivelAcesso: nivelAcessoSalvo || null,
  // A foto NÃO vai dentro do token JWT de propósito: o token é reenviado em
  // todo request autenticado (via header), e um base64 de imagem deixaria
  // esse header enorme — algumas hospedagens/proxies rejeitam headers muito
  // grandes. Por isso ela viaja separada, só nas respostas de login/edição.
  foto: fotoSalva || null,
  email: emailSalvo || null,
  // Só é falso se a pessoa desligou de propósito; qualquer outro caso
  // (conta nova, nada salvo ainda) assume que ela quer receber o aviso.
  notificarEmail: notificarEmailSalvo !== '0',
});

export function definirUsuarioLogado(login, token, nome, telefone, nivelAcesso, foto, email, notificarEmail) {
  estadoUsuario.login = login;
  estadoUsuario.token = token || null;
  estadoUsuario.nome = nome || null;
  estadoUsuario.telefone = telefone || null;
  estadoUsuario.nivelAcesso = nivelAcesso || null;
  estadoUsuario.foto = foto || null;
  estadoUsuario.email = email || null;
  estadoUsuario.notificarEmail = notificarEmail !== false;

  localStorage.setItem('usuarioLogado', login);
  localStorage.setItem('usuarioNotificarEmail', estadoUsuario.notificarEmail ? '1' : '0');
  if (token) {
    localStorage.setItem('tokenAcesso', token);
  } else {
    localStorage.removeItem('tokenAcesso');
  }

  if (nome) {
    localStorage.setItem('usuarioNome', nome);
  } else {
    localStorage.removeItem('usuarioNome');
  }

  if (telefone) {
    localStorage.setItem('usuarioTelefone', telefone);
  } else {
    localStorage.removeItem('usuarioTelefone');
  }

  if (nivelAcesso) {
    localStorage.setItem('usuarioNivelAcesso', nivelAcesso);
  } else {
    localStorage.removeItem('usuarioNivelAcesso');
  }

  if (foto) {
    localStorage.setItem('usuarioFoto', foto);
  } else {
    localStorage.removeItem('usuarioFoto');
  }

  if (email) {
    localStorage.setItem('usuarioEmail', email);
  } else {
    localStorage.removeItem('usuarioEmail');
  }
}

export function limparUsuarioLogado() {
  estadoUsuario.login = null;
  estadoUsuario.token = null;
  estadoUsuario.nome = null;
  estadoUsuario.telefone = null;
  estadoUsuario.nivelAcesso = null;
  estadoUsuario.foto = null;
  estadoUsuario.email = null;
  estadoUsuario.notificarEmail = true;
  localStorage.removeItem('usuarioLogado');
  localStorage.removeItem('tokenAcesso');
  localStorage.removeItem('usuarioNome');
  localStorage.removeItem('usuarioTelefone');
  localStorage.removeItem('usuarioNivelAcesso');
  localStorage.removeItem('usuarioFoto');
  localStorage.removeItem('usuarioEmail');
  localStorage.removeItem('usuarioNotificarEmail');
}
