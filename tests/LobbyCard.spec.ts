import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LobbyCard, { type Lobby } from '~/components/LobbyCard.vue'

const waitingLobby: Lobby = {
  id: 'neon-protocol',
  name: 'Neon Protocol',
  category: 'Culture générale',
  status: 'waiting',
  players: 6,
  maxPlayers: 8,
  host: 'CipherX'
}

const fullLobby: Lobby = { ...waitingLobby, id: 'void-sector', name: 'Void Sector', status: 'full', players: 8 }

describe('LobbyCard', () => {
  it('affiche les informations du lobby', () => {
    const wrapper = mount(LobbyCard, { props: { lobby: waitingLobby } })

    expect(wrapper.find('h3').text()).toBe('Neon Protocol')
    expect(wrapper.text()).toContain('Culture générale')
    expect(wrapper.text()).toContain('6/8 Players')
    expect(wrapper.text()).toContain('CipherX')
  })

  it('double le statut coloré d’un libellé texte (RGAA 3.1)', () => {
    const waiting = mount(LobbyCard, { props: { lobby: waitingLobby } })
    const full = mount(LobbyCard, { props: { lobby: fullLobby } })

    expect(waiting.text()).toContain('Waiting')
    expect(full.text()).toContain('Full')
  })

  it('donne au bouton Join un nom accessible distinct par lobby', () => {
    const wrapper = mount(LobbyCard, { props: { lobby: waitingLobby } })
    const join = wrapper.find('button')

    expect(join.exists()).toBe(true)
    // Le nom du lobby est ajouté en texte lecteur d'écran pour distinguer les boutons.
    expect(join.text()).toContain('Neon Protocol')
  })

  it('émet join avec l’id du lobby au clic', async () => {
    const wrapper = mount(LobbyCard, { props: { lobby: waitingLobby } })

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('join')).toEqual([['neon-protocol']])
  })

  it('ne propose aucun bouton Join quand le lobby est complet', () => {
    const wrapper = mount(LobbyCard, { props: { lobby: fullLobby } })

    expect(wrapper.find('button').exists()).toBe(false)
  })
})
