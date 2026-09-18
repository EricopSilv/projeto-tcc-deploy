<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">{{ modoCadastro ? 'Cadastro' : 'Login' }}</h1>

      <div class="login-fields">
        <input v-model="loginInput" placeholder="Login" class="login-input" />
        <input v-model="senha" type="password" placeholder="Senha" class="login-input" />
        <template v-if="modoCadastro">
          <input v-model="email" type="email" placeholder="E-mail (opcional, mas necessário pra recuperar a senha)" class="login-input" />
          <input v-model="nome" placeholder="Nome completo (opcional)" class="login-input" />
          <input v-model="telefone" placeholder="Telefone (opcional)" class="login-input" />
          <select v-model="tipoConta" class="login-input">
            <option value="administrador">Administrador (crio modelos 3D)</option>
            <option value="cliente">Cliente (recebo modelos já criados)</option>
          </select>
        </template>
      </div>

      <label v-if="modoCadastro" class="login-checkbox-label">
        <input type="checkbox" v-model="aceitouTermos" />
        Li e aceito os
        <RouterLink to="/termos" target="_blank">Termos de Uso e a Política de Privacidade</RouterLink>
      </label>

      <button @click="enviar" class="login-button login-button-primary">
        {{ modoCadastro ? 'Cadastrar' : 'Entrar' }}
      </button>

      <button @click="modoCadastro = !modoCadastro" class="login-button login-button-secondary">
        {{ modoCadastro ? 'Já tenho conta, fazer login' : 'Não tenho conta, cadastrar' }}
      </button>

      <RouterLink v-if="!modoCadastro" to="/esqueci-senha" class="login-link">Esqueci minha senha</RouterLink>

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
const email = ref('');
const tipoConta = ref('administrador');
const modoCadastro = ref(false);
const mensagem = ref('');
const aceitouTermos = ref(false);

async function enviar() {
  mensagem.value = '';
  try {
    if (modoCadastro.value) {
      if (!aceitouTermos.value) {
        mensagem.value = 'Você precisa aceitar os Termos de Uso pra criar uma conta.';
        return;
      }
      await register(loginInput.value, senha.value, nome.value, telefone.value, tipoConta.value, email.value);
      mensagem.value = 'Cadastro realizado! Agora você pode fazer login.';
      modoCadastro.value = false;
      nome.value = '';
      telefone.value = '';
      email.value = '';
      tipoConta.value = 'administrador';
      aceitouTermos.value = false;
    } else {
      const data = await loginApi(loginInput.value, senha.value);
      definirUsuarioLogado(data.login, data.token, data.nome, data.telefone, data.nivelAcesso, data.foto, data.email, data.notificarEmail);
      router.push('/perfil');
    }
  } catch (err) {
    mensagem.value = err.message;
  }
}
</script>
