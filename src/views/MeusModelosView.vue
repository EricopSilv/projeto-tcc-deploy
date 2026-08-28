<template>
  <div class="meus-modelos-page">
    <div class="meus-modelos-wrap">
      <h1 class="meus-modelos-title">Meus Modelos</h1>

      <p v-if="carregando" class="meus-modelos-status">Carregando...</p>
      <p v-else-if="erro" class="meus-modelos-status">{{ erro }}</p>
      <p v-else-if="modelos.length === 0" class="meus-modelos-status">
        Você ainda não gerou nenhum modelo 3D.
      </p>

      <div v-else class="meus-modelos-grid">
        <div v-for="modelo in modelos" :key="modelo.id" class="meus-modelos-card">
          <ModelViewer :src="proxiedUrl(modelo.url_modelo)" />
          <p class="meus-modelos-tipo">{{ tipoFormatado(modelo.tipo) }}</p>
          <p v-if="modelo.descricao" class="meus-modelos-descricao">{{ modelo.descricao }}</p>
          <p class="meus-modelos-data">{{ dataFormatada(modelo.criado_em) }}</p>
          <a :href="modelo.url_modelo" target="_blank" class="meus-modelos-download-link">
            Baixar arquivo .glb
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import '@/assets/pages/meus-modelos.css';
import { ref, onMounted } from 'vue';
import { getMeusModelos } from '@/services/meshy';
import { API_BASE } from '@/services/apiBase';
import ModelViewer from '@/components/ModelViewer.vue';

const modelos = ref([]);
const carregando = ref(true);
const erro = ref('');

const LABELS_TIPO = {
  texto: 'Texto para 3D',
  imagem: 'Imagem para 3D',
  multi_imagem: 'Múltiplas imagens para 3D',
};

function tipoFormatado(tipo) {
  return LABELS_TIPO[tipo] || tipo;
}

function proxiedUrl(url) {
  return `${API_BASE}/api/proxy-model?url=${encodeURIComponent(url)}`;
}

function dataFormatada(dataIso) {
  return new Date(dataIso).toLocaleString('pt-BR');
}

onMounted(async () => {
  try {
    modelos.value = await getMeusModelos();
  } catch (err) {
    erro.value = err.message;
  } finally {
    carregando.value = false;
  }
});
</script>