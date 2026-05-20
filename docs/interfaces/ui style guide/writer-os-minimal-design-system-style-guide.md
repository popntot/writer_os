# Writer OS Minimal Design System Style Guide

Version: 0.1  
Source prototype: `writer-os-ui-minimal.html`  
Primary direction: severe editorial minimalism for a serious writing instrument

---

## 1. Design Thesis

Writer OS should feel like a composed editorial instrument, not a productivity dashboard, AI chat surface, or decorative notebook app.

The interface should be:

- **Severe, quiet, almost invisible.** The design gets its personality through restraint.
- **Reading-first.** The primary unit is a composed page of thought, not a card, feed, chat bubble, or widget.
- **Editorial, not cozy.** Use literary typography, hairline rules, and measured spacing rather than faux paper, handwriting, or nostalgic texture.
- **AI-invisible.** The intelligence is implied by prioritization: what is shown, hidden, sequenced, and named.
- **Almost static.** Motion should feel like a page settling, not a product performing.

### Anti-Patterns

Do not make Writer OS feel like:

- AI SaaS: glowing gradients, purple/blue sheen, assistant avatars, chat-first composition.
- A project dashboard: KPIs, widget grids, dense management panels, task-board aesthetics.
- A precious journal: faux handwriting, torn paper, stickers, heavy textures, sentimental notebook cues.
- A generic mobile app: rounded card stacks, pill-heavy controls, overly familiar startup UI.

---

## 2. Visual Language

### Core Metaphor

The app is a **quiet editorial page** with a narrow margin system. It should feel closer to a carefully typeset essay draft than a workspace dashboard.

### Primary Surfaces

Use:

- pages
- hairline rules
- measured rows
- excerpts
- small state dots
- document-weather strips
- narrow margin labels

Avoid:

- stacked cards
- floating panels
- chat bubbles
- heavy controls
- decorative frames

### Layout Personality

The layout should preserve meaningful blank space. Silence is part of the interface.

Use asymmetry lightly:

- a narrow left margin rail
- vertical page mark
- one dominant content measure
- large type only for true page-level ideas

---

## 3. Design Tokens

These tokens are the current canonical palette from the prototype.

```css
:root {
  --ground: #fbfaf6;
  --page: #fffffb;
  --page-muted: #f4f1e8;

  --ink: #171512;
  --ink-2: #49443b;
  --ink-3: #858072;

  --hairline: #d9d3c5;
  --hairline-2: #ece7db;

  --active: #7d3b25;
  --ready: #50684e;
  --source: #3c6672;
  --open: #9a741c;

  --shadow: rgba(42, 34, 22, 0.08);

  --serif: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  --mono: "SF Mono", "IBM Plex Mono", "JetBrains Mono", Menlo, monospace;
}
```

### Night Mode Tokens

```css
:root[data-tone="night"] {
  --ground: #11110f;
  --page: #191916;
  --page-muted: #202018;

  --ink: #f3ecdc;
  --ink-2: #cfc4ac;
  --ink-3: #8f856f;

  --hairline: #454131;
  --hairline-2: #2d2b22;

  --active: #cc8063;
  --ready: #aab894;
  --source: #9bbbc2;
  --open: #d0ab4a;

  --shadow: rgba(0, 0, 0, 0.24);
}
```

### Color Semantics

Use color sparingly. Color should never decorate; it should clarify state.

| Token | Meaning | Usage |
|---|---|---|
| `--active` | Current work / primary focus | active item dot, active label, urgent but non-alarming state |
| `--ready` | Settled / reviewed / safe to proceed | completed state, next-ready indicator |
| `--source` | Source / reference material | citations, excerpts, raw material markers |
| `--open` | Unresolved question / tension | live question, uncertainty, conceptual pressure |
| `--ink-3` | Quiet metadata | dates, labels, inactive navigation |

---

## 4. Typography

Typography is the main design material.

### Font Roles

- **Serif:** prose, page titles, prompts, article excerpts.
- **Mono:** metadata, navigation, state labels, timestamps, indexes.

### Type Scale

Recommended mobile scale:

| Role | Size | Line Height | Weight | Notes |
|---|---:|---:|---:|---|
| Page title | 43-48px | 0.92 | 500 | Use for screen-level concepts only |
| Section heading | 28px | 1.03 | 500 | Article/source section headings |
| Row title | 19px | 1.12 | 500 | Quiet list items |
| Primary question | 25-26px | 1.17 | 400 | One per Today page |
| Body | 16px | 1.45 | 400 | Main reading text |
| Supporting body | 14.5px | 1.35-1.45 | 400 | Row descriptions |
| Metadata | 9-10px | 1.0-1.55 | 700-800 | Mono, uppercase, tracked |

### Typography Rules

- Do not use negative letter spacing.
- Do not scale font size fluidly with viewport width inside the mobile app surface.
- Keep metadata uppercase and tracked, but short.
- Avoid overusing bold; hierarchy should come from scale, rule weight, and placement.
- Treat large type as expensive. If everything is large, nothing is quiet.

---

## 5. Spacing And Layout

### Mobile Shell

The mobile surface uses:

- narrow left rail: `54-70px`
- content measure: approximately `290px`
- bottom navigation: `72px`
- top chrome: `42px`

Current prototype values:

```css
.view {
  padding: 20px 26px 26px 70px;
}

.measure {
  max-width: 290px;
}
```

### Spacing Scale

Use this practical scale:

| Token | Value | Use |
|---|---:|---|
| `space-1` | 5px | tight label/title relationships |
| `space-2` | 10px | metadata group spacing |
| `space-3` | 15-16px | row padding |
| `space-4` | 18-20px | section rhythm |
| `space-5` | 26-28px | primary blocks |
| `space-6` | 32-38px | major screen separation |
| `space-7` | 44px+ | desktop board sections |

### Rule Weights

- Use `1px` rules almost everywhere.
- Use `var(--ink)` rule color only for major conceptual boundaries.
- Use `var(--hairline)` for normal separation.
- Use `var(--hairline-2)` for subtle nav and background rail lines.

---

## 6. State Grammar

Writer OS state should feel annotated, not badged.

### State Dot

Use a small dot to indicate state in lists.

```css
.quiet-row::before {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
```

State color mapping:

- active: rust
- ready: green
- source: blue
- open: amber
- inactive: quiet gray

### State Label

Use mono uppercase labels:

```css
.state {
  font-family: var(--mono);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
```

Labels should be short:

- `Active`
- `Ready`
- `Source`
- `Open`
- `Captured`
- `Question`
- `Next`

Avoid:

- `Needs immediate action`
- `High priority`
- `AI recommended`
- `Task status pending`

---

## 7. Core Components

### Today Page

Purpose: orient the writer without turning the session into management.

Required elements:

- date lockup
- `Walk / Desk` mode switch
- page title
- one primary question or desk index
- three or fewer quiet signals

Walk mode:

- one question
- very low density
- no source queue
- no operational controls beyond navigation

Desk mode:

- short ordered work index
- still text-first
- no dashboard widgets

### Primary Question

Use for the one live thought that should carry a walk.

Rules:

- one per screen
- serif
- 25-26px on mobile
- bounded by top and bottom ink rules
- no icon
- no assistant attribution

### Quiet Row

Use for active signals, blockers, next work, and brief article/source state.

Structure:

- state dot
- state label
- row title
- one-sentence explanation

Do not add buttons inside quiet rows unless there is a clear user action.

### Work Index

Used in Desk mode for ordered work.

Structure:

- number
- sentence-length work item
- short state mark

The work index is not a task list. It is a reading order.

### Document Weather

Used to summarize article/source condition without creating a dashboard.

Example dimensions:

- Draft
- Voice
- Lineage
- Risk

Each weather cell should be terse: one label, one short value.

### Source Note

Used for source excerpts and raw material.

Structure:

- source label
- excerpt as serif quote
- one short contextual note

Raw material should feel like cited marginalia, not an inbox.

### System Page

Purpose: expose design/operating rules without leaving the app language.

Use it for:

- rules of restraint
- token/type examples
- state examples
- implementation notes

---

## 8. Navigation

