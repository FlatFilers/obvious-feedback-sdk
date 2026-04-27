import { afterEach, describe, expect, it, mock } from 'bun:test'
import type { FeedbackStatusResponse } from './index'

const originalDocument = globalThis.document
const originalWindow = globalThis.window
const originalNavigator = globalThis.navigator
const originalFetch = globalThis.fetch
const originalConsoleLog = console.log
const originalLocalStorage = globalThis.localStorage
const originalMathRandom = Math.random
const originalElement = globalThis.Element
const originalHTMLElement = globalThis.HTMLElement
const originalHTMLScriptElement = globalThis.HTMLScriptElement

let restorePatchedFormData: (() => void) | null = null

type FetchImpl = (url: string | URL | Request, init?: RequestInit) => Promise<Response>
type FetchCall = [url: string | URL | Request, init?: RequestInit]
type FetchMockLike = { mock: { calls: unknown[] } }

function createDefaultFetchMock() {
  return mock(async (_url: string | URL | Request, _init?: RequestInit) => {
    return new Response(JSON.stringify({ data: { issueId: 'abi_test', status: 'received' } }))
  })
}

function fetchCalls(fetchImpl: FetchMockLike): FetchCall[] {
  return fetchImpl.mock.calls as FetchCall[]
}

function firstFetchBody(fetchImpl: FetchMockLike): string {
  const body = fetchCalls(fetchImpl)[0]?.[1]?.body
  return typeof body === 'string' ? body : ''
}

function findFetchBody(fetchImpl: FetchMockLike, path: string): string {
  const body = fetchCalls(fetchImpl).find((call) => String(call[0]).includes(path))?.[1]?.body
  return typeof body === 'string' ? body : ''
}

class MiniElement {
  tagName: string
  private textValue = ''
  private innerHTMLSnapshot = ''
  attributes: Array<{ name: string; value: string }> = []
  children: MiniElement[] = []
  style = ''
  focusCallCount = 0
  private listeners = new Map<string, (event: Event) => void>()
  private attrs = new Map<string, string>()
  shadowRoot: MiniShadowRoot | null = null

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase()
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value)
    if (name === 'style') {
      this.style = value
    }
    if (this.innerHTMLSnapshot) {
      const attrPattern = new RegExp(`${name}="[^"]*"`)
      this.innerHTMLSnapshot = attrPattern.test(this.innerHTMLSnapshot)
        ? this.innerHTMLSnapshot.replace(attrPattern, `${name}="${value}"`)
        : this.innerHTMLSnapshot.replace(/^<([\w-]+)/, `<$1 ${name}="${value}"`)
    }
    this.attributes = Array.from(this.attrs.entries()).map(([attrName, attrValue]) => ({
      name: attrName,
      value: attrValue,
    }))
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null
  }

  hasAttribute(name: string): boolean {
    return this.attrs.has(name)
  }

  matches(selector: string): boolean {
    return selector === this.tagName.toLowerCase()
  }

  attachShadow(): MiniShadowRoot {
    this.shadowRoot = new MiniShadowRoot()
    return this.shadowRoot
  }

  appendChild(child: MiniElement): void {
    this.children.push(child)
  }

  remove(): void {}

  addEventListener(type: string, handler: (event: Event) => void): void {
    this.listeners.set(type, handler)
  }

  setPointerCapture(): void {}

  focus(): void {
    this.focusCallCount += 1
  }

  click(): void {}

  setInnerHTMLSnapshot(html: string): void {
    this.innerHTMLSnapshot = html
  }

  get outerHTML(): string {
    return this.innerHTMLSnapshot
  }

  get textContent(): string {
    return this.textValue
  }

  set textContent(value: string) {
    this.textValue = value
    if (this.innerHTMLSnapshot) {
      this.innerHTMLSnapshot = this.innerHTMLSnapshot.replace(/>[^<]*</, `>${value}<`)
    } else {
      this.innerHTMLSnapshot = value
    }
  }

  dispatch(type: string, event: Event): void {
    this.listeners.get(type)?.(event)
  }
}

class MiniShadowRoot {
  private html = ''
  private nodes = new Map<string, MiniElement>()

  querySelector(selector: string): MiniElement | null {
    if (!this.nodes.has(selector)) {
      const tagName =
        selector === 'form'
          ? 'form'
          : selector.includes('textarea')
            ? 'textarea'
            : selector.includes('input')
              ? 'input'
              : selector.includes('dropzone')
                ? 'div'
                : selector.includes('svg')
                  ? 'svg'
                  : 'button'
      this.nodes.set(selector, new MiniElement(tagName))
    }
    return this.nodes.get(selector) ?? null
  }

  querySelectorAll(selector: string): MiniElement[] {
    if (selector === '[data-markup-tool]') {
      return ['rectangle', 'point', 'pen'].map((tool) => {
        const key = `[data-markup-tool="${tool}"]`
        const node = this.querySelector(key)!
        node.setAttribute('data-markup-tool', tool)
        return node
      })
    }
    if (selector === '[data-attachment-remove]') {
      const ids = Array.from(this.html.matchAll(/data-attachment-remove="([^"]+)"/g)).map((match) => match[1])
      return ids.map((id) => {
        const key = `[data-attachment-remove="${id}"]`
        const node = this.querySelector(key)!
        node.setAttribute('data-attachment-remove', id)
        return node
      })
    }
    return this.querySelector(selector) ? [this.querySelector(selector)!] : []
  }

  get innerHTML(): string {
    return this.html.replace(
      /<button class="obv-trigger"[\s\S]*?<\/button>/,
      this.nodes.get('.obv-trigger')?.outerHTML ?? '$&'
    )
  }

  set innerHTML(value: string) {
    const existingTrigger = this.nodes.get('.obv-trigger')
    const existingTriggerLabel = this.nodes.get('.obv-trigger-label')

    this.html = value
    this.nodes.clear()
    const triggerHtml = value.match(/<button class="obv-trigger"[\s\S]*?<\/button>/)?.[0]
    if (triggerHtml) {
      const trigger = existingTrigger ?? new MiniElement('button')
      trigger.setInnerHTMLSnapshot(triggerHtml)
      const triggerStartTag = triggerHtml.match(/^<button\b[^>]*>/)?.[0] ?? triggerHtml
      for (const [, name, attrValue] of triggerStartTag.matchAll(/\s([\w-]+)="([^"]*)"/g)) {
        trigger.setAttribute(name, attrValue)
      }
      const label = triggerHtml.match(/<span class="obv-trigger-label">([^<]*)<\/span>/)?.[1]
      if (label) {
        const triggerLabel = existingTriggerLabel ?? new MiniElement('span')

        triggerLabel.setInnerHTMLSnapshot(`<span class="obv-trigger-label">${label}</span>`)
        triggerLabel.textContent = label
        this.nodes.set('.obv-trigger-label', triggerLabel)
      }
      this.nodes.set('.obv-trigger', trigger)
    }
  }
}

class MiniScriptElement extends MiniElement {
  dataset: Record<string, string> = {}

  constructor() {
    super('script')
  }
}

type InstallDomResult<TFetch extends FetchImpl> = {
  body: MiniElement
  listeners: Map<string, (event: Event) => void>
  documentListeners: Map<string, (event: Event) => void>
  fetchImpl: TFetch
  storage: Map<string, string>
}

function installDom(): InstallDomResult<ReturnType<typeof createDefaultFetchMock>>
function installDom<TFetch extends FetchImpl>(fetchImpl: TFetch): InstallDomResult<TFetch>
function installDom<TFetch extends FetchImpl>(
  fetchImpl?: TFetch
): InstallDomResult<TFetch | ReturnType<typeof createDefaultFetchMock>> {
  const resolvedFetchImpl = fetchImpl ?? createDefaultFetchMock()
  const listeners = new Map<string, (event: Event) => void>()

  const documentListeners = new Map<string, (event: Event) => void>()
  const storage = new Map<string, string>()
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  }
  const body = new MiniElement('body')
  const input = new MiniElement('input')
  input.setAttribute('value', 'secret')
  body.appendChild(input)
  body.textContent = 'A'.repeat(400)

  Object.defineProperty(globalThis, 'document', {
    value: {
      body,
      currentScript: null,
      createElement: (tag: string) => new MiniElement(tag),
      addEventListener: (type: string, handler: (event: Event) => void) => documentListeners.set(type, handler),
      removeEventListener: (type: string) => documentListeners.delete(type),
    },
    configurable: true,
  })
  Object.defineProperty(globalThis, 'window', {
    value: {
      fetch: resolvedFetchImpl,
      localStorage,
      location: { href: 'https://example.com/path?token=secret', origin: 'https://example.com' },
      innerWidth: 800,
      innerHeight: 600,
      scrollX: 12,
      scrollY: 34,
      devicePixelRatio: 2,
      setTimeout: () => 1,
      clearTimeout: () => {},
      addEventListener: (type: string, handler: (event: Event) => void) => listeners.set(type, handler),
      removeEventListener: (type: string) => listeners.delete(type),
    },
    configurable: true,
  })
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mini UA' }, configurable: true })
  Object.defineProperty(globalThis, 'Element', { value: MiniElement, configurable: true })
  Object.defineProperty(globalThis, 'HTMLElement', { value: MiniElement, configurable: true })
  Object.defineProperty(globalThis, 'HTMLScriptElement', { value: MiniScriptElement, configurable: true })
  Object.defineProperty(globalThis, 'fetch', { value: resolvedFetchImpl, writable: true, configurable: true })
  Object.defineProperty(globalThis, 'localStorage', { value: localStorage, configurable: true })

  return { body, listeners, documentListeners, fetchImpl: resolvedFetchImpl, storage }
}

function createFeedbackFile(name: string, type: string, contents = 'file-bytes'): File {
  return new File([contents], name, { type })
}

function createAttachmentFetchMock(options: { failPut?: boolean; delayPresign?: boolean } = {}) {
  let resolvePresign: (() => void) | null = null
  const presignGate = new Promise<void>((resolve) => {
    resolvePresign = resolve
  })
  const presignBodies: unknown[] = []
  const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
    const rawUrl = url instanceof Request ? url.url : String(url)
    if (rawUrl.includes('/v1/feedback/attachments/upload') && init?.method === 'POST') {
      presignBodies.push(JSON.parse(init.body as string))
      if (options.delayPresign) await presignGate
      const index = presignBodies.length
      return new Response(
        JSON.stringify({
          data: { uploadUrl: `https://s3.example.test/upload-${index}`, attachmentToken: `token_${index}` },
        })
      )
    }
    if (rawUrl.startsWith('https://s3.example.test/upload-') && init?.method === 'PUT') {
      return new Response(options.failPut ? 'upload failed' : 'ok', { status: options.failPut ? 500 : 200 })
    }
    if (rawUrl.includes('/v1/feedback/submit') && init?.method === 'POST') {
      return new Response(JSON.stringify({ data: { issueId: 'abi_submit', status: 'received' } }))
    }
    return new Response('unexpected request', { status: 500 })
  })
  return { fetchImpl, presignBodies, resolvePresign: () => resolvePresign?.() }
}

function setFormDescription(description: string): () => void {
  restorePatchedFormData?.()
  const originalFormData = globalThis.FormData
  Object.defineProperty(globalThis, 'FormData', {
    value: class {
      get(name: string): string {
        return ({ description } as Record<string, string>)[name] ?? ''
      }
    },
    configurable: true,
  })
  restorePatchedFormData = () => {
    Object.defineProperty(globalThis, 'FormData', { value: originalFormData, configurable: true })
    restorePatchedFormData = null
  }
  return restorePatchedFormData
}

async function flushAttachmentWork(): Promise<void> {
  for (let index = 0; index < 4; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  restorePatchedFormData?.()
  Object.defineProperty(globalThis, 'document', { value: originalDocument, configurable: true })
  Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true })
  Object.defineProperty(globalThis, 'Element', { value: originalElement, configurable: true })
  Object.defineProperty(globalThis, 'HTMLElement', { value: originalHTMLElement, configurable: true })
  Object.defineProperty(globalThis, 'HTMLScriptElement', { value: originalHTMLScriptElement, configurable: true })
  Object.defineProperty(globalThis, 'fetch', { value: originalFetch, writable: true, configurable: true })
  Math.random = originalMathRandom

  Object.defineProperty(globalThis, 'localStorage', { value: originalLocalStorage, configurable: true })
  console.log = originalConsoleLog
})

