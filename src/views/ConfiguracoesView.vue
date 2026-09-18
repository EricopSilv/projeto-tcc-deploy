<template>
  <div class="config-page">
    <h1 class="config-title">Configurações</h1>

    <!-- ---------- Dados pessoais ---------- -->
    <section class="config-card">
      <h2 class="config-section-title">Dados pessoais</h2>
      <p class="config-section-hint">
        Login atual: <strong class="config-highlight">{{ estadoUsuario.login }}</strong>
      </p>

      <div class="config-foto">
        <img
          :src="previaFoto || estadoUsuario.foto || avatarPadrao"
          alt="Foto de perfil"
          class="config-foto-img"
        />
        <label class="btn-secondary config-foto-label">
          Escolher foto
          <input type="file" accept="image/*" @change="selecionarFoto" class="config-foto-input" />
        </label>
      </div>

      <div class="config-fields">
        <input v-model="novoLogin" placeholder="Novo login (opcional)" class="input-field" />
        <input v-model="novaSenha" type="password" placeholder="Nova senha (opcional)" class="input-field" />
        <input v-model="novoNome" placeholder="Nome completo" class="input-field" />
        <input v-model="novoTelefone" placeholder="Telefone" class="input-field" />
        <input v-model="novoEmail" type="email" placeholder="E-mail" class="input-field" />
      </div>

      <div class="config-actions">
        <button @click="salvar" class="btn-primary">Salvar alterações</button>
      </div>

      <p v-if="mensagem" class="config-message">{{ mensagem }}</p>
    </section>

    <!-- ---------- Preferências ---------- -->
    <section class="config-card">
      <h2 class="config-section-title">Preferências</h2>

      <div class="config-toggle">
        <div class="config-toggle-texto">
          <p class="config-toggle-label">Avisos por e-mail</p>
          <p class="config-toggle-desc">
            Receber um e-mail quando um administrador disponibilizar um novo modelo 3D para você.
          </p>
        </div>
        <label class="config-switch">
          <input type="checkbox" v-model="notificarEmail" @change="salvarPreferenciaEmail" />
          <span class="config-switch-trilho"></span>
        </label>
      </div>

      <div class="config-toggle">
        <div class="config-toggle-texto">
          <p class="config-toggle-label">Reduzir animações</p>
          <p class="config-toggle-desc">
            Desliga as transições e os efeitos de movimento do site. Fica salvo neste navegador.
          </p>
        </div>
        <label class="config-switch">
          <input type="checkbox" v-model="reduzirAnimacoes" @change="salvarPreferenciaAnimacoes" />
          <span class="config-switch-trilho"></span>
        </label>
      </div>

      <p v-if="mensagemPreferencias" class="config-message">{{ mensagemPreferencias }}</p>
    </section>

    <!-- ---------- Zona de risco ---------- -->
    <section class="config-card config-card-perigo">
      <h2 class="config-section-title">Excluir conta</h2>
      <p class="config-section-hint">
        Apaga a sua conta e os seus dados permanentemente. Essa ação não pode ser desfeita.
      </p>
      <div class="config-actions">
        <button @click="excluir" class="btn-danger">Excluir minha conta</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import '@/assets/pages/configuracoes.css';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { updateUser, deleteUser } from '@/services/auth';
import { estadoUsuario, definirUsuarioLogado, limparUsuarioLogado } from '@/stores/usuario';
import avatarPadrao from '@/assets/avatar-padrao.svg';

const router = useRouter();

// ---------- Dados pessoais ----------
const novoLogin = ref('');
const novaSenha = ref('');
// Nome, telefone e e-mail já vêm preenchidos com o valor atual (diferente de
// login/senha, que ficam em branco) — assim a pessoa edita em cima do que
// já está salvo, em vez de ter que digitar tudo de novo.
const novoNome = ref(estadoUsuario.nome || '');
const novoTelefone = ref(estadoUsuario.telefone || '');
const novoEmail = ref(estadoUsuario.email || '');
const mensagem = ref('');

