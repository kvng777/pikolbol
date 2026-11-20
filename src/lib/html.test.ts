import { describe, it, expect } from 'vitest'
import { escapeHtml } from './html'

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml(`<script>alert("x") & 'y'</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;'
    )
  })
  it('escapes ampersands first, once', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
  it('leaves plain text alone and coerces non-strings', () => {
    expect(escapeHtml('Booking S1')).toBe('Booking S1')
    expect(escapeHtml(12)).toBe('12')
  })
})
