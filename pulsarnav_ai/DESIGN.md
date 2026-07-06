---
name: PulsarNav AI
colors:
  surface: '#111318'
  surface-dim: '#111318'
  surface-bright: '#36393f'
  surface-container-lowest: '#0b0e13'
  surface-container-low: '#191c21'
  surface-container: '#1d2025'
  surface-container-high: '#272a2f'
  surface-container-highest: '#32353a'
  on-surface: '#e1e2e9'
  on-surface-variant: '#bbc9cf'
  inverse-surface: '#e1e2e9'
  inverse-on-surface: '#2e3036'
  outline: '#859399'
  outline-variant: '#3c494e'
  surface-tint: '#47d6ff'
  primary: '#a5e7ff'
  on-primary: '#003543'
  primary-container: '#00d2ff'
  on-primary-container: '#00566a'
  inverse-primary: '#00677f'
  secondary: '#adc6ff'
  on-secondary: '#002e6a'
  secondary-container: '#0566d9'
  on-secondary-container: '#e6ecff'
  tertiary: '#edd4ff'
  on-tertiary: '#490080'
  tertiary-container: '#dab1ff'
  on-tertiary-container: '#730dc2'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#b6ebff'
  primary-fixed-dim: '#47d6ff'
  on-primary-fixed: '#001f28'
  on-primary-fixed-variant: '#004e60'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#f0dbff'
  tertiary-fixed-dim: '#ddb7ff'
  on-tertiary-fixed: '#2c0051'
  on-tertiary-fixed-variant: '#6900b3'
  background: '#111318'
  on-background: '#e1e2e9'
  surface-variant: '#32353a'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 44px
    fontWeight: '300'
    lineHeight: 52px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '400'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md-mobile:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-base:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: '0'
  body-bold:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: '0'
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.12em
  stat-lg:
    fontFamily: JetBrains Mono
    fontSize: 36px
    fontWeight: '300'
    lineHeight: 44px
    letterSpacing: -0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
  panel-gap: 24px
---

## Brand & Style
The design system embodies a "Mission Control" aesthetic, merging the high-stakes precision of aerospace engineering with the refined minimalism of premium consumer electronics. The brand personality is authoritative, scientific, and futuristic, designed to evoke a sense of calm control amidst complex data environments.

The visual style is a hybrid of **Glassmorphism** and **Corporate Minimalism**. It utilizes deep, immersive "space-dark" backgrounds to create infinite depth, layered with semi-transparent frosted panels that mimic high-tech cockpit displays. The interface feels "physical" through the use of soft glows, light-emitting accents, and ultra-thin, high-precision borders that represent laser-etched circuitry.

## Colors
The palette is rooted in the "Void"—a deep navy-black foundation that ensures zero visual fatigue. 

- **Primary (Pulsar Cyan):** Used for critical telemetry, active status indicators, and primary interactive elements. It should feel luminous, like a light source.
- **Secondary (Stellar Blue):** Used for stable navigation and secondary actions, providing a professional balance to the high-intensity cyan.
- **Tertiary (Astro Purple):** Reserved for AI insights and predictive data overlays.
- **Neutral (Void Black):** The primary background color. 
- **Accents:** Use Starlight White (#F8FAFC) for text to maintain maximum legibility against dark backgrounds. Functional states use Telemetry Red (#EF4444) for alerts and Telemetry Green (#10B981) for safe locks.

## Typography
The typographic system emphasizes technical precision. 

- **Headlines:** Use Geist in thin weights to achieve an elegant, Apple-inspired aerospace look.
- **Body:** Inter provides a humanist balance, ensuring long-form logs and descriptions are highly readable.
- **Technical/Data:** JetBrains Mono is used for all numerical readouts and labels. The `label-caps` style should always be transformed to uppercase with wide tracking to mimic instrumentation marking. 
- **Readouts:** Large-scale telemetry (coordinates, timers) should use the `stat-lg` style to stand out as primary data points.

## Layout & Spacing
The layout follows a **Modular Grid** philosophy, resembling a multi-pane operations console. 

- **Desktop:** A 12-column fluid grid with a maximum container width of 1600px. Content is divided into functional "panes" (e.g., Map, Telemetry, Diagnostics) separated by the `panel-gap`.
- **Mobile:** The layout collapses into a single-column stack. Dense data widgets should transition into swipeable carousels or tabbed views to maintain clarity.
- **Rhythm:** All spacing is based on a 4px baseline. Use tighter padding (8px-12px) inside data cards to maintain density, but wider margins (24px-32px) between major UI sections to provide breathing room.

## Elevation & Depth
Depth is conveyed through **Glassmorphism** and light physics rather than traditional heavy shadows.

- **Surface Layers:** Use "Nebula Glass" for all floating panels—a dark semi-transparent fill with a `20px` backdrop blur. This creates a sense of the UI floating in front of the data or background.
- **Outlines:** Instead of shadows, use "Hairline Borders"—1px solid outlines with low opacity (8-10%) in white or the primary accent color. This defines edges with surgical precision.
- **Glows:** Use `box-shadow` to create soft, colored ambient glows (0-15px blur) behind active elements or primary buttons to suggest they are illuminated from within.

## Shapes
The shape language balances "soft-tech" comfort with "hard-tech" precision. 

- **Standard Containers:** Use 16px (rounded-lg) for main cards and dashboard panels to soften the technical density.
- **Controls:** Buttons and input fields use 8px or 12px rounding to maintain a precise, engineered feel.
- **Interactive Elements:** Use pill-shapes (rounded-full) sparingly for status badges or navigation pills to create a distinct visual contrast from structural containers.

## Components
- **Buttons:** Primary buttons are solid Pulsar Cyan with a soft glow and dark text. Secondary buttons are "ghost" style with a thin cyan border and a subtle glass background that increases in opacity on hover.
- **Cards (Orbit Containers):** Feature a 1px white outline (10% opacity) and a 2px horizontal Pulsar Cyan "active bar" at the very top to indicate the module is online.
- **Input Fields:** Dark, recessed backgrounds (`rgba(4, 6, 10, 0.6)`). On focus, the border glows cyan and the monospace label above the field shifts to a higher brightness.
- **Chips/Status:** Small, monospace tags. Use "Pulsing Beacons"—a small dot with an animated, expanding ring—next to labels to indicate live data feeds.
- **Lists:** Data lists should use thin dividers (5% opacity) and alternating row backgrounds ("zebra striping") using a slightly brighter navy tint for high-density readability.
- **Navigation:** A floating top bar in glassmorphic navy. The active state is indicated by a glowing cyan underline and a very soft vertical gradient behind the menu item.