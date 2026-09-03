<template>
  <div class="edit-profile-page">
    <div class="edit-profile-card">
      <h1 class="edit-profile-title">Alterar dados</h1>

      <p class="edit-profile-subtitle">
        Login atual: <strong class="edit-profile-highlight">{{ estadoUsuario.login }}</strong>
      </p>

      <div class="edit-profile-foto">
        <img :src="previaFoto || estadoUsuario.foto || avatarPadrao" alt="Foto de perfil" class="edit-profile-foto-img" />
        <label class="btn-secondary edit-profile-foto-label">
          Escolher foto
          <input type="file" accept="image/*" @change="selecionarFoto" class="edit-profile-foto-input" />
        </label>
      </div>

      <div class="edit-profile-fields">
        <input v-model="novoLogin" placeholder="Novo login (opcional)" class="input-field" />
        <input v-model="novaSenha" type="password" placeholder="Nova senha (opcional)" class="input-field" />
        <input v-model="novoNome" placeholder="Nome completo" class="input-field" />
        <input v-model="novoTelefone" placeholder="Telefone" class="input-field" />
        <input v-model="novoEmail" type="email" placeholder="E-mail" class="input-field" />
      </div>

      <div class="edit-profile-actions">
        <button @click="salvar" class="btn-primary">Salvar alterações</button>
        <button @click="voltar" class="btn-secondary">Voltar</button>
        <button @click="excluir" class="btn-danger">Excluir minha conta</button>
      </div>

      <p v-if="mensagem" class="edit-profile-message">{{ mensagem }}</p>
    </div>
  </div>
</template>

<script setup>
import '@/assets/pages/edit-profile.css';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { updateUser, deleteUser } from '@/services/auth';
import { estadoUsuario, definirUsuarioLogado, limparUsuarioLogado } from '@/stores/usuario';
import avatarPadrao from '@/assets/avatar-padrao.svg';

const router = useRouter();
const novoLogin = ref('');
const novaSenha = ref('');
// Nome e telefone já vêm preenchidos com o valor atual (diferente de
// login/senha, que ficam em branco por padrão) — assim a pessoa edita
// diretamente em cima do que já está salvo.
const novoNome = ref(estadoUsuario.nome || '');
const novoTelefone = ref(estadoUsuario.telefone || '');
const novoEmail = ref(estadoUsuario.email || '');
const mensagem = ref('');

const previaFoto = ref('');
let fotoBase64Selecionada = '';

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

    definirUsuarioLogado(data.login, data.token, data.nome, data.telefone, data.nivelAcesso, data.foto, data.email);
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

function voltar() {
  router.push('/perfil');
}
</script>