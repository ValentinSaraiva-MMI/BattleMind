<script setup lang="ts">
// Pied de page : logotype (le symbole est décoratif, le logotype porte le nom
// accessible) et lien de signalement vers le formulaire externe.
</script>

<template>
  <footer class="footer">
    <div class="footer__logo">
      <img src="/icons/logo-symbole-footer.svg" alt="" width="39" height="30">
      <img src="/icons/logo-texte.svg" alt="Battlemind" width="74" height="11">
    </div>

    <!-- Ouverture dans un nouvel onglet annoncée dans le nom accessible (RGAA 13.1). -->
    <a
      class="footer__link"
      href="https://tally.so/r/obNzoX"
      target="_blank"
      rel="noopener noreferrer"
    >
      Signaler un problème
      <span class="sr-only">(nouvel onglet)</span>
    </a>
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

/* Lien discret : gris atténué (7,6:1 sur le fond, RGAA 3.2) et souligné en
   permanence — le repère ne tient donc pas à la seule couleur (RGAA 3.1).
   Le focus visible est fourni par la règle globale :focus-visible. */
.footer__link {
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 16px;
  text-decoration: underline;
}

.footer__link:hover {
  color: var(--color-text);
}

</style>
