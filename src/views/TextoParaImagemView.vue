<template>
  <div class="texto-imagem-page">
    <div class="texto-imagem-wrap">
      <RouterLink :to="{ name: 'gerar-3d' }" class="texto-imagem-back">
        ← Voltar
      </RouterLink>

      <div class="texto-imagem-card">
        <h1 class="texto-imagem-title">Criar imagem a partir de texto</h1>
        <p class="texto-imagem-subtitle">Depois gere o modelo 3D a partir da imagem gerada</p>
        <Tripo3D />
      </div>
    </div>
  </div>
</template>

<script setup>
import '@/assets/pages/texto-para-imagem.css';
import { RouterLink } from 'vue-router';
import Tripo3D from '@/components/Tripo3D.vue';
</script>
