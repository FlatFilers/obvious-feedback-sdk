import { afterEach, describe, expect, it } from 'bun:test'
import { installDom, restoreGlobals } from './test-dom'

afterEach(restoreGlobals)

describe('init', () => {
  it('throws when publicKey is missing', async () => {
    installDom()
    const { ObviousFeedback } = await import(`../../src/index?init-missing=${Date.now()}`)
    expect(() => ObviousFeedback.init({ publicKey: '' })).toThrow('ObviousFeedback.init requires publicKey')
  })

  it('renders an icon-only compose trigger', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`../../src/index?init-trigger=${Date.now()}`)
    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    const trigger = host.shadowRoot?.querySelector('.obv-trigger')
    expect(trigger).toBeTruthy()
    expect(trigger?.getAttribute('type')).toBe('button')
  })

  it('renders preview-only mode without a public key and does not submit', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`../../src/index?preview-only=${Date.now()}`)
    expect(() => ObviousFeedback.init({ previewOnly: true })).not.toThrow()
    const host = body.children[1]
    expect(host.shadowRoot?.innerHTML).toContain('obv-trigger')
  })
})
