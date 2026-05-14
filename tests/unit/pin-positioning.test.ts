import { afterEach, describe, expect, it } from 'bun:test'
import {
  computeInlinePopupPlacement,
  computePinAnchor,
  computePinAnchorFromPoint,
  deepElementFromPoint,
  isElementFixed,
  resolvePinElement,
} from '../../src/pin-positioning'
import { installDom, restoreGlobals } from './test-dom'

afterEach(restoreGlobals)

describe('computePinAnchor', () => {
  it('places the anchor at the element center in viewport %/doc-px', () => {
    const rect = { left: 100, top: 200, width: 80, height: 40 }
    const anchor = computePinAnchor(rect, false, 1000, 50)
    expect(anchor.xPct).toBeCloseTo(((100 + 40) / 1000) * 100)
    expect(anchor.yPx).toBe(200 + 20 + 50)
  })

  it('uses viewport-space y when the element is fixed', () => {
    const rect = { left: 0, top: 10, width: 20, height: 20 }
    const anchor = computePinAnchor(rect, true, 1000, 5000)
    expect(anchor.yPx).toBe(20)
  })

  it('clamps xPct between 0 and 100', () => {
    const rect = { left: -200, top: 0, width: 50, height: 50 }
    const anchor = computePinAnchor(rect, false, 1000, 0)
    expect(anchor.xPct).toBe(0)

    const rectFar = { left: 2000, top: 0, width: 50, height: 50 }
    const anchorFar = computePinAnchor(rectFar, false, 1000, 0)
    expect(anchorFar.xPct).toBe(100)
  })

  it('falls back to 1px viewport width when innerWidth is invalid', () => {
    const rect = { left: 5, top: 0, width: 5, height: 5 }
    const anchor = computePinAnchor(rect, false, 0, 0)
    expect(anchor.xPct).toBe(100)
  })
})

describe('computePinAnchorFromPoint', () => {
  it('uses the click point and adds scrollY when not fixed', () => {
    const anchor = computePinAnchorFromPoint(250, 400, false, 1000, 100)
    expect(anchor.xPct).toBe(25)
    expect(anchor.yPx).toBe(500)
  })

  it('keeps viewport-space y when fixed', () => {
    const anchor = computePinAnchorFromPoint(250, 400, true, 1000, 100)
    expect(anchor.yPx).toBe(400)
  })
})

describe('computeInlinePopupPlacement', () => {
  const viewport = { width: 1000, height: 800 }

  it('prefers below the element when there is room', () => {
    const rect = { left: 400, top: 100, width: 80, height: 40 }
    const placement = computeInlinePopupPlacement(rect, 300, 200, viewport, 0, 0)
    expect(placement.placement).toBe('below')
    expect(placement.top).toBeGreaterThan(rect.top + rect.height)
  })

  it('flips above when there is not enough room below', () => {
    const rect = { left: 400, top: 750, width: 80, height: 40 }
    const placement = computeInlinePopupPlacement(rect, 300, 200, viewport, 0, 0)
    expect(placement.placement).toBe('above')
    expect(placement.top).toBeLessThan(rect.top)
  })

  it('clamps the popup inside the viewport horizontally on the right edge', () => {
    const rect = { left: 980, top: 100, width: 20, height: 20 }
    const placement = computeInlinePopupPlacement(rect, 300, 200, viewport, 0, 0)
    expect(placement.left).toBeGreaterThanOrEqual(0)
    expect(placement.left + 300).toBeLessThanOrEqual(viewport.width)
  })

  it('clamps the popup inside the viewport horizontally on the left edge', () => {
    const rect = { left: -50, top: 100, width: 20, height: 20 }
    const placement = computeInlinePopupPlacement(rect, 300, 200, viewport, 0, 0)
    expect(placement.left).toBeGreaterThanOrEqual(0)
  })

  it('adds scrollY so the result is in document space', () => {
    const rect = { left: 100, top: 100, width: 40, height: 40 }
    const placement = computeInlinePopupPlacement(rect, 300, 200, viewport, 1500, 50)
    expect(placement.top).toBeGreaterThan(1500)
    expect(placement.left).toBeGreaterThanOrEqual(50)
  })

  it('keeps the arrow offset within the popup width', () => {
    const rect = { left: 0, top: 200, width: 40, height: 40 }
    const placement = computeInlinePopupPlacement(rect, 300, 200, viewport, 0, 0)
    expect(placement.arrowOffsetX).toBeGreaterThanOrEqual(8)
    expect(placement.arrowOffsetX).toBeLessThanOrEqual(300 - 8)
  })
})

describe('isElementFixed', () => {
  it('returns false for null', () => {
    expect(isElementFixed(null)).toBe(false)
  })
})

describe('resolvePinElement', () => {
  it('returns null when no selector is given and there is no fallback', () => {
    expect(resolvePinElement('', null)).toBeNull()
  })
})

describe('deepElementFromPoint', () => {
  it('returns null when document.elementFromPoint is unavailable', () => {
    installDom()
    expect(deepElementFromPoint(0, 0)).toBeNull()
  })
})
