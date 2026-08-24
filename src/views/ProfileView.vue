<template>
  <div class="profile-page">
    <div class="profile-card">
      <h1 class="profile-title">
        Bem-vindo, <span class="profile-highlight">{{ estadoUsuario.login }}</span>!
      </h1>

      <div class="profile-actions">
        <button @click="irParaEdicao" class="btn-primary">Alterar dados</button>
        <button @click="sair" class="btn-secondary">Sair</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import '@/assets/pages/profile.css';
import { useRouter } from 'vue-router';
import { estadoUsuario, limparUsuarioLogado } from '@/stores/usuario';

const router = useRouter();

function irParaEdicao() {
  router.push('/perfil/editar');
}

function sair() {
  limparUsuarioLogado();
  router.push('/login');
}
</script>
