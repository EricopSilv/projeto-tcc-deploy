import { API_BASE } from './apiBase';

export async function enviarFotosCaptura(sessionId, images) {
  const res = await fetch(`${API_BASE}/api/captura-movel/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Falha ao enviar as fotos');
  return data;
}

export async function consultarCaptura(sessionId) {
  const res = await fetch(`${API_BASE}/api/captura-movel/${sessionId}`);
  return res.json();
}
