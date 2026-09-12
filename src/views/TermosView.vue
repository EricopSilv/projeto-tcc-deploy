<template>
  <div class="termos-page">
    <div class="termos-card">
      <h1 class="termos-title">Termos de Uso e Política de Privacidade</h1>
      <p class="termos-atualizado">Última atualização: {{ dataAtual }}</p>

      <section class="termos-secao">
        <h2>1. Sobre o VisionFade</h2>
        <p>
          O VisionFade é um sistema desenvolvido como Trabalho de Conclusão de Curso (TCC),
          que permite gerar modelos 3D a partir de texto ou imagens usando serviços de
          inteligência artificial de terceiros (Meshy AI). Por ser um projeto acadêmico,
          o serviço pode ser instável, ficar indisponível temporariamente ou ser descontinuado
          sem aviso prévio.
        </p>
      </section>

      <section class="termos-secao">
        <h2>2. Dados que coletamos</h2>
        <p>Para funcionar, o VisionFade armazena:</p>
        <ul>
          <li>Nome, login, telefone e e-mail informados no cadastro;</li>
          <li>Foto de perfil, caso enviada;</li>
          <li>Senha (armazenada de forma criptografada, nunca em texto puro);</li>
          <li>Os modelos 3D gerados, as imagens e os textos usados para gerá-los;</li>
          <li>Qual administrador atribuiu um modelo a qual cliente.</li>
        </ul>
      </section>

      <section class="termos-secao">
        <h2>3. Como os dados são usados</h2>
        <p>
          Os dados servem para autenticação na plataforma, para administradores atribuírem
          modelos gerados a clientes, e para o envio de e-mails transacionais (recuperação
          de senha e aviso de novo modelo disponível).
        </p>
      </section>

      <section class="termos-secao">
        <h2>4. Compartilhamento com terceiros</h2>
        <p>
          Imagens e textos enviados pra gerar modelos 3D são processados pela API da
          <strong>Meshy AI</strong>. E-mails transacionais são enviados através da
          <strong>Resend</strong>. Nenhum dado é vendido ou compartilhado para fins de
          publicidade.
        </p>
      </section>

      <section class="termos-secao">
        <h2>5. Seus direitos</h2>
        <p>
          Você pode solicitar a exclusão da sua conta e dos seus dados a qualquer momento,
          entrando em contato com o administrador do sistema.
        </p>
      </section>

      <section class="termos-secao">
        <h2>6. Contato</h2>
        <p>Dúvidas sobre estes termos podem ser enviadas para o administrador do sistema.</p>
      </section>

      <RouterLink to="/login" class="termos-voltar">← Voltar</RouterLink>
    </div>
  </div>
</template>

<script setup>
import '@/assets/pages/termos.css';
import { RouterLink } from 'vue-router';

const dataAtual = new Date().toLocaleDateString('pt-BR', { year: 'numeric', month: 'long' });
</script>