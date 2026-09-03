<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">Esqueci minha senha</h1>

      <template v-if="!enviado">
        <p class="login-message" style="margin-top: 0; margin-bottom: 1rem;">
          Informe seu login. Se a conta tiver um e-mail cadastrado, mandamos um link de redefinição pra ele.
        </p>

        <div class="login-fields">
          <input v-model="loginInput" placeholder="Login" class="login-input" />
        </div>

        <button @click="enviar" :disabled="enviando" class="login-button login-button-primary">
          {{ enviando ? 'Enviando...' : 'Enviar link' }}
        </button>
      </template>

      <p v-else class="login-message" style="margin-top: 0;">
        Se esse login existir e tiver e-mail cadastrado, o link de redefinição já foi enviado. Confira sua caixa de entrada (e o spam).
      </p>

      <RouterLink to="/login" class="login-link">Voltar para o login</RouterLink>

      <p v-if="mensagem" class="login-message">{{ mensagem }}</p>
    </div>
  </div>
</template>

<script setup>
import '@/assets/pages/login.css';
import { ref } from 'vue';
import { esqueciSenha } from '@/services/auth';

const loginInput = ref('');
const enviando = ref(false);
const enviado = ref(false);
const mensagem = ref('');

async function enviar() {
  if (!loginInput.value) {
    mensagem.value = 'Informe o login.';
    return;
  }

  mensagem.value = '';
  enviando.value = true;
  try {
    await esqueciSenha(loginInput.value);
    enviado.value = true;
  } catch (err) {
    mensagem.value = err.message;
  } finally {
    enviando.value = false;
  }
}
</script>
