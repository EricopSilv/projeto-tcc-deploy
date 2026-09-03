<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">Redefinir senha</h1>

      <template v-if="!tokenValido">
        <p class="login-message" style="margin-top: 0;">
          Link inválido. Peça um novo link em "Esqueci minha senha".
        </p>
      </template>

      <template v-else-if="!concluido">
        <div class="login-fields">
          <input v-model="novaSenha" type="password" placeholder="Nova senha" class="login-input" />
          <input v-model="confirmarSenha" type="password" placeholder="Confirmar nova senha" class="login-input" />
        </div>

        <button @click="enviar" :disabled="enviando" class="login-button login-button-primary">
          {{ enviando ? 'Salvando...' : 'Salvar nova senha' }}
        </button>
      </template>

      <p v-else class="login-message" style="margin-top: 0;">
        Senha redefinida com sucesso! Já pode fazer login com a nova senha.
      </p>

      <RouterLink to="/login" class="login-link">Voltar para o login</RouterLink>

      <p v-if="mensagem" class="login-message">{{ mensagem }}</p>
    </div>
  </div>
</template>

<script setup>
import '@/assets/pages/login.css';
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { redefinirSenha } from '@/services/auth';

const route = useRoute();
const router = useRouter();

const token = route.query.token || '';
const tokenValido = !!token;

const novaSenha = ref('');
const confirmarSenha = ref('');
const enviando = ref(false);
const concluido = ref(false);
const mensagem = ref('');

async function enviar() {
  if (!novaSenha.value) {
    mensagem.value = 'Informe a nova senha.';
    return;
  }
  if (novaSenha.value !== confirmarSenha.value) {
    mensagem.value = 'As senhas não são iguais.';
    return;
  }

  mensagem.value = '';
  enviando.value = true;
  try {
    await redefinirSenha(token, novaSenha.value);
    concluido.value = true;
    setTimeout(() => router.push('/login'), 2500);
  } catch (err) {
    mensagem.value = err.message;
  } finally {
    enviando.value = false;
  }
}
</script>
