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
        <input v-model="novoNome" placeholder="Nome completo" class="input-field" />
        <input v-model="novoTelefone" placeholder="Telefone" class="input-field" />
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
// Nome e telefone já vêm preenchidos com o valor atual (diferente de
// login/senha, que ficam em branco por padrão) — assim a pessoa edita
// diretamente em cima do que já está salvo.
const novoNome = ref(estadoUsuario.nome || '');
const novoTelefone = ref(estadoUsuario.telefone || '');
const mensagem = ref('');

async function salvar() {
  mensagem.value = '';
  try {
    const data = await updateUser(estadoUsuario.login, {
      novoLogin: novoLogin.value || undefined,
      novaSenha: novaSenha.value || undefined,
      novoNome: novoNome.value,
      novoTelefone: novoTelefone.value,
    });

    definirUsuarioLogado(data.login, data.token, data.nome, data.telefone);
    novoLogin.value = '';
    novaSenha.value = '';
    novoNome.value = data.nome || '';
    novoTelefone.value = data.telefone || '';
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
