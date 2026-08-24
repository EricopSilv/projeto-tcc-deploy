<script setup>
import { RouterLink, RouterView } from 'vue-router'
import { estadoUsuario } from './stores/usuario';
import logo from './assets/logo.png';
import '@/assets/layout.css';
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-logo-wrap">
      <img :src="logo" alt="Logo" class="sidebar-logo" />
    </div>

    <nav class="sidebar-nav">
      <RouterLink to="/gerar-3d" class="sidebar-link" active-class="sidebar-link-active">Gerar 3D</RouterLink>
      <RouterLink v-if="!estadoUsuario.login" to="/login" class="sidebar-link" active-class="sidebar-link-active">Login</RouterLink>
      <RouterLink v-else to="/perfil" class="sidebar-link" active-class="sidebar-link-active">Perfil ({{ estadoUsuario.login }})</RouterLink>
    </nav>
  </aside>

  <div class="app-content">
    <RouterView />
  </div>
</template>
