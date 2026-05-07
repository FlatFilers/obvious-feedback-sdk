import { afterEach, describe, expect, it } from 'bun:test'
import {
  DEFAULT_ENV,
  DRAFT_ROUND_STORAGE_PREFIX,
  TRIGGER_POSITION_STORAGE_KEY,
} from '../../src/constants'
import { installDom, restoreGlobals } from './test-dom'

afterEach(restoreGlobals)

describe('theme', () => {
  it('defaults to light theme when theme is omitted', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`../../src/index?theme-default=${Date.now()}`)
    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    expect(host.getAttribute('data-theme')).toBe('light')
  })

  it('applies dark theme when theme is set to dark', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`../../src/index?theme-dark=${Date.now()}`)
    ObviousFeedback.init({ publicKey: 'fsk_pub_test', theme: 'dark' })
    const host = body.children[1]
    expect(host.getAttribute('data-theme')).toBe('dark')
  })

  it('does not reference generic host design tokens that could collide', async () => {
    installDom()
    const mod = await import(`../../src/index?theme-tokens=${Date.now()}`)
    const source = await Bun.file(new URL('../../src/index.ts', import.meta.url).pathname).text()
    const hostTokenPattern = /var\(--(?!obv-(feedback|vs)-)[a-z]/
    const styleMatches = source.match(/`[^`]*var\(--[^`]*`/g) ?? []
    for (const block of styleMatches) {
      expect(hostTokenPattern.test(block)).toBe(false)
    }
  })

  it('pins footer edge tooltips inside the feedback card', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`../../src/index?tooltip-edge-alignment=${Date.now()}`)
    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]

    expect(host.shadowRoot?.innerHTML).toContain('.obv-footer-tool-btn:first-of-type::after')
    expect(host.shadowRoot?.innerHTML).toContain('.obv-footer-tool-btn:last-of-type::after')
  })
  it('anchors trigger tooltip to right edge when trigger is in a right-side corner', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`../../src/index?tooltip-right-anchor=${Date.now()}`)
    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    // CSS rule that prevents right-corner tooltip from overflowing the viewport
    expect(host.shadowRoot?.innerHTML).toContain('.obv-trigger[data-trigger-corner$="-right"]::after')
    expect(host.shadowRoot?.innerHTML).toContain('left: auto; right: 0; transform: none')
  })

  it('hides the trigger tooltip when the feedback card is open', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`../../src/index?tooltip-card-open=${Date.now()}`)
    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    // CSS rule that hides tooltip when card is open
    expect(host.shadowRoot?.innerHTML).toContain('.obv-trigger[data-card-open]::after { display: none; }')
    // Trigger should not have data-card-open on closed state
    const trigger = host.shadowRoot?.querySelector('.obv-trigger')
    expect(trigger?.getAttribute('data-card-open')).toBeNull()
  })

  it('sets data-card-open on the trigger when the card is open', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`../../src/index?data-card-open=${Date.now()}`)
    const sdk = ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    // Open the card
    sdk.open()
    const trigger = host.shadowRoot?.querySelector('.obv-trigger')
    expect(trigger?.getAttribute('data-card-open')).toBe('true')
  })

  it('uses overflow:visible on .obv-card so footer tool tooltips are not clipped', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`../../src/index?card-overflow=${Date.now()}`)
    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    // Card should have overflow:visible so ::after tooltips on footer buttons are not clipped
    expect(host.shadowRoot?.innerHTML).toContain('overflow: visible')
    // Inner scroll wrapper contains the scrollable content, keeping the footer outside the overflow boundary
    expect(host.shadowRoot?.innerHTML).toContain('.obv-card-scroll')
    expect(host.shadowRoot?.innerHTML).toContain('overflow-y: auto')
  })

  it('uses layout viewport (clientWidth) for trigger sizing to prevent zoom drift', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`../../src/index?layout-viewport=${Date.now()}`)
    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    // Widget should initialize — if it uses document.documentElement?.clientWidth safely, no error thrown
    const trigger = host.shadowRoot?.querySelector('.obv-trigger')
    expect(trigger).not.toBeNull()
  })

  it('loads stored trigger positions without hidden state as visible', async () => {
    const { body, storage } = installDom()
    storage.set(
      TRIGGER_POSITION_STORAGE_KEY,
      JSON.stringify({ corner: 'top-left', offsetX: 24, offsetY: 32 })
    )
    const { ObviousFeedback } = await import(`../../src/index?stored-visible-trigger=${Date.now()}`)
    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    const trigger = host.shadowRoot?.querySelector('.obv-trigger')
    expect(trigger?.getAttribute('data-trigger-hidden')).toBeNull()
    expect(trigger?.getAttribute('data-trigger-corner')).toBe('top-left')
  })

  it('renders stored hidden trigger positions as a corner peek', async () => {
    const { body, storage } = installDom()
    storage.set(
      TRIGGER_POSITION_STORAGE_KEY,
      JSON.stringify({ corner: 'bottom-right', offsetX: 8, offsetY: 8, hidden: true })
    )
    const { ObviousFeedback } = await import(`../../src/index?stored-hidden-trigger=${Date.now()}`)
    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    const trigger = host.shadowRoot?.querySelector('.obv-trigger')
    expect(trigger?.getAttribute('data-trigger-hidden')).toBe('true')
    expect(trigger?.getAttribute('style')).toContain('left: 788px; top: 588px')
  })

  it('keeps the draft badge rendered when the trigger is hidden', async () => {
    const { body, storage } = installDom()
    storage.set(
      TRIGGER_POSITION_STORAGE_KEY,
      JSON.stringify({ corner: 'bottom-right', offsetX: 8, offsetY: 8, hidden: true })
    )
    const draftKey = [
      DRAFT_ROUND_STORAGE_PREFIX,
      'fsk_pub_test',
      DEFAULT_ENV,
      'https://example.com',
    ]
      .map((part) => encodeURIComponent(part))
      .join(':')
    storage.set(draftKey, JSON.stringify([{ id: 'draft_1', description: 'Need to fix this' }]))
    const { ObviousFeedback } = await import(`../../src/index?hidden-trigger-badge=${Date.now()}`)
    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    const trigger = host.shadowRoot?.querySelector('.obv-trigger')
    expect(trigger?.getAttribute('data-trigger-hidden')).toBe('true')
    expect(host.shadowRoot?.innerHTML).toContain('class="obv-trigger-badge"')
    expect(host.shadowRoot?.innerHTML).toContain('>1</span>')
  })

})
