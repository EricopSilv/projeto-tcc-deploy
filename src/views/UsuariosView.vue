<template>
  <div class="usuarios-page">
    <div class="usuarios-header">
      <h1 class="usuarios-title">Gerenciar usuários</h1>
      <button @click="voltar" class="btn-secondary">Voltar ao perfil</button>
    </div>

    <p v-if="carregando" class="usuarios-status">Carregando...</p>
    <p v-else-if="erro" class="usuarios-status">{{ erro }}</p>
    <p v-else-if="usuarios.length === 0" class="usuarios-status">Nenhuma conta cadastrada ainda.</p>

    <div v-else class="usuarios-lista">
      <div v-for="usuario in usuarios" :key="usuario.login" class="usuarios-card">
        <div class="usuarios-card-info">
          <p class="usuarios-card-login">{{ usuario.login }}</p>
          <p v-if="usuario.nome" class="usuarios-card-detalhe">{{ usuario.nome }}</p>
          <p v-if="usuario.telefone" class="usuarios-card-detalhe">{{ usuario.telefone }}</p>
        </div>

        <div v-if="usuario.login === estadoUsuario.login" class="usuarios-card-acao">
          <span class="usuarios-card-voce">Essa é a sua conta</span>
        </div>

        <div v-else class="usuarios-card-acao">
          <select v-model="niveisSelecionados[usuario.login]" class="usuarios-select">
            <option value="pendente">Pendente</option>
            <option value="administrador">Administrador</option>
            <option value="cliente">Cliente</option>
          </select>
          <button @click="salvarNivel(usuario)" class="btn-primary usuarios-btn-salvar">Salvar</button>
          <button @click="excluir(usuario)" class="btn-danger usuarios-btn-excluir">Excluir</button>
        </div>

        <p v-if="mensagens[usuario.login]" class="usuarios-card-mensagem">{{ mensagens[usuario.login] }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import '@/assets/pages/usuarios.css';
import { reactive, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { estadoUsuario } from '@/stores/usuario';
import { listarTodosUsuarios, alterarNivelAcesso, excluirContaAdmin } from '@/services/auth';

const router = useRouter();
const usuarios = ref([]);
const carregando = ref(true);
const erro = ref('');
const niveisSelecionados = reactive({});
const mensagens = reactive({});

function voltar() {
  router.push('/perfil');
}

async function salvarNivel(usuario) {
  mensagens[usuario.login] = '';
  try {
    await alterarNivelAcesso(usuario.login, niveisSelecionados[usuario.login]);
    usuario.nivel_acesso = niveisSelecionados[usuario.login];
    mensagens[usuario.login] = 'Nível atualizado!';
  } catch (err) {
    mensagens[usuario.login] = err.message;
  }
}

async function excluir(usuario) {
  const confirmar = confirm(`Tem certeza que deseja excluir a conta "${usuario.login}"? Essa ação não pode ser desfeita.`);
  if (!confirmar) return;

  try {
    await excluirContaAdmin(usuario.login);
    usuarios.value = usuarios.value.filter((u) => u.login !== usuario.login);
  } catch (err) {
    mensagens[usuario.login] = err.message;
  }
}

onMounted(async () => {
  try {
    usuarios.value = await listarTodosUsuarios();
    for (const usuario of usuarios.value) {
      niveisSelecionados[usuario.login] = usuario.nivel_acesso;
    }
  } catch (err) {
    erro.value = err.message;
  } finally {
    carregando.value = false;
  }
});
</script>