import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { pool } from './db.js';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

const app = express();                    // ← isso precisa vir ANTES

app.use(helmet());

// Em produção, defina FRONTEND_URL (ex: https://app.seudominio.com) pra que
// só o seu próprio site consiga chamar essa API. Sem essa variável definida
// (ambiente local, testes), libera qualquer origem pra não travar o
// desenvolvimento (localhost, IP da rede local, túnel do ngrok etc.).
const origemPermitida = process.env.FRONTEND_URL;
app.use(cors(origemPermitida ? { origin: origemPermitida } : {}));

// Limite maior porque o multi-imagem manda várias fotos em base64 no mesmo request
app.use(express.json({ limit: '40mb' }));

// Limite geral pras rotas da API, pra dificultar abuso/DoS básico.
const limiteGeral = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiteGeral);

// Limite mais rígido só pra login/cadastro, pra dificultar força bruta de senha.
const limiteAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- E-mail de aprovação de acesso ---
// Usa a API da Resend (por HTTPS) em vez de SMTP direto (Gmail): hospedagens
// como o Render bloqueiam conexões de saída pelas portas usadas por SMTP —
// isso foi testado e confirmado (deu "Connection timeout" tentando o Gmail
// direto). A Resend funciona pela mesma porta de qualquer site (443), então
// não esbarra nesse bloqueio.
async function enviarEmailAprovacao({ login, nome, token }) {
  if (!process.env.RESEND_API_KEY || !process.env.ADMIN_EMAIL) {
    console.warn('E-mail de aprovação não enviado: variáveis de e-mail não configuradas.');
    return;
  }

  const linkAprovacao = `${process.env.BACKEND_URL}/api/solicitacoes/${token}/aprovar`;

  try {
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        // "onboarding@resend.dev" é o remetente de teste da Resend: funciona
        // sem precisar verificar um domínio próprio, mas só entrega pro
        // e-mail usado pra criar a conta na Resend — que aqui é o mesmo
        // ADMIN_EMAIL, então funciona certinho pro nosso caso.
        from: 'VisionFade <onboarding@resend.dev>',
        to: [process.env.ADMIN_EMAIL],
        subject: 'Novo pedido de acesso - VisionFade',
        html: `
          <p>Uma nova conta pediu acesso de administrador no VisionFade:</p>
          <p><strong>Login:</strong> ${login}<br>
             <strong>Nome:</strong> ${nome || '(não informado)'}</p>
          <p><a href="${linkAprovacao}">Clique aqui para aprovar esse acesso</a></p>
        `,
      }),
    });

    if (!resposta.ok) {
      const detalhes = await resposta.text();
      console.error('Erro ao enviar e-mail de aprovação (Resend):', resposta.status, detalhes);
    }
  } catch (err) {
    // Um erro ao enviar e-mail não deve impedir o cadastro de dar certo —
    // a conta é criada normalmente, só o aviso que falha.
    console.error('Erro ao enviar e-mail de aprovação:', err);
  }
}

