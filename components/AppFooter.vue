<script setup lang="ts">
const links = [
  { label: "Conditions d'utilisation", to: '/cgu' },
  { label: 'Politique de confidentialité', to: '/confidentialite' },
  { label: 'Contact', to: '/contact' }
]
</script>

<template>
  <footer class="footer">
    <div class="footer__logo">
      <img src="/icons/logo-symbole-footer.svg" alt="" width="39" height="30">
      <img src="/icons/logo-texte.svg" alt="Battlemind" width="74" height="11">
    </div>
    <nav class="footer__nav">
      <NuxtLink v-for="link in links" :key="link.to" class="footer__link" :to="link.to">
        {{ link.label }}
      </NuxtLink>
    </nav>
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

.footer__nav {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 24px;
  min-width: 0;
}

.footer__link {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 20px;
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.15s ease;
}

.footer__link:hover,
.footer__link:focus-visible {
  color: var(--color-text);
}
</style>
