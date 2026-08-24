import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { pool } from './db.js';
import jwt from 'jsonwebtoken';

const app = express();                    // ← isso precisa vir ANTES
app.use(cors());
// Limite maior porque o multi-imagem manda várias fotos em base64 no mesmo request
app.use(express.json({ limit: '40mb' }));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- Autenticação (JWT) ---
// Gera um token com o login do usuário, válido por 7 dias.
function gerarToken(login) {
  return jwt.sign({ login }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// Middleware que exige um token válido no header "Authorization: Bearer <token>".
// Em caso de sucesso, disponibiliza o login do dono do token em req.usuarioLogin.
function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token não informado' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuarioLogin = payload.login;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

app.post('/api/register', async (req, res) => {
  try {
    const { login, senha } = req.body;
    if (!login || !senha) {
      return res.status(400).json({ error: 'Login e senha são obrigatórios' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    await pool.query(
      'INSERT INTO usuarios (login, senha_hash) VALUES ($1, $2)',
      [login, senhaHash]
    );

    res.status(201).json({ message: 'Usuário cadastrado com sucesso' });
  } catch (err) {
    if (err.code === '23505') {
      // erro do Postgres para violação de UNIQUE
      return res.status(409).json({ error: 'Esse login já está em uso' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar usuário' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { login, senha } = req.body;
    if (!login || !senha) {
      return res.status(400).json({ error: 'Login e Senha são Obrigatorios!' });
    }

    const result = await pool.query(
      'SELECT login, senha_hash FROM usuarios WHERE login = $1',
      [login]
    );
    const usuario = result.rows[0];

    // Mesma mensagem tanto pra "usuário não existe" quanto "senha errada",
    // pra não dar pista de quais logins existem no banco.
    if (!usuario) {
      return res.status(401).json({ error: 'Login ou senha incorretos' });
    }

    const senhaConfere = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaConfere) {
      return res.status(401).json({ error: 'Login ou senha incorretos' });
    }

    const token = gerarToken(usuario.login);
    res.json({ login: usuario.login, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// autenticar garante que existe um token válido; a checagem abaixo garante
// que o dono do token só altera/exclui a própria conta, nunca a de outra pessoa.
app.put('/api/usuarios/:login', autenticar, async (req, res) => {
  try {
    const loginAtual = req.params.login;

    if (req.usuarioLogin !== loginAtual) {
      return res.status(403).json({ error: 'Você só pode alterar a própria conta' });
    }

    const { novoLogin, novaSenha } = req.body;

    if (!novoLogin && !novaSenha) {
      return res.status(400).json({ error: 'Informe um novo login e/ou uma nova senha' });
    }

    if (novoLogin && novaSenha) {
      const senhaHash = await bcrypt.hash(novaSenha, 10);
      await pool.query(
        'UPDATE usuarios SET login = $1, senha_hash = $2 WHERE login = $3',
        [novoLogin, senhaHash, loginAtual]
      );
    } else if (novoLogin) {
      await pool.query(
        'UPDATE usuarios SET login = $1 WHERE login = $2',
        [novoLogin, loginAtual]
      );
    } else {
      const senhaHash = await bcrypt.hash(novaSenha, 10);
      await pool.query(
        'UPDATE usuarios SET senha_hash = $1 WHERE login = $2',
        [senhaHash, loginAtual]
      );
    }

    // Se o login mudou, o token antigo (que carrega o login antigo) deixa de
    // fazer sentido — geramos um novo já com o login atualizado.
    const loginFinal = novoLogin || loginAtual;
    const token = gerarToken(loginFinal);

    res.json({ message: 'Dados atualizados com sucesso', login: loginFinal, token });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Esse login já está em uso' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

app.delete('/api/usuarios/:login', autenticar, async (req, res) => {
  try {
    if (req.usuarioLogin !== req.params.login) {
      return res.status(403).json({ error: 'Você só pode excluir a própria conta' });
    }

    await pool.query('DELETE FROM usuarios WHERE login = $1', [req.params.login]);
    res.json({ message: 'Conta excluída com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir usuário' });
  }
});

// Chat com a IA (Gemini). Recebe o histórico inteiro a cada chamada
// (o front-end reenvia tudo, então aqui é uma chamada única e sem estado).
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Envie ao menos uma mensagem' });
    }

    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
    });

    res.json({ reply: response.text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao consultar a IA' });
  }
});

// rotas novas do Meshy (3D) - vêm DEPOIS de "const app = express()"
const MESHY_BASE_URL = 'https://api.meshy.ai/openapi/v2';

// A Meshy trabalha em 2 etapas: "preview" (malha sem textura) e "refine"
// (aplica textura). Esse mapa guarda, em memória, qual refine_task_id
// corresponde a cada preview_task_id, para o front-end continuar usando
// um único taskId do início ao fim (igual funcionava com a Tripo).
const refineTaskMap = new Map();

// Normaliza o status da Meshy (PENDING/IN_PROGRESS/SUCCEEDED/FAILED/CANCELED)
// para o vocabulário que o front-end já espera (success/failed/cancelled).
function normalizeStatus(meshyStatus) {
  const map = {
    SUCCEEDED: 'success',
    FAILED: 'failed',
    CANCELED: 'cancelled',
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
  };
  return map[meshyStatus] || meshyStatus?.toLowerCase();
}

app.post('/api/generate-3d', async (req, res) => {
  try {
    const { prompt } = req.body;

    const response = await fetch(`${MESHY_BASE_URL}/text-to-3d`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.MESHY_API_KEY}`,
      },
      body: JSON.stringify({
        mode: 'preview',
        prompt,
        art_style: 'realistic',
        should_remesh: true,
      }),
    });

    const data = await response.json();
    console.log('Resposta da Meshy (preview):', JSON.stringify(data, null, 2));
    // Meshy retorna { result: "<task_id>" }
    res.json({ task_id: data.result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar tarefa de geração 3D' });
  }
});

app.get('/api/task/:id', async (req, res) => {
  try {
    const clientId = req.params.id;
    // Se já existe uma etapa de refine em andamento para esse id, consulta ela
    const actualId = refineTaskMap.get(clientId) || clientId;

    const response = await fetch(`${MESHY_BASE_URL}/text-to-3d/${actualId}`, {
      headers: { Authorization: `Bearer ${process.env.MESHY_API_KEY}` },
    });
    const data = await response.json();

    // Etapa 1 (preview) terminou e o refine ainda não foi disparado:
    // dispara o refine automaticamente e devolve "em andamento" pro front-end.
    if (data.status === 'SUCCEEDED' && actualId === clientId && !refineTaskMap.has(clientId)) {
      const refineResponse = await fetch(`${MESHY_BASE_URL}/text-to-3d`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.MESHY_API_KEY}`,
        },
        body: JSON.stringify({
          mode: 'refine',
          preview_task_id: clientId,
          enable_pbr: true,
        }),
      });
      const refineData = await refineResponse.json();
      refineTaskMap.set(clientId, refineData.result);

      return res.json({ status: 'in_progress', progress: 0 });
    }

    res.json({
      status: normalizeStatus(data.status),
      progress: data.progress,
      output: { model_url: data.model_urls?.glb || null },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao consultar tarefa' });
  }
});

app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt } = req.body;

    const response = await fetch('https://api.meshy.ai/openapi/v1/text-to-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.MESHY_API_KEY}`,
      },
      body: JSON.stringify({
        ai_model: 'nano-banana-pro',
        prompt,
        aspect_ratio: '1:1',
      }),
    });

    const data = await response.json();
    console.log('Resposta da Meshy (text-to-image):', JSON.stringify(data, null, 2));
    res.json({ task_id: data.result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar tarefa de geração de imagem' });
  }
});

app.get('/api/task-text-image/:id', async (req, res) => {
  try {
    const response = await fetch(`https://api.meshy.ai/openapi/v1/text-to-image/${req.params.id}`, {
      headers: { Authorization: `Bearer ${process.env.MESHY_API_KEY}` },
    });
    const data = await response.json();

    res.json({
      status: normalizeStatus(data.status),
      progress: data.progress,
      output: { image_url: data.image_urls?.[0] || null },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao consultar tarefa de geração de imagem' });
  }
});

app.post('/api/generate-3d-image', async (req, res) => {
  try {
    const { image_base64 } = req.body;
    console.log('Prefixo recebido:', image_base64?.substring(0, 50));

    const response = await fetch('https://api.meshy.ai/openapi/v1/image-to-3d', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.MESHY_API_KEY}`,
      },
      body: JSON.stringify({
        image_url: image_base64, // aceita data URI base64 ou uma URL direto
        enable_pbr: true,
        should_texture: true,
      }),
    });

    const data = await response.json();
    console.log('Resposta da Meshy (image-to-3d):', JSON.stringify(data, null, 2));
    res.json({ task_id: data.result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar tarefa de geração 3D a partir de imagem' });
  }
});

app.get('/api/task-image/:id', async (req, res) => {
  try {
    const response = await fetch(`https://api.meshy.ai/openapi/v1/image-to-3d/${req.params.id}`, {
      headers: { Authorization: `Bearer ${process.env.MESHY_API_KEY}` },
    });
    const data = await response.json();

    res.json({
      status: normalizeStatus(data.status),
      progress: data.progress,
      output: { model_url: data.model_urls?.glb || null },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao consultar tarefa de imagem' });
  }
});

// Multi-imagem: recebe várias fotos do MESMO objeto/pessoa (ex.: frente, lado, costas)
// e usa o endpoint "multi-image-to-3d" da Meshy, que combina os ângulos para gerar
// um modelo mais fiel do que dá pra conseguir com uma foto só.
app.post('/api/generate-3d-multi-image', async (req, res) => {
  try {
    const { images } = req.body; // array de data URIs base64 (ou URLs), 1 a 4 itens

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'Envie de 1 a 4 imagens em "images"' });
    }
    if (images.length > 4) {
      return res.status(400).json({ error: 'Máximo de 4 imagens por modelo' });
    }

    console.log(`Multi-imagem: recebidas ${images.length} imagem(ns)`);

    const response = await fetch('https://api.meshy.ai/openapi/v1/multi-image-to-3d', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.MESHY_API_KEY}`,
      },
      body: JSON.stringify({
        // A Meshy usa a 1ª imagem do array como vista principal (frente);
        // a ordem das demais não importa, mas é bom manter uma convenção
        // no front-end (frente, lado, costas) pra facilitar o uso.
        image_urls: images,
        ai_model: 'latest',
        should_texture: true,
        enable_pbr: true,
      }),
    });

    const data = await response.json();
    console.log('Resposta da Meshy (multi-image-to-3d):', JSON.stringify(data, null, 2));

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Erro na API da Meshy' });
    }

    res.json({ task_id: data.result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar tarefa de geração 3D a partir de múltiplas imagens' });
  }
});

app.get('/api/task-multi-image/:id', async (req, res) => {
  try {
    const response = await fetch(`https://api.meshy.ai/openapi/v1/multi-image-to-3d/${req.params.id}`, {
      headers: { Authorization: `Bearer ${process.env.MESHY_API_KEY}` },
    });
    const data = await response.json();

    res.json({
      status: normalizeStatus(data.status),
      progress: data.progress,
      output: { model_url: data.model_urls?.glb || null },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao consultar tarefa de multi-imagem' });
  }
});

// --- Captura pelo celular via QR code ---
// Guarda temporariamente (em memória, igual o refineTaskMap da Meshy) as
// fotos que a pessoa manda pelo celular, associadas a um sessionId gerado
// no navegador do computador.
const capturasMoveis = new Map(); // sessionId -> { images: [...], criadoEm: number }
const CAPTURA_EXPIRA_MS = 15 * 60 * 1000; // 15 minutos

function limparCapturasExpiradas() {
  const agora = Date.now();
  for (const [id, captura] of capturasMoveis) {
    if (agora - captura.criadoEm > CAPTURA_EXPIRA_MS) {
      capturasMoveis.delete(id);
    }
  }
}

app.post('/api/captura-movel/:sessionId', (req, res) => {
  limparCapturasExpiradas();

  const { sessionId } = req.params;
  const { images } = req.body;

  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'Envie de 1 a 4 imagens em "images"' });
  }
  if (images.length > 4) {
    return res.status(400).json({ error: 'Máximo de 4 imagens' });
  }

  capturasMoveis.set(sessionId, { images, criadoEm: Date.now() });
  res.json({ message: 'Fotos recebidas' });
});

app.get('/api/captura-movel/:sessionId', (req, res) => {
  limparCapturasExpiradas();

  const captura = capturasMoveis.get(req.params.sessionId);
  if (!captura) {
    return res.json({ pronto: false });
  }

  res.json({ pronto: true, images: captura.images });
  // Depois de entregar pro computador, apaga — não precisa mais ficar em memória.
  capturasMoveis.delete(req.params.sessionId);
});

app.get('/api/proxy-model', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL não informada' });

    let response;
    for (let tentativa = 1; tentativa <= 4; tentativa++) {
      response = await fetch(url);
      if (response.ok) break;

      console.warn(`Tentativa ${tentativa} falhou (status ${response.status}), tentando de novo em 2s...`);
      if (tentativa < 4) await new Promise((r) => setTimeout(r, 2000));
    }

    if (!response.ok) {
      const text = await response.text();
      console.error('Falha ao buscar modelo após várias tentativas:', response.status, text);
      return res.status(response.status).json({ error: 'Falha ao buscar modelo' });
    }

    res.set('Content-Type', response.headers.get('content-type') || 'model/gltf-binary');
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar modelo' });
  }
});

app.listen(3001, () => console.log('Servidor rodando na porta 3001'));   // ← isso precisa vir por ÚLTIMO