Navigation is a bottom text rail.

Current nav:

- Today
- Walk
- Close
- Article
- Source
- System

Rules:

- mono uppercase
- six items maximum
- equal-width tabs
- active tab uses muted page fill, not a loud color
- no icons unless usability testing proves text-only is failing

Avoid:

- floating action buttons
- large bottom sheets
- icon-only controls
- colorful selected states

---

## 9. Motion

Motion principle: **a page settles. Nothing performs.**

Allowed:

- view opacity fade: `~220ms`
- slight vertical settle: `translateY(8px)` to `0`
- no bounce
- no spring
- no animated gradients

Current transition:

```css
.view {
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 220ms ease, transform 260ms ease;
}
```

Use motion only to preserve orientation. Never use motion as delight for its own sake.

---

## 10. Screen Patterns

### Walk Screen

The Walk screen should be the calmest surface.

It should include:

- timer
- one captured thought
- one minimal capture control

It should not include:

- transcript feed
- assistant replies
- source lists
- multi-step prompts
- dense controls

### Close Screen

The Close screen should feel like filing, not finishing.

It should include:

- captured note
- open question
- next page / next action

Language should avoid false completion. Good words:

- filed
- captured
- next
- open
- return

Avoid:

- completed
- resolved
- done
- optimized

### Article Screen

The Article screen should remain prose-led.

Use:

- article title
- lede
- document weather
- outline beats

Avoid:

- kanban stages
- progress percentages
- revision score
- AI critique panel

### Source Screen

The Source screen treats raw material as excerpts.

Use:

- source codes
- blockquotes
- short contextual notes

Avoid:

- generic file list
- upload/inbox UI
- checkboxes
- bulk management controls

---

## 11. Accessibility And Usability

### Contrast

Text should meet WCAG AA contrast in both light and night modes.

Special attention:

- `--ink-3` metadata is intentionally quiet; do not use it for essential body copy.
- state colors should never be the only indicator; pair color with text labels.

### Touch Targets

- Navigation tabs: minimum height `72px`.
- Mode buttons: minimum height `42px`.
- Avoid tiny icon-only controls.

### Text Fit

- Do not truncate primary questions.
- Do not force one-line labels if they need space.
- Keep nav labels short.
- Keep source and state labels compact.

### Reduced Motion

If implementing in production, respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 12. Implementation Notes

### Recommended Structure

Treat the design system as a small token/component layer:

- tokens: color, type, spacing, rule weights
- primitives: page, rail, rule, state label, state dot
- components: today page, quiet row, work index, document weather, source note
- screen compositions: Today, Walk, Close, Article, Source, System

### Component Naming

Suggested names:

- `PageShell`
- `PageRail`
- `PageMark`
- `BottomNav`
- `ModeSwitch`
- `PrimaryQuestion`
- `QuietRow`
- `WorkIndex`
- `DocumentWeather`
- `SourceNote`
- `FiledNote`
- `SystemSpecRow`

### State Names

Use semantic state names in code:

```ts
type WriterState = "active" | "ready" | "source" | "open" | "inactive";
```

Do not name states by color.

### Content Constraints

The design depends on disciplined copy.

Recommended limits:

- primary question: 1 sentence
- quiet row title: 3-7 words
- quiet row body: 1 sentence
- weather value: 1-2 words
- source note context: 1 sentence

---

## 13. Acceptance Checklist

Before shipping a screen, verify:

- The screen can be understood in under five seconds.
- The page has one dominant thought.
- The UI does not look like chat.
- The UI does not look like a dashboard.
- Color is only used for state.
- Body copy remains readable in light and night modes.
- State is communicated by text plus color, not color alone.
- The writer is not asked to manage more than the current surface needs.
- The screen still works if all decorative cues are removed.

---

## 14. Current Artifacts

- Visual prototype: `writer-os-ui-minimal.html`
- PDF export: `writer-os-ui-minimal.pdf`
- Earlier alternate direction: `writer-os-ui-prototype.html`

Use the minimal HTML prototype as the canonical visual reference. Use the earlier field-notebook prototype only as historical exploration.
