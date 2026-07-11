---
name: Planivo
description: Calm, precise scheduling for sports facilities — a control room, not an ERP.
colors:
  forest-pine: "#2f6f4f"
  pine-deep: "#285f43"
  spring-pine: "#4caf7d"
  slate-ink: "#1f2430"
  slate-raised: "#2a3040"
  slate-line: "#3b4252"
  graphite: "#4b5563"
  muted-gray: "#6b7280"
  border-gray: "#d1d5db"
  hairline: "#e5e7eb"
  panel-gray: "#eef0f3"
  app-bg: "#f4f5f7"
  surface: "#ffffff"
  success-green: "#166534"
  success-tint: "#dcfce7"
  warning-amber: "#d97706"
  warning-tint: "#fef3c7"
  danger-red: "#b91c1c"
  danger-tint: "#fee2e2"
  shift-fixed-blue: "#3b82f6"
  shift-single-amber: "#f59e0b"
  substitution-violet: "#8b5cf6"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "normal"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
  xl: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.forest-pine}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.pine-deep}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "{colors.hairline}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-danger:
    backgroundColor: "{colors.danger-red}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  sidebar-link-active:
    backgroundColor: "{colors.slate-ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
---

# Design System: Planivo

## 1. Overview

**Creative North Star: "The Calm Control Room"**

Planivo is the room a shift manager walks into every morning to see the whole day at a glance — coverage, requests, gaps — without a single thing shouting at them. The interface behaves like a well-run operations desk: dark slate rails hold the navigation steady while the work happens on a quiet gray field, and a single deep green means *go, confirmed, covered*. Colour is spent, never sprinkled: status hues (amber, red, blue, violet) appear only where the eye must be pulled, and the rest of the surface stays deliberately calm. This is the visual form of the product's core promise — *la calma è una funzionalità* — the software has already taken the situation in hand, and the screen should feel like proof of that.

Underneath the calm is exactness. This is also a **ledger**: hours, coverage counts and costs are rendered with an accountant's precision, in tabular numerals and honest labels, because real staffing decisions ride on them. The density is that of a professional tool used all day by non-technical staff at a pool or gym — legibility and clarity outrank elegance every time. Type is small, plain and system-native; hierarchy comes from weight and grouping, not from decoration.

The system explicitly rejects two neighbours. It is **not a heavy enterprise ERP** — no gray-on-gray field-forests, no learning cliff, no chrome for chrome's sake. And it is **not a bare spreadsheet or admin dump** — every surface is composed, grouped and given breathing room, never a raw table pushed to the edges. Planivo sits precisely between them: specific, composed, and quiet.

**Key Characteristics:**
- Slate-and-green control-room palette; status colour spent sparingly and meaningfully.
- Flat surfaces with a soft, deliberate elevation scale — lift signals interaction, not decoration.
- System-native typography, small and exact, hierarchy through weight and grouping.
- Tabular precision for anything numeric (hours, coverage, counts).
- Calm and confident components: modest radii, solid fills, unambiguous states.

## 2. Colors

A slate-and-pine control-room palette on a cool neutral field, with a tightly-rationed set of status hues that only ever appear to carry meaning.

### Primary
- **Forest Pine** (`#2f6f4f`): The single action and confirmation colour. Primary buttons, active segmented controls, selected weekday chips, links, "covered" indicators. It means *go / confirmed / covered* and nothing else.
- **Pine Deep** (`#285f43`): The pressed/hover state of Forest Pine. Only ever the darker echo of an action already in Forest Pine.
- **Spring Pine** (`#4caf7d`): A brighter green reserved for the active-navigation marker in the dark sidebar, where Forest Pine would read too dim against slate.

### Secondary
- **Slate Ink** (`#1f2430`): The structural dark. Sidebar, topbar, and all primary body text. It is the room's walls — steady, quiet, always present.
- **Slate Raised** (`#2a3040`) & **Slate Line** (`#3b4252`): Controls and hairlines *within* the dark sidebar (the sede selector, its border). Depth on dark comes from these tonal steps, not shadow.

### Tertiary — Status taxonomy
A small, fixed vocabulary. Each hue owns one meaning and is never used decoratively.
- **Warning Amber** (`#d97706`, tint `#fef3c7`): Attention/pending — under-coverage warnings, demo banner, stat alerts (`#b45309`).
- **Danger Red** (`#b91c1c`, tint `#fee2e2`): Errors and destructive actions only.
- **Success Green** (`#166534`, tint `#dcfce7`): Confirmation text and success surfaces (distinct from Forest Pine, which is for *actions*).
- **Calendar taxonomy** — the signature legend that colour-codes shift and course types on the grid: **Fixed Blue** (`#3b82f6`) recurring shifts/courses, **Single Amber** (`#f59e0b`) one-off occurrences, **Substitution Violet** (`#8b5cf6`) open substitutions ("Sostituzioni"). These three are a closed set with a fixed legend; do not repurpose them elsewhere.

