<template>
  <div class="gerar3d-menu-page">
    <h1 class="gerar3d-menu-title">Gerador de Modelos 3D</h1>
    <p class="gerar3d-menu-subtitle">Escolha como você quer criar o seu modelo</p>

    <RouterLink :to="{ name: 'gerar-3d-texto' }" class="btn-primary gerar3d-menu-link">
      Criar imagem a partir de texto
    </RouterLink>

    <RouterLink :to="{ name: 'gerar-3d-imagem' }" class="btn-primary gerar3d-menu-link">
      Criar modelo 3D a partir de uma imagem
    </RouterLink>

    <RouterLink :to="{ name: 'gerar-3d-multi-imagem' }" class="btn-primary gerar3d-menu-link">
      Criar modelo 3D a partir de várias imagens
    </RouterLink>
  </div>
</template>

<script setup>
import '@/assets/pages/gerar-3d-menu.css';
import { RouterLink } from 'vue-router';
</script>
