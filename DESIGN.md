---
name: Read with JEV
description: A quiet reading instrument for inspecting sentence signals in context.
colors:
  paper: "#f0eeea"
  panel: "#f7f5f1"
  ink: "#24303b"
  muted: "#616d77"
  rule: "#d5d2cc"
  accent: "#914528"
  tint: "#e9cdbd"
  focus: "#536a85"
  hover: "#e5e1db"
  primary-hover: "#3c4b59"
  insufficient: "#d7d5d0"
  pending: "#9eaeba"
  failed: "#bc7777"
  scored: "#c1c9c9"
  map-marked: "#c58b6c"
typography:
  display:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "42px"
    fontWeight: 400
    lineHeight: 1.16
    letterSpacing: "-.025em"
  body:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "21px"
    fontWeight: 400
    lineHeight: 1.95
  interface:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "15px"
    lineHeight: 1.6
  label:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "13px"
    fontWeight: 600
rounded:
  map: "1px"
  sentence: "2px"
  control: "4px"
  field: "5px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
    rounded: "{rounded.control}"
    padding: "11px 20px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: ".5rem .8rem"
  button-text:
    textColor: "{colors.ink}"
    rounded: "0"
    padding: "2px 0"
  paste-field:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "22px"
---

# Design System: Read with JEV

## Overview

**Creative North Star: "The reading instrument"**

This independent local prototype inherits the approved warm paper, serif reading column, quiet controls, sentence highlights, and whole-text navigation of `../read-with-jev`, without copying its licensed component kit. Preserve that visual world. This is a record of the implementation, not a new visual direction or a separate design comp.

The text leads; controls support inspection and keep uncertainty visible. Original passage text remains unchanged, and signals are described without an authorship verdict.

**Key Characteristics:**

- Warm paper and restrained rust accents.
- Spacious serif reading with compact sans-serif controls.
- Flat surfaces, quiet rules, and explicit analysis states.

Documentation evidence: `PRODUCT.md`, `public/index.html`, `public/style.css`, and `public/app.js`; reviewed desktop reading, mobile sentence-detail, and mobile map captures in `.impeccable/review/`. The reviewer reported three accessibility fixes resolved and a ship disposition at that fix scope. This does not validate detection or a participant pilot. Context and detector launchers returned permission denied during the workflow; their checks did not run, and no launcher repair was attempted.

## Colors

The normative palette above pairs warm paper and pale panels with blue-gray ink and a dark rust inspection accent.

- **Primary:** `accent` colors the threshold control and text-action hover; `tint` marks sentences above threshold. Primary action buttons use `ink` with `panel` text.
- **Neutral:** `paper` is the page and drawer background; `panel` is the paste and detail surface; `muted` carries secondary information; `rule` separates regions.
- **State:** map marks distinguish pending, insufficient, failed, scored, and above-threshold states with the corresponding tokens. Unscored marks use `panel`. Sentence underlines distinguish pending, insufficient, and failed states in addition to detail text.

**The Context Rule.** A highlight invites inspection in context. Neither a tint nor its absence is an authorship verdict.

## Typography

Georgia with Times New Roman fallback carries headings and passage text. Arial with Helvetica fallback carries controls, labels, statuses, and metadata. There are no remote font dependencies.

The paste heading uses the display token; reading headings are smaller (32px). Passage text uses the body token and a maximum measure of 70ch, preserving whitespace and wrapping long content. The introductory lead is serif (20px/1.6). Small interface explanations use 12px/1.65; threshold labels use the label token. Numeric threshold output uses tabular numerals.

At widths up to 800px, the paste heading is 35px, the reading heading 29px, and passage text 19px/1.9. Reading remains more prominent than the interface.

## Layout

The desktop workspace is a centered three-column grid, up to 1700px wide: settings (260px), flexible reading column, and map (210px). A sticky header is 76px tall. Sidebars stick below it and scroll independently; the sentence detail section sits inside the sticky map sidebar. Main padding is 64px vertically at the top and a fluid 24–72px horizontally. The paste area is capped at 740px.

At 1100px and below, side columns narrow to 225px and 165px, and main padding becomes 48px 28px. At 800px and below, the workspace becomes a single column with a 68px header and main padding of 36px 22px 60px. Settings and map move into separate views of the native modal drawer. The original sidebar nodes are moved, then restored on close, keeping their controls and state intact.

The mobile sentence-detail region is fixed 12px from the bottom and both sides, capped at 30vh with internal scrolling. While visible, main content gains 220px bottom padding; sentences have 200px bottom scroll margin. This region is separate from the modal drawers and can be hidden.

## Elevation & Depth

The interface uses no box shadows. Warm tonal surfaces and thin borders define regions. The header sits above reading content; mobile details sit above the header layer. Native modal drawers occupy the top layer with a translucent ink backdrop (`#24303b66`). Do not introduce decorative elevation into the inherited reading surface.

## Shapes

Controls have gently rounded corners; fields and mobile details use the slightly larger field radius. Sentence highlights retain small corners across line breaks. The desktop map uses near-square horizontal strips. Rules and component borders are 1px; no card grid or ornamental shapes are part of this surface.

## Components

### Actions and fields

Primary actions use solid ink, pale text, and the primary component padding. Secondary actions are transparent with a rule border; text actions are underlined and borderless. Disabled buttons have reduced opacity (.55). Focusable controls have a visible 2px blue-gray outline, offset 4px; sentence focus uses a 3px offset.

The paste textarea is a pale, bordered, vertically resizable surface with serif text (17px/1.7), minimum height 280px, and maximum height 560px. On mobile it uses 16px text, 16px padding, and a 255px minimum height. The threshold slider uses rust and remains disabled until reading starts. Changing its value reuses scores without inference.

### Passage and sentence detail

Sentences support hover, keyboard focus, and click inspection. Details describe unscored, pending, insufficient, failed, and scored states in text. Desktop details update politely inside the map sidebar. On mobile, selection reveals the region named “Selected sentence detail,” with a status announcement and a “Hide” action. Hiding it clears the active selection so later score updates do not reopen it unexpectedly.

Sentence tints and map colors transition over 140ms with ease-out only when reduced motion is not requested. Preserve original text and whitespace.

### Whole-text navigation

Every sentence has a map button with an accessible sentence number and status. Desktop strips are 8px high with 3px gaps; mobile targets are 32px high, including the minimum height. The map scrolls internally (44vh desktop, 48vh mobile). Arrow Up/Down, Home/End, and Page Up/Down move keyboard focus between marks. Activation closes an open drawer, scrolls the sentence into view, and focuses it.

### Named drawers and status

The native dialog receives its accessible name through its visible title: “Reading settings” or “Text map.” Opening places focus on “Close”; native modal behavior handles keyboard containment, Escape, and return to the invoking control. Preserve the dialog/title association.

Keep simulated/live mode text visible. Empty states explain what will appear; pending, insufficient, failure, retry, and disabled states remain explicit. Errors use alert regions; progress updates use a polite live region. No document verdict or invented research metric belongs in these components.

## Do's and Don'ts

- **Do** preserve warm paper, Georgia reading text, compact Arial controls, and thin rules.
- **Do** keep the passage dominant and inspection details available by keyboard and touch.
- **Do** retain 32px mobile map targets and the named modal drawers.
- **Do** distinguish unscored text from scored text below threshold.
- **Don't** treat synthetic highlights as evidence of detection quality.
- **Don't** replace the inherited visual world during a scoped fix.
- **Don't** introduce shadows, decorative cards, or unnecessary motion into this reading surface.
