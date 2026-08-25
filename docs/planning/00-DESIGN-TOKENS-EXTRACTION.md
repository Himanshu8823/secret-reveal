# NEXORA — Design Tokens Extraction (From Reference Images)

> Source images live in `D:/secret-reveal/docs/images/`. Filenames referenced below.
> Every value here is sampled visually from `01-all-screens-overview.png` and `02-home-feed-detail.png`. Treat them as **v1 targets** to be confirmed in-app on a real device.

---

## 1. Brand & Logo

| Token | Value | Use |
| --- | --- | --- |
| `brand.name` | **NEXORA** | Wordmark on splash |
| `brand.tagline` | "Share Privately. Connect Deeply." | Splash subtitle |
| `brand.logoGlyph` | Stylised "N" mark, white, soft-rounded diagonal stroke | Splash + (future) app icon |
| `brand.logoBg` | Radial blue gradient (see below) | Splash background |

The splash uses a **deep blue radial gradient** fading from `#0B49FA` (centre) → `#01125C` (edges), with subtle dot/light-streak texture. We will recreate this with `expo-linear-gradient`.

---

## 2. Color Tokens

All colors are sampled from the references. They are **light-theme only** for v1; dark mode is a v2 milestone.

### 2.1 Brand / Primary

| Token | Hex | Notes |
| --- | --- | --- |
| `primary.DEFAULT` | `#0B49FA` | Login "Send OTP", active nav, primary buttons |
| `primary.pressed` | `#0940D6` | Pressed state (already used today) |
| `primary.subtle` | `#E8EEFE` | Hover/selected pills, badge backgrounds (Hidden Discussion chip) |
| `primary.onPrimary` | `#FFFFFF` | Text on primary fill |
| `accent.violet` | `#7A4DFF` | Story ring accents |
| `accent.pink` | `#FF3D7F` | Story ring accents |
| `accent.amber` | `#FFB020` | "Story" gradient stop |
| `accent.teal` | `#22C7B7` | "Story" gradient stop |

### 2.2 Surface / Background

| Token | Hex | Notes |
| --- | --- | --- |
| `surface.bg` | `#FFFFFF` | Page background |
| `surface.muted` | `#F5F6F8` | Chips, secondary card backgrounds |
| `surface.divider` | `#E4E5E7` | Hairlines (already in `colors.border`) |
| `surface.overlay` | `rgba(17,17,17,0.55)` | Modal scrim |

### 2.3 Text

| Token | Hex | Notes |
| --- | --- | --- |
| `text.primary` | `#111111` | Headlines, primary copy |
| `text.secondary` | `#8A8D93` | Subtitle, helper, "·" meta |
| `text.tertiary` | `#B6B9BF` | Placeholder text inside inputs |
| `text.onDark` | `#FFFFFF` | On dark gradient hero (splash, countdown) |
| `text.link` | `#0B49FA` | "Terms of Service" / "Privacy Policy" links |

### 2.4 Semantic

| Token | Hex | Notes |
| --- | --- | --- |
| `success` | `#16A34A` | "Accepted" pill in group invites |
| `warning` | `#F59E0B` | "Pending" pill |
| `danger` | `#EF4444` | "Rejected", "Delete", "Ban" actions, "Report" |
| `info` | `#0EA5E9` | "Locked responses", "Next" CTA when actionable |

### 2.5 Border / Outline

| Token | Hex | Notes |
| --- | --- | --- |
| `border.DEFAULT` | `#E4E5E7` | Default 1px outline |
| `border.strong` | `#D0D2D6` | Google button border (already in code) |
| `border.focus` | `#0B49FA` | Focus ring |

### 2.6 Status Pill Backgrounds

| Token | Hex | Notes |
| --- | --- | --- |
| `pill.successBg` | `#DCFCE7` | "Accepted" pill |
| `pill.warningBg` | `#FEF3C7` | "Pending" pill |
| `pill.dangerBg` | `#FEE2E2` | "Rejected" pill |
| `pill.infoBg` | `#E8EEFE` | "Hidden Discussion" / "Next" CTA bg |

---

## 3. Spacing Scale

Used uniformly in padding / margins / gaps. Based on a 4-pt grid.

| Token | px | Used for |
| --- | --- | --- |
| `space.0` | 0 | Reset |
| `space.1` | 4 | Tight stack |
| `space.2` | 8 | Icon-to-label inside chips |
| `space.3` | 12 | Input horizontal padding, chip padding |
| `space.4` | 16 | Card padding, list item padding |
| `space.5` | 20 | Section gap |
| `space.6` | 24 | Page horizontal padding (login, splash) |
| `space.8` | 32 | Between primary blocks |
| `space.10` | 40 | Splash hero gap |
| `space.12` | 48 | Section separators |

The reference uses **24 px page padding** consistently for full-screen pages.

---

## 4. Border Radius — the **four radii**

Per the prompt: define **exactly four** radius tokens, used everywhere.

| Token | px | Primary use |
| --- | --- | --- |
| `radius.full` | `9999` | Avatars, story rings, FAB, circular icon buttons |
| `radius.sm` | `8` | Small chips, tag pills, secondary buttons that nest inside cards |
| `radius.md` | `12` | **Default for inputs and primary buttons** (Send OTP, Google sign-in, Next CTA) |
| `radius.lg` | `16` | **Default for cards, modals, bottom sheets, post cards, list cards** |

Anything else gets `radius.full` (perfect circles) or one of the four above. **No other radius values exist in the design system.**

---

## 5. Typography

System font stack for v1 (`-apple-system, "Segoe UI", Roboto, sans-serif`). Inter is a good upgrade later but not required to ship.

### Scale

