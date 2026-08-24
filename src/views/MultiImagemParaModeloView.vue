<template>
  <div class="multi-imagem-modelo-page">
    <div class="multi-imagem-modelo-wrap">
      <RouterLink :to="{ name: 'gerar-3d' }" class="multi-imagem-modelo-back">
        ← Voltar
      </RouterLink>

      <div class="multi-imagem-modelo-card">
        <h1 class="multi-imagem-modelo-title">Modelo 3D a partir de várias imagens</h1>
        <p class="multi-imagem-modelo-subtitle">Frente, lados e costas — quanto mais ângulos, mais fiel o modelo</p>
        <MultiImageTo3D />
      </div>
    </div>
  </div>
</template>

<script setup>
import '@/assets/pages/multi-imagem-modelo.css';
import { RouterLink } from 'vue-router';
import MultiImageTo3D from '@/components/MultiImageTo3D.vue';
</script>
