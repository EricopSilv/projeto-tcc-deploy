<template>
  <div class="tripo3d">
    <div class="tripo3d-form">
      <input v-model="prompt" placeholder="Descreva a imagem que você quer gerar..." class="input-field tripo3d-input" />
      <button @click="generateImage" :disabled="loadingImage" class="btn-primary tripo3d-submit-btn">
        Gerar Imagem
      </button>
    </div>
    <p v-if="loadingImage" class="tripo3d-progress">Gerando imagem... {{ imageProgress }}%</p>

    <div v-if="imageUrl" class="tripo3d-result">
      <img :src="imageUrl" alt="Imagem gerada" class="tripo3d-image" />

      <div>
        <button @click="generateModel" :disabled="loadingModel" class="btn-primary">
          Gerar Modelo 3D a partir da imagem
        </button>
        <p v-if="loadingModel" class="tripo3d-model-progress">Gerando modelo 3D... {{ modelProgress }}%</p>
      </div>

      <div v-if="modelUrl" class="tripo3d-model">
        <ModelViewer :src="proxiedModelUrl" />
        <a :href="modelUrl" target="_blank" class="tripo3d-download-link">
          Baixar arquivo .glb
        </a>
      </div>
    </div>
  </div>
</template>

<script setup>
// Nome do arquivo é histórico (a ideia original era usar a API da Tripo),
// mas hoje esse fluxo (texto -> imagem -> modelo 3D) roda todo via Meshy,
// igual o resto do projeto — ver services/meshy.js.
import '@/assets/components/tripo3d.css';
import { ref, computed } from 'vue';
import { generateImage as gerarImagemApi, checkTextImageTask, generate3DFromImage, checkImageTask } from '@/services/meshy';
import { API_BASE } from '@/services/apiBase';
import ModelViewer from './ModelViewer.vue';

const prompt = ref('');
const loadingImage = ref(false);
const imageProgress = ref(0);
const imageUrl = ref(null);

const loadingModel = ref(false);
const modelProgress = ref(0);
const modelUrl = ref(null);

const proxiedModelUrl = computed(() =>
  modelUrl.value ? `${API_BASE}/api/proxy-model?url=${encodeURIComponent(modelUrl.value)}` : null
);

async function generateImage() {
  if (!prompt.value.trim()) return;

  loadingImage.value = true;
  imageUrl.value = null;
  modelUrl.value = null;

  try {
    const taskId = await gerarImagemApi(prompt.value);
    pollImage(taskId);
  } catch (err) {
    loadingImage.value = false;
    alert(err.message || 'Falha ao gerar a imagem.');
  }
}

async function pollImage(taskId) {
  const task = await checkTextImageTask(taskId);
  imageProgress.value = task.progress || 0;

  if (task.status === 'success') {
    imageUrl.value = task.output.image_url;
    loadingImage.value = false;
  } else if (['failed', 'cancelled', 'banned'].includes(task.status)) {
    loadingImage.value = false;
    alert('Falha ao gerar a imagem.');
  } else {
    setTimeout(() => pollImage(taskId), 2000);
  }
}

async function generateModel() {
  if (!imageUrl.value) return;

  loadingModel.value = true;
  modelUrl.value = null;

  try {
    const taskId = await generate3DFromImage(imageUrl.value);
    pollModel(taskId);
  } catch (err) {
    loadingModel.value = false;
    alert(err.message || 'Falha ao gerar o modelo.');
  }
}

async function pollModel(taskId) {
  const task = await checkImageTask(taskId);
  modelProgress.value = task.progress || 0;

  if (task.status === 'success') {
    modelUrl.value = task.output.model_url;
    loadingModel.value = false;
  } else if (['failed', 'cancelled', 'banned'].includes(task.status)) {
    loadingModel.value = false;
    alert('Falha ao gerar o modelo.');
  } else {
    setTimeout(() => pollModel(taskId), 2000);
  }
}
</script>
