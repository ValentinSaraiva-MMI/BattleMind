// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import CreateLobbyModal from '~/components/CreateLobbyModal.vue'

/** `attachTo` est indispensable : sans DOM réel, `document.activeElement` ne bouge pas. */
const mountModal = (props: Record<string, unknown> = {}) =>
  mount(CreateLobbyModal, { props, attachTo: document.body })

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('CreateLobbyModal — pattern dialog', () => {
  beforeEach(() => {
    wrapper = mountModal()
  })

  it('expose un dialogue modal nommé par son titre', () => {
    const dialog = wrapper!.find('[role="dialog"]')

    expect(dialog.attributes('aria-modal')).toBe('true')
    const labelledBy = dialog.attributes('aria-labelledby')!
    expect(wrapper!.find(`#${labelledBy}`).text()).toBe('Créer une arène')
  })

  it('donne le focus au premier champ à l’ouverture', () => {
    expect(document.activeElement).toBe(wrapper!.find('#lobby-name').element)
  })

  it('ferme sur Échap', async () => {
    await wrapper!.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })

    expect(wrapper!.emitted('close')).toHaveLength(1)
  })

  it('ferme via le bouton dédié, doté d’un nom accessible', async () => {
    const close = wrapper!.find('.modal__close')

    expect(close.text()).toContain('Fermer')
    await close.trigger('click')

    expect(wrapper!.emitted('close')).toHaveLength(1)
  })


  it('rend le focus au déclencheur à la fermeture', async () => {
    wrapper!.unmount()

    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const modal = mountModal()
    // Le focus initial part sur un `nextTick` : il faut le laisser s'appliquer.
    await flushPromises()
    expect(document.activeElement).not.toBe(trigger)

    modal.unmount()

    expect(document.activeElement).toBe(trigger)
    trigger.remove()
    wrapper = null
  })
})

describe('CreateLobbyModal — formulaire accessible', () => {
  beforeEach(() => {
    wrapper = mountModal()
  })

  it('associe une étiquette visible au nom du salon', () => {
    const input = wrapper!.find('#lobby-name')
    const label = wrapper!.find('label[for="lobby-name"]')

    expect(label.exists()).toBe(true)
    expect(label.text()).toContain('obligatoire')
    expect(input.attributes('required')).toBeDefined()
  })

  it('regroupe les thèmes dans un fieldset légendé, avec de vrais boutons radio', () => {
    const fieldset = wrapper!.find('fieldset')
    const radios = fieldset.findAll('input[type="radio"]')

    expect(fieldset.find('legend').text()).toContain('thème')
    expect(radios).toHaveLength(5)
    // Même `name` : le groupe est navigable aux flèches nativement.
    expect(new Set(radios.map(radio => radio.attributes('name')))).toEqual(
      new Set(['lobby-category'])
    )
  })

  it('présélectionne une catégorie pour qu’aucune soumission ne parte à vide', () => {
    const checked = wrapper!
      .findAll('input[type="radio"]')
      .filter(radio => (radio.element as HTMLInputElement).checked)

    expect(checked).toHaveLength(1)
    expect((checked[0]!.element as HTMLInputElement).value).toBe('culture_generale')
  })

  it('expose les deux bascules comme des interrupteurs nommés et étiquetés', () => {
    const switches = wrapper!.findAll('[role="switch"]')

    expect(switches).toHaveLength(2)
    for (const toggle of switches) {
      expect(toggle.attributes('aria-checked')).toBe('true')
      // Le nom accessible reprend l'intitulé du groupe ET l'état écrit.
      expect(toggle.attributes('aria-labelledby')).toBeTruthy()
    }
    expect(wrapper!.find('#lobby-access-state').text()).toBe('Public')
    expect(wrapper!.find('#lobby-powerups-state').text()).toBe('Activé')
  })

  it('bascule l’accès public/privé au clic, état doublé d’un texte', async () => {
    const access = wrapper!.findAll('[role="switch"]')[0]!

    await access.trigger('click')

    expect(access.attributes('aria-checked')).toBe('false')
    // Statut jamais porté par la seule couleur (RGAA 3.1).
    expect(wrapper!.find('#lobby-access-state').text()).toBe('Privé')
  })
})

