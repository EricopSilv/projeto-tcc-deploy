<template>
  <div class="edit-profile-page">
    <div class="edit-profile-card">
      <h1 class="edit-profile-title">Alterar dados</h1>

      <p class="edit-profile-subtitle">
        Login atual: <strong class="edit-profile-highlight">{{ estadoUsuario.login }}</strong>
      </p>

      <div class="edit-profile-fields">
        <input v-model="novoLogin" placeholder="Novo login (opcional)" class="input-field" />
        <input v-model="novaSenha" type="password" placeholder="Nova senha (opcional)" class="input-field" />
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

const router = useRouter();
const novoLogin = ref('');
const novaSenha = ref('');
const mensagem = ref('');

async function salvar() {
  mensagem.value = '';
  try {
    const data = await updateUser(estadoUsuario.login, {
      novoLogin: novoLogin.value || undefined,
      novaSenha: novaSenha.value || undefined,
    });

    definirUsuarioLogado(data.login, data.token);
    novoLogin.value = '';
    novaSenha.value = '';
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
