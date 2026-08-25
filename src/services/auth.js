import { API_BASE } from './apiBase';
import { estadoUsuario } from '@/stores/usuario';

export async function register(login, senha) {
  const res = await fetch(`${API_BASE}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, senha }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar');
  return data;
}

// Retorna { login, token }. O token deve ser guardado com definirUsuarioLogado
// para ser reenviado nas próximas chamadas autenticadas.
export async function login(login_, senha) {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: login_, senha }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro ao fazer login');
  return data;
}

// Só o dono da conta pode alterar seus próprios dados, então enviamos o
// token JWT guardado em estadoUsuario no header Authorization.
export async function updateUser(loginAtual, dados) {
  const res = await fetch(`${API_BASE}/api/usuarios/${loginAtual}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${estadoUsuario.token}`,
    },
    body: JSON.stringify(dados),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro ao atualizar usuário');
  return data;
}

export async function deleteUser(login) {
  const res = await fetch(`${API_BASE}/api/usuarios/${login}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${estadoUsuario.token}`,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro ao excluir usuário');
  return data;
}