describe('CreateLobbyModal — stepper joueurs', () => {
  beforeEach(() => {
    wrapper = mountModal()
  })

  const stepper = () => wrapper!.find('[role="group"]')
  const buttons = () => stepper().findAll('button')
  const value = () => stepper().find('.stepper__value')

  it('démarre à 6 et désactive « + » à la borne haute', () => {
    expect(value().text()).toContain('6')
    expect(buttons()[1]!.attributes('disabled')).toBeDefined()
    expect(buttons()[0]!.attributes('disabled')).toBeUndefined()
  })

  it('nomme chaque bouton pour les lecteurs d’écran', () => {
    expect(buttons()[0]!.text()).toContain('Retirer un joueur')
    expect(buttons()[1]!.text()).toContain('Ajouter un joueur')
  })

  it('décrémente jusqu’à 2 puis désactive « − »', async () => {
    for (let i = 0; i < 4; i += 1) await buttons()[0]!.trigger('click')

    expect(value().text()).toContain('2')
    expect(buttons()[0]!.attributes('disabled')).toBeDefined()
    expect(buttons()[1]!.attributes('disabled')).toBeUndefined()
  })

  it('ne franchit jamais les bornes, même sur clics répétés', async () => {
    for (let i = 0; i < 10; i += 1) await buttons()[0]!.trigger('click')
    expect(value().text()).toContain('2')

    for (let i = 0; i < 10; i += 1) await buttons()[1]!.trigger('click')
    expect(value().text()).toContain('6')
  })

  it('annonce la valeur courante dans une zone vivante', () => {
    expect(value().attributes('aria-live')).toBe('polite')
    // La valeur nue « 6 » n'a pas de sens sans son unité.
    expect(value().text()).toContain('joueurs maximum')
  })
})

describe('CreateLobbyModal — soumission', () => {
  beforeEach(() => {
    wrapper = mountModal()
  })

  it('émet les paramètres saisis', async () => {
    await wrapper!.find('#lobby-name').setValue('Neon Protocol')
    await wrapper!.findAll('input[type="radio"]')[4]!.setValue()
    await wrapper!.findAll('[role="switch"]')[0]!.trigger('click')
    await wrapper!.find('.stepper__button').trigger('click')
    await wrapper!.find('form').trigger('submit')

    expect(wrapper!.emitted('submit')![0]![0]).toEqual({
      name: 'Neon Protocol',
      category: 'tech',
      access: 'private',
      maxPlayers: 5,
      powerupsEnabled: true
    })
  })

  it('refuse un nom vide et signale l’erreur dans une alerte liée au champ', async () => {
    await wrapper!.find('form').trigger('submit')

    expect(wrapper!.emitted('submit')).toBeUndefined()

    const alert = wrapper!.find('[role="alert"]')
    const input = wrapper!.find('#lobby-name')
    expect(alert.exists()).toBe(true)
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toBe(alert.attributes('id'))
  })

  it('affiche l’erreur remontée par le serveur dans une alerte', () => {
    wrapper!.unmount()
    wrapper = mountModal({ errorMessage: 'Impossible de créer l’arène.' })

    expect(wrapper.find('[role="alert"]').text()).toContain('Impossible de créer')
  })

  it('verrouille le formulaire pendant la création', () => {
    wrapper!.unmount()
    wrapper = mountModal({ pending: true })

    const submit = wrapper.find('button[type="submit"]')
    expect(submit.attributes('disabled')).toBeDefined()
    expect(submit.attributes('aria-busy')).toBe('true')
    expect(wrapper.find('#lobby-name').attributes('disabled')).toBeDefined()
  })
})
