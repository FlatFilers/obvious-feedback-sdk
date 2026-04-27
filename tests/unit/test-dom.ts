import { afterEach, mock } from 'bun:test'

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

export class MiniElement {
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

  removeAttribute(name: string): void {
    this.attrs.delete(name)
    if (name === 'style') {
      this.style = ''
    }
    if (this.innerHTMLSnapshot) {
      const attrPattern = new RegExp(`\\s${name}(="[^"]*")?`)
      this.innerHTMLSnapshot = this.innerHTMLSnapshot.replace(attrPattern, '')
    }
    this.attributes = Array.from(this.attrs.entries()).map(([attrName, attrValue]) => ({
      name: attrName,
      value: attrValue,
    }))
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

export class MiniShadowRoot {
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

export function installDom(
  fetchImpl = mock(async () => new Response(JSON.stringify({ data: { issueId: 'abi_test', status: 'received' } })))
) {
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
      fetch: fetchImpl,
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
  Object.defineProperty(globalThis, 'fetch', { value: fetchImpl, writable: true, configurable: true })
  Object.defineProperty(globalThis, 'localStorage', { value: localStorage, configurable: true })

  return { body, listeners, documentListeners, fetchImpl, storage }
}

export function setFormDescription(description: string): () => void {
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

export function createAttachmentFetchMock(options: { failPut?: boolean; delayPresign?: boolean } = {}) {
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

export async function flushAttachmentWork(): Promise<void> {
  for (let index = 0; index < 4; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

export function createFeedbackFile(name: string, type: string, contents = 'file-bytes'): File {
  return new File([contents], name, { type })
}

export function restoreGlobals(): void {
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
}
