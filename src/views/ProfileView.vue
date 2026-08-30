<template>
  <div class="profile-page">
      <div class="profile-card">
      <img :src="estadoUsuario.foto || avatarPadrao" alt="Foto de perfil" class="profile-foto" />

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
      <h2 class="profile-modelos-title">{{ tituloModelos }}</h2>

      <p v-if="carregandoModelos" class="profile-modelos-status">Carregando...</p>
      <p v-else-if="erroModelos" class="profile-modelos-status">{{ erroModelos }}</p>
      <p v-else-if="modelos.length === 0" class="profile-modelos-status">
        {{ ehCliente ? 'Nenhum modelo foi disponibilizado para você ainda.' : 'Você ainda não gerou nenhum modelo 3D.' }}
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

          <div v-if="ehAdministrador" class="profile-modelos-atribuir">
            <label class="profile-modelos-atribuir-label">Atribuir a um cliente:</label>
            <select
              v-model="atribuicoes[modelo.id]"
              @change="salvarAtribuicao(modelo)"
              class="profile-modelos-atribuir-select"
            >
              <option value="">— nenhum —</option>
              <option v-for="cliente in clientes" :key="cliente.login" :value="cliente.login">
                {{ cliente.nome || cliente.login }}
              </option>
            </select>
            <p v-if="mensagemAtribuicao[modelo.id]" class="profile-modelos-atribuir-msg">
              {{ mensagemAtribuicao[modelo.id] }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import '@/assets/pages/profile.css';
import { computed, reactive, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { estadoUsuario, limparUsuarioLogado } from '@/stores/usuario';
import { getMeusModelos, listarClientes, atribuirModeloCliente } from '@/services/meshy';
import { API_BASE } from '@/services/apiBase';
import ModelViewer from '@/components/ModelViewer.vue';
import avatarPadrao from '@/assets/avatar-padrao.svg';

const router = useRouter();

const nivelAcessoFormatado = computed(() => {
  const nivel = estadoUsuario.nivelAcesso || '';
  return nivel.charAt(0).toUpperCase() + nivel.slice(1);
});

const ehAdministrador = computed(() => estadoUsuario.nivelAcesso === 'administrador');
const ehCliente = computed(() => estadoUsuario.nivelAcesso === 'cliente');
const tituloModelos = computed(() =>
  ehCliente.value ? 'Modelos disponíveis para você' : 'Meus Modelos'
);

function irParaEdicao() {
  router.push('/perfil/editar');
}

function sair() {
  limparUsuarioLogado();
  router.push('/login');
}

const modelos = ref([]);
const carregandoModelos = ref(true);
const erroModelos = ref('');
const clientes = ref([]);
// Guarda, por id de modelo, qual cliente está selecionado no <select> — e a
// mensagem de sucesso/erro depois de salvar aquela atribuição específica.
const atribuicoes = reactive({});
const mensagemAtribuicao = reactive({});

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

async function salvarAtribuicao(modelo) {
  mensagemAtribuicao[modelo.id] = '';
  try {
    const clienteLogin = atribuicoes[modelo.id] || null;
    await atribuirModeloCliente(modelo.id, clienteLogin);
    mensagemAtribuicao[modelo.id] = 'Atribuição salva!';
  } catch (err) {
    mensagemAtribuicao[modelo.id] = err.message;
  }
}

onMounted(async () => {
  try {
    modelos.value = await getMeusModelos();
    // Pré-preenche o seletor de cada modelo com o cliente já atribuído (se algum).
    for (const modelo of modelos.value) {
      atribuicoes[modelo.id] = modelo.cliente_login || '';
    }

    if (ehAdministrador.value) {
      clientes.value = await listarClientes();
    }
  } catch (err) {
    erroModelos.value = err.message;
  } finally {
    carregandoModelos.value = false;
  }
});
</script>