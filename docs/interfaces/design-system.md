# Design System — Locked Interface

**Status:** locked at module-interface depth review. Version to be assigned at PR merge.

**Version:**

**Module priority:** Foundation (consumed by all iOS reskin work after DS-1).

## Responsibility

The Writer OS design system is the single visual contract for iOS screens. It owns the
canonical tokens, state grammar, motion helper, and SwiftUI primitives used to compose app
surfaces. Screens must use this module instead of ad-hoc colors, fonts, spacing, rules,
navigation, or state treatments.

## Token Contract

Light tone defines exactly these colors. New colors require a paired PR amending this
document and the primitive implementation.

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

Night tone defines exactly these colors. Night tone must be selected by trait/tone, not by
call-site color substitution.

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

Color semantics are fixed:

| Token | Meaning | Usage |
|---|---|---|
| `--active` | Current work / primary focus | active item dot, active label, urgent but non-alarming state |
| `--ready` | Settled / reviewed / safe to proceed | completed state, next-ready indicator |
| `--source` | Source / reference material | citations, excerpts, raw material markers |
| `--open` | Unresolved question / tension | live question, uncertainty, conceptual pressure |
| `--ink-3` | Quiet metadata | dates, labels, inactive navigation |

Typography is the main design material. Serif is for prose, page titles, prompts, and
article excerpts. Mono is for metadata, navigation, state labels, timestamps, and indexes.

| Role | Size | Line Height | Weight | Notes |
|---|---:|---:|---:|---|
| Page title | 43-48px | 0.92 | 500 | Use for screen-level concepts only |
| Section heading | 28px | 1.03 | 500 | Article/source section headings |
| Row title | 19px | 1.12 | 500 | Quiet list items |
| Primary question | 25-26px | 1.17 | 400 | One per Today page |
| Body | 16px | 1.45 | 400 | Main reading text |
| Supporting body | 14.5px | 1.35-1.45 | 400 | Row descriptions |
| Metadata | 9-10px | 1.0-1.55 | 700-800 | Mono, uppercase, tracked |

Typography rules are contractual:

- Do not use negative letter spacing.
- Do not scale font size fluidly with viewport width inside the mobile app surface.
- Keep metadata uppercase and tracked, but short.
- Avoid overusing bold; hierarchy should come from scale, rule weight, and placement.
- Treat large type as expensive. If everything is large, nothing is quiet.

The mobile shell defines these fixed layout values:

- narrow left rail: `54-70px`
- content measure: approximately `290px`
- bottom navigation: `72px`
- top chrome: `42px`

Current prototype values are contractual for the iOS primitive:

```css
.view {
  padding: 20px 26px 26px 70px;
}

.measure {
  max-width: 290px;
}
```

The spacing scale is fixed:

| Token | Value | Use |
|---|---:|---|
| `space-1` | 5px | tight label/title relationships |
| `space-2` | 10px | metadata group spacing |
| `space-3` | 15-16px | row padding |
| `space-4` | 18-20px | section rhythm |
| `space-5` | 26-28px | primary blocks |
| `space-6` | 32-38px | major screen separation |
| `space-7` | 44px+ | desktop board sections |

Rule weights are fixed:

- Use `1px` rules almost everywhere.
- Use `var(--ink)` rule color only for major conceptual boundaries.
- Use `var(--hairline)` for normal separation.
- Use `var(--hairline-2)` for subtle nav and background rail lines.

## Primitive Specs

### Tokens

Responsibility: expose the canonical colors, typography roles, spacing values, rule
weights, state mapping, and reduced-motion-aware fade helper.

Required inputs: color accessors take no caller-supplied palette; typography factories take
only the documented role size when a role supports a range; `WriterFade` takes visibility.

Visual constraints: colors resolve from light/night tone traits; font factories expose serif
and mono roles; spacing constants mirror the table above; rule weights map to ink,
hairline, and hairline-2.

Must not: expose arbitrary color construction, arbitrary font families, or motion beyond the
allowed fade/settle behavior.

### PageShell

Responsibility: provide the full-screen page container that establishes Writer OS mobile
surface padding and bottom-nav safe area.

Required inputs: content view, optional bottom navigation view.

Visual constraints: 70pt left rail, 26pt right padding, 20pt top padding, 26pt bottom
padding before safe-area inset, page background, and approximately 290pt readable measure.

Must not: add cards, chrome, icons, or screen-specific layout decisions.

### PageRail

Responsibility: render the narrow left margin rail and optional vertical page mark.

Required inputs: optional vertical page mark string.

Visual constraints: 54-70pt rail area, hairline-2 vertical rule, mono uppercase vertical
mark at 9pt with 0.15em tracking, ink-3 color.

Must not: render navigation, icons, actions, or decorative marks outside the margin system.

