<template>
  <div class="image-to-3d">
    <div class="image-mode-toggle">
      <button
        type="button"
        @click="usarModoArquivo"
        :class="modo === 'arquivo' ? 'btn-primary' : 'btn-secondary'"
      >
        Escolher arquivo
      </button>
      <button
        type="button"
        @click="iniciarWebcam"
        :disabled="!webcamSuportada"
        :title="!webcamSuportada ? 'Seu navegador não suporta acesso à câmera aqui' : ''"
        :class="modo === 'webcam' ? 'btn-primary' : 'btn-secondary'"
      >
        Usar webcam
      </button>
    </div>

    <label v-if="modo === 'arquivo'" class="image-file-label">
      <span class="image-file-label-text">Escolher imagem (PNG ou JPEG, até 5MB)</span>
      <input
        type="file"
        accept="image/png, image/jpeg"
        @change="onFileChange"
        class="image-file-input"
      />
    </label>

    <div v-else-if="modo === 'webcam'" class="image-webcam">
      <video ref="videoRef" autoplay playsinline muted class="image-webcam-video"></video>
      <div class="image-webcam-actions">
        <button type="button" @click="capturarFoto" class="btn-primary">Capturar foto</button>
        <button type="button" @click="cancelarWebcam" class="btn-secondary">Cancelar</button>
      </div>
    </div>

    <div v-if="preview">
      <img :src="preview" alt="preview" class="image-preview" />
    </div>

    <button @click="generate" :disabled="loading || !preview" class="btn-primary">
      Gerar Modelo 3D a partir da imagem
    </button>

    <p v-if="loading" class="image-progress">Gerando... {{ progress }}%</p>

    <div v-if="modelUrl" class="image-result">
      <ModelViewer :src="proxiedModelUrl" />
      <a :href="modelUrl" target="_blank" class="image-download-link">
        Baixar arquivo .glb
      </a>
    </div>
  </div>
</template>

<script setup>
import '@/assets/components/image-to-3d.css';
import { ref, computed, onUnmounted, nextTick, onMounted } from 'vue';
import { generate3DFromImage, checkImageTask } from '@/services/meshy';
import { API_BASE } from '@/services/apiBase';
import ModelViewer from './ModelViewer.vue';

const preview = ref(null);
const loading = ref(false);
const progress = ref(0);
const modelUrl = ref(null);
const proxiedModelUrl = computed(() =>
  modelUrl.value ? `${API_BASE}/api/proxy-model?url=${encodeURIComponent(modelUrl.value)}` : null
);

// --- Envio por arquivo (já existia) ---
function onFileChange(event) {
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

    preview.value = canvas.toDataURL('image/jpeg', 0.92);
    URL.revokeObjectURL(objectUrl);
  };

  img.onerror = () => {
    alert('Não foi possível ler essa imagem. Tente outro arquivo.');
    URL.revokeObjectURL(objectUrl);
  };

  img.src = objectUrl;
}

// --- Captura por webcam (novo) ---
const modo = ref('arquivo'); // 'arquivo' | 'webcam'
const videoRef = ref(null);
const streamAtivo = ref(null);

// Se o navegador não suportar getUserMedia (ou a página não estiver em
// contexto seguro — https ou localhost), a gente nem mostra a opção.
const webcamSuportada = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

function usarModoArquivo() {
  pararWebcam();
  modo.value = 'arquivo';
}

async function iniciarWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
    });

    streamAtivo.value = stream;
    modo.value = 'webcam';

    // O <video> só existe no DOM depois que "modo" vira 'webcam' (v-else-if),
    // então espera o próximo tick do Vue antes de ligar o stream nele.
    await nextTick();
    if (videoRef.value) {
      videoRef.value.srcObject = stream;
    }
  } catch (err) {
    console.error(err);
    alert('Não foi possível acessar a webcam. Verifique as permissões do navegador.');
  }
}

function capturarFoto() {
  const video = videoRef.value;
  if (!video) return;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  // Mesma conversão que já era usada no upload de arquivo — o resto do
  // componente (preview, geração do modelo) não precisa saber de onde veio.
  preview.value = canvas.toDataURL('image/jpeg', 0.92);
  pararWebcam();
  modo.value = 'arquivo';
}

function cancelarWebcam() {
  pararWebcam();
  modo.value = 'arquivo';
}

function pararWebcam() {
  streamAtivo.value?.getTracks().forEach((track) => track.stop());
  streamAtivo.value = null;
}

// Se a pessoa sair da página com a webcam ligada, desliga a câmera junto.
onUnmounted(() => {
  pararWebcam();
});

async function generate() {
  if (!preview.value) return;

  loading.value = true;
  modelUrl.value = null;

  try {
    const taskId = await generate3DFromImage(preview.value);
    // Guarda a geração em andamento: se a pessoa atualizar a página ou fechar
    // o navegador, o onMounted lá embaixo retoma o acompanhamento daqui.
    localStorage.setItem(TAREFA_EM_ANDAMENTO, taskId);
    poll(taskId);
  } catch (err) {
    loading.value = false;
    alert(err.message || 'Falha ao gerar o modelo.');
  }
}

async function poll(taskId) {
  const task = await checkImageTask(taskId);
  progress.value = task.progress || 0;

  if (task.status === 'success') {
    modelUrl.value = task.output.model_url;
    loading.value = false;
    localStorage.removeItem(TAREFA_EM_ANDAMENTO);
  } else if (['failed', 'cancelled', 'banned'].includes(task.status)) {
    loading.value = false;
    localStorage.removeItem(TAREFA_EM_ANDAMENTO);
    alert('Falha ao gerar o modelo.');
  } else {
    setTimeout(() => poll(taskId), 2000);
  }
}
// Chave no localStorage onde fica o id da geração em andamento. É o que
// permite retomar o acompanhamento depois de atualizar a página — sem isso,
// o id só existia na memória do componente e sumia junto com ela.
const TAREFA_EM_ANDAMENTO = 'visionfade:geracaoImagem';

// Ao abrir a tela, se havia uma geração em andamento, volta a acompanhá-la.
onMounted(() => {
  const pendente = localStorage.getItem(TAREFA_EM_ANDAMENTO);
  if (!pendente) return;

  loading.value = true;
  poll(pendente);
});
</script>
