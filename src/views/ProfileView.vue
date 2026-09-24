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
        <button v-if="ehSuperAdmin" @click="irParaUsuarios" class="btn-secondary">Gerenciar usuários</button>
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
          <!-- Modelo ainda em processamento: a tarefa foi criada na Meshy mas o
               arquivo ainda não foi baixado. Acontece quando a pessoa sai da
               página durante a geração — o servidor termina o trabalho depois. -->
          <div v-if="modelo.status === 'pendente'" class="profile-modelos-thumb-placeholder">
            Processando...
          </div>
          <div v-else-if="modelo.status === 'falhou'" class="profile-modelos-thumb-placeholder">
            A geração falhou
          </div>
          <div v-else-if="!modeloAberto[modelo.id]" class="profile-modelos-thumb-wrap">
            <img
              v-if="modelo.tem_miniatura"
              :src="miniaturaUrl(modelo)"
              :alt="modelo.descricao || 'Modelo 3D'"
              class="profile-modelos-thumb"
            />
            <div v-else class="profile-modelos-thumb-placeholder">Sem prévia</div>
            <button @click="modeloAberto[modelo.id] = true" class="btn-secondary profile-modelos-ver-btn">
              Ver em 3D
            </button>
          </div>
          <ModelViewer v-else :src="arquivoUrl(modelo)" />
          <p class="profile-modelos-tipo">{{ tipoFormatado(modelo.tipo) }}</p>
          <p v-if="modelo.descricao" class="profile-modelos-descricao">{{ modelo.descricao }}</p>
          <p class="profile-modelos-data">{{ dataFormatada(modelo.criado_em) }}</p>
          <p v-if="modelo.status === 'pendente'" class="profile-modelos-aviso">
            Ainda sendo preparado. Atualize a página em alguns instantes.
          </p>
          <div v-if="modelo.tem_arquivo" class="profile-modelos-downloads">
            <a :href="arquivoUrl(modelo)" download class="profile-modelos-download-link">.glb</a>
            <!-- Os outros formatos continuam apontando direto pra Meshy, que
                 apaga os arquivos depois de 3 dias. Por isso eles só aparecem
                 enquanto ainda valem: um link morto é pior que link nenhum. -->
            <template v-if="formatosExtrasValidos(modelo)">
              <a v-if="modelo.formatos?.fbx" :href="modelo.formatos.fbx" target="_blank" class="profile-modelos-download-link">.fbx</a>
              <a v-if="modelo.formatos?.obj" :href="modelo.formatos.obj" target="_blank" class="profile-modelos-download-link">.obj</a>
              <a v-if="modelo.formatos?.usdz" :href="modelo.formatos.usdz" target="_blank" class="profile-modelos-download-link">.usdz</a>
            </template>
          </div>

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
const LOGIN_SUPER_ADMIN = 'ericopererinha123@gmail.com';
const ehSuperAdmin = computed(() => estadoUsuario.login === LOGIN_SUPER_ADMIN);
const tituloModelos = computed(() =>
  ehCliente.value ? 'Modelos disponíveis para você' : 'Meus Modelos'
);

function irParaUsuarios() {
  router.push('/perfil/usuarios');
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
const modeloAberto = reactive({});

const LABELS_TIPO = {
  texto: 'Texto para 3D',
  imagem: 'Imagem para 3D',
  multi_imagem: 'Múltiplas imagens para 3D',
};
function tipoFormatado(tipo) {
  return LABELS_TIPO[tipo] || tipo;
}

// Os arquivos ficam guardados no nosso banco e são servidos por um token
// aleatório — não mais pela URL da Meshy, que expira em poucos dias.
function arquivoUrl(modelo) {
  return `${API_BASE}/api/arquivo/${modelo.token_publico}`;
}

function miniaturaUrl(modelo) {
  return `${API_BASE}/api/miniatura/${modelo.token_publico}`;
}

// Só o .glb fica guardado aqui. Os outros formatos seguem hospedados na Meshy,
// que apaga os arquivos gerados via API depois de 3 dias — passado esse prazo
// os links quebram, então paramos de exibi-los.
const DIAS_VALIDADE_MESHY = 3;

function formatosExtrasValidos(modelo) {
  const idadeEmDias = (Date.now() - new Date(modelo.criado_em)) / 86400000;
  return idadeEmDias < DIAS_VALIDADE_MESHY;
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