### Neutral
- **Graphite** (`#4b5563`) & **Muted Gray** (`#6b7280`): Secondary and tertiary text. Muted Gray is the workhorse for labels, hints and metadata — keep it off tinted backgrounds where it drops below 4.5:1.
- **Border Gray** (`#d1d5db`): Input and control strokes.
- **Hairline** (`#e5e7eb`): Table rules, dividers, secondary-button fill.
- **Panel Gray** (`#eef0f3`): The tonal panel — the staffing row's background, distinguishing a planning layer from the shift grid beneath it.
- **App BG** (`#f4f5f7`): The cool neutral field every screen sits on.
- **Surface** (`#ffffff`): Cards, modals, inputs, the calendar itself.

### Named Rules
**The One Green Rule.** Forest Pine means *action or confirmation*, full stop. If green is on the screen for any other reason — decoration, "brand feel", a splash of colour — remove it. Its scarcity is what makes it read as a signal.

**The Rationed Status Rule.** Amber, Red, Blue and Violet each carry exactly one meaning and appear only to carry it. A screen with no problems is a screen with no amber and no red. Calm is the default state, not a styling choice.

## 3. Typography

**Display / Body / Label Font:** the native system stack — `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`. One family throughout; hierarchy is built from weight and size, never from a second typeface.
**Mono Font:** `'SF Mono', Consolas, monospace` — reserved for machine values (access codes, the `.code` block).

**Character:** Deliberately invisible. System-native type reads as *tool*, not *brand statement* — it renders instantly, matches the user's OS, and never competes with the data. Personality is carried by colour and composition, not by the letterforms.

### Hierarchy
- **Display** (700, 28px, 1.2): Big numbers only — stat-card values, the figures a manager scans first. Pair with tabular numerals.
- **Headline** (700, 22px, 1.25): Page titles (`h1`). One per screen.
- **Title** (600, 16–17px, 1.3): Section and modal headers, card titles.
- **Body** (400, 14px, 1.5): The default — table cells, form values, paragraphs, inputs. Cap prose at 65–75ch.
- **Label** (600, 13px, 1.3): Form field labels, the workhorse UI weight.
- **Micro / Caption** (600, 11–12px, uppercase, letter-spacing 0.05em): Overline labels in low-chrome zones — sidebar "SEDE" selector, the staffing-row corner. This is the *one* sanctioned use of tracked uppercase; it is a structural label inside a utility strip, not a decorative eyebrow above content sections.

### Named Rules
**The One Family Rule.** Never introduce a second typeface. If a heading needs to feel different, change weight (700) or size, not font. Two similar sans-serifs is worse than one.

**The Tabular Numbers Rule.** Any figure that will be scanned or compared — hours, coverage counts, costs — uses tabular (monospaced) numerals so columns align and digits don't jitter between values. Precision you can see is precision you trust.

## 4. Elevation

Soft-layered. Surfaces are flat at rest and depth is mostly tonal — the slate sidebar, the Panel Gray staffing strip, and white cards on the App BG field establish planes without a single shadow. On top of that tonal base sits a small, deliberate three-step shadow scale where lift is *earned*: a card rests, a hovered element rises, an overlay floats clearly above the page. Shadow is a response to interaction and stacking, never a default decoration. If a surface has a shadow, it's because it either invites a click or sits above the plane it covers.

Audit test: if two resting cards have different shadows for no interactive reason, the elevation is doing decoration's job — flatten them.

### Shadow Vocabulary
- **Rest** (`box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08)`): The whisper under cards and stat tiles at rest. Barely there — it lifts white off the gray field, no more.
- **Raised** (`box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12)`): Hover/active lift for interactive cards and popovers (notification panel).
- **Overlay** (`box-shadow: 0 12px 32px rgba(15, 23, 42, 0.28)`): Modals and dialogs — a clear, cool-tinted float above the dimmed backdrop (`rgba(0,0,0,0.4)`).

### Named Rules
**The Earned-Lift Rule.** Elevation escalates with interaction and stacking only: Rest → Raised (hover) → Overlay (modal). A surface never jumps a level for looks. Flat is the resting state of everything.

## 5. Components

Calm and confident: modest radii, solid fills, generous-enough padding, and states that are never ambiguous. Nothing is tactile-flashy; everything is legible and sure of itself.

### Buttons
- **Shape:** Gently rounded (6px, `{rounded.md}`).
- **Primary:** Forest Pine fill, white text, `10px 16px` padding. The one confirming action per context.
- **Hover:** Darken to Pine Deep (`#285f43`); transitions ~150ms ease-out.
- **Secondary:** Hairline fill (`#e5e7eb`) with Slate Ink text — quiet, for cancel/back and non-committal actions.
- **Danger:** Danger Red fill (`#b91c1c`), white text — destructive actions only, typically pushed to the far edge of a modal action row (`margin-right: auto`).
- **Link button:** Forest Pine text/fill for inline navigational actions.

### Segmented Control
- **Shape:** A single 6px pill, `1px` Border Gray outline, hairline dividers between segments, `overflow: hidden`.
- **State:** Inactive segments are white with Slate Ink text; the active segment is a Forest Pine fill with white text. This is the canonical multi-view switcher (calendar views, weekday pickers).

