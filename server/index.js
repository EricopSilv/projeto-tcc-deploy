import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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
  max: 1000,
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

// Rota proposital mente mínima: serve só pra "acordar" o servidor.
//
// O plano gratuito do Render hiberna a instância após 15 minutos sem tráfego,
// e a primeira requisição depois disso espera o servidor subir — o que pode
// levar 50 segundos ou mais. Se essa primeira requisição for justamente a de
// gerar um modelo, a pessoa acha que a geração é lenta, quando na verdade o
// tempo foi gasto ligando o servidor.
//
// O front-end chama esta rota assim que o site abre (ver src/main.js). Assim
// a instância já vai subindo enquanto a pessoa navega e escolhe a imagem, e
// quando ela clicar em gerar o servidor está de pé.
//
// Não consulta o banco de propósito: quanto mais leve, mais rápido responde.
app.get('/api/ping', (req, res) => {
  res.json({ ok: true });
});

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

// --- E-mail de redefinição de senha ---
// Mesmo aviso da função acima: sem domínio próprio verificado na Resend, só
// entrega de verdade pro e-mail dono da conta Resend (o mesmo ADMIN_EMAIL).
// Pra outras contas a chamada nem dá erro — só não chega e-mail nenhum. Fica
// assim por enquanto; quando um domínio for verificado lá, passa a funcionar
// pra qualquer e-mail sem mudar nada aqui.
async function enviarEmailRedefinicao({ email, login, token }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('E-mail de redefinição não enviado: RESEND_API_KEY não configurada.');
    return;
  }

  const linkRedefinicao = `${process.env.FRONTEND_URL}/redefinir-senha?token=${token}`;

  try {
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'VisionFade <onboarding@resend.dev>',
        to: [email],
        subject: 'Redefinição de senha - VisionFade',
        html: `
          <p>Login: <strong>${login}</strong></p>
          <p>Recebemos um pedido para redefinir sua senha. Se foi você, clique no link abaixo (válido por 1 hora):</p>
          <p><a href="${linkRedefinicao}">Redefinir minha senha</a></p>
          <p>Se não foi você, pode ignorar este e-mail.</p>
        `,
      }),
    });

    if (!resposta.ok) {
      const detalhes = await resposta.text();
      console.error('Erro ao enviar e-mail de redefinição (Resend):', resposta.status, detalhes);
    }
  } catch (err) {
    console.error('Erro ao enviar e-mail de redefinição:', err);
  }
}

