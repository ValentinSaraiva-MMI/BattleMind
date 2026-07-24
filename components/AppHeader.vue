<script setup lang="ts">
// En-tête des écrans publics (connexion) : le logo seul, aucune action.
// Le symbole est décoratif — le logotype porte le nom accessible « Battlemind ».
</script>

<template>
  <header class="header">
    <div class="logo">
      <img class="logo__symbol" src="/icons/logo-symbole.svg" alt="" width="46" height="35">
      <img class="logo__wordmark" src="/icons/logo-texte.svg" alt="Battlemind" width="92" height="14">
    </div>
  </header>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo__symbol {
  width: 46px;
  height: 35px;
  flex-shrink: 0;
}

.logo__wordmark {
  width: 92px;
  height: 14px;
  flex-shrink: 0;
}
</style>
