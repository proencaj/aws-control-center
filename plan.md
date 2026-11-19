# Windows 95 theme redesign

## Direction and references

Redesign AWS Control Center as a Windows 95 application, retaining the fixed sidebar and top workspace tabs. Use the classic palette in light mode and a coordinated dark adaptation following system preference.

Use [Windows 95 screenshots](https://guidebookgallery.org/screenshots/win95/) for window frames, Explorer lists, dialogs, and property tabs. Consult [98.css’s component examples](https://jdan.github.io/98.css/) for CSS control construction, while keeping Windows 95’s solid title bars rather than gradients.

## Visual system

- Define semantic theme variables in `app/globals.css`: desktop, window surface, input surface, text, title bar, selection, bevel highlight, bevel shadow, and disabled text.
- Light palette: teal desktop `#008080`, silver panels `#c0c0c0`, white inputs, black text, navy title bars and selections `#000080`, white highlights, and gray `#808080` bevel shadows.
- Dark adaptation: deep teal desktop `#102828`, charcoal panels `#303030`, dark inputs `#181818`, light text `#f0f0f0`, blue title bars `#183858`, and clearly contrasting bevel edges. This is an intentional modern adaptation.
- Use square corners and crisp two-layer raised/sunken borders. Permit hard-edged inset shadows for bevels; avoid soft shadows, gradients, and animations.
- Replace terminal headings, uppercase labels, and wide letter spacing with compact sans-serif text. Use `"MS Sans Serif", Tahoma, Arial, sans-serif`, 14px body text, 13px controls, and bold 16–18px headings. Keep the existing monospace stack for logs, JSON, code, and identifiers.
- Retain recognizable 16px service icons; create simple original CSS/SVG window-control glyphs. Do not bundle Microsoft fonts, logos, or extracted Windows assets.

## Shell, tabs, and screens

- Frame the app with a narrow teal desktop gutter and a raised silver window border. Add a solid navy application title bar with the app name; place region selection in a silver toolbar below it.
- Style the fixed sidebar as an Explorer navigation pane: inset service list, compact rows, navy selected item, and raised “open another tab” buttons.
- Restyle workspace tabs as property-sheet tabs: silver raised tabs, slightly elevated active tab, and an active bottom edge that joins the content panel. Keep close buttons, horizontal overflow, and existing tab behavior.
- Apply the same treatment to service-level navigation, with a clearly visible current selection.
- Restyle content panels as classic group boxes and windows. Use title bars only for major sections and dialogs so pages do not become visually crowded.
- Convert buttons to raised controls with pressed states and dotted keyboard focus. Inputs, selects, textareas, and table containers use sunken borders; checkboxes and radios retain native semantics.
- Make resource tables resemble Explorer detail lists: silver column headers, white or dark input surfaces, compact rows, and distinct hover/selection states.
- Restyle confirmation dialogs, errors, setup screens, empty states, loading states, and log controls consistently. Preserve typed destructive confirmations and communicate status with text and icons.
- Turn the footer into an inset status bar. Keep mobile layouts usable, allowing table and tab-strip scrolling without horizontal overflow of the whole page.

## Implementation and compatibility

- Start with shared tokens and component classes, then update the shell in `components/workspace.tsx` and systematically apply the theme across all existing service pages and controls.
- Remove conflicting inline utility styles rather than relying on broad `!important` overrides. Keep layout utilities where they remain useful.
- Implement the theme locally with Tailwind and CSS; do not add a full retro UI framework.
- Update the repository style instructions to explicitly replace grayscale-only and no-bevel rules with this approved theme, while retaining server-only AWS access and destructive-action safeguards.
- Preserve navigation, workspace persistence, region behavior, forms, SDK calls, and public interfaces. No data migration or new API is required.

## Verification and acceptance

- Inspect Directory, EC2, ECS, S3, Logs Monitor, and Logs Explorer in both themes, including tables, forms, dialogs, errors, and empty states.
- Verify duplicate workspace tabs, active/inactive/hover/pressed states, closing tabs, keyboard navigation, and sidebar scrolling behavior.
- Check readable text contrast, visible focus, disabled controls, long resource names, 200% zoom, and narrow mobile layouts.
- Run Docker-based lint, TypeScript checks, and the existing test suite. Add focused tests only where markup or interaction changes warrant them.
- Capture representative light and dark screenshots for visual review. The redesign is complete when the entire console follows the classic visual language without changing AWS operations or losing usability.
