<template>
  <div class="captura-page">
    <div class="captura-wrap">
      <div class="captura-card">
        <div class="captura-header">
          <h1 class="captura-title">Capturar fotos</h1>
          <p class="captura-desc">
            Tire de 1 a 4 fotos em ângulos diferentes e envie — elas aparecem
            automaticamente no computador.
          </p>
        </div>

        <div v-if="enviado" class="captura-success">
          <p class="captura-success-title">Fotos enviadas!</p>
          <p class="captura-success-desc">Pode voltar pro computador — o modelo já está sendo montado por lá.</p>
        </div>

        <template v-else>
          <div class="captura-grid">
            <label
              v-for="(slot, index) in slots"
              :key="index"
              class="captura-slot"
            >
              <span class="captura-slot-label">{{ slot.label }}</span>

              <img
                v-if="slot.preview"
                :src="slot.preview"
                :alt="slot.label"
                class="captura-slot-preview"
              />
              <div v-else class="captura-slot-placeholder">
                Tirar foto
              </div>

              <input
                type="file"
                accept="image/*"
                capture="environment"
                class="captura-input-hidden"
                @change="(e) => onFileChange(e, index)"
              />
            </label>
          </div>

          <button
            @click="enviarFotos"
            :disabled="enviando || !hasAtLeastOneImage"
            class="btn-primary"
          >
            {{ enviando ? 'Enviando...' : 'Enviar fotos' }}
          </button>

          <p v-if="erro" class="captura-error">{{ erro }}</p>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import '@/assets/pages/captura-movel.css';
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { enviarFotosCaptura } from '@/services/capturaMovel';

const route = useRoute();
const sessionId = route.params.sessionId;

const slots = ref([
  { label: 'Frente', preview: null },
  { label: 'Lado direito', preview: null },
  { label: 'Lado esquerdo', preview: null },
  { label: 'Costas', preview: null },
]);

const enviando = ref(false);
const enviado = ref(false);
const erro = ref('');

const hasAtLeastOneImage = computed(() => slots.value.some((s) => s.preview));

// capture="environment" no input já abre a câmera traseira nativa do
// celular direto — mais simples e compatível do que usar getUserMedia aqui.
function onFileChange(event, index) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 8 * 1024 * 1024) {
    erro.value = 'Foto muito grande. Tente uma foto menor que 8MB.';
    return;
  }

  const img = new Image();
  const objectUrl = URL.createObjectURL(file);

  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);

    slots.value[index].preview = canvas.toDataURL('image/jpeg', 0.85);
    URL.revokeObjectURL(objectUrl);
  };

  img.onerror = () => {
    erro.value = 'Não foi possível ler essa foto. Tente novamente.';
    URL.revokeObjectURL(objectUrl);
  };

  img.src = objectUrl;
}

async function enviarFotos() {
  const images = slots.value.map((s) => s.preview).filter(Boolean);
  if (images.length === 0) return;

  enviando.value = true;
  erro.value = '';

  try {
    await enviarFotosCaptura(sessionId, images);
    enviado.value = true;
  } catch (err) {
    erro.value = err.message || 'Falha ao enviar as fotos. Tente novamente.';
  } finally {
    enviando.value = false;
  }
}
</script>