// --- Autenticação (JWT) ---
// Gera um token com os dados do usuário, válido por 7 dias. Recebe um objeto
// { login, nome, telefone, nivel_acesso } para que o front-end sempre tenha
// esses dados disponíveis sem precisar de uma chamada extra à API.
function gerarToken({ login, nome, telefone, nivel_acesso }) {
  return jwt.sign(
    { login, nome, telefone, nivelAcesso: nivel_acesso },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
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
    req.usuarioNivelAcesso = payload.nivelAcesso;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// Segurança extra além do "autenticar": verifica se o nível de acesso de
// quem está logado está na lista de níveis permitidos pra essa rota. Por
// enquanto só existe o nível "administrador", mas isso já deixa pronta a
// estrutura pra quando o nível "cliente" existir e não puder mais gerar
// modelos, só visualizar os que já foram criados pra ele.
function exigirNivel(...niveisPermitidos) {
  return (req, res, next) => {
    if (niveisPermitidos.includes(req.usuarioNivelAcesso)) {
      return next();
    }

    if (req.usuarioNivelAcesso === 'pendente') {
      return res.status(403).json({
        error: 'Sua conta ainda está aguardando aprovação de um administrador.',
      });
    }

    return res.status(403).json({ error: 'Você não tem permissão para essa ação' });
  };
}

// Trava extra: mesmo entre contas "administrador", só uma pessoa específica
// pode gerenciar as contas dos outros (aprovar, mudar nível, excluir). Fica
// definida pela variável SUPER_ADMIN_LOGIN no Render, não fixa no código.
function exigirSuperAdmin(req, res, next) {
  if (req.usuarioLogin !== process.env.SUPER_ADMIN_LOGIN) {
    return res.status(403).json({ error: 'Você não tem permissão para essa ação' });
  }
  next();
}

app.post('/api/login', limiteAuth, async (req, res) => {
  try {
    const { login, senha } = req.body;
    if (!login || !senha) {
      return res.status(400).json({ error: 'Login e Senha são Obrigatorios!' });
    }

    const result = await pool.query(
      'SELECT login, senha_hash, nome, telefone, nivel_acesso, foto_perfil FROM usuarios WHERE login = $1',
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

    const token = gerarToken(usuario);
    res.json({
      login: usuario.login,
      nome: usuario.nome,
      telefone: usuario.telefone,
      nivelAcesso: usuario.nivel_acesso,
      foto: usuario.foto_perfil,
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// Rota acessada pelo link do e-mail de aprovação — de propósito sem
// "autenticar", já que quem clica é o administrador lendo o e-mail, não
// necessariamente logado nesse navegador/dispositivo. A segurança aqui vem
// do código aleatório e imprevisível no próprio link (só quem recebeu o
// e-mail tem acesso a ele).
app.get('/api/solicitacoes/:token/aprovar', async (req, res) => {
  function paginaHtml(mensagem) {
    return `<!DOCTYPE html>
<html lang="pt-br">
<head><meta charset="UTF-8"><title>Aprovação de acesso — VisionFade</title></head>
<body style="font-family: sans-serif; text-align: center; padding: 3rem;">
  <h1>VisionFade</h1>
  <p>${mensagem}</p>
</body>
</html>`;
  }

  try {
    const { token } = req.params;

    const resultado = await pool.query(
      'SELECT usuario_login, status FROM solicitacoes_acesso WHERE token = $1',
      [token]
    );
    const solicitacao = resultado.rows[0];

    if (!solicitacao) {
      return res.status(404).send(paginaHtml('Link de aprovação não encontrado ou inválido.'));
    }

    if (solicitacao.status !== 'pendente') {
      return res.send(paginaHtml('Essa solicitação já foi resolvida anteriormente.'));
    }

    await pool.query(
      "UPDATE usuarios SET nivel_acesso = 'administrador' WHERE login = $1",
      [solicitacao.usuario_login]
    );
    await pool.query(
      "UPDATE solicitacoes_acesso SET status = 'aprovado', resolvido_em = now() WHERE token = $1",
      [token]
    );

    res.send(paginaHtml(`Acesso de "${solicitacao.usuario_login}" aprovado com sucesso!`));
  } catch (err) {
    console.error(err);
    res.status(500).send(paginaHtml('Erro ao aprovar a solicitação. Tente novamente mais tarde.'));
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

    const { novoLogin, novaSenha, novoNome, novoTelefone, novaFoto } = req.body;

    if (!novoLogin && !novaSenha && novoNome === undefined && novoTelefone === undefined && novaFoto === undefined) {
      return res.status(400).json({ error: 'Informe ao menos um campo para atualizar' });
    }

    // Monta o UPDATE dinamicamente, só com os campos que realmente vieram no
    // pedido — assim dá pra atualizar qualquer combinação (só o nome, só o
    // telefone, tudo junto, etc.) sem precisar de um bloco if/else pra cada caso.
    const campos = [];
    const valores = [];
    let indice = 1;

    if (novoLogin) {
      campos.push(`login = $${indice++}`);
      valores.push(novoLogin);
    }
    if (novaSenha) {
      const senhaHash = await bcrypt.hash(novaSenha, 10);
      campos.push(`senha_hash = $${indice++}`);
      valores.push(senhaHash);
    }
    if (novoNome !== undefined) {
      campos.push(`nome = $${indice++}`);
      valores.push(novoNome || null);
    }
    if (novoTelefone !== undefined) {
      campos.push(`telefone = $${indice++}`);
      valores.push(novoTelefone || null);
    }
    if (novaFoto !== undefined) {
      campos.push(`foto_perfil = $${indice++}`);
      valores.push(novaFoto || null);
    }

    valores.push(loginAtual);
    const resultado = await pool.query(
      `UPDATE usuarios SET ${campos.join(', ')} WHERE login = $${indice} RETURNING login, nome, telefone, nivel_acesso, foto_perfil`,
      valores
    );

    // Se o login mudou, o token antigo (que carrega o login antigo) deixa de
    // fazer sentido — geramos um novo já com os dados atualizados.
    const usuarioAtualizado = resultado.rows[0];
    const token = gerarToken(usuarioAtualizado);

    res.json({
      message: 'Dados atualizados com sucesso',
      login: usuarioAtualizado.login,
      nome: usuarioAtualizado.nome,
      telefone: usuarioAtualizado.telefone,
      nivelAcesso: usuarioAtualizado.nivel_acesso,
      foto: usuarioAtualizado.foto_perfil,
      token,
    });
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

app.post('/api/register', limiteAuth, async (req, res) => {
  try {
    const { login, senha, nome, telefone, tipoConta } = req.body;
    if (!login || !senha) {
      return res.status(400).json({ error: 'Login e senha são obrigatórios' });
    }

    // Só aceita 'administrador' ou 'cliente' — qualquer outra coisa (ou nada)
    // cai no fluxo de administrador, que é o mais restrito por padrão.
    const nivelDesejado = tipoConta === 'cliente' ? 'cliente' : 'administrador';

    const senhaHash = await bcrypt.hash(senha, 10);

    if (nivelDesejado === 'cliente') {
      // Conta Cliente não precisa de aprovação: ela só visualiza modelos que
      // um administrador atribuir a ela, não gera nada nem gasta créditos.
      await pool.query(
        "INSERT INTO usuarios (login, senha_hash, nome, telefone, nivel_acesso) VALUES ($1, $2, $3, $4, 'cliente')",
        [login, senhaHash, nome || null, telefone || null]
      );
      return res.status(201).json({ message: 'Usuário cadastrado com sucesso' });
    }

    // Fluxo existente: administrador nasce "pendente" (padrão da tabela) e
    // precisa ser aprovado por e-mail.
    await pool.query(
      'INSERT INTO usuarios (login, senha_hash, nome, telefone) VALUES ($1, $2, $3, $4)',
      [login, senhaHash, nome || null, telefone || null]
    );

    const tokenSolicitacao = crypto.randomBytes(24).toString('hex');
    await pool.query(
      'INSERT INTO solicitacoes_acesso (usuario_login, token) VALUES ($1, $2)',
      [login, tokenSolicitacao]
    );
    await enviarEmailAprovacao({ login, nome, token: tokenSolicitacao });

    res.status(201).json({ message: 'Usuário cadastrado com sucesso' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Esse login já está em uso' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar usuário' });
  }
});

// Lista os logins de contas "cliente" — usada no Perfil do administrador pra
// montar o seletor de "atribuir esse modelo a qual cliente".
app.get('/api/usuarios/clientes', autenticar, exigirNivel('administrador'), async (req, res) => {
  try {
    const resultado = await pool.query(
      "SELECT login, nome FROM usuarios WHERE nivel_acesso = 'cliente' ORDER BY login"
    );
    res.json({ clientes: resultado.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar clientes' });
  }
});

// --- Gerenciamento de usuários (só administrador) ---

// Lista todas as contas cadastradas, pra tela de gerenciamento.
app.get('/api/admin/usuarios', autenticar, exigirSuperAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      'SELECT login, nome, telefone, nivel_acesso FROM usuarios ORDER BY nivel_acesso, login'
    );
    res.json({ usuarios: resultado.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

// Muda o nível de acesso de OUTRA conta (aprovar um pendente, promover um
// cliente a administrador, revogar um administrador etc.). Diferente da
// rota PUT /api/usuarios/:login (que só deixa a pessoa mexer na própria
// conta), essa aqui é exclusiva de administrador.
const NIVEIS_VALIDOS = ['pendente', 'administrador', 'cliente'];

app.put('/api/admin/usuarios/:login/nivel-acesso', autenticar, exigirSuperAdmin, async (req, res) => {
  try {
    const { nivelAcesso } = req.body;

    if (!NIVEIS_VALIDOS.includes(nivelAcesso)) {
      return res.status(400).json({ error: 'Nível de acesso inválido' });
    }

    if (req.params.login === req.usuarioLogin) {
      return res.status(400).json({ error: 'Você não pode alterar o nível da sua própria conta por aqui' });
    }

    const resultado = await pool.query(
      'UPDATE usuarios SET nivel_acesso = $1 WHERE login = $2 RETURNING login',
      [nivelAcesso, req.params.login]
    );

    if (!resultado.rows[0]) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ message: 'Nível de acesso atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar nível de acesso' });
  }
});

// Exclui a conta de OUTRA pessoa (revogar de vez, não só mudar o nível).
app.delete('/api/admin/usuarios/:login', autenticar, exigirSuperAdmin, async (req, res) => {
  try {
    if (req.params.login === req.usuarioLogin) {
      return res.status(400).json({ error: 'Use "Excluir minha conta" no seu próprio perfil para isso' });
    }

    const resultado = await pool.query('DELETE FROM usuarios WHERE login = $1 RETURNING login', [req.params.login]);

    if (!resultado.rows[0]) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ message: 'Conta excluída com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir usuário' });
  }
});

// Atribui (ou remove a atribuição de) um modelo a um cliente. Só o próprio
// administrador que gerou o modelo pode atribuí-lo — evita que um admin
// mexa em modelos gerados por outro.
app.put('/api/modelos/:id/atribuir-cliente', autenticar, exigirNivel('administrador'), async (req, res) => {
  try {
    const { clienteLogin } = req.body; // login do cliente, ou null pra remover

    const modelo = await pool.query('SELECT usuario_login FROM modelos_3d WHERE id = $1', [req.params.id]);
    if (!modelo.rows[0]) {
      return res.status(404).json({ error: 'Modelo não encontrado' });
    }
    if (modelo.rows[0].usuario_login !== req.usuarioLogin) {
      return res.status(403).json({ error: 'Você só pode atribuir modelos que você mesmo gerou' });
    }

    if (clienteLogin) {
      const cliente = await pool.query(
        "SELECT login FROM usuarios WHERE login = $1 AND nivel_acesso = 'cliente'",
        [clienteLogin]
      );
      if (!cliente.rows[0]) {
        return res.status(400).json({ error: 'Esse login não corresponde a uma conta cliente' });
      }
    }

    await pool.query('UPDATE modelos_3d SET cliente_login = $1 WHERE id = $2', [clienteLogin || null, req.params.id]);
    res.json({ message: 'Atribuição atualizada com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atribuir modelo ao cliente' });
  }
});

// Lista os modelos do usuário logado: administrador vê o que ELE gerou,
// cliente vê o que foi ATRIBUÍDO a ele.
app.get('/api/meus-modelos', autenticar, async (req, res) => {
  try {
    const query = req.usuarioNivelAcesso === 'cliente'
      ? 'SELECT id, tipo, descricao, url_modelo, criado_em, cliente_login FROM modelos_3d WHERE cliente_login = $1 ORDER BY criado_em DESC'
      : 'SELECT id, tipo, descricao, url_modelo, criado_em, cliente_login FROM modelos_3d WHERE usuario_login = $1 ORDER BY criado_em DESC';

    const resultado = await pool.query(query, [req.usuarioLogin]);
    res.json({ modelos: resultado.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar modelos' });
  }
});

// Chat com a IA (Gemini). Recebe o histórico inteiro a cada chamada
// (o front-end reenvia tudo, então aqui é uma chamada única e sem estado).
// Exige login: cada chamada consome cota da sua conta do Gemini, então não
// pode ficar aberta pra qualquer visitante do site.
app.post('/api/chat', autenticar, async (req, res) => {
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

// Guarda, em memória, qual prompt gerou cada tarefa de texto-pra-3D — só
// serve pra registrar uma descrição legível quando o modelo terminar e for
// salvo no banco (ver salvarModeloGerado).
const promptPorTask = new Map();

// Registra no banco um modelo 3D que terminou de ser gerado, associado ao
// usuário logado que pediu a geração. Usa "ON CONFLICT DO NOTHING" na coluna
// meshy_task_id porque o front-end fica consultando o status repetidamente
// até dar "sucesso" — sem isso, cada consulta depois do sucesso duplicaria a
// linha no banco.
async function salvarModeloGerado({ usuarioLogin, tipo, descricao, urlModelo, meshyTaskId }) {
  if (!urlModelo) return;

  try {
    await pool.query(
      `INSERT INTO modelos_3d (usuario_login, tipo, descricao, url_modelo, meshy_task_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (meshy_task_id) DO NOTHING`,
      [usuarioLogin, tipo, descricao || null, urlModelo, meshyTaskId]
    );
  } catch (err) {
    // Um erro aqui não deve derrubar a resposta pro front-end — a pessoa já
    // recebeu o modelo gerado, só não conseguimos registrar no histórico.
    console.error('Erro ao salvar modelo gerado no banco:', err);
  }
}

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

// Todas as rotas abaixo que chamam a Meshy/Gemini exigem login (autenticar):
// são chamadas que custam créditos da SUA conta, então não podem ficar
// abertas pra qualquer visitante do site gerar modelos de graça.

app.post('/api/generate-3d', autenticar, exigirNivel('administrador'), async (req, res) => {
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
    // Guarda o prompt original pra usar como descrição quando o modelo for salvo.
    if (data.result) promptPorTask.set(data.result, prompt);
    // Meshy retorna { result: "<task_id>" }
    res.json({ task_id: data.result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar tarefa de geração 3D' });
  }
});

app.get('/api/task/:id', autenticar, async (req, res) => {
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

    const statusNormalizado = normalizeStatus(data.status);
    const urlModelo = data.model_urls?.glb || null;

    if (statusNormalizado === 'success' && urlModelo) {
      await salvarModeloGerado({
        usuarioLogin: req.usuarioLogin,
        tipo: 'texto',
        descricao: promptPorTask.get(clientId),
        urlModelo,
        meshyTaskId: actualId,
      });
    }

    res.json({
      status: statusNormalizado,
      progress: data.progress,
      output: { model_url: urlModelo },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao consultar tarefa' });
  }
});

app.post('/api/generate-image', autenticar, async (req, res) => {
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

app.get('/api/task-text-image/:id', autenticar, async (req, res) => {
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

app.post('/api/generate-3d-image', autenticar, exigirNivel('administrador'), async (req, res) => {
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

app.get('/api/task-image/:id', autenticar, async (req, res) => {
  try {
    const response = await fetch(`https://api.meshy.ai/openapi/v1/image-to-3d/${req.params.id}`, {
      headers: { Authorization: `Bearer ${process.env.MESHY_API_KEY}` },
    });
    const data = await response.json();

    const statusNormalizado = normalizeStatus(data.status);
    const urlModelo = data.model_urls?.glb || null;

    if (statusNormalizado === 'success' && urlModelo) {
      await salvarModeloGerado({
        usuarioLogin: req.usuarioLogin,
        tipo: 'imagem',
        descricao: 'Gerado a partir de uma imagem',
        urlModelo,
        meshyTaskId: req.params.id,
      });
    }

    res.json({
      status: statusNormalizado,
      progress: data.progress,
      output: { model_url: urlModelo },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao consultar tarefa de imagem' });
  }
});

// Multi-imagem: recebe várias fotos do MESMO objeto/pessoa (ex.: frente, lado, costas)
// e usa o endpoint "multi-image-to-3d" da Meshy, que combina os ângulos para gerar
// um modelo mais fiel do que dá pra conseguir com uma foto só.
app.post('/api/generate-3d-multi-image', autenticar, exigirNivel('administrador'), async (req, res) => {
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

app.get('/api/task-multi-image/:id', autenticar, async (req, res) => {
  try {
    const response = await fetch(`https://api.meshy.ai/openapi/v1/multi-image-to-3d/${req.params.id}`, {
      headers: { Authorization: `Bearer ${process.env.MESHY_API_KEY}` },
    });
    const data = await response.json();

    const statusNormalizado = normalizeStatus(data.status);
    const urlModelo = data.model_urls?.glb || null;

    if (statusNormalizado === 'success' && urlModelo) {
      await salvarModeloGerado({
        usuarioLogin: req.usuarioLogin,
        tipo: 'multi_imagem',
        descricao: 'Gerado a partir de múltiplas imagens',
        urlModelo,
        meshyTaskId: req.params.id,
      });
    }

    res.json({
      status: statusNormalizado,
      progress: data.progress,
      output: { model_url: urlModelo },
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
//
// Essa rota fica sem "autenticar" de propósito: quem acessa pelo celular
// (escaneando o QR code) normalmente não está logado nesse dispositivo, e
// ela só guarda fotos em memória por alguns minutos — não chama nenhuma API
// paga. Quem efetivamente gera o modelo (gastando créditos) é o /api/
// generate-3d-multi-image, chamado pelo navegador logado no computador.
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

// Domínios de onde essa rota pode buscar arquivos. Sem essa checagem, ela
// seria um "proxy aberto": qualquer pessoa poderia usar seu servidor pra
// buscar QUALQUER endereço da internet (inclusive endereços internos da
// própria hospedagem), o que é um risco de segurança sério (SSRF).
const DOMINIOS_PERMITIDOS_PROXY = ['meshy.ai'];

function urlPermitidaParaProxy(urlStr) {
  try {
    const { hostname, protocol } = new URL(urlStr);
    if (protocol !== 'https:') return false;
    return DOMINIOS_PERMITIDOS_PROXY.some(
      (dominio) => hostname === dominio || hostname.endsWith(`.${dominio}`)
    );
  } catch {
    return false;
  }
}

app.get('/api/proxy-model', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL não informada' });

    if (!urlPermitidaParaProxy(url)) {
      return res.status(400).json({ error: 'Domínio não permitido' });
    }

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

// A maioria das hospedagens (Render, Railway etc.) define a porta através da
// variável PORT — se não existir (rodando local), cai no 3001 de sempre.
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));   // ← isso precisa vir por ÚLTIMO
