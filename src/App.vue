<script setup>
import { ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { estadoUsuario } from './stores/usuario';
import logo from './assets/logo.png';
import '@/assets/layout.css';

const menuAberto = ref(false);
const route = useRoute();

function alternarMenu() {
  menuAberto.value = !menuAberto.value;
}

function fecharMenu() {
  menuAberto.value = false;
}

// Garante que o menu feche sozinho ao trocar de página no celular.
watch(() => route.fullPath, fecharMenu);
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar-open': menuAberto }">
    <div class="sidebar-top">
      <div class="sidebar-logo-wrap">
        <img :src="logo" alt="Logo" class="sidebar-logo" />
      </div>

      <button
        type="button"
        class="sidebar-toggle"
        @click="alternarMenu"
        :aria-expanded="menuAberto"
        aria-label="Abrir menu"
      >
        <span class="sidebar-toggle-bar"></span>
        <span class="sidebar-toggle-bar"></span>
        <span class="sidebar-toggle-bar"></span>
      </button>
    </div>

    <nav class="sidebar-nav">
      <RouterLink to="/gerar-3d" class="sidebar-link" active-class="sidebar-link-active" @click="fecharMenu">Gerar 3D</RouterLink>
      <RouterLink v-if="!estadoUsuario.login" to="/login" class="sidebar-link" active-class="sidebar-link-active" @click="fecharMenu">Login</RouterLink>
      <RouterLink v-else to="/perfil" class="sidebar-link" active-class="sidebar-link-active" @click="fecharMenu">Perfil ({{ estadoUsuario.login }})</RouterLink>
    </nav>
  </aside>

  <div class="app-content">
    <RouterView />
  </div>
</template>