<template>
  <div class="profile-page">
    <div class="profile-card">
      <h1 class="profile-title">
        Bem-vindo, <span class="profile-highlight">{{ estadoUsuario.nome || estadoUsuario.login }}</span>!
      </h1>

      <p class="profile-subtitle">Login: {{ estadoUsuario.login }}</p>
      <p v-if="estadoUsuario.telefone" class="profile-subtitle">Telefone: {{ estadoUsuario.telefone }}</p>
      <p v-if="estadoUsuario.nivelAcesso" class="profile-subtitle">Nível: {{ nivelAcessoFormatado }}</p>

      <p v-if="estadoUsuario.nivelAcesso === 'pendente'" class="profile-aviso-pendente">
        Sua conta ainda está aguardando aprovação de um administrador. Você já pode
        navegar pelo site, mas só vai conseguir gerar modelos 3D depois de aprovado.
      </p>

      <div class="profile-actions">
        <button @click="irParaEdicao" class="btn-primary">Alterar dados</button>
        <button @click="sair" class="btn-secondary">Sair</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import '@/assets/pages/profile.css';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { estadoUsuario, limparUsuarioLogado } from '@/stores/usuario';

const router = useRouter();

const nivelAcessoFormatado = computed(() => {
  const nivel = estadoUsuario.nivelAcesso || '';
  return nivel.charAt(0).toUpperCase() + nivel.slice(1);
});

function irParaEdicao() {
  router.push('/perfil/editar');
}

function sair() {
  limparUsuarioLogado();
  router.push('/login');
}
</script>
