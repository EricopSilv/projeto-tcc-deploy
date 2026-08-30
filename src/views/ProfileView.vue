<template>
  <div class="profile-page">
    <div class="profile-card">
      <h1 class="profile-title">
        Bem-vindo, <span class="profile-highlight">{{ estadoUsuario.nome || estadoUsuario.login }}</span>!
      </h1>

      <p class="profile-subtitle">Login: {{ estadoUsuario.login }}</p>
      <p v-if="estadoUsuario.telefone" class="profile-subtitle">Telefone: {{ estadoUsuario.telefone }}</p>
      <p v-if="estadoUsuario.nivelAcesso" class="profile-subtitle">Nível: {{ nivelAcessoFormatado }}</p>

      <p v-if="estadoUsuario.nivelAcesso === 'pendente'" class="profile-aviso-pendente">
        Sua conta ainda está aguardando aprovação de um administrador. Você já pode
        navegar pelo site, mas só vai conseguir gerar modelos 3D depois de aprovado.
      </p>

      <div class="profile-actions">
        <button @click="irParaEdicao" class="btn-primary">Alterar dados</button>
        <button @click="sair" class="btn-secondary">Sair</button>
      </div>
    </div>

    <div class="profile-modelos">
      <h2 class="profile-modelos-title">Meus Modelos</h2>

      <p v-if="carregandoModelos" class="profile-modelos-status">Carregando...</p>
      <p v-else-if="erroModelos" class="profile-modelos-status">{{ erroModelos }}</p>
      <p v-else-if="modelos.length === 0" class="profile-modelos-status">
        Você ainda não gerou nenhum modelo 3D.
      </p>

      <div v-else class="profile-modelos-grid">
        <div v-for="modelo in modelos" :key="modelo.id" class="profile-modelos-card">
          <ModelViewer :src="proxiedUrl(modelo.url_modelo)" />
          <p class="profile-modelos-tipo">{{ tipoFormatado(modelo.tipo) }}</p>
          <p v-if="modelo.descricao" class="profile-modelos-descricao">{{ modelo.descricao }}</p>
          <p class="profile-modelos-data">{{ dataFormatada(modelo.criado_em) }}</p>
          <a :href="modelo.url_modelo" target="_blank" class="profile-modelos-download-link">
            Baixar arquivo .glb
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import '@/assets/pages/profile.css';
import { computed, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { estadoUsuario, limparUsuarioLogado } from '@/stores/usuario';
import { getMeusModelos } from '@/services/meshy';
import { API_BASE } from '@/services/apiBase';
import ModelViewer from '@/components/ModelViewer.vue';

const router = useRouter();

const nivelAcessoFormatado = computed(() => {
  const nivel = estadoUsuario.nivelAcesso || '';
  return nivel.charAt(0).toUpperCase() + nivel.slice(1);
});

function irParaEdicao() {
  router.push('/perfil/editar');
}

function sair() {
  limparUsuarioLogado();
  router.push('/login');
}

// --- Modelos já gerados pela conta logada ---
const modelos = ref([]);
const carregandoModelos = ref(true);
const erroModelos = ref('');

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
    erroModelos.value = err.message;
  } finally {
    carregandoModelos.value = false;
  }
});
</script>