<template>
  <model-viewer
    :src="src"
    alt="Modelo 3D Gerado"
    camera-controls
    auto-rotate
    shadow-intensity="1"
    exposure="1"
    class="model-viewer-el"
  ></model-viewer>
</template>

<script setup>
import '@/assets/components/model-viewer.css';

defineProps({
  src: { type: String, required: true }
})
</script>
