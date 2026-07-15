<script setup lang="ts">
type RuleCard = {
  id: string
  icon: string
  title: string
  description: string
}

const props = withDefaults(
  defineProps<{
    title?: string
    cards?: RuleCard[]
    interval?: number
  }>(),
  {
    title: 'Comment ça marche ?',
    interval: 5000,
    cards: () => [
      {
        id: 'vitesse',
        icon: '/icons/timer.svg',
        title: 'Répondez vite',
        description:
          "L'arène ne pardonne pas. Plus vous répondez rapidement, plus votre multiplicateur de score augmente. Dominez le temps."
      },
      {
        id: 'lorem-1',
        icon: '/icons/timer.svg',
        title: 'Lorem ipsum',
        description:
          'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
      },
      {
        id: 'lorem-2',
        icon: '/icons/timer.svg',
        title: 'Dolor sit amet',
        description:
          'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.'
      }
    ]
  }
)

const activeIndex = ref(0)
const paused = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

const goTo = (index: number) => {
  activeIndex.value = index
}

const start = () => {
  stop()
  timer = setInterval(() => {
    if (!paused.value) {
      activeIndex.value = (activeIndex.value + 1) % props.cards.length
    }
  }, props.interval)
}

const stop = () => {
  if (timer) clearInterval(timer)
  timer = undefined
}

onMounted(start)
onBeforeUnmount(stop)
</script>

<template>
  <section
    class="slider"
    aria-roledescription="carousel"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
    @focusin="paused = true"
    @focusout="paused = false"
  >
    <h2 class="slider__title">{{ title }}</h2>

    <div class="slider__viewport">
      <article
        v-for="(card, index) in cards"
        :key="card.id"
        class="card"
        :class="{ 'card--active': index === activeIndex }"
        :aria-hidden="index !== activeIndex"
      >
        <span class="card__icon">
          <img :src="card.icon" alt="" width="18" height="21">
        </span>
        <h3 class="card__title">{{ card.title }}</h3>
        <p class="card__text">{{ card.description }}</p>
      </article>
    </div>

    <div class="dots">
      <button
        v-for="(card, index) in cards"
        :key="card.id"
        class="dot"
        :class="{ 'dot--active': index === activeIndex }"
        type="button"
        :aria-label="`Aller à la slide ${index + 1}`"
        :aria-current="index === activeIndex"
        @click="goTo(index)"
      />
    </div>
  </section>
</template>

<style scoped>
.slider {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 448px;
  padding: 33px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
}

.slider__title {
  margin: 0;
  color: var(--color-text);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
}

.slider__viewport {
  position: relative;
  height: 386px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-background);
}

.card {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 33px;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.4s ease;
}

.card--active {
  opacity: 1;
  visibility: visible;
}

.card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  margin-bottom: 8px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-surface);
}

.card__icon img {
  width: 18px;
  height: 21px;
}

.card__title {
  margin: 0;
  color: var(--color-text);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  text-align: center;
}

.card__text {
  max-width: 320px;
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  line-height: 20px;
  text-align: center;
}

.dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.dot {
  width: 6px;
  height: 6px;
  padding: 0;
  border: none;
  border-radius: var(--radius);
  background-color: var(--color-border-subtle);
  cursor: pointer;
  transition: width 0.3s ease, background-color 0.3s ease;
}

.dot--active {
  width: 24px;
  background-color: var(--color-accent);
}

@media (prefers-reduced-motion: reduce) {
  .card,
  .dot {
    transition: none;
  }
}
</style>
