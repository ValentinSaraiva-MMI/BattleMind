<script setup lang="ts">
// Pied de page réduit au logotype : le symbole est décoratif, le logotype porte
// le nom accessible.
</script>

<template>
  <footer class="footer">
    <div class="footer__logo">
      <img src="/icons/logo-symbole-footer.svg" alt="" width="39" height="30">
      <img src="/icons/logo-texte.svg" alt="Battlemind" width="74" height="11">
    </div>
  </footer>
</template>

<style scoped>
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 89px;
  padding: 25px 24px 24px;
  border-top: 1px solid var(--color-border-subtle);
}

.footer__logo {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

</style>
