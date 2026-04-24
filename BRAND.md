# AUTOMASH — Design System Handoff

Canonical tokens + guidance for `automash.xyz`. Source of truth is this document + the accompanying files in `/handoff`. Values match the product's current CSS so nothing visual changes on import — this just formalizes what's already there and fills in the gaps for brand surfaces (logo, OG, favicon, merch, docs).

---

## 1 · Identity

**Name** — `AUTOMASH` (always one word, all caps) in product chrome; `automash.xyz` in URL lockups. Never "Auto Mash", "Automash", or "AutoMash".

**Primary tagline** — `BACK AND FORTH FOREVER`. Always paired with the mark (under the wordmark in the lockup, under the glyph on the mark tile). IBM Plex Mono 700, tracked `0.28–0.32em`, ink `#111`.

**Secondary tagline** — `MILLENNIAL CRINGE MASHUP SLOP`. Subtitle only, lower weight/opacity. Never used alone.

**Mark** — The `))<>((` glyph is a Miranda July / "Me and You and Everyone We Know" reference — "back and forth forever." Set in Arial Black 900, letter-spacing `-2`, ink `#111` on panel olive. Renders as a typographic glyph (not an SVG illustration) so it can be pasted into chat, email signatures, terminal output.

**Voice** — not prescribed here. Write it however you want. This doc covers the visual system only.

---

## 2 · Logo system

Six approved forms. Source SVGs in `/handoff/logo/`.

| File | Use |
|---|---|
| `logo-primary.svg` | Primary lockup — mark + wordmark on panel olive. Site header, docs, press. |

| `logo-mark.svg` | The `))<>((` glyph on a panel tile. App icon, favicon, loading spinner. |


### Clear space
Minimum clear space around any logo = **1× the cap height of the wordmark** ("A"). Don't crowd; the console panel is part of the mark.

### Minimum sizes
- Primary lockup: **140px wide** (digital) · 28mm (print)
- Mark alone: **24px**
- Monogram: **32px** (CRT glow drops below this — switch to solid green)

### Don'ts
- Don't recolor the wordmark outside the approved palette.
- Don't skew, outline, or add drop shadows beyond the built-in engraved text-shadow (`0 1px 0 rgba(255,255,255,0.12)`).
- Don't render the wordmark in any font other than Arial Black.
- Don't put the wordmark over photography — always on panel olive or control black.

---

## 3 · Color tokens

All tokens already live in `src/app/globals.css` `:root`. Keep as the source of truth. The table below names the semantic roles we apply them to for brand surfaces.

### Panel — the olive/putty chassis

| Token | Hex | Role |
|---|---|---|
| `--panel-light` | `#a8a392` | Panel top gradient · hover states on panel chrome |
| `--panel-base` | `#9c9786` | **Canvas color.** Default background for brand assets (OG, deck slides, print). |
| `--panel-dark` | `#8c8776` | Panel bottom gradient · inset zone fills |
| `--panel-shadow` | `#6b6758` | Deep shadow wells |
| `--engrave-dark` | `#5a5648` | Engraved border (top/left) · hairline dividers |
| `--engrave-light` | `#b0ab9b` | Engraved border (bottom/right) |

### Control — knobs, buttons, bezels

| Token | Hex | Role |
|---|---|---|
| `--text-dark` | `#111111` | **Primary ink.** All engraved labels, wordmark on panel. |
| `--control-face` | `#262626` | Knob faces, input fills |
| `--control-base` | `#333333` | Button base, rocker switches |
| `--screen-bezel` | `#222222` | Display bezel surrounding CRT |

### CRT — the display

| Token | Hex | Role |
|---|---|---|
| `--crt-bg` | `#1e2e1a` | CRT screen background |
| `--crt-grid` | `#2c4225` | CRT grid lines |
| `--crt-dim` | `#4a822c` | CRT secondary text, phosphor bleed |
| `--crt-bright` | `#75cc46` | **CRT primary text.** Active readouts, timestamps. |

### Indicators — LEDs

| Token | Hex | Role |
|---|---|---|
| `--led-green-on` | `#75cc46` | Status: ready / loaded (same as CRT bright) |
| `--led-orange` | `#FF7300` | **Accent.** Knob indicators, `.xyz` TLD in URL, attention, warnings. Use sparingly — never as a fill. |
| `--led-red-on` | `#c92a2a` | Record-armed, destructive action |

