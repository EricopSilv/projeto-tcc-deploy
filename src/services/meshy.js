export async function generate3D(prompt) {
  const res = await fetch('http://localhost:3001/api/generate-3d', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  return data.task_id;
}

export async function checkTask(taskId) {
  const res = await fetch(`http://localhost:3001/api/task/${taskId}`);
  return res.json();
}

export async function generate3DFromImage(imageBase64) {
  const res = await fetch('http://localhost:3001/api/generate-3d-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: imageBase64 }),
  });
  const data = await res.json();
  return data.task_id;
}

export async function checkImageTask(taskId) {
  const res = await fetch(`http://localhost:3001/api/task-image/${taskId}`);
  return res.json();
}

// Multi-imagem: `images` é um array com 1 a 4 fotos (data URI base64 ou URL)
// do mesmo objeto/pessoa em ângulos diferentes (frente, lado, costas).
export async function generate3DFromImages(images) {
  const res = await fetch('http://localhost:3001/api/generate-3d-multi-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Falha ao criar tarefa de multi-imagem');
  return data.task_id;
}

export async function checkMultiImageTask(taskId) {
  const res = await fetch(`http://localhost:3001/api/task-multi-image/${taskId}`);
  return res.json();
}

export async function generateImage(prompt) {
  const res = await fetch('http://localhost:3001/api/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  return data.task_id;
}

export async function checkTextImageTask(taskId) {
  const res = await fetch(`http://localhost:3001/api/task-text-image/${taskId}`);
  return res.json();
}