### Hairline

Responsibility: render a one-point rule in the requested rule weight.

Required inputs: `RuleWeight`; optional axis.

Visual constraints: 1pt thickness; ink for major boundaries, hairline for normal
separation, hairline-2 for subtle nav/background lines.

Must not: render thick dividers, shadows, gradients, or colored decorative rules.

### StateDot

Responsibility: annotate state with the small dot specified by the state grammar.

Required inputs: `WriterState`.

Visual constraints: 6pt by 6pt circle; color resolves from `WriterState`.

Must not: communicate state by color alone when used in composed primitives.

### StateLabel

Responsibility: render the textual half of the state grammar.

Required inputs: label string and optional `WriterState`.

Visual constraints: mono uppercase, 9pt, weight 800, 0.12em tracking, state color when
provided and ink-3 otherwise.

Must not: use sentence case, icons, badges, pills, or long operational labels.

### QuietRow

Responsibility: render a measured row for active signals, blockers, next work, and brief
article/source state.

Required inputs: `WriterState`, state label, row title, one-sentence body.

Visual constraints: StateDot at the left margin, StateLabel above the title, row title at
19pt serif, body at 14.5pt serif, 15pt vertical padding, hairline bottom rule.

Must not: become a card, checklist row, chat bubble, or container for controls unless a
future contract adds a clear user action slot.

### PrimaryQuestion

Responsibility: carry the one live thought that should dominate a screen.

Required inputs: question string.

Visual constraints: serif 25-26pt, line-height approximately 1.17, 26pt top and 28pt
bottom padding, bounded by top and bottom ink rules.

Must not: render icons, assistant attribution, multiple questions, truncation, or secondary
actions.

### WorkIndex

Responsibility: render Desk-mode work as a numbered reading order.

Required inputs: ordered items, each with text and a short state mark/state.

Visual constraints: ink top rule, hairline row rules, 38pt numeral column, mono 10pt
tracked numerals, 14.5pt serif item text.

Must not: render checkboxes, task completion controls, drag handles, or dashboard widgets.

### DocumentWeather

Responsibility: summarize article/source condition as terse label/value cells.

Required inputs: cells with label, value, and optional `WriterState`.

Visual constraints: horizontal strip with hairline top/bottom and inner separators, cells at
least 58pt high, labels mono uppercase 9pt, values 13pt serif.

Must not: show KPIs, progress percentages, scores, charts, or management panels.

### SourceNote

Responsibility: render source excerpts as cited marginalia.

Required inputs: source label, serif quote text, one-line context.

Visual constraints: 19pt vertical padding, top hairline rule, source label as StateLabel in
source state, quote at 21pt serif, context at 13.5pt serif.

Must not: become a file list, upload inbox, card, checkbox row, or generic source manager.

### SystemSpecRow

Responsibility: render System-page settings and read-only implementation facts as measured
label/title/body/value rows with an optional native control slot.

Required inputs: short mono label, serif title, one-sentence body, optional terse value, and
optional control content.

Visual constraints: label uses StateLabel grammar; title uses row-title serif; body uses
supporting serif; value uses mono metadata; row padding follows space-3; each row ends with
a hairline rule.

Must not: become a card, dashboard metric, generic form section, icon row, segmented
control, or container for unrelated actions.

### BottomNav

Responsibility: render the app navigation as a six-tab bottom text rail.

Required inputs: up to six tab labels, active tab, selection callback.

Visual constraints: 72pt minimum height, equal-width tabs, mono uppercase 9pt, hairline top
rule, hairline-2 separators, active tab uses page-muted fill and ink text.

Must not: render icons, floating buttons, colorful selected states, or more than six tabs.

### ModeSwitch

Responsibility: render the Walk / Desk toggle.

Required inputs: selected mode and selection callback.

Visual constraints: two equal-width segments, 42pt minimum height, mono uppercase 9pt,
hairline top/bottom, hairline inner separator, active segment uses page-muted fill and ink
text.

Must not: add icons, extra modes, pill styling, or animated toggles beyond `WriterFade`.

## State Grammar Contract

`WriterState` has exactly these cases:

| State | Contract |
|---|---|
| `active` | Current work / primary focus. |
| `ready` | Settled / reviewed / safe to proceed. |
| `source` | Source / reference material. |
| `open` | Unresolved question / tension. |
| `inactive` | Quiet inactive metadata state. |

Do not name states by color.

## Acceptance Checklist

Every reskin PR runs against this checklist before merge.

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

## Out Of Scope

- Motion beyond the specified 220ms opacity fade and slight vertical settle.
- Asset catalogs for SF Symbols.
- Icons or image assets.
- Web port.
- Reskinning existing iOS screens in DS-1.