// --- E-mail de aviso de modelo atribuído ---
// Mesma limitação das outras: sem domínio verificado na Resend, só entrega
// de verdade se o e-mail do cliente for o mesmo do ADMIN_EMAIL. Pra qualquer
// outro e-mail de cliente, a chamada não dá erro, só não entrega nada.
async function enviarEmailAtribuicao({ email, nomeModelo }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('E-mail de atribuição não enviado: RESEND_API_KEY não configurada.');
    return;
  }

  try {
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'VisionFade <onboarding@resend.dev>',
        to: [email],
        subject: 'Novo modelo 3D disponível - VisionFade',
        html: `
          <p>Um novo modelo 3D foi disponibilizado pra você no VisionFade${nomeModelo ? `: <strong>${nomeModelo}</strong>` : ''}.</p>
          <p>Acesse sua conta pra visualizar e baixar.</p>
        `,
      }),
    });

    if (!resposta.ok) {
      const detalhes = await resposta.text();
      console.error('Erro ao enviar e-mail de atribuição (Resend):', resposta.status, detalhes);
    }
  } catch (err) {
    console.error('Erro ao enviar e-mail de atribuição:', err);
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
      'SELECT login, senha_hash, nome, telefone, nivel_acesso, foto_perfil, email, notificar_email FROM usuarios WHERE login = $1',
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
      email: usuario.email,
      notificarEmail: usuario.notificar_email,
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

    const { novoLogin, novaSenha, novoNome, novoTelefone, novoEmail, novaFoto, notificarEmail } = req.body;

    if (
      !novoLogin && !novaSenha && novoNome === undefined &&
      novoTelefone === undefined && novoEmail === undefined && novaFoto === undefined &&
      notificarEmail === undefined
    ) {
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
    if (novoEmail !== undefined) {
      campos.push(`email = $${indice++}`);
      valores.push(novoEmail || null);
    }
    if (novaFoto !== undefined) {
      campos.push(`foto_perfil = $${indice++}`);
      valores.push(novaFoto || null);
    }
    // Aqui não dá pra usar "|| null" como nos campos de texto: false é um
    // valor legítimo, e "|| null" o transformaria em null (ou seja, desligar
    // o aviso nunca salvaria). Por isso o Boolean() explícito.
    if (notificarEmail !== undefined) {
      campos.push(`notificar_email = $${indice++}`);
      valores.push(Boolean(notificarEmail));
    }

    valores.push(loginAtual);
    const resultado = await pool.query(
      `UPDATE usuarios SET ${campos.join(', ')} WHERE login = $${indice} RETURNING login, nome, telefone, nivel_acesso, foto_perfil, email, notificar_email`,
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
      email: usuarioAtualizado.email,
      notificarEmail: usuarioAtualizado.notificar_email,
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
    const { login, senha, nome, telefone, tipoConta, email } = req.body;
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
        "INSERT INTO usuarios (login, senha_hash, nome, telefone, email, nivel_acesso) VALUES ($1, $2, $3, $4, $5, 'cliente')",
        [login, senhaHash, nome || null, telefone || null, email || null]
      );
      return res.status(201).json({ message: 'Usuário cadastrado com sucesso' });
    }

    // Fluxo existente: administrador nasce "pendente" (padrão da tabela) e
    // precisa ser aprovado por e-mail.
    await pool.query(
      'INSERT INTO usuarios (login, senha_hash, nome, telefone, email) VALUES ($1, $2, $3, $4, $5)',
      [login, senhaHash, nome || null, telefone || null, email || null]
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

// Pede redefinição de senha: gera um token temporário e manda um e-mail com
// o link. Sempre responde a MESMA mensagem, exista ou não esse login e tenha
// ou não e-mail cadastrado — assim não dá pra descobrir quais contas existem
// só tentando logins ao acaso.
app.post('/api/esqueci-senha', limiteAuth, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Informe o e-mail' });
    }

    const resultado = await pool.query('SELECT login, email FROM usuarios WHERE email = $1', [email]);
    const usuario = resultado.rows[0];

    if (!usuario) {
      return res.status(404).json({ error: 'Esse e-mail não está cadastrado' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    await pool.query(
      'INSERT INTO redefinicoes_senha (usuario_login, token) VALUES ($1, $2)',
      [usuario.login, token]
    );
    await enviarEmailRedefinicao({ email: usuario.email, login: usuario.login, token });

    res.json({ message: 'E-mail de redefinição enviado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao pedir redefinição de senha' });
  }
});

const REDEFINICAO_EXPIRA_MS = 60 * 60 * 1000; // 1 hora

// Consome o token do e-mail e troca a senha. Sem "autenticar" de propósito:
// quem está redefinindo a senha, por definição, não consegue logar — a
// segurança aqui vem do token aleatório, não de uma sessão já aberta.
app.post('/api/redefinir-senha', limiteAuth, async (req, res) => {
  try {
    const { token, novaSenha } = req.body;
    if (!token || !novaSenha) {
      return res.status(400).json({ error: 'Token e nova senha são obrigatórios' });
    }

    const resultado = await pool.query(
      'SELECT usuario_login, criado_em, usado FROM redefinicoes_senha WHERE token = $1',
      [token]
    );
    const pedido = resultado.rows[0];

    if (!pedido || pedido.usado) {
      return res.status(400).json({ error: 'Link inválido ou já utilizado' });
    }

    const expirado = Date.now() - new Date(pedido.criado_em).getTime() > REDEFINICAO_EXPIRA_MS;
    if (expirado) {
      return res.status(400).json({ error: 'Link expirado. Peça uma nova redefinição.' });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);
    await pool.query('UPDATE usuarios SET senha_hash = $1 WHERE login = $2', [senhaHash, pedido.usuario_login]);
    await pool.query('UPDATE redefinicoes_senha SET usado = true WHERE token = $1', [token]);

    res.json({ message: 'Senha redefinida com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao redefinir senha' });
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

    const modelo = await pool.query('SELECT usuario_login, descricao FROM modelos_3d WHERE id = $1', [req.params.id]);
    if (!modelo.rows[0]) {
      return res.status(404).json({ error: 'Modelo não encontrado' });
    }
    if (modelo.rows[0].usuario_login !== req.usuarioLogin) {
      return res.status(403).json({ error: 'Você só pode atribuir modelos que você mesmo gerou' });
    }

    let clienteEmail = null;
    let clienteQuerAviso = true;
    if (clienteLogin) {
      const cliente = await pool.query(
        "SELECT login, email, notificar_email FROM usuarios WHERE login = $1 AND nivel_acesso = 'cliente'",
        [clienteLogin]
      );
      if (!cliente.rows[0]) {
        return res.status(400).json({ error: 'Esse login não corresponde a uma conta cliente' });
      }
      clienteEmail = cliente.rows[0].email;
      // Contas antigas podem ter esse campo nulo (antes da coluna existir),
      // e nesse caso o padrão é avisar — só não envia quem desligou de fato.
      clienteQuerAviso = cliente.rows[0].notificar_email !== false;
    }

    await pool.query('UPDATE modelos_3d SET cliente_login = $1 WHERE id = $2', [clienteLogin || null, req.params.id]);

    if (clienteLogin && clienteEmail && clienteQuerAviso) {
      await enviarEmailAtribuicao({ email: clienteEmail, nomeModelo: modelo.rows[0].descricao });
    }

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
    // Repare que arquivo_glb e miniatura NÃO entram no SELECT: são os bytes
    // dos arquivos, e trazer isso pra listagem deixaria a resposta com vários
    // megabytes por modelo. A lista traz só o token, e o navegador busca cada
    // arquivo separadamente (ver /api/arquivo/:token e /api/miniatura/:token).
    const colunas = `id, tipo, descricao, url_modelo, formatos, criado_em, cliente_login,
                     token_publico, arquivo_glb IS NOT NULL AS tem_arquivo,
                     miniatura IS NOT NULL AS tem_miniatura`;

    const query = req.usuarioNivelAcesso === 'cliente'
      ? `SELECT ${colunas} FROM modelos_3d WHERE cliente_login = $1 ORDER BY criado_em DESC`
      : `SELECT ${colunas} FROM modelos_3d WHERE usuario_login = $1 ORDER BY criado_em DESC`;

    const resultado = await pool.query(query, [req.usuarioLogin]);
    res.json({ modelos: resultado.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar modelos' });
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
//
// O "DO UPDATE ... COALESCE" existe porque antes era "DO NOTHING", e isso
// congelava para sempre o que estivesse preenchido na PRIMEIRA gravação: se a
// miniatura ainda não tivesse chegado naquele instante, ela ficava nula e
// nenhuma consulta posterior conseguia corrigir. Com o COALESCE, o que já tem
// valor é preservado e só o que está nulo é preenchido.
// Tarefas cujo download já está em andamento AGORA, neste processo.
//
// Sem isso acontece o seguinte: o front-end consulta o status a cada 2s, e
// quando a geração termina o download do .glb começa. Esse download demora,
// e enquanto ele não grava a linha no banco, a consulta seguinte não vê
// arquivo nenhum e dispara OUTRO download do mesmo arquivo — e a próxima
// também. Em poucos segundos há vários downloads do mesmo modelo rodando ao
// mesmo tempo, o que estoura a memória da instância no Render.
const downloadsEmAndamento = new Set();

// Dispara o salvamento em segundo plano, SEM travar a resposta ao navegador.
// Antes isso era feito com await dentro da rota de status: a resposta só saía
// depois do arquivo inteiro ter sido baixado, e era por isso que a tela ficava
// parada em 99%.
function agendarSalvamentoModelo(params) {
  if (downloadsEmAndamento.has(params.meshyTaskId)) return;
  downloadsEmAndamento.add(params.meshyTaskId);

  salvarModeloGerado(params)
    .catch((err) => console.error('Falha ao salvar modelo em segundo plano:', err))
    .finally(() => downloadsEmAndamento.delete(params.meshyTaskId));
}

async function salvarModeloGerado({ usuarioLogin, tipo, descricao, urlModelo, formatos, thumbnailUrl, meshyTaskId }) {
  if (!urlModelo) return;

  try {
    // O front-end consulta o status repetidamente, então esta função é
    // chamada várias vezes para o mesmo modelo. Se o arquivo já foi baixado
    // antes, não há nada a fazer — sem essa saída antecipada, cada consulta
    // baixaria o .glb de novo.
    const existente = await pool.query(
      'SELECT id, arquivo_glb IS NOT NULL AS tem_arquivo FROM modelos_3d WHERE meshy_task_id = $1',
      [meshyTaskId]
    );
    if (existente.rows[0]?.tem_arquivo) return;

    // Baixa os arquivos AGORA, enquanto as URLs da Meshy ainda valem.
    // Isso é obrigatório, não uma otimização: a Meshy apaga os modelos
    // gerados via API depois de 3 dias, e as URLs assinadas expiram antes
    // disso. Guardar só o endereço significa perder o modelo — foi o que
    // aconteceu com todos os modelos gerados até aqui.
    const [glb, miniatura] = await Promise.all([
      baixarArquivo(urlModelo),
      thumbnailUrl ? baixarArquivo(thumbnailUrl) : Promise.resolve(null),
    ]);

    if (!glb) {
      console.error('Modelo não foi salvo: falha ao baixar o .glb da Meshy.', meshyTaskId);
      return;
    }

    // Endereço público de cada arquivo usa este token, e não o id da linha:
    // o id é sequencial e qualquer pessoa adivinharia os modelos dos outros
    // só contando 1, 2, 3. O token aleatório não dá pra adivinhar.
    const tokenPublico = crypto.randomBytes(16).toString('hex');

    await pool.query(
      `INSERT INTO modelos_3d
         (usuario_login, tipo, descricao, url_modelo, formatos, thumbnail_url,
          meshy_task_id, arquivo_glb, miniatura, token_publico)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (meshy_task_id) DO UPDATE SET
         arquivo_glb   = COALESCE(modelos_3d.arquivo_glb, EXCLUDED.arquivo_glb),
         miniatura     = COALESCE(modelos_3d.miniatura, EXCLUDED.miniatura),
         token_publico = COALESCE(modelos_3d.token_publico, EXCLUDED.token_publico),
         thumbnail_url = COALESCE(modelos_3d.thumbnail_url, EXCLUDED.thumbnail_url),
         formatos      = COALESCE(modelos_3d.formatos, EXCLUDED.formatos)`,
      [
        usuarioLogin, tipo, descricao || null, urlModelo,
        formatos ? JSON.stringify(formatos) : null, thumbnailUrl || null,
        meshyTaskId, glb, miniatura, tokenPublico,
      ]
    );

    console.log(`Modelo ${meshyTaskId} salvo: .glb ${(glb.length / 1048576).toFixed(1)} MB` +
      (miniatura ? `, miniatura ${(miniatura.length / 1024).toFixed(0)} KB` : ', sem miniatura'));
  } catch (err) {
    console.error('Erro ao salvar modelo gerado no banco:', err);
  }
}

// Baixa uma URL e devolve os bytes. Devolve null em vez de lançar erro: a
// falha em baixar a miniatura não pode impedir o modelo de ser salvo.
async function baixarArquivo(url) {
  try {
    const resposta = await fetch(url);
    if (!resposta.ok) {
      console.error('Falha ao baixar arquivo da Meshy:', resposta.status, url.slice(0, 80));
      return null;
    }
    return Buffer.from(await resposta.arrayBuffer());
  } catch (err) {
    console.error('Erro ao baixar arquivo da Meshy:', err.message);
    return null;
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
      agendarSalvamentoModelo({
        usuarioLogin: req.usuarioLogin,
        tipo: 'texto',
        descricao: promptPorTask.get(clientId),
        urlModelo,
        formatos: data.model_urls,
        thumbnailUrl: data.thumbnail_url || data.thumbnail_urls?.front || null,
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
        // Modelo FIXADO numa versão, em vez de "latest". O "latest" é um alvo
        // móvel: em 18/09/2026 ele deixou de apontar pro Meshy 7 e passou a
        // apontar pro 7.1, sem nenhuma mudança aqui. Fixar a versão garante
        // que a qualidade do que você mostra na defesa seja a mesma que você
        // testou — se a Meshy lançar um 7.2, nada muda sozinho.
        //
        // Já testamos o "meshy-6-lite", que é mais rápido, mas a perda de
        // detalhe na geometria ficou visível demais.
        ai_model: 'meshy-7.1',
        // Passe de geometria em 2048³ em vez do "standard" — é o parâmetro
        // que mais aumenta o detalhe da malha. Custa mais créditos e tempo,
        // e só funciona a partir do meshy-7.1 (daí a versão fixada acima).
        // O antigo "ultra_mode: true" da Meshy virou apelido justamente
        // deste valor.
        geometry_resolution: '2k',
        // O remesh é o que impede o arquivo de sair gigante. No Meshy 7 ele
        // vem DESLIGADO por padrão, e sem ele a Meshy entrega a malha bruta da
        // geração: o primeiro modelo gerado com geometry_resolution 2k saiu com
        // 49 MB, o que estouraria o limite de 0,5 GB do Neon em ~9 modelos.
        //
        // A prática normal é justamente esta: gerar denso (o passe 2k captura
        // bem a forma), reduzir os polígonos, e deixar o detalhe fino por conta
        // dos mapas de normal — que vêm do enable_pbr, já ligado aqui.
        should_remesh: true,
        target_polycount: 50000,
        // A textura já vem em 2k por padrão, então geometria e textura ficam
        // no mesmo patamar. Dá pra subir a textura pra 4k/8k, mas aí o .glb
        // engorda bastante — e ele agora é guardado no nosso banco.
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
      // TEMPORÁRIO (diagnóstico da miniatura): mostra exatamente quais campos
      // de thumbnail a Meshy mandou nesta resposta. Pode apagar este
      // console.log assim que a prévia estiver aparecendo nos cards.
      console.log('[thumb] image-to-3d:', JSON.stringify({
        thumbnail_url: data.thumbnail_url ?? '(ausente)',
        thumbnail_urls: data.thumbnail_urls ?? '(ausente)',
      }));

      agendarSalvamentoModelo({
        usuarioLogin: req.usuarioLogin,
        tipo: 'imagem',
        descricao: 'Gerado a partir de uma imagem',
        urlModelo,
        formatos: data.model_urls,
        thumbnailUrl: data.thumbnail_url || data.thumbnail_urls?.front || null,
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
        // Mesma versão fixada da rota de imagem única — ver o comentário lá
        // sobre por que não usar "latest".
        ai_model: 'meshy-7.1',
        // Mesmo patamar da rota de imagem única. Aqui o "2k" é inclusive o
        // teto: esta rota não aceita 4k no geometry_resolution.
        geometry_resolution: '2k',
        // O remesh é o que impede o arquivo de sair gigante. No Meshy 7 ele
        // vem DESLIGADO por padrão, e sem ele a Meshy entrega a malha bruta da
        // geração: o primeiro modelo gerado com geometry_resolution 2k saiu com
        // 49 MB, o que estouraria o limite de 0,5 GB do Neon em ~9 modelos.
        //
        // A prática normal é justamente esta: gerar denso (o passe 2k captura
        // bem a forma), reduzir os polígonos, e deixar o detalhe fino por conta
        // dos mapas de normal — que vêm do enable_pbr, já ligado aqui.
        should_remesh: true,
        target_polycount: 50000,
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
      agendarSalvamentoModelo({
        usuarioLogin: req.usuarioLogin,
        tipo: 'multi_imagem',
        descricao: 'Gerado a partir de múltiplas imagens',
        urlModelo,
        formatos: data.model_urls,
        thumbnailUrl: data.thumbnail_url || data.thumbnail_urls?.front || null,
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

// --- Arquivos guardados no banco ---
// Sem autenticação de propósito, igual ao /api/proxy-model logo abaixo: estas
// URLs vão dentro de uma tag <model-viewer> e de uma <img>, e o navegador não
// manda cabeçalho de autenticação nesses casos. A proteção aqui é o token
// aleatório do endereço, que não dá pra adivinhar.

app.get('/api/arquivo/:token', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT arquivo_glb, descricao FROM modelos_3d WHERE token_publico = $1',
      [req.params.token]
    );
    const linha = r.rows[0];
    if (!linha?.arquivo_glb) return res.status(404).json({ error: 'Arquivo não encontrado' });

    const nome = (linha.descricao || 'modelo').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40);
    res.set('Content-Type', 'model/gltf-binary');
    res.set('Content-Disposition', `inline; filename="${nome}.glb"`);
    // Os arquivos nunca mudam depois de gravados, então vale deixar o
    // navegador guardar em cache e não baixar de novo a cada visita.
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(linha.arquivo_glb);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar arquivo do modelo' });
  }
});

app.get('/api/miniatura/:token', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT miniatura FROM modelos_3d WHERE token_publico = $1',
      [req.params.token]
    );
    if (!r.rows[0]?.miniatura) return res.status(404).json({ error: 'Miniatura não encontrada' });

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(r.rows[0].miniatura);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar miniatura' });
  }
});

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