### Usage rules
- **90% of brand surface = panel olive + ink.** Panel base is the paper; ink is the type.
- **CRT green is strictly inside a display bezel.** Don't use `#75cc46` as body text on panel — it vibrates badly against olive. The `.display-bezel` wrapper is required.
- **Amber is a single-pixel accent.** Knob indicator dots, the `.xyz` in the URL lockup, a single warning word. Never a button fill, never a background.
- **Never use pure white.** Panel light `#a8a392` is the lightest value on brand.

---


---

## 5 · Elevation & materials

The product is a physical object. Four elevation levels — match them in any new surface.

1. **Panel** — the chassis. `console` class. Box-shadow: top-down gradient + inset highlight + drop shadow.
2. **Inset zone** — pressed-in areas. `zone-inset` class. Darker panel tone, inset shadow.
3. **Engraved zone** — outlined areas. `zone-engraved` class. Dual-border bevel (dark top/left, light bottom/right).
4. **Bezel** — surrounds a screen. `display-bezel` class. Darkest, almost black.

Within a bezel sits a CRT (`crt` class) with scanlines and a slow VHS tracking line. Don't omit the scanlines — they're the product's signature.

---

## 6 · Iconography

2px strokes, square terminals, solid ink fills. 32px canvas. Always drawn in `--text-dark`. Never outlined in green or amber.

Core set (see `/handoff/icons/`):

`load · play · stop · rec · mash · key · bpm · eject · export · loop · seek · random`

New icons should:
- Sit on a 32px grid with 2px padding
- Use 2px strokes, miter joins, square caps
- Prefer solid fills over outlines when the glyph is unambiguous (play = filled triangle, rec = filled red circle)

---

## 7 · Motion

The product is slowed-and-reverbed. Motion follows.

- **Easing** — `cubic-bezier(.22, 1, .36, 1)` for everything except hardware-feedback events.
- **Hardware feedback** (button press) — `ease, 60ms` — should feel instant.
- **Boot sequence** — the staggered `bootUp` animation. Don't skip it. Sections reveal on `0.05s / 0.15s / 0.3s / 0.45s / 0.6s`.
- **LEDs breathe**, not blink. `ledBreathe` 2s infinite.
- **CRT text pulses** with `phosphorPulse` 3.5s infinite.
- **VHS tracking line** sweeps every 7s. It's a vibe feature — never slower than 5s, never faster than 10s.

---

## 8 · Brand surfaces — where we appear

- **Favicon / app icon** — `))<>((` glyph on panel-olive tile. 512/180/32/16.
- **Open Graph** — console-framed display reading the positioning line. 1312×940 (already the repo's dimension).
- **Social avatar** — `))<>((` glyph on panel-olive tile, no tagline at small sizes.
- **Docs / README** — panel olive background, engraved labels, wordmark lockup at top.
- **Press kit** — this document + `/handoff/logo/` SVGs + `/handoff/tokens/` exports.

---

## 9 · File index (handoff/)

```
handoff/
  BRAND.md                      ← this document
  tokens/
    colors.css                  ← copy-paste over globals.css :root colors
    colors.json                 ← design-tool import (Figma / Style Dictionary)
    tailwind.colors.ts          ← tailwind.config.ts `theme.extend.colors.dw`
  logo/
    logo-primary.svg

    logo-mark.svg
   
  README.md                     ← how to use this folder
```

All SVGs are set in Arial Black — system-available, renders identically without any web font loaded.

---

## 10 · Quick-start for Claude Code

Prompts you can paste into Claude Code to apply this system:

> "Read `handoff/BRAND.md` and `handoff/tokens/colors.css`. Update `src/app/globals.css` so the `:root` block matches `handoff/tokens/colors.css` exactly. Do not touch other rules."

> "Add `handoff/logo/logo-primary.svg` as `public/logo.svg`. Replace the inline wordmark in `SceneLanding.tsx` header with `<img src="/logo.svg" alt="AUTOMASH" />` and remove the hand-rolled square-icon + span next to it."

> "Create `src/app/press/page.tsx` — a brand press page that renders the logos from `public/brand/*.svg`, the color palette from the CSS vars, and the type specimen. Use the `.console`, `.zone-inset`, and `.display-bezel` classes from `globals.css`."

> "Add an OG image route at `src/app/opengraph-image.tsx` using `next/og` that renders the positioning line on a console panel. Dimensions 1312×940. Arial Black for display + IBM Plex Mono for tech. Use the CSS tokens in `handoff/tokens/colors.css`."
