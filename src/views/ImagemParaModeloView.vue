<template>
  <div class="imagem-modelo-page">
    <div class="imagem-modelo-wrap">
      <RouterLink :to="{ name: 'gerar-3d' }" class="imagem-modelo-back">
        ← Voltar
      </RouterLink>

      <div class="imagem-modelo-card">
        <h1 class="imagem-modelo-title">Modelo 3D a partir de uma imagem</h1>
        <p class="imagem-modelo-subtitle">Envie uma foto e gere o modelo 3D correspondente</p>
        <ImageTo3D />
      </div>
    </div>
  </div>
</template>

<script setup>
import '@/assets/pages/imagem-para-modelo.css';
import { RouterLink } from 'vue-router';
import ImageTo3D from '@/components/ImageTo3D.vue';
</script>