### Cards / Containers
- **Corner Style:** 10px (`{rounded.lg}`).
- **Background:** Surface white on the App BG field.
- **Shadow Strategy:** Rest shadow at rest (see Elevation); never nested.
- **Border:** None by default — the shadow and the field contrast do the separating. A `1px` Forest Pine border marks a success/confirmed card.
- **Internal Padding:** 24px (`{spacing.xl}`); 16–20px for denser stat cards.

### Inputs / Fields
- **Style:** White fill, `1px` Border Gray stroke, 6px radius, `10px 12px` padding, 14px body text. Labels sit above in 13px/600.
- **Focus:** A visible Forest Pine focus ring is **required and currently missing** — see Do's & Don'ts. Target: `outline: 2px solid #2f6f4f; outline-offset: 2px`, or the equivalent `0 0 0 3px rgba(47,111,79,0.35)` glow (the value the tour ring already uses).
- **Textarea:** Same treatment, `resize: vertical`, inherits the family.

### Navigation (Sidebar)
- **Style:** A fixed 230px Slate Ink rail: brand block, sede selector, then vertical links. Links are Muted-to-light gray (`#d1d5db`), 14px, 6px radius.
- **States:** Hover lifts to `rgba(255,255,255,0.06)` and white text; **active** adds `rgba(255,255,255,0.1)` plus a Spring Pine (`#4caf7d`) left marker.
- **Mobile (≤900px):** The rail becomes a horizontal, scrollable top bar — every section stays reachable, no hamburger. The active marker moves from left border to bottom border.

### Badges & Chips
- **Badge:** Small 12px-radius pill, 12px text. Role variants: neutral (Slate Line on dark), admin (Success-ish green `#2f6f4f`/`#2f6f4f` family), warning (Warning tint + `#92400e` text).
- **Staffing chip:** A white status chip in the calendar's staffing row showing coverage per slot; colour-state currently carried by a left border (Forest Pine = covered, Amber = under-covered). **This left-stripe pattern is slated for migration** — see Don'ts.

### Signature Component — The Coverage Calendar
The heart of the app: a CSS-grid week view with a sticky time column and day columns. Shift/course blocks are absolutely positioned, colour-coded by the calendar taxonomy (Blue fixed / Amber single / Violet substitution), and laid out side-by-side when overlapping. Above the hour grid sits an optional **staffing row** on a Panel Gray band — a distinct *planning* layer (how many people are needed) kept visually separate from the *assignment* layer (the shift blocks) beneath it. A legend with colour dots keys the taxonomy. This component embodies the whole system: dense but calm, colour-coded but rationed, precise about what each layer means.

## 6. Do's and Don'ts

### Do:
- **Do** spend Forest Pine only on actions and confirmations (The One Green Rule). One primary action per context.
- **Do** keep status colour rationed — amber, red, blue and violet each mean one thing; a problem-free screen has none of them.
- **Do** render hours, coverage and cost figures in tabular numerals so columns align and values are trustworthy.
- **Do** give every interactive element a visible `:focus-visible` ring — 2px Forest Pine with a 2px offset (or the `0 0 0 3px rgba(47,111,79,0.35)` glow). The app currently ships **no** focus states; this is required for the WCAG 2.1 AA target.
- **Do** verify Muted Gray (`#6b7280`) text clears 4.5:1 against its background; on tinted panels bump toward Graphite (`#4b5563`) or Slate Ink.
- **Do** keep depth tonal first (slate rail, Panel Gray strips, white cards); reach for a shadow only when a surface is hovered, floating, or a modal.
- **Do** provide a `prefers-reduced-motion` alternative (crossfade or instant) for every transition and the tour/overlay animations.

### Don't:
- **Don't** build like a **heavy enterprise ERP**: no gray-on-gray field-forests, no dozen-input screens, no chrome without a job. Planivo is explicitly the alternative to that.
- **Don't** let a screen decay into a **bare spreadsheet or admin dump** — raw edge-to-edge tables with no grouping, hierarchy or breathing room. Compose every surface.
- **Don't** use a `border-left`/`border-right` greater than 1px as a coloured status stripe on chips, cards, callouts or alerts. The current `.staffing-chip` uses a 4px left stripe for coverage state — **migrate it** to a full tinted background (Success/Warning tint) with a leading status dot or icon. (The 3px sidebar active-marker is the one sanctioned exception: it's a navigation affordance, not a status stripe.)
- **Don't** introduce a second typeface or a display/brand font. One system family, hierarchy by weight.
- **Don't** add gradient text (`background-clip: text`), decorative glassmorphism, hero-metric templates, or identical icon-card grids — the standard AI-slop tells.
- **Don't** put a tracked-uppercase eyebrow above content sections. The only sanctioned tracked-uppercase is the 11px structural label inside utility strips (sidebar "SEDE", staffing corner).
- **Don't** repurpose the calendar taxonomy hues (Blue/Amber/Violet) for anything outside the shift/course legend — it breaks a learned code.