describe('ObviousFeedback', () => {
  it('throws when publicKey is missing', async () => {
    installDom()
    const { ObviousFeedback } = await import(`./index?missing=${Date.now()}`)

    expect(() => ObviousFeedback.init({ publicKey: '' })).toThrow('ObviousFeedback.init requires publicKey')
  })
  it('renders an icon-only compose trigger and keeps it compact on hover', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`./index?trigger-polish=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    const trigger = host.shadowRoot?.querySelector('.obv-trigger')

    expect(host.shadowRoot?.innerHTML).toContain('data-assistant-position="bottom-right"')
    expect(host.shadowRoot?.innerHTML).toContain('bottom: 96px')
    expect(trigger?.getAttribute('aria-label')).toBe('Open feedback')
    expect(host.shadowRoot?.innerHTML).toContain('class="obv-trigger-icon"')
    expect(host.shadowRoot?.innerHTML).toContain('viewBox="0 0 24 24"')
    expect(host.shadowRoot?.innerHTML).toContain('stroke: currentColor')
    expect(host.shadowRoot?.innerHTML).toContain('--obv-feedback-bg: #ffffff')
    expect(host.shadowRoot?.innerHTML).toContain('--obv-feedback-primary: #111111')
    expect(host.shadowRoot?.innerHTML).toContain('justify-content: center')
    expect(host.shadowRoot?.innerHTML).not.toContain('obv-trigger-label')
    expect(host.shadowRoot?.innerHTML).not.toContain('obv-trigger-mark')
    expect(host.shadowRoot?.innerHTML).not.toContain('width 440ms cubic-bezier')
    expect(host.shadowRoot?.innerHTML).not.toContain('>?</span>')

    trigger?.dispatch('mouseenter', { preventDefault() {} } as unknown as Event)
    expect(trigger?.getAttribute('aria-label')).toBe('Open feedback')

    trigger?.dispatch('click', { preventDefault() {} } as unknown as Event)
    expect(host.shadowRoot?.innerHTML).toContain('<div class="obv-kicker">Feedback</div>')
    expect(host.shadowRoot?.innerHTML).not.toContain('Describe what happened')
    expect(host.shadowRoot?.innerHTML).not.toContain('Field note')
    expect(host.shadowRoot?.innerHTML).not.toContain('Share the details')
    expect(host.shadowRoot?.innerHTML).not.toContain('Feature request')
    expect(host.shadowRoot?.innerHTML).not.toContain('Report a bug')
  })

  it('remembers submitted issue IDs in storage scoped to public key, env, and origin', async () => {
    const { body, storage } = installDom()
    const { ObviousFeedback } = await import(`./index?issue-history-submit=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test', env: 'staging' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    const originalFormData = globalThis.FormData
    Object.defineProperty(globalThis, 'FormData', {
      value: class {
        get(name: string): string {
          return ({ description: 'Remember this issue' } as Record<string, string>)[name] ?? ''
        }
      },
      configurable: true,
    })

    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const historyKey = 'obvious.feedback.issueHistory:fsk_pub_test:staging:https%3A%2F%2Fexample.com'
    expect(JSON.parse(storage.get(historyKey) ?? '[]')).toMatchObject([{ issueId: 'abi_test', status: 'received' }])

    Object.defineProperty(globalThis, 'FormData', { value: originalFormData, configurable: true })
  })

  it('includes resolved session replay URL in submit payload and omits failed resolver results', async () => {
    const fetchImpl = mock(
      async () => new Response(JSON.stringify({ data: { issueId: 'abi_test', status: 'received' } }))
    )
    const { body } = installDom(fetchImpl)
    const { ObviousFeedback } = await import(`./index?session-replay-resolver=${Date.now()}`)

    ObviousFeedback.init({
      publicKey: 'fsk_pub_test',
      sessionReplayUrlResolver: () => 'https://app.fullstory.com/ui/session/abc',
    })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    Object.defineProperty(globalThis, 'FormData', {
      value: class {
        get(name: string): string {
          return ({ description: 'Replay this session' } as Record<string, string>)[name] ?? ''
        }
      },
      configurable: true,
    })
    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(JSON.parse(firstFetchBody(fetchImpl)).sessionReplayUrl).toBe(
      'https://app.fullstory.com/ui/session/abc'
    )

    fetchImpl.mockClear()
    ObviousFeedback.init({ publicKey: 'fsk_pub_test_2', sessionReplayUrlResolver: () => null })
    const secondHost = body.children[2]
    secondHost.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    secondHost.shadowRoot
      ?.querySelector('form')
      ?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(JSON.parse(firstFetchBody(fetchImpl)).sessionReplayUrl).toBeUndefined()

    fetchImpl.mockClear()
    ObviousFeedback.init({
      publicKey: 'fsk_pub_test_3',
      sessionReplayUrlResolver: () => {
        throw new Error('resolver failed')
      },
    })
    const thirdHost = body.children[3]
    thirdHost.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    thirdHost.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(JSON.parse(firstFetchBody(fetchImpl)).sessionReplayUrl).toBeUndefined()
  })
  it('renders compact previous issue rows inside the form, refreshes saved statuses, and preserves titles', async () => {
    const historyKey = 'obvious.feedback.issueHistory:fsk_pub_test:production:https%3A%2F%2Fexample.com'
    const fetchImpl = mock(async (url: string | URL | Request) => {
      const rawUrl = url instanceof Request ? url.url : String(url)
      if (rawUrl.includes('/v1/feedback/status/abi_old')) {
        return new Response(
          JSON.stringify({
            data: {
              issueId: 'abi_old',
              status: 'in_progress',
              triageStatus: 'triaged',
              title: 'Export CSV button is hidden',
              description: null,
              resolvedNote: null,
              reportedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              updatedAt: '2026-04-08T00:00:00.000Z',
            },
          })
        )
      }
      return new Response('revoked or missing', { status: 404 })
    })
    const { body, storage } = installDom(fetchImpl)
    storage.set(
      historyKey,
      JSON.stringify([
        { issueId: 'abi_old', status: 'received' },
        { issueId: 'abi_missing', status: 'received' },
      ])
    )
    const { ObviousFeedback } = await import(`./index?issue-history-tray=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    expect(host.shadowRoot?.innerHTML).toContain('obv-issue-section')
    expect(host.shadowRoot?.innerHTML).toContain('Issue abi_old')
    expect(host.shadowRoot?.innerHTML).toContain('Received')
    const issueHistoryHtml = host.shadowRoot?.innerHTML ?? ''
    expect(issueHistoryHtml.indexOf('type="submit"')).toBeLessThan(issueHistoryHtml.lastIndexOf('obv-issue-section'))

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://app.obvious.ai/prepare/v1/feedback/status/abi_old?publicKey=fsk_pub_test'
    )
    expect(host.shadowRoot?.innerHTML).toContain('In progress')
    expect(host.shadowRoot?.innerHTML).toContain('Export CSV button is hidden')
    expect(host.shadowRoot?.innerHTML).toContain('2h ago')
    expect(host.shadowRoot?.innerHTML).toContain('Status unavailable')
    expect(storage.get(historyKey)).toContain('Export CSV button is hidden')

    host.shadowRoot
      ?.querySelector('[data-history-dismiss-index="0"]')
      ?.dispatch('click', { preventDefault() {} } as unknown as Event)

    expect(host.shadowRoot?.innerHTML).not.toContain('Export CSV button is hidden')
    expect(JSON.parse(storage.get(historyKey) ?? '[]')).toHaveLength(1)
  })

  it('links compact rows to worker threads only when status metadata includes a thread URL', async () => {
    const historyKey = 'obvious.feedback.issueHistory:fsk_pub_test:production:https%3A%2F%2Fexample.com'
    const fetchImpl = mock(async (url: string | URL | Request) => {
      const rawUrl = url instanceof Request ? url.url : String(url)
      if (rawUrl.includes('/v1/feedback/status/abi_thread')) {
        return new Response(
          JSON.stringify({
            data: {
              issueId: 'abi_thread',
              status: 'resolved',
              triageStatus: 'auto_fixed',
              title: 'Thread-linked fixed bug',
              description: null,
              resolvedNote: null,
              reportedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
              updatedAt: new Date().toISOString(),
              workerThread: { id: 'th_worker', url: 'https://app.obvious.ai/assistant/threads/th_worker' },
            },
          })
        )
      }
      if (rawUrl.includes('/v1/feedback/status/abi_plain')) {
        return new Response(
          JSON.stringify({
            data: {
              issueId: 'abi_plain',
              status: 'received',
              triageStatus: 'pending',
              title: 'Plain reporter bug',
              description: null,
              resolvedNote: null,
              reportedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          })
        )
      }
      return new Response('not found', { status: 404 })
    })
    const { body, storage } = installDom(fetchImpl)
    storage.set(
      historyKey,
      JSON.stringify([
        { issueId: 'abi_thread', status: 'in_progress' },
        { issueId: 'abi_plain', status: 'received' },
      ])
    )
    const { ObviousFeedback } = await import(`./index?issue-history-thread-link=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const html = host.shadowRoot?.innerHTML ?? ''
    expect(html).toContain('Thread-linked fixed bug')
    expect(html).toContain('m ago')
    expect(html).toContain('Resolved')
    expect(html).toContain('<path d="m5 12 4 4L19 6" />')
    expect(html).toContain('Plain reporter bug')

    host.shadowRoot
      ?.querySelector('[data-history-detail-index="1"]')
      ?.dispatch('click', { preventDefault() {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const detailHtml = host.shadowRoot?.innerHTML ?? ''
    expect(detailHtml).toContain('Current status')
    expect(detailHtml).toContain('href="https://app.obvious.ai/assistant/threads/th_worker"')
    expect(detailHtml).not.toContain('href="undefined"')
    expect(detailHtml).not.toContain('Plain reporter bug</a>')
  })

  it('ignores unsafe worker-thread URLs recovered from localStorage or status responses', async () => {
    const historyKey = 'obvious.feedback.issueHistory:fsk_pub_test:production:https%3A%2F%2Fexample.com'
    const fetchImpl = mock(async () =>
      Response.json({
        data: {
          issueId: 'abi_unsafe_response',
          status: 'resolved',
          triageStatus: 'auto_fixed',
          title: 'Unsafe response link',
          description: null,
          resolvedNote: null,
          reportedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          workerThread: { id: 'th_unsafe', url: 'javascript:alert(1)' },
        },
      })
    )
    const { body, storage } = installDom(fetchImpl)
    storage.set(
      historyKey,
      JSON.stringify([
        {
          issueId: 'abi_unsafe_storage',
          status: 'resolved',
          title: 'Unsafe storage link',
          workerThread: { id: 'th_storage', url: 'javascript:alert(2)' },
        },
        { issueId: 'abi_unsafe_response', status: 'received' },
      ])
    )
    const { ObviousFeedback } = await import(`./index?unsafe-worker-url=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const html = host.shadowRoot?.innerHTML ?? ''
    expect(html).toContain('Unsafe storage link')
    expect(html).toContain('Unsafe response link')
    expect(html).not.toContain('javascript:alert')
    expect(storage.get(historyKey)).not.toContain('javascript:alert')
  })

  it('loads unavailable saved issue statuses without downgrading them to received', async () => {
    const historyKey = 'obvious.feedback.issueHistory:fsk_pub_test:production:https%3A%2F%2Fexample.com'
    const { body, storage } = installDom(mock(async () => new Response('still missing', { status: 404 })))
    storage.set(historyKey, JSON.stringify([{ issueId: 'abi_revoked', status: 'unavailable' }]))
    const { ObviousFeedback } = await import(`./index?issue-history-unavailable=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    expect(host.shadowRoot?.innerHTML).toContain('Status unavailable')
    expect(host.shadowRoot?.innerHTML).not.toContain('Received')
  })

  it('summarizes open issue count on the closed trigger without counting terminal or unavailable issues', async () => {
    const historyKey = 'obvious.feedback.issueHistory:fsk_pub_test:production:https%3A%2F%2Fexample.com'
    const { body, storage } = installDom()
    storage.set(
      historyKey,
      JSON.stringify([
        { issueId: 'abi_one', status: 'received' },
        { issueId: 'abi_two', status: 'in_progress' },
        { issueId: 'abi_done', status: 'resolved' },
        { issueId: 'abi_missing', status: 'unavailable' },
      ])
    )
    const { ObviousFeedback } = await import(`./index?trigger-open-count=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    const trigger = host.shadowRoot?.querySelector('.obv-trigger')

    expect(trigger?.getAttribute('aria-label')).toBe('Open feedback — 2 open issues, latest status in progress')
    expect(trigger?.getAttribute('data-issue-status')).toBe('open')
    expect(host.shadowRoot?.innerHTML).toContain('class="obv-trigger-badge" aria-hidden="true">2</span>')
    expect(host.shadowRoot?.innerHTML).toContain('class="obv-trigger-ring"')
  })

  it('does not render a trigger badge when all known issues are terminal', async () => {
    const historyKey = 'obvious.feedback.issueHistory:fsk_pub_test:production:https%3A%2F%2Fexample.com'
    const { body, storage } = installDom()
    storage.set(
      historyKey,
      JSON.stringify([
        { issueId: 'abi_done', status: 'resolved' },
        { issueId: 'abi_no_action', status: 'no_action' },
        { issueId: 'abi_duplicate', status: 'duplicate' },
      ])
    )
    const { ObviousFeedback } = await import(`./index?trigger-terminal-count=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    const trigger = host.shadowRoot?.querySelector('.obv-trigger')

    expect(trigger?.getAttribute('aria-label')).toBe('Open feedback')
    expect(trigger?.getAttribute('data-issue-status')).toBe('idle')
    expect(host.shadowRoot?.innerHTML).not.toContain('class="obv-trigger-badge" aria-hidden="true">')
  })

  it('renders reporter status detail with AI summary, resolved note, and permission-scoped links', async () => {
    const historyKey = 'obvious.feedback.issueHistory:fsk_pub_test:production:https%3A%2F%2Fexample.com'
    const fetchImpl = mock(async () =>
      Response.json({
        data: {
          issueId: 'abi_detail',
          status: 'resolved',
          triageStatus: 'auto_fixed',
          title: 'Dropdown crashes on save',
          description: 'Reporter details',
          resolvedNote: 'Fixed in the linked PR.',
          aiSummary: {
            headline: 'Fix is ready',
            progress: 'The save handler now guards empty values.',
            updatedAt: '2026-04-10T12:00:00.000Z',
          },
          links: {
            workerThread: { id: 'th_worker', url: 'https://app.obvious.ai/assistant/threads/th_worker' },
            pullRequest: {
              id: 'abpr_1',
              number: 14711,
              title: 'Fix dropdown save',
              url: 'https://github.com/FlatFilers/obvious/pull/14711',
              status: 'open',
              ciStatus: 'success',
              reviewStatus: 'approved',
              isDraft: false,
            },
          },
          reportedAt: '2026-04-10T10:00:00.000Z',
          updatedAt: '2026-04-10T12:00:00.000Z',
        },
      })
    )
    const { body, storage } = installDom(fetchImpl)
    storage.set(historyKey, JSON.stringify([{ issueId: 'abi_detail', status: 'in_progress' }]))
    const { ObviousFeedback } = await import(`./index?issue-detail-panel=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))
    host.shadowRoot
      ?.querySelector('[data-history-detail-index="0"]')
      ?.dispatch('click', { preventDefault() {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const detailHtml = host.shadowRoot?.innerHTML ?? ''
    expect(detailHtml).toContain('aria-label="Issue status details"')
    expect(detailHtml).toContain('Dropdown crashes on save')
    expect(detailHtml).toContain('Resolved')
    expect(detailHtml).toContain('Fix is ready')
    expect(detailHtml).toContain('The save handler now guards empty values.')
    expect(detailHtml).toContain('Fixed in the linked PR.')
    expect(detailHtml).toContain('Worker thread')
    expect(detailHtml).toContain('PR #14711')

    host.shadowRoot
      ?.querySelector('[data-issue-detail-close="true"]')
      ?.dispatch('click', { preventDefault() {} } as unknown as Event)
    expect(host.shadowRoot?.innerHTML).not.toContain('Issue status details')
  })

  it('preserves custom triggerLabel embeds when triggerLabels are not provided', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`./index?custom-label=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test', triggerLabel: 'Custom Feedback' })
    const host = body.children[1]

    expect(host.shadowRoot?.innerHTML).toContain('Custom Feedback')
    expect(host.shadowRoot?.innerHTML).not.toContain('Feature request')
  })

  it('shows a silly message when the feedback kicker is double-clicked', async () => {
    const { body } = installDom()
    Math.random = mock(() => 0.5)
    const { ObviousFeedback } = await import(`./index?silly-feedback-dblclick=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    expect(host.shadowRoot?.innerHTML).toContain('<div class="obv-kicker">Feedback</div>')

    Math.random = mock(() => 0.74)
    host.shadowRoot?.querySelector('form')?.dispatch('dblclick', {
      preventDefault() {},
      target: { closest: (selector: string) => (selector === '.obv-kicker' ? {} : null) },
    } as unknown as Event)

    expect(host.shadowRoot?.innerHTML).toContain('Needs more cowbell')
  })

  it('occasionally shows a silly message when the feedback form opens', async () => {
    const { body } = installDom()
    const randomValues = [0.01, 0.95]
    Math.random = mock(() => randomValues.shift() ?? 0.99)
    const { ObviousFeedback } = await import(`./index?silly-feedback-load=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    expect(host.shadowRoot?.innerHTML).toContain('Salt and Pepper')
  })

  it('preserves description text when dismissing compact previous issue rows', async () => {
    const historyKey = 'obvious.feedback.issueHistory:fsk_pub_test:production:https%3A%2F%2Fexample.com'
    const { body, storage } = installDom()
    storage.set(
      historyKey,
      JSON.stringify([
        { issueId: 'abi_first', status: 'received' },
        { issueId: 'abi_second', status: 'in_progress' },
      ])
    )
    const { ObviousFeedback } = await import(`./index?issue-history-text-preserve=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    const descriptionInput = host.shadowRoot?.querySelector('textarea[name="description"]') as
      | HTMLTextAreaElement
      | undefined
    descriptionInput!.value = 'My screen freezes when I open exports.'

    host.shadowRoot
      ?.querySelector('[data-history-dismiss-index="0"]')
      ?.dispatch('click', { preventDefault() {} } as unknown as Event)
    expect(host.shadowRoot?.innerHTML).toContain('My screen freezes when I open exports.')
  })

  it('keeps open description text when the icon-only trigger is hovered', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`./index?hover-form-preserve=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]

    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    const descriptionInput = host.shadowRoot?.querySelector('textarea[name="description"]') as
      | HTMLTextAreaElement
      | undefined
    descriptionInput!.value = 'The submit button never finishes.'

    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('mouseenter', { preventDefault() {} } as unknown as Event)

    expect(descriptionInput!.value).toBe('The submit button never finishes.')
    expect(host.shadowRoot?.querySelector('.obv-trigger')?.getAttribute('aria-label')).toBe('Open feedback')
    expect(host.shadowRoot?.innerHTML).not.toContain('obv-trigger-label')
  })

  it('opens the feedback card down and right from a top-left trigger', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`./index?card-position-top-left=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test', assistantPosition: 'top-left' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    const html = host.shadowRoot?.innerHTML ?? ''
    expect(html).toContain('data-assistant-position="top-left"')
    expect(html).toContain('data-dialog-direction="down-right"')
    expect(html).toContain('style="left: 20px; top: 152px; right: auto; bottom: auto;"')
  })

  it('opens the feedback card up and left from a bottom-right trigger', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`./index?card-position-bottom-right=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    const html = host.shadowRoot?.innerHTML ?? ''
    expect(html).toContain('data-trigger-corner="bottom-right"')
    expect(html).toContain('data-dialog-direction="up-left"')
    expect(html).toContain('style="left: 388px; top: 28px; right: auto; bottom: auto;"')
  })

  it('clamps the trigger-anchored feedback card inside small viewports', async () => {
    const { body } = installDom()
    Object.assign(globalThis.window, { innerWidth: 240, innerHeight: 180 })
    const { ObviousFeedback } = await import(`./index?card-position-clamp=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test', assistantPosition: 'top-left' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    const html = host.shadowRoot?.innerHTML ?? ''
    expect(html).toContain('data-dialog-direction="up-right"')
    expect(html).toContain('style="left: 20px; top: 20px; right: auto; bottom: auto;"')
  })

  it('renders a description-focused form without classification controls', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`./index?description-only-ui=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    const html = host.shadowRoot?.innerHTML ?? ''
    expect(html).toContain('<div class="obv-kicker">Feedback</div>')
    expect(html).toContain('name="description"')
    expect(html).toContain('aria-label="Feedback"')
    expect(html).not.toContain('Field note')
    expect(html).not.toContain('Share the details')
    expect(html).not.toContain('<select')
    expect(html).not.toContain('name="type"')
    expect(html).not.toContain('name="severity"')
    expect(html).not.toContain('Short title')
  })
  it('applies compact action-label typography after the form-control font reset', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`./index?action-label-typography=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    const formHtml = host.shadowRoot?.innerHTML ?? ''
    expect(formHtml).toContain(
      '.obv-trigger, .obv-card button, .obv-card textarea, .obv-markup-toolbar button { font-family: inherit; }'
    )
    expect(formHtml).not.toContain('{ font: inherit; }')
    expect(formHtml).toContain('--obv-feedback-button-font-size: 12px;')
    expect(formHtml).toContain('--obv-feedback-button-font-weight: 500;')
    expect(formHtml).toContain('--obv-feedback-button-line-height: 16px;')
    expect(formHtml).toContain(
      'font-size: var(--obv-feedback-button-font-size); font-weight: var(--obv-feedback-button-font-weight); line-height: var(--obv-feedback-button-line-height);'
    )
    expect(formHtml).toContain('<button class="obv-button" type="submit"')

    host.shadowRoot
      ?.querySelector('[data-screenshot-start="true"]')
      ?.dispatch('click', { preventDefault() {} } as unknown as Event)
    const markupHtml = host.shadowRoot?.innerHTML ?? ''
    expect(markupHtml).toContain('<button class="obv-button" type="button" data-markup-done="true">')
    expect(markupHtml).toContain('Done</button>')
  })

  it('persists dragged trigger position as nearest-corner offsets and suppresses the drag click', async () => {
    const { body, storage } = installDom()
    const { ObviousFeedback } = await import(`./index?drag-persist=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    const trigger = host.shadowRoot?.querySelector('.obv-trigger')

    trigger?.dispatch('pointerdown', { pointerId: 1, clientX: 780, clientY: 580, preventDefault() {} } as unknown as Event)
    trigger?.dispatch('pointermove', { pointerId: 1, clientX: 120, clientY: 80, preventDefault() {} } as unknown as Event)
    trigger?.dispatch('pointerup', { pointerId: 1, clientX: 120, clientY: 80, preventDefault() {} } as unknown as Event)
    trigger?.dispatch('click', { preventDefault() {} } as unknown as Event)

    expect(host.shadowRoot?.innerHTML).not.toContain('Describe what happened')
    expect(trigger?.getAttribute('data-trigger-corner')).toBe('top-left')
    expect(trigger?.getAttribute('style')).toContain('left: 76px; top: 8px')
    expect(JSON.parse(storage.get('obvious.feedback.triggerPosition') ?? '{}')).toEqual({
      corner: 'top-left',
      offsetX: 76,
      offsetY: 8,
    })
  })

  it('restores and clamps persisted trigger position on init', async () => {
    const { body, storage } = installDom()
    storage.set(
      'obvious.feedback.triggerPosition',
      JSON.stringify({ corner: 'bottom-right', offsetX: 900, offsetY: 900 })
    )
    const { ObviousFeedback } = await import(`./index?drag-restore=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test', assistantPosition: 'top-left' })
    const host = body.children[1]

    expect(host.shadowRoot?.innerHTML).toContain('data-assistant-position="top-left"')
    expect(host.shadowRoot?.innerHTML).toContain('data-trigger-corner="bottom-right"')
    expect(host.shadowRoot?.innerHTML).toContain('left: 8px; top: 8px')
  })

  it('keeps trigger listeners after label hover and reverts canceled drags', async () => {
    const { body, storage } = installDom()
    const { ObviousFeedback } = await import(`./index?drag-cancel=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    const trigger = host.shadowRoot?.querySelector('.obv-trigger')

    trigger?.dispatch('mouseenter', { preventDefault() {} } as unknown as Event)
    trigger?.dispatch('pointerdown', {
      pointerId: 1,
      clientX: 780,
      clientY: 580,
      currentTarget: trigger,
      preventDefault() {},
    } as unknown as Event)
    trigger?.dispatch('pointermove', { pointerId: 1, clientX: 120, clientY: 80, preventDefault() {} } as unknown as Event)
    trigger?.dispatch('pointercancel', { preventDefault() {} } as unknown as Event)
    trigger?.dispatch('click', { preventDefault() {} } as unknown as Event)

    expect(host.shadowRoot?.innerHTML).toContain('class="obv-kicker"')
    expect(trigger?.getAttribute('data-trigger-corner')).toBe('bottom-right')
    expect(trigger?.getAttribute('style')).toContain('left: 736px; top: 460px')
    expect(storage.has('obvious.feedback.triggerPosition')).toBe(false)
  })

  it('reclamps the persisted trigger when the viewport shrinks after init', async () => {
    const { body, listeners } = installDom()
    const { ObviousFeedback } = await import(`./index?drag-resize=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    const trigger = host.shadowRoot?.querySelector('.obv-trigger')

    trigger?.dispatch('pointerdown', { pointerId: 1, clientX: 780, clientY: 580, preventDefault() {} } as unknown as Event)
    trigger?.dispatch('pointermove', { pointerId: 1, clientX: 760, clientY: 560, preventDefault() {} } as unknown as Event)
    trigger?.dispatch('pointerup', { pointerId: 1, clientX: 760, clientY: 560, preventDefault() {} } as unknown as Event)
    expect(trigger?.getAttribute('style')).toContain('left: 716px; top: 440px')

    Object.assign(globalThis.window, { innerWidth: 240, innerHeight: 180 })
    listeners.get('resize')?.({ preventDefault() {} } as unknown as Event)

    expect(trigger?.getAttribute('style')).toContain('left: 156px; top: 20px')
  })

  it('renders preview-only mode without a public key and does not submit', async () => {
    const { body, fetchImpl } = installDom()
    const { ObviousFeedback } = await import(`./index?preview-only=${Date.now()}`)

    ObviousFeedback.init({ previewOnly: true })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    expect(host.shadowRoot?.innerHTML).toContain('Preview only — submissions disabled.')
    expect(host.shadowRoot?.innerHTML).toContain('disabled aria-disabled="true"')

    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {} } as unknown as Event)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(host.shadowRoot?.innerHTML).toContain('Preview only — submissions disabled.')
  })

  it('shows the configured preview-only reason and keeps submit disabled', async () => {
    const { body, fetchImpl } = installDom()
    const { ObviousFeedback } = await import(`./index?preview-reason=${Date.now()}`)

    ObviousFeedback.init({
      previewOnly: true,
      previewOnlyReason: 'Feedback SDK public key is not configured for this preview host; submissions are disabled.',
    })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    expect(host.shadowRoot?.innerHTML).toContain(
      'Feedback SDK public key is not configured for this preview host; submissions are disabled.'
    )
    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {} } as unknown as Event)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(host.shadowRoot?.innerHTML).toContain(
      'Feedback SDK public key is not configured for this preview host; submissions are disabled.'
    )
  })

  it('captures coordinate markup in annotationPayload on submit', async () => {
    const { body, fetchImpl } = installDom()
    const { ObviousFeedback } = await import(`./index?markup-submit=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    expect(host.shadowRoot?.innerHTML).toContain('Screenshot')
    const descriptionInput = host.shadowRoot?.querySelector('textarea[name="description"]') as
      | HTMLTextAreaElement
      | undefined
    descriptionInput!.value = 'Typed before annotate & still here'

    host.shadowRoot
      ?.querySelector('[data-screenshot-start="true"]')
      ?.dispatch('click', { preventDefault() {} } as unknown as Event)
    expect(host.shadowRoot?.innerHTML).toContain('Feedback markup canvas')
    expect(host.shadowRoot?.innerHTML).toContain('Rectangle')
    expect(host.shadowRoot?.innerHTML).toContain('Point')

    const overlay = host.shadowRoot?.querySelector('.obv-markup-overlay')
    overlay?.dispatch('pointerdown', {
      pointerId: 1,
      clientX: 100,
      clientY: 120,
      currentTarget: overlay,
      preventDefault() {},
    } as unknown as Event)
    overlay?.dispatch('pointermove', { pointerId: 1, clientX: 220, clientY: 260, preventDefault() {} } as unknown as Event)
    overlay?.dispatch('pointerup', { pointerId: 1, clientX: 220, clientY: 260, preventDefault() {} } as unknown as Event)
    Object.assign(globalThis.window, { innerWidth: 320, innerHeight: 240, scrollX: 90, scrollY: 91 })
    host.shadowRoot?.querySelector('[data-markup-done="true"]')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    expect(host.shadowRoot?.innerHTML).toContain('1 annotation attached')
    expect(host.shadowRoot?.innerHTML).toContain('Typed before annotate &amp; still here')

    const form = host.shadowRoot?.querySelector('form')
    const originalFormData = globalThis.FormData
    Object.defineProperty(globalThis, 'FormData', {
      value: class {
        get(name: string): string {
          return ({ description: 'Button is hidden behind the tray' } as Record<string, string>)[name] ?? ''
        }
      },
      configurable: true,
    })

    form?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const payload = JSON.parse(firstFetchBody(fetchImpl))
    expect(payload.annotationPayload).toMatchObject({
      items: [
        {
          tool: 'rectangle',
          points: [
            { x: 100, y: 120 },
            { x: 220, y: 260 },
          ],
        },
      ],
      viewport: { width: 800, height: 600 },
      scroll: { x: 12, y: 34 },
      devicePixelRatio: 2,
    })
    expect(payload.annotationPayload.items[0].id).toStartWith('markup_')
    expect(payload.annotationPayload.domSnapshot).toBeUndefined()
    expect(payload.annotationPayload.capturedAt).toBeString()
    expect(payload.domSnapshot).toBeUndefined()

    host.shadowRoot?.querySelector('[data-new="true"]')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    expect(host.shadowRoot?.innerHTML).not.toContain('annotation attached')
    expect(host.shadowRoot?.innerHTML).not.toContain('Typed before annotate')

    Object.defineProperty(globalThis, 'FormData', { value: originalFormData, configurable: true })
  })
  it('enters markup mode without blurring or bubbling the entry click to the page', async () => {
    const { body, listeners } = installDom()
    const { ObviousFeedback } = await import(`./index?markup-preserve-page-state=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    const markupStart = host.shadowRoot?.querySelector('[data-screenshot-start="true"]')
    const pointerPreventDefault = mock(() => {})
    const pointerStopPropagation = mock(() => {})
    markupStart?.dispatch('pointerdown', {
      preventDefault: pointerPreventDefault,
      stopPropagation: pointerStopPropagation,
    } as unknown as Event)

    expect(pointerPreventDefault).not.toHaveBeenCalled()
    expect(pointerStopPropagation).toHaveBeenCalled()

    const clickPreventDefault = mock(() => {})
    const clickStopPropagation = mock(() => {})
    markupStart?.dispatch('click', {
      preventDefault: clickPreventDefault,
      stopPropagation: clickStopPropagation,
    } as unknown as Event)

    const overlay = host.shadowRoot?.querySelector('.obv-markup-overlay')
    expect(host.shadowRoot?.innerHTML).toContain('Feedback markup canvas')
    expect(overlay?.focusCallCount).toBe(0)
    expect(clickPreventDefault).not.toHaveBeenCalled()
    expect(clickStopPropagation).toHaveBeenCalled()
    expect(listeners.has('keydown')).toBe(true)

    const capturePointerDownStopPropagation = mock(() => {})
    overlay?.dispatch('pointerdown', {
      pointerId: 1,
      clientX: 100,
      clientY: 120,
      currentTarget: overlay,
      preventDefault() {},
      stopPropagation: capturePointerDownStopPropagation,
    } as unknown as Event)
    expect(capturePointerDownStopPropagation).toHaveBeenCalled()

    const capturePointerUpStopPropagation = mock(() => {})
    overlay?.dispatch('pointerup', {
      pointerId: 1,
      clientX: 220,
      clientY: 260,
      preventDefault() {},
      stopPropagation: capturePointerUpStopPropagation,
    } as unknown as Event)
    expect(capturePointerUpStopPropagation).toHaveBeenCalled()

    const refreshedOverlay = host.shadowRoot?.querySelector('.obv-markup-overlay')
    const windowCaptureClickPreventDefault = mock(() => {})
    const windowCaptureClickStopPropagation = mock(() => {})
    listeners.get('click')?.({
      composedPath: () => [refreshedOverlay],
      preventDefault: windowCaptureClickPreventDefault,
      stopPropagation: windowCaptureClickStopPropagation,
    } as unknown as Event)
    expect(windowCaptureClickPreventDefault).toHaveBeenCalled()
    expect(windowCaptureClickStopPropagation).toHaveBeenCalled()

    overlay?.dispatch('pointerdown', {
      pointerId: 2,
      clientX: 120,
      clientY: 140,
      currentTarget: overlay,
      preventDefault() {},
      stopPropagation() {},
    } as unknown as Event)
    const toolbarClickPreventDefault = mock(() => {})
    const toolbarClickStopPropagation = mock(() => {})
    listeners.get('click')?.({
      composedPath: () => [{ classList: { contains: () => false } }],
      preventDefault: toolbarClickPreventDefault,
      stopPropagation: toolbarClickStopPropagation,
    } as unknown as Event)
    expect(toolbarClickPreventDefault).not.toHaveBeenCalled()

    refreshedOverlay?.dispatch('pointerdown', {
      pointerId: 3,
      clientX: 130,
      clientY: 150,
      currentTarget: refreshedOverlay,
      preventDefault() {},
      stopPropagation() {},
    } as unknown as Event)
    refreshedOverlay?.dispatch('pointercancel', { stopPropagation() {} } as unknown as Event)
    const canceledPointerClickPreventDefault = mock(() => {})
    const canceledPointerClickStopPropagation = mock(() => {})
    listeners.get('click')?.({
      composedPath: () => [refreshedOverlay],
      preventDefault: canceledPointerClickPreventDefault,
      stopPropagation: canceledPointerClickStopPropagation,
    } as unknown as Event)
    expect(canceledPointerClickPreventDefault).not.toHaveBeenCalled()
    expect(canceledPointerClickStopPropagation).not.toHaveBeenCalled()

    expect(toolbarClickStopPropagation).not.toHaveBeenCalled()

    const captureClickPreventDefault = mock(() => {})
    const captureClickStopPropagation = mock(() => {})
    host.shadowRoot?.querySelector('.obv-markup-overlay')?.dispatch('click', {
      preventDefault: captureClickPreventDefault,
      stopPropagation: captureClickStopPropagation,
    } as unknown as Event)
    expect(captureClickPreventDefault).toHaveBeenCalled()
    expect(captureClickStopPropagation).toHaveBeenCalled()

    listeners.get('keydown')?.({ key: 'Escape', preventDefault() {} } as KeyboardEvent)
    expect(host.shadowRoot?.innerHTML).toContain('Screenshot')
    expect(listeners.has('keydown')).toBe(false)
  })

  it('returns from markup mode with Escape without attaching a draft item', async () => {
    const { body, listeners } = installDom()
    const { ObviousFeedback } = await import(`./index?markup-escape=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    host.shadowRoot
      ?.querySelector('[data-screenshot-start="true"]')
      ?.dispatch('click', { preventDefault() {} } as unknown as Event)

    expect(host.shadowRoot?.innerHTML).toContain('Feedback markup canvas')
    listeners.get('keydown')?.({
      key: 'Escape',
      preventDefault() {},
    } as KeyboardEvent)

    expect(host.shadowRoot?.innerHTML).toContain('class="obv-kicker"')
    expect(host.shadowRoot?.innerHTML).not.toContain('annotation attached')
  })

  it('cancels markup without attaching annotationPayload', async () => {
    const { body, fetchImpl } = installDom()
    const { ObviousFeedback } = await import(`./index?markup-cancel=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    host.shadowRoot
      ?.querySelector('[data-screenshot-start="true"]')
      ?.dispatch('click', { preventDefault() {} } as unknown as Event)

    const overlay = host.shadowRoot?.querySelector('.obv-markup-overlay')
    overlay?.dispatch('pointerdown', {
      pointerId: 1,
      clientX: 100,
      clientY: 120,
      currentTarget: overlay,
      preventDefault() {},
    } as unknown as Event)
    overlay?.dispatch('pointerup', { pointerId: 1, clientX: 220, clientY: 260, preventDefault() {} } as unknown as Event)
    host.shadowRoot?.querySelector('[data-markup-cancel="true"]')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    expect(host.shadowRoot?.innerHTML).not.toContain('annotation attached')

    const form = host.shadowRoot?.querySelector('form')
    const originalFormData = globalThis.FormData
    Object.defineProperty(globalThis, 'FormData', {
      value: class {
        get(name: string): string {
          return ({ description: 'No markup please' } as Record<string, string>)[name] ?? ''
        }
      },
      configurable: true,
    })

    form?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const payload = JSON.parse(firstFetchBody(fetchImpl))
    expect(payload.annotationPayload).toBeUndefined()

    Object.defineProperty(globalThis, 'FormData', { value: originalFormData, configurable: true })
  })

  it('preserves committed markup when canceling a later edit session', async () => {
    const { body, fetchImpl, listeners } = installDom()
    const { ObviousFeedback } = await import(`./index?markup-edit-cancel=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    host.shadowRoot
      ?.querySelector('[data-screenshot-start="true"]')
      ?.dispatch('click', { preventDefault() {} } as unknown as Event)
    let overlay = host.shadowRoot?.querySelector('.obv-markup-overlay')
    overlay?.dispatch('pointerdown', {
      pointerId: 1,
      clientX: 100,
      clientY: 120,
      currentTarget: overlay,
      preventDefault() {},
    } as unknown as Event)
    overlay?.dispatch('pointermove', { pointerId: 1, clientX: 220, clientY: 260, preventDefault() {} } as unknown as Event)
    overlay?.dispatch('pointerup', { pointerId: 1, clientX: 220, clientY: 260, preventDefault() {} } as unknown as Event)
    host.shadowRoot?.querySelector('[data-markup-done="true"]')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    expect(host.shadowRoot?.innerHTML).toContain('1 annotation attached')

    host.shadowRoot
      ?.querySelector('[data-screenshot-start="true"]')
      ?.dispatch('click', { preventDefault() {} } as unknown as Event)
    overlay = host.shadowRoot?.querySelector('.obv-markup-overlay')
    overlay?.dispatch('pointerdown', {
      pointerId: 2,
      clientX: 10,
      clientY: 10,
      currentTarget: overlay,
      preventDefault() {},
    } as unknown as Event)
    overlay?.dispatch('pointermove', { pointerId: 2, clientX: 60, clientY: 60, preventDefault() {} } as unknown as Event)
    listeners.get('keydown')?.({ key: 'Escape', preventDefault() {} } as KeyboardEvent)
    expect(host.shadowRoot?.innerHTML).toContain('1 annotation attached')

    const originalFormData = globalThis.FormData
    Object.defineProperty(globalThis, 'FormData', {
      value: class {
        get(name: string): string {
          return ({ description: 'Keep the first annotation only' } as Record<string, string>)[name] ?? ''
        }
      },
      configurable: true,
    })
    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const payload = JSON.parse(firstFetchBody(fetchImpl))
    expect(payload.annotationPayload.items).toHaveLength(1)
    expect(payload.annotationPayload.items[0].points).toEqual([
      { x: 100, y: 120 },
      { x: 220, y: 260 },
    ])

    Object.defineProperty(globalThis, 'FormData', { value: originalFormData, configurable: true })
  })

  it('decimates and caps long pen strokes before submitting annotationPayload', async () => {
    const { body, fetchImpl } = installDom()
    const { ObviousFeedback } = await import(`./index?markup-pen-cap=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    host.shadowRoot
      ?.querySelector('[data-screenshot-start="true"]')
      ?.dispatch('click', { preventDefault() {} } as unknown as Event)
    host.shadowRoot?.querySelector('[data-markup-tool="pen"]')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    const overlay = host.shadowRoot?.querySelector('.obv-markup-overlay')
    overlay?.dispatch('pointerdown', {
      pointerId: 1,
      clientX: 5,
      clientY: 5,
      currentTarget: overlay,
      preventDefault() {},
    } as unknown as Event)
    for (let index = 0; index < 1_000; index += 1) {
      overlay?.dispatch('pointermove', { pointerId: 1, clientX: 5 + index, clientY: 5, preventDefault() {} } as unknown as Event)
    }
    overlay?.dispatch('pointerup', { pointerId: 1, clientX: 1_200, clientY: 5, preventDefault() {} } as unknown as Event)
    host.shadowRoot?.querySelector('[data-markup-done="true"]')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    const originalFormData = globalThis.FormData
    Object.defineProperty(globalThis, 'FormData', {
      value: class {
        get(name: string): string {
          return ({ description: 'Long pen stroke remains bounded' } as Record<string, string>)[name] ?? ''
        }
      },
      configurable: true,
    })
    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const payload = JSON.parse(firstFetchBody(fetchImpl))
    expect(payload.annotationPayload.items).toHaveLength(1)
    expect(payload.annotationPayload.items[0].tool).toBe('pen')
    expect(payload.annotationPayload.items[0].points.length).toBeLessThanOrEqual(240)
    expect(payload.annotationPayload.items[0].points.length).toBeGreaterThan(2)

    Object.defineProperty(globalThis, 'FormData', { value: originalFormData, configurable: true })
  })

  it('restores console/fetch and removes listeners on destroy', async () => {
    const { listeners, fetchImpl } = installDom()
    const { ObviousFeedback } = await import(`./index?lifecycle=${Date.now()}`)

    const widget = ObviousFeedback.init({ publicKey: 'fsk_pub_test', captureConsole: true, captureNetwork: true })
    expect(console.log).not.toBe(originalConsoleLog)
    expect(globalThis.window.fetch).not.toBe(fetchImpl)

    widget.destroy()

    expect(console.log).toBe(originalConsoleLog)
    expect(typeof globalThis.window.fetch).toBe('function')
    expect(listeners.has('keydown')).toBe(false)
    expect(listeners.has('resize')).toBe(false)
    expect(listeners.has('orientationchange')).toBe(false)
  })

  it('redacts DOM and URL payloads and truncates page text when capture is enabled', async () => {
    const { body, listeners, fetchImpl } = installDom()
    const { ObviousFeedback } = await import(`./index?redact=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test', capturePageContext: true })
    listeners.get('keydown')?.({
      preventDefault() {},
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      key: '.',
    } as KeyboardEvent)

    const host = body.children[1]
    const form = host.shadowRoot?.querySelector('form')
    const originalFormData = globalThis.FormData
    Object.defineProperty(globalThis, 'FormData', {
      value: class {
        get(name: string): string {
          return ({ description: '  Description-only feedback  ' } as Record<string, string>)[name] ?? ''
        }
      },
      configurable: true,
    })

    form?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const payload = JSON.parse(firstFetchBody(fetchImpl))
    expect(payload.sourceUrl).toBe('https://example.com/path?token=%5BREDACTED%5D')
    expect(payload.domSnapshot.children[0]).toEqual({ tag: 'input', redacted: true })
    expect(payload.domSnapshot.text).toEndWith('…')
    expect(payload.context.url).toBe('https://example.com/path?token=%5BREDACTED%5D')
    expect(payload.type).toBe('improvement')
    expect(payload.severity).toBe('medium')
    expect(payload.description).toBe('Description-only feedback')
    expect(payload.title).toBeUndefined()

    Object.defineProperty(globalThis, 'FormData', { value: originalFormData, configurable: true })
  })

  it('keeps status polling scoped to the submitted issue and does not clobber a new draft', async () => {
    const scheduledTimers: Array<() => void> = []
    const clearedTimers = new Set<number>()
    let submitCount = 0
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const rawUrl = url instanceof Request ? url.url : String(url)
      if (rawUrl.includes('/v1/feedback/submit') && init?.method === 'POST') {
        submitCount += 1
        const issueId = submitCount === 1 ? 'abi_first' : 'abi_second'
        return new Response(JSON.stringify({ data: { issueId, status: 'received' } }))
      }
      return new Response(
        JSON.stringify({
          data: {
            issueId: 'abi_second',
            status: 'in_progress',
            triageStatus: 'triaged',
            title: 'Second issue title must not persist',
            description: null,
            resolvedNote: 'Second issue note',
            updatedAt: '2026-04-08T00:00:00.000Z',
          },
        })
      )
    })
    const { body } = installDom(fetchImpl)
    Object.assign(globalThis.window, {
      setTimeout: (handler: () => void) => {
        scheduledTimers.push(handler)
        return scheduledTimers.length
      },
      clearTimeout: (timerId: number) => {
        clearedTimers.add(timerId)
      },
    })
    const { ObviousFeedback } = await import(`./index?status-stale=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    const originalFormData = globalThis.FormData
    let description = 'First submitted issue'
    Object.defineProperty(globalThis, 'FormData', {
      value: class {
        get(name: string): string {
          return ({ description } as Record<string, string>)[name] ?? ''
        }
      },
      configurable: true,
    })

    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(scheduledTimers).toHaveLength(1)

    host.shadowRoot?.querySelector('[data-new="true"]')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    expect(clearedTimers.has(1)).toBe(true)
    const textarea = host.shadowRoot?.querySelector('textarea[name="description"]') as HTMLTextAreaElement | undefined
    textarea!.value = 'Draft that must survive a stale poll.'

    await new Promise((resolve) => setTimeout(resolve, 0))
    const statusUrlsAfterNewSession = fetchCalls(fetchImpl)
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/v1/feedback/status/'))
    scheduledTimers[0]?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(host.shadowRoot?.innerHTML).toContain('Draft that must survive a stale poll.')
    expect(host.shadowRoot?.innerHTML).toContain('<div class="obv-kicker">Feedback</div>')
    expect(
      fetchCalls(fetchImpl).map((call) => String(call[0])).filter((url) => url.includes('/v1/feedback/status/'))
    ).toEqual(statusUrlsAfterNewSession)

    description = 'Second submitted issue'
    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(scheduledTimers).toHaveLength(2)

    scheduledTimers[1]?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(
      fetchCalls(fetchImpl).map((call) => String(call[0])).filter((url) => url.includes('/v1/feedback/status/'))
    ).toEqual([
      ...statusUrlsAfterNewSession,
      'https://app.obvious.ai/prepare/v1/feedback/status/abi_second?publicKey=fsk_pub_test',
    ])
    expect(host.shadowRoot?.innerHTML).toContain('In progress')

    Object.defineProperty(globalThis, 'FormData', { value: originalFormData, configurable: true })
  })

  it('keeps closed-widget status polling silent while updating issue history and trigger state', async () => {
    const scheduledTimers: Array<() => void> = []
    const polledStatuses: FeedbackStatusResponse[] = [
      {
        issueId: 'abi_polling',
        status: 'under_review',
        triageStatus: 'triaged',
        title: 'Polling issue',
        description: null,
        resolvedNote: null,
        reportedAt: '2026-04-08T00:00:00.000Z',
        updatedAt: '2026-04-08T00:01:00.000Z',
      },
      {
        issueId: 'abi_polling',
        status: 'in_progress',
        triageStatus: 'triaged',
        title: 'Polling issue',
        description: null,
        resolvedNote: null,
        reportedAt: '2026-04-08T00:00:00.000Z',
        updatedAt: '2026-04-08T00:02:00.000Z',
      },
      {
        issueId: 'abi_polling',
        status: 'resolved',
        triageStatus: 'auto_fixed',
        title: 'Polling issue',
        description: null,
        resolvedNote: 'Fixed by the worker.',
        reportedAt: '2026-04-08T00:00:00.000Z',
        updatedAt: '2026-04-08T00:03:00.000Z',
      },
    ]
    let statusIndex = 0
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const rawUrl = url instanceof Request ? url.url : String(url)
      if (rawUrl.includes('/v1/feedback/submit') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            data: {
              issueId: 'abi_polling',
              status: 'received',
              title: 'Polling issue',
              reportedAt: '2026-04-08T00:00:00.000Z',
            },
          })
        )
      }
      if (rawUrl.includes('/v1/feedback/status/abi_polling')) {
        const data = polledStatuses[Math.min(statusIndex, polledStatuses.length - 1)]
        statusIndex += 1
        return new Response(JSON.stringify({ data }))
      }
      return new Response('unexpected request', { status: 500 })
    })
    const { body, storage } = installDom(fetchImpl)
    Object.assign(globalThis.window, {
      setTimeout: (handler: () => void) => {
        scheduledTimers.push(handler)
        return scheduledTimers.length
      },
      clearTimeout: () => {},
    })
    const { ObviousFeedback } = await import(`./index?status-polling-silent=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    setFormDescription('Status polling should stay silent')
    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(host.shadowRoot?.innerHTML).toContain('<div class="obv-kicker">Feedback state</div>')
    host.shadowRoot?.querySelector('[data-close="true"]')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    expect(host.shadowRoot?.innerHTML).not.toContain('Feedback state')

    for (const expectedStatus of ['Under review', 'In progress', 'Resolved']) {
      scheduledTimers.shift()?.()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(host.shadowRoot?.innerHTML).not.toContain('Feedback state')
      expect(host.shadowRoot?.innerHTML).not.toContain('Fixed by the worker.')
      const trigger = host.shadowRoot?.querySelector('.obv-trigger')
      if (expectedStatus === 'Resolved') {
        expect(trigger?.getAttribute('aria-label')).toBe('Open feedback')
        expect(trigger?.getAttribute('data-issue-status')).toBe('idle')
      } else {
        expect(trigger?.getAttribute('aria-label')).toBe(
          `Open feedback — 1 open issue, latest status ${expectedStatus.toLowerCase()}`
        )
        expect(trigger?.getAttribute('data-issue-status')).toBe('open')
        expect(host.shadowRoot?.innerHTML).toContain('class="obv-trigger-ring"')
      }
    }

    const historyKey = 'obvious.feedback.issueHistory:fsk_pub_test:production:https%3A%2F%2Fexample.com'
    expect(JSON.parse(storage.get(historyKey) ?? '[]')).toMatchObject([
      {
        issueId: 'abi_polling',
        status: 'resolved',
        title: 'Polling issue',
        resolvedNote: 'Fixed by the worker.',
        acknowledgedStatusVersions: expect.arrayContaining([
          'under_review:2026-04-08T00:01:00.000Z',
          'in_progress:2026-04-08T00:02:00.000Z',
          'resolved:2026-04-08T00:03:00.000Z',
        ]),
      },
    ])
  })

  it('preserves rich issue history fields when acknowledging an already-seen status version', async () => {
    const scheduledTimers: Array<() => void> = []
    let statusFetchCount = 0
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const rawUrl = url instanceof Request ? url.url : String(url)
      if (rawUrl.includes('/v1/feedback/submit') && init?.method === 'POST') {
        return new Response(JSON.stringify({ data: { issueId: 'abi_rich', status: 'received' } }))
      }
      if (rawUrl.includes('/v1/feedback/status/abi_rich')) {
        statusFetchCount += 1
        return new Response(
          JSON.stringify({
            data: {
              issueId: 'abi_rich',
              status: 'in_progress',
              title: 'Rich issue title',
              description: 'Rich issue description',
              aiSummary: { headline: 'Rich headline', progress: 'Rich progress' },
              links: {
                pullRequest: {
                  id: 'pr_rich',
                  number: 123,
                  title: 'Rich PR',
                  url: 'https://github.com/FlatFilers/obvious/pull/123',
                  status: 'open',
                  ciStatus: 'success',
                  reviewStatus: 'approved',
                  isDraft: false,
                },
              },
              workerThread: { id: 'th_rich', url: 'https://obvious.ai/thread/th_rich' },
              reportedAt: '2026-04-08T00:00:00.000Z',
              updatedAt: '2026-04-08T01:00:00.000Z',
            },
          })
        )
      }
      return new Response('unexpected request', { status: 500 })
    })
    const { body, storage } = installDom(fetchImpl)
    Object.assign(globalThis.window, {
      setTimeout: (handler: () => void) => {
        scheduledTimers.push(handler)
        return scheduledTimers.length
      },
      clearTimeout: () => {},
    })
    const { ObviousFeedback } = await import(`./index?rich-ack=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    const originalFormData = globalThis.FormData
    Object.defineProperty(globalThis, 'FormData', {
      value: class {
        get(name: string): string {
          return ({ description: 'Submitted rich issue' } as Record<string, string>)[name] ?? ''
        }
      },
      configurable: true,
    })

    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))
    scheduledTimers[0]?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(statusFetchCount).toBe(1)
    host.shadowRoot?.querySelector('[data-close="true"]')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    scheduledTimers[1]?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(statusFetchCount).toBe(2)

    const historyKey = 'obvious.feedback.issueHistory:fsk_pub_test:production:https%3A%2F%2Fexample.com'
    const [entry] = JSON.parse(storage.get(historyKey) ?? '[]')
    expect(entry).toMatchObject({
      issueId: 'abi_rich',
      status: 'in_progress',
      title: 'Rich issue title',
      description: 'Rich issue description',
      aiSummary: { headline: 'Rich headline', progress: 'Rich progress' },
      links: { pullRequest: { url: 'https://github.com/FlatFilers/obvious/pull/123', number: 123 } },
      workerThread: { id: 'th_rich', url: 'https://obvious.ai/thread/th_rich' },
      reportedAt: '2026-04-08T00:00:00.000Z',
      updatedAt: '2026-04-08T01:00:00.000Z',
    })
    expect(entry.acknowledgedStatusVersions).toContain('in_progress:2026-04-08T01:00:00.000Z')

    Object.defineProperty(globalThis, 'FormData', { value: originalFormData, configurable: true })
  })
  it('bounds remembered status refreshes on form open and skips fresh or terminal entries', async () => {
    const fetchedStatusUrls: string[] = []
    const fetchImpl = mock(async (url: string | URL | Request) => {
      const rawUrl = url instanceof Request ? url.url : String(url)
      fetchedStatusUrls.push(rawUrl)
      const issueId = rawUrl.match(/\/v1\/feedback\/status\/([^?]+)/)?.[1] ?? 'abi_unknown'
      return new Response(
        JSON.stringify({
          data: {
            issueId,
            status: 'under_review',
            triageStatus: 'triaged',
            title: issueId,
            description: null,
            resolvedNote: null,
            updatedAt: '2026-04-08T00:10:00.000Z',
            reportedAt: '2026-04-08T00:00:00.000Z',
          },
        })
      )
    })
    const { body, storage } = installDom(fetchImpl)
    const historyKey = 'obvious.feedback.issueHistory:fsk_pub_test:production:https%3A%2F%2Fexample.com'
    storage.set(
      historyKey,
      JSON.stringify([
        { issueId: 'abi_stale_one', status: 'received', checkedAt: '2026-04-08T00:00:00.000Z' },
        { issueId: 'abi_stale_two', status: 'under_review', checkedAt: '2026-04-08T00:00:00.000Z' },
        { issueId: 'abi_stale_three', status: 'in_progress', checkedAt: '2026-04-08T00:00:00.000Z' },
        { issueId: 'abi_terminal', status: 'resolved', checkedAt: '2026-04-08T00:00:00.000Z' },
        { issueId: 'abi_fresh', status: 'received', checkedAt: new Date().toISOString() },
      ])
    )
    const { ObviousFeedback } = await import(`./index?history-refresh=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(fetchedStatusUrls).toEqual([
      'https://app.obvious.ai/prepare/v1/feedback/status/abi_stale_one?publicKey=fsk_pub_test',
      'https://app.obvious.ai/prepare/v1/feedback/status/abi_stale_two?publicKey=fsk_pub_test',
    ])
  })

  it('keeps later status versions silent after acknowledging the initial confirmation', async () => {
    const scheduledTimers: Array<() => void> = []
    const statusResponses: FeedbackStatusResponse[] = [
      {
        issueId: 'abi_progressive',
        status: 'under_review',
        triageStatus: 'triaged',
        title: 'Progressive issue',
        description: null,
        resolvedNote: null,
        updatedAt: '2026-04-08T00:01:00.000Z',
        reportedAt: '2026-04-08T00:00:00.000Z',
      },
      {
        issueId: 'abi_progressive',
        status: 'in_progress',
        triageStatus: 'triaged',
        title: 'Progressive issue',
        description: null,
        resolvedNote: null,
        updatedAt: '2026-04-08T00:02:00.000Z',
        reportedAt: '2026-04-08T00:00:00.000Z',
      },
      {
        issueId: 'abi_progressive',
        status: 'resolved',
        triageStatus: 'actioned',
        title: 'Progressive issue',
        description: null,
        resolvedNote: 'Done',
        updatedAt: '2026-04-08T00:03:00.000Z',
        reportedAt: '2026-04-08T00:00:00.000Z',
      },
    ]
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const rawUrl = url instanceof Request ? url.url : String(url)
      if (rawUrl.includes('/v1/feedback/submit') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            data: {
              issueId: 'abi_progressive',
              status: 'received',
              title: 'Progressive issue',
              reportedAt: '2026-04-08T00:00:00.000Z',
            },
          })
        )
      }
      return new Response(JSON.stringify({ data: statusResponses.shift() }))
    })
    const { body, storage } = installDom(fetchImpl)
    Object.assign(globalThis.window, {
      setTimeout: (handler: () => void) => {
        scheduledTimers.push(handler)
        return scheduledTimers.length
      },
    })
    const { ObviousFeedback } = await import(`./index?status-ack=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    const originalFormData = globalThis.FormData
    Object.defineProperty(globalThis, 'FormData', {
      value: class {
        get(name: string): string {
          return ({ description: 'Progressive status feedback' } as Record<string, string>)[name] ?? ''
        }
      },
      configurable: true,
    })

    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(host.shadowRoot?.innerHTML).toContain('Received')

    host.shadowRoot?.querySelector('[data-close="true"]')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    expect(host.shadowRoot?.innerHTML).not.toContain('Feedback state')

    scheduledTimers[0]?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(host.shadowRoot?.innerHTML).not.toContain('Feedback state')
    expect(host.shadowRoot?.querySelector('.obv-trigger')?.getAttribute('aria-label')).toBe(
      'Open feedback — 1 open issue, latest status under review'
    )
    expect(host.shadowRoot?.querySelector('.obv-trigger')?.getAttribute('data-issue-status')).toBe('open')

    scheduledTimers[1]?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(host.shadowRoot?.innerHTML).not.toContain('Feedback state')
    expect(host.shadowRoot?.querySelector('.obv-trigger')?.getAttribute('aria-label')).toBe(
      'Open feedback — 1 open issue, latest status in progress'
    )
    expect(host.shadowRoot?.querySelector('.obv-trigger')?.getAttribute('data-issue-status')).toBe('open')

    scheduledTimers[2]?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(host.shadowRoot?.innerHTML).not.toContain('Feedback state')
    expect(host.shadowRoot?.querySelector('.obv-trigger')?.getAttribute('aria-label')).toBe('Open feedback')
    expect(host.shadowRoot?.querySelector('.obv-trigger')?.getAttribute('data-issue-status')).toBe('idle')

    const historyKey = 'obvious.feedback.issueHistory:fsk_pub_test:production:https%3A%2F%2Fexample.com'
    const [entry] = JSON.parse(storage.get(historyKey) ?? '[]') as Array<{
      acknowledgedStatusVersions?: string[]
      status: string
    }>
    expect(entry.status).toBe('resolved')
    expect(entry.acknowledgedStatusVersions).toEqual([
      'received:2026-04-08T00:00:00.000Z',
      'under_review:2026-04-08T00:01:00.000Z',
      'in_progress:2026-04-08T00:02:00.000Z',
      'resolved:2026-04-08T00:03:00.000Z',
    ])

    Object.defineProperty(globalThis, 'FormData', { value: originalFormData, configurable: true })
  })

  it('updates open feedback history in place during status polling without reopening status cards', async () => {
    const scheduledTimers: Array<() => void> = []
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const rawUrl = url instanceof Request ? url.url : String(url)
      if (rawUrl.includes('/v1/feedback/submit') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            data: { issueId: 'abi_open_history', status: 'received', reportedAt: '2026-04-08T00:00:00.000Z' },
          })
        )
      }
      return new Response(
        JSON.stringify({
          data: {
            issueId: 'abi_open_history',
            status: 'under_review',
            triageStatus: 'triaged',
            title: 'Open history issue',
            description: null,
            resolvedNote: null,
            updatedAt: '2026-04-08T00:01:00.000Z',
            reportedAt: '2026-04-08T00:00:00.000Z',
          },
        })
      )
    })
    const { body } = installDom(fetchImpl)
    Object.assign(globalThis.window, {
      setTimeout: (handler: () => void) => {
        scheduledTimers.push(handler)
        return scheduledTimers.length
      },
    })
    const { ObviousFeedback } = await import(`./index?status-open-history=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    const originalFormData = globalThis.FormData
    Object.defineProperty(globalThis, 'FormData', {
      value: class {
        get(name: string): string {
          return ({ description: 'Open history feedback' } as Record<string, string>)[name] ?? ''
        }
      },
      configurable: true,
    })

    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))
    host.shadowRoot?.querySelector('[data-close="true"]')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    scheduledTimers[0]?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(host.shadowRoot?.innerHTML).toContain('<div class="obv-kicker">Feedback</div>')
    expect(host.shadowRoot?.innerHTML).toContain('Under review')
    expect(host.shadowRoot?.innerHTML).not.toContain('Feedback state')

    Object.defineProperty(globalThis, 'FormData', { value: originalFormData, configurable: true })
  })

  it('does not reschedule status polling after destroy while a poll request is pending', async () => {
    const scheduledTimers: Array<() => void> = []
    let resolveStatus: ((response: Response) => void) | null = null
    let resolveStatusFetchStarted: (() => void) | null = null
    const statusFetchStarted = new Promise<void>((resolve) => {
      resolveStatusFetchStarted = resolve
    })
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const rawUrl = url instanceof Request ? url.url : String(url)
      if (rawUrl.includes('/v1/feedback/submit') && init?.method === 'POST') {
        return new Response(JSON.stringify({ data: { issueId: 'abi_destroy', status: 'received' } }))
      }
      if (rawUrl.includes('/v1/feedback/status/abi_destroy')) {
        resolveStatusFetchStarted?.()
        return new Promise<Response>((resolve) => {
          resolveStatus = resolve
        })
      }
      return new Response('unexpected request', { status: 500 })
    })
    const { body } = installDom(fetchImpl)
    Object.assign(globalThis.window, {
      setTimeout: (handler: () => void) => {
        scheduledTimers.push(handler)
        return scheduledTimers.length
      },
    })
    const { ObviousFeedback } = await import(`./index?destroy-pending-poll=${Date.now()}`)

    const sdk = ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    const originalFormData = globalThis.FormData
    Object.defineProperty(globalThis, 'FormData', {
      value: class {
        get(name: string): string {
          return ({ description: 'Feedback with pending status poll' } as Record<string, string>)[name] ?? ''
        }
      },
      configurable: true,
    })

    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(scheduledTimers).toHaveLength(1)

    scheduledTimers[0]?.()
    await statusFetchStarted
    sdk.destroy()
    const completeStatusFetch = resolveStatus as ((response: Response) => void) | null
    completeStatusFetch?.(
      new Response(JSON.stringify({ data: { issueId: 'abi_destroy', status: 'in_progress', triageStatus: 'triaged' } }))
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(scheduledTimers).toHaveLength(1)
    expect(host.shadowRoot?.innerHTML).not.toContain('In progress')

    Object.defineProperty(globalThis, 'FormData', { value: originalFormData, configurable: true })
  })

  it('rejects whitespace-only descriptions before submitting', async () => {
    const { body, listeners, fetchImpl } = installDom()
    const { ObviousFeedback } = await import(`./index?blank-description=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    listeners.get('keydown')?.({
      preventDefault() {},
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      key: '.',
    } as KeyboardEvent)

    const host = body.children[1]
    const form = host.shadowRoot?.querySelector('form')
    expect(host.shadowRoot?.innerHTML).toContain('<form class="obv-card" novalidate')
    const originalFormData = globalThis.FormData
    Object.defineProperty(globalThis, 'FormData', {
      value: class {
        get(name: string): string {
          return ({ description: '   ' } as Record<string, string>)[name] ?? ''
        }
      },
      configurable: true,
    })

    form?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(host.shadowRoot?.innerHTML).toContain('role="alert"')
    expect(host.shadowRoot?.innerHTML).toContain('Feedback description is required')
    expect(host.shadowRoot?.innerHTML).toContain('<div class="obv-kicker">Feedback</div>')
    expect(host.shadowRoot?.innerHTML).not.toContain('Feedback state')

    Object.defineProperty(globalThis, 'FormData', { value: originalFormData, configurable: true })
  })

  it('omits page capture by default and renders submit errors', async () => {
    const { body, listeners, fetchImpl } = installDom(mock(async () => new Response('nope', { status: 500 })))
    const { ObviousFeedback } = await import(`./index?submit-error=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    listeners.get('keydown')?.({
      preventDefault() {},
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      key: '.',
    } as KeyboardEvent)

    const host = body.children[1]
    const descriptionInput = host.shadowRoot?.querySelector('textarea[name="description"]') as
      | HTMLTextAreaElement
      | undefined
    descriptionInput!.value = 'Do not drop this draft after the server fails.'
    const form = host.shadowRoot?.querySelector('form')
    const originalFormData = globalThis.FormData
    Object.defineProperty(globalThis, 'FormData', {
      value: class {
        get(name: string): string {
          return ({ description: 'D' } as Record<string, string>)[name] ?? ''
        }
      },
      configurable: true,
    })

    form?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const payload = JSON.parse(firstFetchBody(fetchImpl))
    expect(payload.domSnapshot).toBeUndefined()
    expect(payload.context).toBeUndefined()
    expect(host.shadowRoot?.innerHTML).toContain('role="alert"')
    expect(host.shadowRoot?.innerHTML).toContain('Feedback submission failed (500)')
    expect(host.shadowRoot?.innerHTML).toContain('Do not drop this draft after the server fails.')
    expect(host.shadowRoot?.innerHTML).toContain('<div class="obv-kicker">Feedback</div>')
    expect(host.shadowRoot?.innerHTML).not.toContain('Feedback state')

    Object.defineProperty(globalThis, 'FormData', { value: originalFormData, configurable: true })
  })

  it('uploads dropped image and ordinary file attachments, removes chips, and submits ready tokens', async () => {
    const attachmentMock = createAttachmentFetchMock()
    const { body, fetchImpl } = installDom(attachmentMock.fetchImpl)
    const restoreFormData = setFormDescription('Please inspect the reporter attachments')
    const { ObviousFeedback } = await import(`./index?attachment-drop-submit=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    host.shadowRoot?.querySelector('form')?.dispatch('drop', {
      preventDefault() {},
      stopPropagation() {},
      dataTransfer: {
        files: [
          createFeedbackFile('screen.png', 'image/png'),
          createFeedbackFile('diagnostics.log', '', 'plain diagnostic text'),
          createFeedbackFile('remove-me.txt', 'text/plain'),
        ],
      },
    } as unknown as DragEvent)

    expect(host.shadowRoot?.innerHTML).toContain('Uploading…')
    await flushAttachmentWork()
    expect(host.shadowRoot?.innerHTML).toContain('screen.png')
    expect(host.shadowRoot?.innerHTML).toContain('diagnostics.log')
    expect(host.shadowRoot?.innerHTML).toContain('application/octet-stream')
    expect(attachmentMock.presignBodies).toMatchObject([
      { publicKey: 'fsk_pub_test', name: 'screen.png', mimeType: 'image/png', sizeBytes: 10 },
      { publicKey: 'fsk_pub_test', name: 'diagnostics.log', mimeType: 'application/octet-stream', sizeBytes: 21 },
      { publicKey: 'fsk_pub_test', name: 'remove-me.txt', mimeType: 'text/plain', sizeBytes: 10 },
    ])
    host.shadowRoot
      ?.querySelectorAll('[data-attachment-remove]')[2]
      ?.dispatch('click', { preventDefault() {} } as unknown as Event)
    expect(host.shadowRoot?.innerHTML).not.toContain('remove-me.txt')
    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await flushAttachmentWork()

    const payload = JSON.parse(
      findFetchBody(fetchImpl, '/v1/feedback/submit')
    )
    expect(payload.attachmentTokens).toEqual(['token_1', 'token_2'])
    expect(payload.description).toBe('Please inspect the reporter attachments')
    restoreFormData()
  })

  it('keeps attachment drop events inside the dropzone and uploads dropped files', async () => {
    const attachmentMock = createAttachmentFetchMock()
    const { body } = installDom(attachmentMock.fetchImpl)
    const { ObviousFeedback } = await import(`./index?attachment-dropzone-propagation=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    let defaultPrevented = 0
    let propagationStopped = 0
    host.shadowRoot?.querySelector('[data-attachment-dropzone]')?.dispatch('drop', {
      preventDefault() {
        defaultPrevented += 1
      },
      stopPropagation() {
        propagationStopped += 1
      },
      dataTransfer: { files: [createFeedbackFile('inside-dialog.png', 'image/png')] },
    } as unknown as DragEvent)

    expect(defaultPrevented).toBe(1)
    expect(propagationStopped).toBe(1)
    await flushAttachmentWork()
    expect(host.shadowRoot?.innerHTML).toContain('inside-dialog.png')
    expect(attachmentMock.presignBodies).toMatchObject([{ name: 'inside-dialog.png' }])
  })

  it('uses capture-phase file drop guards to attach SDK drops before host handlers can steal them', async () => {
    const attachmentMock = createAttachmentFetchMock()
    const { body, listeners, documentListeners } = installDom(attachmentMock.fetchImpl)
    const { ObviousFeedback } = await import(`./index?attachment-global-drop-guard=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    expect(documentListeners.has('drop')).toBe(true)

    let defaultPrevented = 0
    let propagationStopped = 0
    let immediatePropagationStopped = 0
    listeners.get('drop')?.({
      preventDefault() {
        defaultPrevented += 1
      },
      stopPropagation() {
        propagationStopped += 1
      },
      stopImmediatePropagation() {
        immediatePropagationStopped += 1
      },
      composedPath: () => [host],
      dataTransfer: { types: ['Files'], files: [createFeedbackFile('guarded.png', 'image/png')] },
    } as unknown as DragEvent)

    expect(defaultPrevented).toBe(1)
    expect(propagationStopped).toBe(1)
    expect(immediatePropagationStopped).toBe(1)
    await flushAttachmentWork()
    expect(host.shadowRoot?.innerHTML).toContain('guarded.png')
    expect(attachmentMock.presignBodies).toMatchObject([{ name: 'guarded.png' }])
  })

  it('lets outside file drops reach host handlers while the dialog is open without attaching them', async () => {
    const attachmentMock = createAttachmentFetchMock()
    const { body, listeners, documentListeners } = installDom(attachmentMock.fetchImpl)
    const { ObviousFeedback } = await import(`./index?attachment-outside-drop-guard=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    expect(documentListeners.has('drop')).toBe(true)

    let defaultPrevented = 0
    let propagationStopped = 0
    let dragLeavePropagationStopped = 0
    listeners.get('dragleave')?.({
      preventDefault() {},
      stopPropagation() {
        dragLeavePropagationStopped += 1
      },
      stopImmediatePropagation() {},
      composedPath: () => [body],
      dataTransfer: { types: ['Files'], files: [] },
    } as unknown as DragEvent)
    listeners.get('drop')?.({
      preventDefault() {
        defaultPrevented += 1
      },
      stopPropagation() {
        propagationStopped += 1
      },
      stopImmediatePropagation() {},
      composedPath: () => [body],
      dataTransfer: { types: ['Files'], files: [createFeedbackFile('outside.png', 'image/png')] },
    } as unknown as DragEvent)

    await flushAttachmentWork()
    expect(defaultPrevented).toBe(1)
    expect(propagationStopped).toBe(0)
    expect(dragLeavePropagationStopped).toBe(1)
    expect(host.shadowRoot?.innerHTML).not.toContain('outside.png')
    expect(attachmentMock.presignBodies).toEqual([])
  })

  it('preserves non-file text drops for editable fields and removes guards when closed', async () => {
    const { body, listeners, documentListeners } = installDom()
    const { ObviousFeedback } = await import(`./index?attachment-text-drop-preserve=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    let defaultPrevented = 0
    listeners.get('drop')?.({
      preventDefault() {
        defaultPrevented += 1
      },
      stopPropagation() {},
      stopImmediatePropagation() {},
      composedPath: () => [host.shadowRoot?.querySelector('textarea[name="description"]'), host],
      dataTransfer: { types: ['text/plain'], files: [] },
    } as unknown as DragEvent)

    expect(defaultPrevented).toBe(0)
    host.shadowRoot?.querySelector('[data-close="true"]')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    expect(listeners.has('drop')).toBe(false)
    expect(documentListeners.has('drop')).toBe(false)
  })

  it('makes the attachment dropzone clickable, keyboard accessible, and inline aligned', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`./index?attachment-picker-accessibility=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    expect(host.shadowRoot?.innerHTML).toContain('data-attachment-dropzone="true" role="button" tabindex="0"')
    expect(host.shadowRoot?.innerHTML).toContain('class="obv-attachment-prompt"')
    expect(host.shadowRoot?.innerHTML).toContain('data-attachment-input="true" type="file" multiple')

    const fileInput = host.shadowRoot?.querySelector('[data-attachment-input]')
    let pickerClicks = 0
    if (fileInput) {
      fileInput.click = () => {
        pickerClicks += 1
      }
    }

    host.shadowRoot?.querySelector('[data-attachment-dropzone]')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    let keyboardDefaultPrevented = 0
    host.shadowRoot?.querySelector('[data-attachment-dropzone]')?.dispatch('keydown', {
      key: 'Enter',
      preventDefault() {
        keyboardDefaultPrevented += 1
      },
    } as KeyboardEvent)

    expect(pickerClicks).toBe(2)
    expect(keyboardDefaultPrevented).toBe(1)
  })
  it('uploads pasted image and file attachments from clipboard items', async () => {
    const attachmentMock = createAttachmentFetchMock()
    const { body, fetchImpl } = installDom(attachmentMock.fetchImpl)
    const restoreFormData = setFormDescription('Pasted evidence attached')
    const { ObviousFeedback } = await import(`./index?attachment-paste=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    host.shadowRoot?.querySelector('form')?.dispatch('paste', {
      preventDefault() {},
      clipboardData: {
        files: [],
        items: [
          { kind: 'file', getAsFile: () => createFeedbackFile('clipboard.jpg', 'image/jpeg') },
          { kind: 'file', getAsFile: () => createFeedbackFile('notes.txt', 'text/plain') },
        ],
      },
    } as unknown as ClipboardEvent)
    await flushAttachmentWork()
    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await flushAttachmentWork()

    const payload = JSON.parse(
      findFetchBody(fetchImpl, '/v1/feedback/submit')
    )
    expect(payload.attachmentTokens).toEqual(['token_1', 'token_2'])
    restoreFormData()
  })

  it('blocks submit while an attachment upload is pending and blocks failed uploads until removal', async () => {
    const delayedMock = createAttachmentFetchMock({ delayPresign: true })
    const { body, fetchImpl } = installDom(delayedMock.fetchImpl)
    const restoreFormData = setFormDescription('Pending upload feedback')
    const { ObviousFeedback } = await import(`./index?attachment-pending=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    host.shadowRoot?.querySelector('form')?.dispatch('drop', {
      preventDefault() {},
      stopPropagation() {},
      dataTransfer: { files: [createFeedbackFile('pending.png', 'image/png')] },
    } as unknown as DragEvent)
    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(host.shadowRoot?.innerHTML).toContain('Please wait for attachments to finish uploading')
    expect(fetchCalls(fetchImpl).some((call) => String(call[0]).includes('/v1/feedback/submit'))).toBe(false)
    delayedMock.resolvePresign()
    await flushAttachmentWork()

    const failingMock = createAttachmentFetchMock({ failPut: true })
    fetchImpl.mockImplementation(failingMock.fetchImpl)
    host.shadowRoot?.querySelector('form')?.dispatch('drop', {
      preventDefault() {},
      stopPropagation() {},
      dataTransfer: { files: [createFeedbackFile('fails.png', 'image/png')] },
    } as unknown as DragEvent)
    await flushAttachmentWork()
    expect(host.shadowRoot?.innerHTML).toContain('Attachment upload failed (500)')
    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    expect(host.shadowRoot?.innerHTML).toContain('Remove failed attachments before submitting feedback')
    restoreFormData()
  })

  it('submits without requesting upload URLs when no attachments are selected', async () => {
    const attachmentMock = createAttachmentFetchMock()
    const { body, fetchImpl } = installDom(attachmentMock.fetchImpl)
    const restoreFormData = setFormDescription('Feedback without any extra files')
    const { ObviousFeedback } = await import(`./index?attachment-none=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await flushAttachmentWork()

    const urls = fetchCalls(fetchImpl).map((call) => String(call[0]))
    expect(urls.some((url) => url.includes('/v1/feedback/attachments/upload'))).toBe(false)
    const payload = JSON.parse(
      findFetchBody(fetchImpl, '/v1/feedback/submit')
    )
    expect(payload.attachmentTokens).toEqual([])
    restoreFormData()
  })

  it('posts feedback submissions through the API route prefix for PR preview API bases', async () => {
    const fetchImpl = mock(
      async () => new Response(JSON.stringify({ data: { issueId: 'abi_test', status: 'received' } }))
    )
    const { body } = installDom(fetchImpl)
    const { ObviousFeedback } = await import(`./index?preview-submit-route=${Date.now()}`)

    ObviousFeedback.init({
      apiBaseUrl: 'https://api.stage.obvious.ai',
      env: 'staging',
      prNumber: 15686,
      publicKey: 'fsk_pub_test',
    })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    const restoreFormData = setFormDescription('Preview feedback should reach the staging API route.')
    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(String(fetchCalls(fetchImpl)[0]?.[0])).toBe('https://api.stage.obvious.ai/prepare/v1/feedback/submit')

    restoreFormData()
  })

  it('posts attachment presign requests through the API route prefix for PR preview API bases', async () => {
    const attachmentMock = createAttachmentFetchMock()
    const { body, fetchImpl } = installDom(attachmentMock.fetchImpl)
    const { ObviousFeedback } = await import(`./index?preview-attachment-route=${Date.now()}`)

    ObviousFeedback.init({
      apiBaseUrl: 'https://api.stage.obvious.ai',
      env: 'staging',
      prNumber: 15686,
      publicKey: 'fsk_pub_test',
    })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)
    host.shadowRoot?.querySelector('form')?.dispatch('drop', {
      preventDefault() {},
      stopPropagation() {},
      dataTransfer: { files: [createFeedbackFile('markup-arrow.png', 'image/png')] },
    } as unknown as DragEvent)
    await flushAttachmentWork()

    expect(String(fetchCalls(fetchImpl)[0]?.[0])).toBe(
      'https://api.stage.obvious.ai/prepare/v1/feedback/attachments/upload'
    )
  })

  it('builds status polling requests through the API route prefix for PR preview API bases', async () => {
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const rawUrl = url instanceof Request ? url.url : String(url)
      if (rawUrl.includes('/v1/feedback/submit') && init?.method === 'POST') {
        return new Response(JSON.stringify({ data: { issueId: 'abi_preview_status', status: 'received' } }))
      }
      return new Response(JSON.stringify({ data: { issueId: 'abi_preview_status', status: 'under_review' } }))
    })
    const scheduledTimers: Array<() => void> = []
    const { body } = installDom(fetchImpl)
    Object.assign(globalThis.window, {
      setTimeout: (handler: () => void) => {
        scheduledTimers.push(handler)
        return scheduledTimers.length
      },
    })
    const { ObviousFeedback } = await import(`./index?preview-status-route=${Date.now()}`)

    ObviousFeedback.init({
      apiBaseUrl: 'https://api.stage.obvious.ai',
      env: 'staging',
      prNumber: 15686,
      publicKey: 'fsk_pub_test',
    })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    const restoreFormData = setFormDescription('Preview feedback status should poll through prepare.')
    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))
    scheduledTimers[0]?.()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const statusUrls = fetchCalls(fetchImpl)
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/v1/feedback/status/'))
    expect(statusUrls).toEqual([
      'https://api.stage.obvious.ai/prepare/v1/feedback/status/abi_preview_status?publicKey=fsk_pub_test',
    ])

    restoreFormData()
  })

  it('does not duplicate the API route prefix when callers include it in apiBaseUrl', async () => {
    const fetchImpl = mock(
      async () => new Response(JSON.stringify({ data: { issueId: 'abi_test', status: 'received' } }))
    )
    const { body } = installDom(fetchImpl)
    const { ObviousFeedback } = await import(`./index?prefixed-submit-route=${Date.now()}`)

    ObviousFeedback.init({
      apiBaseUrl: 'https://api.stage.obvious.ai/prepare',
      env: 'staging',
      publicKey: 'fsk_pub_test',
    })
    const host = body.children[1]
    host.shadowRoot?.querySelector('.obv-trigger')?.dispatch('click', { preventDefault() {} } as unknown as Event)

    const restoreFormData = setFormDescription('Prefixed base URLs should not double-prefix.')
    host.shadowRoot?.querySelector('form')?.dispatch('submit', { preventDefault() {}, currentTarget: {} } as unknown as Event)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(String(fetchCalls(fetchImpl)[0]?.[0])).toBe('https://api.stage.obvious.ai/prepare/v1/feedback/submit')

    restoreFormData()
  })

  it('auto-initializes from script tag dataset', async () => {
    const { body } = installDom()
    const script = new MiniScriptElement()
    script.dataset.pubKey = 'fsk_pub_script'
    Object.defineProperty(globalThis.document, 'currentScript', { value: script, configurable: true })

    await import(`./index?script=${Date.now()}`)

    expect(body.children.length).toBe(2)
  })

  it('does not reference generic host design tokens that could collide with host-page libraries', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`./index?host-token-isolation=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const html = body.children[1].shadowRoot?.innerHTML ?? ''

    const hostTokens = [
      'var(--popover,',
      'var(--muted,',
      'var(--foreground,',
      'var(--muted-foreground,',
      'var(--border,',
      'var(--ring,',
      'var(--primary,',
      'var(--primary-foreground,',
      'var(--radius,',
    ]
    for (const token of hostTokens) {
      expect(html).not.toContain(token)
    }

    expect(html).toContain('--obv-feedback-bg:')
    expect(html).toContain('--obv-feedback-primary:')
    expect(html).toContain('--obv-feedback-text:')
  })

  it('defaults to light theme when theme is omitted', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`./index?theme-default-light=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test' })
    const host = body.children[1]

    expect(host.getAttribute('data-theme')).toBe('light')
    expect(host.shadowRoot?.innerHTML).toContain('color-scheme: light')
    expect(host.shadowRoot?.innerHTML).toContain('--obv-feedback-bg: #ffffff')
  })

  it('applies dark theme when theme is set to dark', async () => {
    const { body } = installDom()
    const { ObviousFeedback } = await import(`./index?theme-explicit-dark=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test', theme: 'dark' })
    const host = body.children[1]

    expect(host.getAttribute('data-theme')).toBe('dark')
    expect(host.shadowRoot?.innerHTML).toContain(':host([data-theme="dark"])')
  })

  it('uses prefers-color-scheme only when theme is system', async () => {
    const { body } = installDom()

    const matchMediaListeners: Array<(event: { matches: boolean }) => void> = []
    let currentMatches = true
    Object.defineProperty(globalThis.window, 'matchMedia', {
      configurable: true,
      value: () => ({
        get matches() {
          return currentMatches
        },
        addEventListener: (_type: string, handler: (event: { matches: boolean }) => void) => {
          matchMediaListeners.push(handler)
        },
        removeEventListener: () => {},
      }),
    })

    const { ObviousFeedback } = await import(`./index?theme-system=${Date.now()}`)

    ObviousFeedback.init({ publicKey: 'fsk_pub_test', theme: 'system' })
    const host = body.children[1]

    expect(host.getAttribute('data-theme')).toBe('dark')

    currentMatches = false
    for (const listener of matchMediaListeners) {
      listener({ matches: false })
    }
    expect(host.getAttribute('data-theme')).toBe('light')
  })
})