| Token | size / weight / line-height | Use |
| --- | --- | --- |
| `display.splash` | 40 / 800 / 48 | Splash wordmark "NEXORA" |
| `h1` | 28 / 800 / 34 | "Welcome Back" |
| `h2` | 22 / 700 / 28 | "Set Result Timer", "Notifications" |
| `h3` | 18 / 700 / 24 | Section headers, sheet titles |
| `title` | 16 / 700 / 22 | Card titles, modal titles ("Hidden Discussion", "Report Content") |
| `body` | 15 / 400 / 22 | Paragraph copy |
| `body.strong` | 15 / 600 / 22 | Buttons, tabs |
| `meta` | 13 / 400 / 18 | Timestamps, counters ("3h • 12", "00:45:12") |
| `meta.strong` | 13 / 600 / 18 | Tab labels ("All / Invites / Updates / Reports") |
| `caption` | 12 / 400 / 16 | "or continue with", helper text |
| `mono.timer` | 48 / 700 / 56 | Countdown "00:45:12" |

Letter-spacing: `-0.4` on `h1`, `-0.2` on `h2`, default elsewhere. This gives the modern "tight" feel the references show.

---

## 6. Elevation / Shadow

| Token | Definition | Use |
| --- | --- | --- |
| `elevation.0` | none | Flat surfaces |
| `elevation.1` | `0 1 2 rgba(17,17,17,0.06)` | Cards (post card, contact row) |
| `elevation.2` | `0 4 12 rgba(17,17,17,0.08)` | Floating elements (FAB, bottom sheet) |
| `elevation.3` | `0 12 32 rgba(11,73,250,0.18)` | Primary CTA shadow on splash-style hero |

---

## 7. Motion

| Token | Duration | Use |
| --- | --- | --- |
| `motion.fast` | 120 ms | Tap feedback, micro |
| `motion.base` | 220 ms | Modal open/close |
| `motion.slow` | 320 ms | Sheet slide, hero transition |

Easing: `cubic-bezier(0.2, 0.8, 0.2, 1)` (Reanimated default `Easing.out(Easing.cubic)`).

---

## 8. Iconography

Use `@expo/vector-icons` (already installed) with two families:

| Family | Token | Use |
| --- | --- | --- |
| MaterialCommunityIcons | `mci:` | Chevrons, social icons (already in code) |
| Ionicons | `io:` | Tab bar, utility icons (preferred for line icons) |

**Never** mix the same icon style across one screen.

---

## 9. Imagery References (where to copy from)

For media samples when we need placeholder content in stories / posts:

| Need | Source |
| --- | --- |
| Sunset over rocks | `01-all-screens-overview.png` row 3, post card hero |
| Tropical palms at beach | `01-all-screens-overview.png` screen 12 (Media Viewer) |
| Ocean cove | `02-home-feed-detail.png` create-post preview |
| Avatar set | Stories row in screens 3 & 2 |

Save these crops under `mobile/src/assets/images/placeholders/` before front-end work begins.

---

## 10. Mapping to Tailwind / NativeWind

When NativeWind is installed, the `tailwind.config.js` should mirror:

```js
// Pseudo — full config in 02-FRONTEND-ARCHITECTURE.md
theme: {
  extend: {
    colors: {
      primary: { DEFAULT: '#0B49FA', pressed: '#0940D6', subtle: '#E8EEFE' },
      surface: { bg: '#FFFFFF', muted: '#F5F6F8', divider: '#E4E5E7' },
      text:   { primary: '#111111', secondary: '#8A8D93', tertiary: '#B6B9BF', onDark: '#FFFFFF', link: '#0B49FA' },
      border: { DEFAULT: '#E4E5E7', strong: '#D0D2D6', focus: '#0B49FA' },
      accent: { violet: '#7A4DFF', pink: '#FF3D7F', amber: '#FFB020', teal: '#22C7B7' },
      success: '#16A34A', warning: '#F59E0B', danger: '#EF4444', info: '#0EA5E9',
      pill:    { successBg: '#DCFCE7', warningBg: '#FEF3C7', dangerBg: '#FEE2E2', infoBg: '#E8EEFE' },
    },
    borderRadius: {
      sm: 8,  md: 12, lg: 16, full: 9999,
    },
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 },
    fontSize: {
      'display-splash': ['40px', { lineHeight: '48px', fontWeight: '800' }],
      'h1':   ['28px', { lineHeight: '34px', fontWeight: '800', letterSpacing: '-0.4px' }],
      'h2':   ['22px', { lineHeight: '28px', fontWeight: '700', letterSpacing: '-0.2px' }],
      'h3':   ['18px', { lineHeight: '24px', fontWeight: '700' }],
      'title':['16px', { lineHeight: '22px', fontWeight: '700' }],
      'body': ['15px', { lineHeight: '22px', fontWeight: '400' }],
      'meta': ['13px', { lineHeight: '18px', fontWeight: '400' }],
      'caption':['12px', { lineHeight: '16px', fontWeight: '400' }],
      'mono-timer': ['48px', { lineHeight: '56px', fontWeight: '700' }],
    },
  },
},
```

---

## 11. Do's & Don'ts

**Do**
- Stick to the four radii. If a designer wants a different one, push back — there must be a reason.
- Use `space.6` (24 px) as the page-edge padding unless explicitly different.
- Treat `text.secondary` as the only "muted" text color.
- Round every avatar to `radius.full`.

**Don't**
- Don't add new color tokens mid-sprint. Open a token PR instead.
- Don't use `borderRadius: 10` because it "feels right". Use `sm`, `md`, or `lg`.
- Don't use drop shadows without an elevation token.
- Don't ship placeholder gray (#CCC) — use `surface.divider`.