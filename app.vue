<template>
  <div>
    <NuxtRouteAnnouncer />
    <!-- `app.vue` étant personnalisé, les layouts ne s'appliquent QUE si <NuxtPage>
         est enveloppé par <NuxtLayout>. Sans ça, layouts/default.vue est ignoré
         en silence et les pages perdent leur en-tête. -->
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
