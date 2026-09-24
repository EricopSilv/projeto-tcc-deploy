<template>
  <div class="visual-wrap">
    <!-- ETAPA 1: foto + descrição do visual -->
    <div class="visual-etapa">
      <label class="visual-label">1. Foto da pessoa</label>

      <input type="file" accept="image/*" @change="aoEscolherArquivo" class="visual-file" />

      <img v-if="fotoOriginal" :src="fotoOriginal" alt="Foto enviada" class="visual-previa" />
    </div>

    <div class="visual-etapa">
      <label class="visual-label">2. Descreva o visual desejado</label>

      <textarea
        v-model="descricaoVisual"
        placeholder="Ex: degradê baixo nas laterais, sem alterar o comprimento em cima"
        class="input-field visual-textarea"
        rows="3"
      ></textarea>

      <p class="visual-dica">
        Quanto mais específico, melhor. Descreva o corte, a barba e o que deve
        permanecer como está.
      </p>

      <button
        @click="gerarPrevia"
        :disabled="!fotoOriginal || !descricaoVisual.trim() || carregandoPrevia"
        class="btn-primary visual-botao"
      >
        {{ carregandoPrevia ? `Aplicando o visual... ${progressoPrevia}%` : 'Ver prévia do visual' }}
      </button>
    </div>

    <!-- ETAPA 2: comparação antes/depois -->
    <div v-if="fotoEditada" class="visual-etapa">
      <label class="visual-label">3. Resultado</label>

      <div class="visual-comparacao">
        <figure class="visual-figura">
          <img :src="fotoOriginal" alt="Antes" class="visual-previa" />
          <figcaption class="visual-legenda">Antes</figcaption>
        </figure>
        <figure class="visual-figura">
          <img :src="fotoEditada" alt="Depois" class="visual-previa" />
          <figcaption class="visual-legenda">Depois</figcaption>
        </figure>
      </div>

      <p class="visual-dica">
        Não ficou como esperava? Ajuste a descrição acima e gere outra prévia —
        isso custa bem menos que gerar o modelo 3D.
      </p>

      <button
        @click="gerarModelo"
        :disabled="carregandoModelo"
        class="btn-primary visual-botao"
      >
        {{ carregandoModelo ? `Gerando modelo 3D... ${progressoModelo}%` : 'Gerar modelo 3D deste visual' }}
      </button>
    </div>

    <!-- ETAPA 3: modelo pronto -->
    <div v-if="urlModelo" class="visual-etapa">
      <label class="visual-label">4. Modelo 3D</label>
      <ModelViewer :src="urlModeloProxy" />
    </div>

    <p v-if="mensagemErro" class="visual-erro">{{ mensagemErro }}</p>
  </div>
</template>

<script setup>
import '@/assets/components/mudar-visual.css';
import { ref, computed, onMounted } from 'vue';
import {
  editarVisual,
  checkEditarVisualTask,
  generate3DFromImage,
  checkImageTask,
} from '@/services/meshy';
import { API_BASE } from '@/services/apiBase';
import ModelViewer from './ModelViewer.vue';

const fotoOriginal = ref(null);
const descricaoVisual = ref('');
const mensagemErro = ref('');

const carregandoPrevia = ref(false);
const progressoPrevia = ref(0);
const fotoEditada = ref(null);

const carregandoModelo = ref(false);
const progressoModelo = ref(0);
const urlModelo = ref(null);

const urlModeloProxy = computed(() =>
  urlModelo.value ? `${API_BASE}/api/proxy-model?url=${encodeURIComponent(urlModelo.value)}` : null
);

// Mesma chave de retomada usada nas outras telas: se a pessoa atualizar a
// página no meio da geração do modelo, o acompanhamento volta sozinho.
const TAREFA_EM_ANDAMENTO = 'visionfade:geracaoVisual';

function aoEscolherArquivo(evento) {
  const arquivo = evento.target.files[0];
  if (!arquivo) return;

  if (arquivo.size > 5 * 1024 * 1024) {
    mensagemErro.value = 'Imagem muito grande. Escolha uma imagem menor que 5MB.';
    return;
  }

  const leitor = new FileReader();
  leitor.onload = (e) => {
    fotoOriginal.value = e.target.result;
    fotoEditada.value = null;
    urlModelo.value = null;
    mensagemErro.value = '';
  };
  leitor.onerror = () => {
    mensagemErro.value = 'Não foi possível ler essa imagem. Tente outro arquivo.';
  };
  leitor.readAsDataURL(arquivo);
}

// --- Etapa 1: editar a foto ---

async function gerarPrevia() {
  mensagemErro.value = '';
  carregandoPrevia.value = true;
  fotoEditada.value = null;
  urlModelo.value = null;

  try {
    const taskId = await editarVisual(fotoOriginal.value, descricaoVisual.value);
    acompanharPrevia(taskId);
  } catch (err) {
    carregandoPrevia.value = false;
    mensagemErro.value = err.message || 'Falha ao aplicar o visual.';
  }
}

async function acompanharPrevia(taskId) {
  const tarefa = await checkEditarVisualTask(taskId);
  progressoPrevia.value = tarefa.progress || 0;

  if (tarefa.status === 'success') {
    fotoEditada.value = tarefa.output.image_url;
    carregandoPrevia.value = false;
  } else if (['failed', 'cancelled', 'banned'].includes(tarefa.status)) {
    carregandoPrevia.value = false;
    mensagemErro.value = 'Não foi possível aplicar esse visual. Tente descrever de outro jeito.';
  } else {
    setTimeout(() => acompanharPrevia(taskId), 2000);
  }
}

// --- Etapa 2: gerar o modelo 3D da foto editada ---

async function gerarModelo() {
  mensagemErro.value = '';
  carregandoModelo.value = true;
  urlModelo.value = null;

  try {
    // A descrição do visual vira o nome do modelo, pra que ele não fique
    // indistinguível dos outros na lista do Perfil.
    const taskId = await generate3DFromImage(fotoEditada.value, descricaoVisual.value.trim());
    localStorage.setItem(TAREFA_EM_ANDAMENTO, taskId);
    acompanharModelo(taskId);
  } catch (err) {
    carregandoModelo.value = false;
    mensagemErro.value = err.message || 'Falha ao gerar o modelo.';
  }
}

async function acompanharModelo(taskId) {
  const tarefa = await checkImageTask(taskId);
  progressoModelo.value = tarefa.progress || 0;

  if (tarefa.status === 'success') {
    urlModelo.value = tarefa.output.model_url;
    carregandoModelo.value = false;
    localStorage.removeItem(TAREFA_EM_ANDAMENTO);
  } else if (['failed', 'cancelled', 'banned'].includes(tarefa.status)) {
    carregandoModelo.value = false;
    localStorage.removeItem(TAREFA_EM_ANDAMENTO);
    mensagemErro.value = 'Falha ao gerar o modelo.';
  } else {
    setTimeout(() => acompanharModelo(taskId), 2000);
  }
}

onMounted(() => {
  const pendente = localStorage.getItem(TAREFA_EM_ANDAMENTO);
  if (!pendente) return;

  carregandoModelo.value = true;
  acompanharModelo(pendente);
});
</script>
