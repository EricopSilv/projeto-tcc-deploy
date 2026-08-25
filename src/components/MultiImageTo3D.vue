<template>
  <div class="multi-image">
    <p class="multi-image-intro">
      Envie de 1 a 4 fotos do <strong>mesmo objeto ou pessoa</strong> em ângulos diferentes.
      A primeira foto é usada como vista principal (frente) — quanto mais ângulos, mais fiel
      tende a ficar o modelo.
    </p>

    <div class="multi-image-mode-toggle">
      <button type="button" @click="usarModoArquivo" :class="modo === 'arquivo' ? 'btn-primary' : 'btn-secondary'">
        Enviar do computador
      </button>
      <button type="button" @click="usarCelular" :class="modo === 'celular' ? 'btn-primary' : 'btn-secondary'">
        Usar celular (QR code)
      </button>
    </div>

    <div v-if="modo === 'celular'" class="multi-image-qr-section">
      <p class="multi-image-qr-text">
        Escaneie o QR code com a câmera do celular. Uma página vai abrir lá pra
        você tirar as fotos — quando enviar, elas aparecem aqui sozinhas.
      </p>
      <img v-if="qrCodeUrl" :src="qrCodeUrl" alt="QR code para captura pelo celular" class="multi-image-qr-code" />
      <a :href="urlMobile" target="_blank" class="multi-image-qr-link">{{ urlMobile }}</a>
      <p class="multi-image-qr-status">Aguardando fotos do celular...</p>
      <button type="button" @click="cancelarCelular" class="btn-secondary">Cancelar</button>
    </div>

    <div v-else class="multi-image-grid">
      <label
        v-for="(slot, index) in slots"
        :key="index"
        class="multi-image-slot"
      >
        <span class="multi-image-slot-label">{{ slot.label }}</span>

        <img
          v-if="slot.preview"
          :src="slot.preview"
          :alt="slot.label"
          class="multi-image-slot-preview"
        />
        <div v-else class="multi-image-slot-placeholder">
          Escolher foto
        </div>

        <input
          type="file"
          accept="image/png, image/jpeg"
          class="multi-image-input-hidden"
          @change="(e) => onFileChange(e, index)"
        />
      </label>
    </div>

    <button
      @click="generate"
      :disabled="loading || !hasAtLeastOneImage"
      class="btn-primary"
    >
      Gerar Modelo 3D a partir das imagens
    </button>

    <p v-if="loading" class="multi-image-progress">Gerando... {{ progress }}%</p>

    <div v-if="modelUrl" class="multi-image-result">
      <ModelViewer :src="proxiedModelUrl" />
      <a :href="modelUrl" target="_blank" class="multi-image-download-link">
        Baixar arquivo .glb
      </a>
    </div>
  </div>
</template>

<script setup>
import '@/assets/components/multi-image-to-3d.css';
import { ref, computed, onUnmounted } from 'vue';
import QRCode from 'qrcode';
import { generate3DFromImages, checkMultiImageTask } from '@/services/meshy';
import { consultarCaptura } from '@/services/capturaMovel';
import { API_BASE } from '@/services/apiBase';
import ModelViewer from './ModelViewer.vue';

// Ordem sugerida: a Meshy usa a 1ª imagem como vista principal (frente).
// As demais (lados/costas) ajudam o modelo a "entender" partes que não
// aparecem na frente, então a ordem entre elas não importa muito.
const slots = ref([
  { label: 'Frente', preview: null },
  { label: 'Lado direito', preview: null },
  { label: 'Lado esquerdo', preview: null },
  { label: 'Costas', preview: null },
]);

const loading = ref(false);
const progress = ref(0);
const modelUrl = ref(null);

const proxiedModelUrl = computed(() =>
  modelUrl.value ? `${API_BASE}/api/proxy-model?url=${encodeURIComponent(modelUrl.value)}` : null
);

const hasAtLeastOneImage = computed(() => slots.value.some((s) => s.preview));

function onFileChange(event, index) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert('Imagem muito grande. Escolha uma imagem menor que 5MB.');
    return;
  }

  const img = new Image();
  const objectUrl = URL.createObjectURL(file);

  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);

    slots.value[index].preview = canvas.toDataURL('image/jpeg', 0.92);
    URL.revokeObjectURL(objectUrl);
  };

  img.onerror = () => {
    alert('Não foi possível ler essa imagem. Tente outro arquivo.');
    URL.revokeObjectURL(objectUrl);
  };

  img.src = objectUrl;
}

// --- Captura pelo celular via QR code (novo) ---
const modo = ref('arquivo'); // 'arquivo' | 'celular'
const sessionId = ref(null);
const qrCodeUrl = ref(null);
let intervaloPolling = null;

const urlMobile = computed(() =>
  sessionId.value ? `${window.location.origin}/captura-movel/${sessionId.value}` : ''
);

function gerarSessionId() {
  // De propósito não usamos crypto.randomUUID: essa API só funciona em
  // contexto seguro (https ou localhost), e isso aqui também precisa
  // funcionar acessando pelo IP da rede local, sem certificado.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function usarModoArquivo() {
  pararPollingCelular();
  modo.value = 'arquivo';
}

async function usarCelular() {
  modo.value = 'celular';
  sessionId.value = gerarSessionId();
  qrCodeUrl.value = await QRCode.toDataURL(urlMobile.value);

  intervaloPolling = setInterval(verificarCaptura, 2000);
}

async function verificarCaptura() {
  if (!sessionId.value) return;

  try {
    const resultado = await consultarCaptura(sessionId.value);
    if (resultado.pronto) {
      pararPollingCelular();
      resultado.images.forEach((imagem, i) => {
        if (slots.value[i]) slots.value[i].preview = imagem;
      });
      modo.value = 'arquivo';
    }
  } catch (err) {
    console.error(err);
  }
}

function pararPollingCelular() {
  if (intervaloPolling) {
    clearInterval(intervaloPolling);
    intervaloPolling = null;
  }
}

function cancelarCelular() {
  pararPollingCelular();
  modo.value = 'arquivo';
}

onUnmounted(() => {
  pararPollingCelular();
});

async function generate() {
  const images = slots.value.map((s) => s.preview).filter(Boolean);
  if (images.length === 0) return;

  loading.value = true;
  modelUrl.value = null;

  try {
    const taskId = await generate3DFromImages(images);
    poll(taskId);
  } catch (err) {
    loading.value = false;
    alert(err.message || 'Falha ao enviar as imagens.');
  }
}

async function poll(taskId) {
  const task = await checkMultiImageTask(taskId);
  progress.value = task.progress || 0;

  if (task.status === 'success') {
    modelUrl.value = task.output.model_url;
    loading.value = false;
  } else if (['failed', 'cancelled', 'banned'].includes(task.status)) {
    loading.value = false;
    alert('Falha ao gerar o modelo.');
  } else {
    setTimeout(() => poll(taskId), 2000);
  }
}
</script>