const previaFoto = ref('');
let fotoBase64Selecionada = '';

// ---------- Preferências ----------
const notificarEmail = ref(estadoUsuario.notificarEmail !== false);
const reduzirAnimacoes = ref(localStorage.getItem('reduzirAnimacoes') === '1');
const mensagemPreferencias = ref('');

// Redimensiona a imagem no navegador (máx. 300px no lado maior, JPEG 80%)
// antes de mandar pro backend — assim o arquivo fica pequeno o bastante pra
// salvar como texto (base64) direto numa coluna do banco, sem precisar de
// um serviço externo de hospedagem de imagens.
function redimensionarImagem(file, maxLado = 300, qualidade = 0.8) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', qualidade));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    leitor.onerror = reject;
    leitor.readAsDataURL(file);
  });
}

async function selecionarFoto(evento) {
  const file = evento.target.files?.[0];
  if (!file) return;

  try {
    const dataUri = await redimensionarImagem(file);
    fotoBase64Selecionada = dataUri;
    previaFoto.value = dataUri;
  } catch (err) {
    mensagem.value = 'Não foi possível processar essa imagem.';
  }
}

async function salvar() {
  mensagem.value = '';
  try {
    const data = await updateUser(estadoUsuario.login, {
      novoLogin: novoLogin.value || undefined,
      novaSenha: novaSenha.value || undefined,
      novoNome: novoNome.value,
      novoTelefone: novoTelefone.value,
      novoEmail: novoEmail.value,
      novaFoto: fotoBase64Selecionada || undefined,
    });

    definirUsuarioLogado(
      data.login, data.token, data.nome, data.telefone,
      data.nivelAcesso, data.foto, data.email, data.notificarEmail,
    );

    novoLogin.value = '';
    novaSenha.value = '';
    novoNome.value = data.nome || '';
    novoTelefone.value = data.telefone || '';
    novoEmail.value = data.email || '';
    fotoBase64Selecionada = '';
    previaFoto.value = '';
    mensagem.value = 'Dados atualizados com sucesso!';
  } catch (err) {
    mensagem.value = err.message;
  }
}

// O aviso por e-mail fica no banco (o backend precisa saber na hora de
// atribuir um modelo), então salva sozinho assim que a chave é mexida.
async function salvarPreferenciaEmail() {
  mensagemPreferencias.value = '';
  try {
    const data = await updateUser(estadoUsuario.login, {
      notificarEmail: notificarEmail.value,
    });

    definirUsuarioLogado(
      data.login, data.token, data.nome, data.telefone,
      data.nivelAcesso, data.foto, data.email, data.notificarEmail,
    );

    mensagemPreferencias.value = notificarEmail.value
      ? 'Você vai receber avisos por e-mail.'
      : 'Avisos por e-mail desligados.';
  } catch (err) {
    // Volta a chave pro estado anterior, senão ela mostraria algo que não
    // chegou a ser salvo de verdade.
    notificarEmail.value = !notificarEmail.value;
    mensagemPreferencias.value = err.message;
  }
}

// Essa é só visual e vale pra este navegador, então não passa pelo backend.
function salvarPreferenciaAnimacoes() {
  if (reduzirAnimacoes.value) {
    localStorage.setItem('reduzirAnimacoes', '1');
    document.documentElement.setAttribute('data-reduce-motion', 'true');
  } else {
    localStorage.removeItem('reduzirAnimacoes');
    document.documentElement.removeAttribute('data-reduce-motion');
  }
}

async function excluir() {
  const confirmar = confirm('Tem certeza que deseja excluir sua conta? Essa ação não pode ser desfeita.');
  if (!confirmar) return;

  try {
    await deleteUser(estadoUsuario.login);
    limparUsuarioLogado();
    router.push('/login');
  } catch (err) {
    mensagem.value = err.message;
  }
}
</script>
