import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Pikolbol — Book Your Pickleball Court'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  // Load Bebas Neue from Google Fonts (bold, condensed — perfect for sports branding)
  let fontData: ArrayBuffer | null = null
  try {
    fontData = await fetch(
      'https://fonts.gstatic.com/s/bebasnene/v14/JTUSjIg69CK48gW7PXooxW5rygbi49c.woff2'
    ).then((r) => r.arrayBuffer())
  } catch {
    // Falls back gracefully without the custom font
  }

  const fonts = fontData
    ? [{ name: 'Bebas Neue', data: fontData, style: 'normal' as const, weight: 400 as const }]
    : []

  const fontFamily = fontData ? '"Bebas Neue", sans-serif' : 'sans-serif'

  // ─── Court geometry ───────────────────────────────────────────────
  // Court rectangle: x=680, y=55, w=580, h=520
  // Court spans to x=1260 (60px bleed off right edge — intentional crop)
  // Net: y=315 (vertical center)
  // Kitchens: 83px from net → y=232 (upper) y=398 (lower)
  // Center line x: 680 + 290 = 970 (visible in service boxes only)

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          background: 'linear-gradient(145deg, #020d06 0%, #061b0e 50%, #0b2a18 100%)',
          position: 'relative',
          overflow: 'hidden',
          fontFamily,
        }}
      >
        {/* ── Atmospheric glow behind text ── */}
        <div
          style={{
            position: 'absolute',
            left: '-120px',
            top: '-80px',
            width: '760px',
            height: '760px',
            background:
              'radial-gradient(circle, rgba(16,185,129,0.09) 0%, transparent 65%)',
            display: 'flex',
          }}
        />

        {/* ── Court boundary rectangle ── */}
        <div
          style={{
            position: 'absolute',
            left: '680px',
            top: '55px',
            width: '580px',
            height: '520px',
            border: '2.5px solid rgba(16,185,129,0.32)',
            display: 'flex',
          }}
        />

        {/* ── Net line (horizontal center) ── */}
        <div
          style={{
            position: 'absolute',
            left: '680px',
            top: '315px',
            width: '580px',
            height: '2.5px',
            background: 'rgba(16,185,129,0.55)',
            display: 'flex',
          }}
        />

        {/* ── Net glow ── */}
        <div
          style={{
            position: 'absolute',
            left: '680px',
            top: '310px',
            width: '580px',
            height: '12px',
            background: 'rgba(16,185,129,0.06)',
            display: 'flex',
          }}
        />

        {/* ── Kitchen line — upper (83px above net) ── */}
        <div
          style={{
            position: 'absolute',
            left: '680px',
            top: '232px',
            width: '580px',
            height: '1.5px',
            background: 'rgba(16,185,129,0.22)',
            display: 'flex',
          }}
        />

        {/* ── Kitchen line — lower (83px below net) ── */}
        <div
          style={{
            position: 'absolute',
            left: '680px',
            top: '398px',
            width: '580px',
            height: '1.5px',
            background: 'rgba(16,185,129,0.22)',
            display: 'flex',
          }}
        />

        {/* ── Center line — upper service box ── */}
        <div
          style={{
            position: 'absolute',
            left: '969px',
            top: '55px',
            width: '1.5px',
            height: '177px',
            background: 'rgba(16,185,129,0.18)',
            display: 'flex',
          }}
        />

        {/* ── Center line — lower service box ── */}
        <div
          style={{
            position: 'absolute',
            left: '969px',
            top: '398px',
            width: '1.5px',
            height: '177px',
            background: 'rgba(16,185,129,0.18)',
            display: 'flex',
          }}
        />

        {/* ── Large ghost circle (pickleball) behind court ── */}
        <div
          style={{
            position: 'absolute',
            left: '740px',
            top: '-80px',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            border: '1.5px solid rgba(16,185,129,0.08)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '790px',
            top: '-30px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            border: '1px solid rgba(16,185,129,0.05)',
            display: 'flex',
          }}
        />

        {/* ── Right-side vignette to blend court into bg ── */}
        <div
          style={{
            position: 'absolute',
            right: '0px',
            top: '0px',
            width: '200px',
            height: '630px',
            background: 'linear-gradient(to right, transparent, rgba(2,13,6,0.6))',
            display: 'flex',
          }}
        />
        {/* ── Left fade over court edge ── */}
        <div
          style={{
            position: 'absolute',
            left: '600px',
            top: '0px',
            width: '160px',
            height: '630px',
            background: 'linear-gradient(to right, rgba(2,13,6,1), transparent)',
            display: 'flex',
            zIndex: 5,
          }}
        />

        {/* ══════════════════════════════════════
            LEFT CONTENT
        ══════════════════════════════════════ */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 80px',
            width: '660px',
            height: '630px',
            zIndex: 10,
          }}
        >
          {/* Badge row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '30px',
            }}
          >
            <div
              style={{
                width: '28px',
                height: '3px',
                background: '#10b981',
                borderRadius: '2px',
                display: 'flex',
              }}
            />
            <span
              style={{
                color: '#10b981',
                fontSize: '14px',
                letterSpacing: '6px',
                textTransform: 'uppercase',
              }}
            >
              Pickleball Court
            </span>
          </div>

          {/* Brand name — two-tone */}
          <div
            style={{
              display: 'flex',
              lineHeight: '0.87',
              marginBottom: '36px',
            }}
          >
            <span
              style={{
                fontSize: '148px',
                color: 'white',
                letterSpacing: '-1px',
              }}
            >
              PIKOL
            </span>
            <span
              style={{
                fontSize: '148px',
                color: '#10b981',
                letterSpacing: '-1px',
              }}
            >
              BOL
            </span>
          </div>

          {/* Decorative divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              marginBottom: '30px',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '1.5px',
                background: 'rgba(255,255,255,0.15)',
                display: 'flex',
              }}
            />
            <div
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                border: '2px solid rgba(16,185,129,0.7)',
                display: 'flex',
              }}
            />
            <div
              style={{
                width: '48px',
                height: '1.5px',
                background: 'rgba(255,255,255,0.15)',
                display: 'flex',
              }}
            />
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: '22px',
              color: 'rgba(255,255,255,0.45)',
              letterSpacing: '4px',
              textTransform: 'uppercase',
              marginBottom: '32px',
            }}
          >
            Book your court online
          </div>

          {/* CTA pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                padding: '11px 26px',
                background: '#10b981',
                borderRadius: '6px',
                color: 'white',
                fontSize: '17px',
                letterSpacing: '2.5px',
                textTransform: 'uppercase',
              }}
            >
              Reserve your slot
            </div>
            <span
              style={{
                color: 'rgba(255,255,255,0.25)',
                fontSize: '17px',
                letterSpacing: '2.5px',
                textTransform: 'uppercase',
              }}
            >
              Play today
            </span>
          </div>
        </div>

        {/* ── Bottom accent line ── */}
        <div
          style={{
            position: 'absolute',
            bottom: '0px',
            left: '0px',
            width: '1200px',
            height: '4px',
            background:
              'linear-gradient(90deg, #10b981 0%, #059669 40%, rgba(5,150,105,0.1) 100%)',
            display: 'flex',
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts,
    }
  )
}
