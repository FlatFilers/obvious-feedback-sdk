import { afterEach, describe, expect, it } from 'bun:test'
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
})
