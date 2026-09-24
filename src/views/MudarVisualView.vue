<template>
  <div class="mudar-visual-page">
    <div class="mudar-visual-wrap">
      <RouterLink :to="{ name: 'gerar-3d' }" class="mudar-visual-back">
        ← Voltar
      </RouterLink>

      <div class="mudar-visual-card">
        <h1 class="mudar-visual-title">Mudar o visual</h1>
        <p class="mudar-visual-subtitle">
          Envie uma foto, descreva o corte ou a barba desejada, e gere o modelo 3D do resultado
        </p>
        <MudarVisual />
      </div>
    </div>
  </div>
</template>

<script setup>
import '@/assets/pages/mudar-visual.css';
import { RouterLink } from 'vue-router';
import MudarVisual from '@/components/MudarVisual.vue';
</script>
