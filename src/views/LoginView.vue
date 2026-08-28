<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">{{ modoCadastro ? 'Cadastro' : 'Login' }}</h1>

      <div class="login-fields">
        <input v-model="loginInput" placeholder="Login" class="login-input" />
        <input v-model="senha" type="password" placeholder="Senha" class="login-input" />
        <template v-if="modoCadastro">
          <input v-model="nome" placeholder="Nome completo (opcional)" class="login-input" />
          <input v-model="telefone" placeholder="Telefone (opcional)" class="login-input" />
        </template>
      </div>

      <button @click="enviar" class="login-button login-button-primary">
        {{ modoCadastro ? 'Cadastrar' : 'Entrar' }}
      </button>

      <button @click="modoCadastro = !modoCadastro" class="login-button login-button-secondary">
        {{ modoCadastro ? 'Já tenho conta, fazer login' : 'Não tenho conta, cadastrar' }}
      </button>

      <p v-if="mensagem" class="login-message">{{ mensagem }}</p>
    </div>
  </div>
</template>

<script setup>
import '@/assets/pages/login.css';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { register, login as loginApi } from '@/services/auth';
import { definirUsuarioLogado } from '@/stores/usuario';

const router = useRouter();
const loginInput = ref('');
const senha = ref('');
const nome = ref('');
const telefone = ref('');
const modoCadastro = ref(false);
const mensagem = ref('');

async function enviar() {
  mensagem.value = '';
  try {
    if (modoCadastro.value) {
      await register(loginInput.value, senha.value, nome.value, telefone.value);
      mensagem.value = 'Cadastro realizado! Agora você pode fazer login.';
      modoCadastro.value = false;
      nome.value = '';
      telefone.value = '';
    } else {
      const data = await loginApi(loginInput.value, senha.value);
      definirUsuarioLogado(data.login, data.token, data.nome, data.telefone, data.nivelAcesso);
      router.push('/perfil');
    }
  } catch (err) {
    mensagem.value = err.message;
  }
}
</script>