import { API_BASE } from './apiBase';
import { estadoUsuario } from '@/stores/usuario';

// Todas essas rotas agora exigem login no backend (elas consomem créditos
// da conta da Meshy/Gemini), então mandamos o token em toda chamada.
function cabecalhosAuth() {
  return { Authorization: `Bearer ${estadoUsuario.token}` };
}

export async function generate3D(prompt) {
  const res = await fetch(`${API_BASE}/api/generate-3d`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabecalhosAuth() },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Falha ao criar tarefa de geração 3D');
  return data.task_id;
}

export async function checkTask(taskId) {
  const res = await fetch(`${API_BASE}/api/task/${taskId}`, { headers: cabecalhosAuth() });
  return res.json();
}

export async function generate3DFromImage(imageBase64) {
  const res = await fetch(`${API_BASE}/api/generate-3d-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabecalhosAuth() },
    body: JSON.stringify({ image_base64: imageBase64 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Falha ao criar tarefa de geração 3D a partir de imagem');
  return data.task_id;
}

export async function checkImageTask(taskId) {
  const res = await fetch(`${API_BASE}/api/task-image/${taskId}`, { headers: cabecalhosAuth() });
  return res.json();
}

// Multi-imagem: `images` é um array com 1 a 4 fotos (data URI base64 ou URL)
// do mesmo objeto/pessoa em ângulos diferentes (frente, lado, costas).
export async function generate3DFromImages(images) {
  const res = await fetch(`${API_BASE}/api/generate-3d-multi-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabecalhosAuth() },
    body: JSON.stringify({ images }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Falha ao criar tarefa de multi-imagem');
  return data.task_id;
}

export async function checkMultiImageTask(taskId) {
  const res = await fetch(`${API_BASE}/api/task-multi-image/${taskId}`, { headers: cabecalhosAuth() });
  return res.json();
}

export async function generateImage(prompt) {
  const res = await fetch(`${API_BASE}/api/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabecalhosAuth() },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Falha ao criar tarefa de geração de imagem');
  return data.task_id;
}

export async function checkTextImageTask(taskId) {
  const res = await fetch(`${API_BASE}/api/task-text-image/${taskId}`, { headers: cabecalhosAuth() });
  return res.json();
}

export async function getMeusModelos() {
  const res = await fetch(`${API_BASE}/api/meus-modelos`, { headers: cabecalhosAuth() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Falha ao buscar modelos');
  return data.modelos;
}

export async function listarClientes() {
  const res = await fetch(`${API_BASE}/api/usuarios/clientes`, { headers: cabecalhosAuth() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Falha ao listar clientes');
  return data.clientes;
}

export async function atribuirModeloCliente(modeloId, clienteLogin) {
  const res = await fetch(`${API_BASE}/api/modelos/${modeloId}/atribuir-cliente`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...cabecalhosAuth() },
    body: JSON.stringify({ clienteLogin }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Falha ao atribuir modelo');
  return data;
}