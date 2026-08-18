---
name: Executive Precision
colors:
  surface: '#fcf8fa'
  surface-dim: '#dcd9db'
  surface-bright: '#fcf8fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f5'
  surface-container: '#f0edef'
  surface-container-high: '#eae7e9'
  surface-container-highest: '#e4e2e4'
  on-surface: '#1b1b1d'
  on-surface-variant: '#45464d'
  inverse-surface: '#303032'
  inverse-on-surface: '#f3f0f2'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#0051d5'
  on-secondary: '#ffffff'
  secondary-container: '#316bf3'
  on-secondary-container: '#fefcff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#0b1c30'
  on-tertiary-container: '#75859d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#d3e4fe'
  tertiary-fixed-dim: '#b7c8e1'
  on-tertiary-fixed: '#0b1c30'
  on-tertiary-fixed-variant: '#38485d'
  background: '#fcf8fa'
  on-background: '#1b1b1d'
  surface-variant: '#e4e2e4'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
  data-tabular:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 24px
  gutter: 16px
  card-gap: 20px
  sidebar-width: 260px
  max-width-content: 1440px
---

## Brand & Style
The design system focuses on high-utility administrative environments where data density and clarity are paramount. The brand personality is authoritative, systematic, and reliable, designed to instill confidence in service coordinators and operations managers.

The visual style is **Corporate / Modern**, leaning heavily into a refined functional aesthetic. It utilizes a structured card-based architecture with significant white space to prevent cognitive overload despite high data density. The interface prioritizes logical grouping of information, clear visual hierarchies, and a utilitarian approach to ornamentation.

## Colors
The palette is rooted in professional "Slate" and "Blue" tones. 
- **Primary (#0F172A):** Used for deep backgrounds, sidebars, and primary headings to provide a grounded, authoritative foundation.
- **Secondary (#2563EB):** The "Action Blue," reserved for interactive elements, primary buttons, and active states.
- **Neutral/Tertiary (#64748B):** Used for secondary text and icons to reduce visual noise.
- **Status Accents:** Success, Warning, and Danger colors are used strictly for semantic feedback (OS status, priority levels, and error states).
- **Background:** A very light grey-blue tint (#F8FAFC) is used to differentiate the page canvas from white surface cards.

## Typography
This design system utilizes **Inter** for its exceptional legibility in data-heavy environments and its neutral, modern character.

- **Headlines:** Use Bold and Semi-Bold weights with slight negative letter-spacing to maintain a compact, professional look.
- **Tabular Data:** For OS lists and KPI numbers, ensure the use of tabular num (monospaced numbers) to maintain vertical alignment in tables.
- **Labels:** Small caps or uppercase with increased tracking should be used for table headers and section titles to distinguish them from content.

## Layout & Spacing
The layout follows a **Fixed-Fluid Hybrid** model. The sidebar remains fixed at 260px, while the main content area expands to a maximum of 1440px to ensure line lengths remain readable on ultra-wide monitors.

- **Grid:** A 12-column system is used for dashboard layouts.
- **KPI Metrics:** Usually span 3 columns (4 cards per row).
- **Main OS Tables:** Typically span 8-9 columns, with 3-4 columns reserved for filters or maps.
- **Rhythm:** An 8px/4px base unit grid ensures consistent alignment of all internal components.

## Elevation & Depth
Depth is used to distinguish the "Work Surface" from the "Canvas."

- **Level 0 (Canvas):** The background (#F8FAFC) is the lowest point.
- **Level 1 (Cards):** Main content containers use a white background with a 1px border (#E2E8F0) and a very soft, diffused shadow (0 1px 3px 0 rgba(0, 0, 0, 0.1)).
- **Level 2 (Dropdowns/Modals):** Floating elements use a more pronounced shadow (0 10px 15px -3px rgba(0, 0, 0, 0.1)) to indicate focus and separation from the grid.
- **Interactions:** Hover states on table rows or list items should use a subtle tint (#F1F5F9) rather than a shadow change to maintain layout stability.

## Shapes
The shape language is **Soft (0.25rem)**. This provides a balance between the "strictness" of a corporate tool and a modern, approachable feel. 

- **Standard Elements:** Buttons, inputs, and small chips use 4px (0.25rem).
- **Cards & Containers:** Use `rounded-lg` (8px / 0.5rem) to softly define large content areas.
- **Status Indicators:** Use `rounded-full` (pill shape) for OS status badges (e.g., "In Progress") to instantly distinguish them from interactive buttons.

## Components
- **KPI Cards:** Prominent display of numbers using `headline-lg` in Primary Blue, with a secondary label and a small trend indicator (Success/Danger arrows).
- **Tables:** Compact density. Header row should have a subtle background tint (#F8FAFC) and `label-md` text. Rows should include a "Quick Action" hover state.
- **Buttons:** 
  - *Primary:* Solid Secondary Blue background, white text.
  - *Secondary:* White background, 1px border (#CBD5E1), Primary Blue text.
- **Input Fields:** 1px border (#E2E8F0) that transitions to Secondary Blue on focus. Labels must always be visible above the input.
- **OS Status Chips:** Low-saturation backgrounds with high-saturation text (e.g., Success Green text on a very pale green background) to ensure legibility without being visually overwhelming.
- **Map Containers:** Should be framed in a Level 1 Card with integrated zoom controls in the top right, utilizing the same `rounded-lg` corner radius.