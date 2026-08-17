# Four-theme design QA

## Scope and source truth

- Product target: Safari PWA, with the primary comparison viewport set to 393 × 852 CSS pixels at device scale factor 1.
- Source packages:
  - `/Users/apple/Downloads/plastic-mule-29-50a112d8.zip`
  - `/Users/apple/Downloads/voltura.zip`
  - `/Users/apple/Downloads/cirrus.zip`
  - `/Users/apple/Downloads/perfect-penguin-77-1ca6e9c0.zip`
- Extracted reference implementations:
  - `ui-preview/spritecraft-inventory.html`
  - `ui-preview/voltura-inventory.html`
  - `ui-preview/cirrus-inventory.html`
  - `ui-preview/lumen-edge-inventory.html`
- Authentic Cirrus image asset: `public/images/sky-horizon-hero.webp` (the supplied 1.7 MB PNG converted lossily to 66 KB WebP at the same 1680 × 720 dimensions for faster PWA startup).
- Implementation evidence: `/tmp/dewu-four-theme-qa/*-home-v2.png`, `*-inventory*.png`, `*-add-v2.png`, `*-reports-v2.png`, and `voltura-filter-sheet.png`.
- Source/implementation home comparisons: `/tmp/dewu-four-theme-qa/{cirrus,spritecraft,voltura,lumen}-comparison.png`. Source and implementation captures were normalized to 378 × 818 for side-by-side comparison; the raw app captures are 378 × 819 and the reference captures are 393 × 818.

## Visual-system comparison

| Theme | Reference rule | Result |
| --- | --- | --- |
| Cirrus | Real cloud/sky image, centered editorial hero, white floating slabs, rounded controls | Implemented with the original sky asset, serif italic secondary line, soft white surfaces, circular settings action, and rounded bottom navigation. |
| Spritecraft | Warm grid paper, square 2 px borders, pixel display type, hard offset shadows, green/gold focal cards | Implemented across dashboard, inventory, add, reports, settings, sheets, controls, and navigation. Profit green was darkened slightly to meet 4.5:1 text contrast while retaining the source character. |
| Voltura | Near-black control surface, acid-lime focal cards, mono numerals, hairline borders, compact geometry | Implemented across every primary screen and interactive sheet using Tabler icons and theme-specific control geometry. |
| Lumen | Dark glass layers, horizon/rim light, cool mono labels, soft radial depth, low-radius controls | Implemented across every primary screen with glass/rim surfaces, monochrome icon treatment, and cool-toned typography. |

The four systems share data and business behavior only. Typography, icons, radii, borders, shadows, focal-card treatment, navigation and form styling vary by theme. Settings moved from the bottom navigation to the header gear so the four-tab structure matches the references without removing access to settings.

## Fidelity and accessibility checks

- Typography: each system uses its own display/body/mono treatment; long financial values use tabular numerals, responsive size clamps, and centered value rows where overflow risk exists.
- Layout and spacing: mobile margins, card grids, section rhythm and fixed bottom navigation were checked on home, inventory, add and reports. No horizontal overflow was observed at 393, 768 or 1280 CSS-pixel widths.
- Color and contrast: the four featured profit cards were browser-tested at or above 4.5:1. Cirrus uses dark-on-white, Spritecraft white-on-dark-green, Voltura dark-on-lime, and Lumen white-on-dark-glass.
- Imagery: Cirrus uses the supplied raster asset rather than CSS art. The other references are surface-led and use their original color/shape systems without placeholder imagery.
- Icons: theme-specific libraries are used—Lucide, Phosphor and Tabler—rather than one generic icon set across all themes.
- Controls: inputs remain 16 px on mobile to prevent Safari zoom; controls keep visible focus rings and practical tap targets. Purchase date, long report totals, image upload, rebate inputs and bottom navigation remain within the viewport.
- Copy and content: source-demo wording was adapted to real inventory data and the existing Chinese product terminology. Business meaning and agreed metrics were preserved instead of copying placeholder source values.
- Reduced-motion compatibility: the redesign does not depend on motion to communicate state.

## States and interactions checked

- Four theme switches persist after navigation and reload.
- Inventory search, empty result, status filter sheet, batch settlement, batch shipping and freight entry.
- Add form, decimal price input, purchase-date containment, screenshot black-bar auto-crop and restore-original action.
- Reports month selector, long sales amount containment/centering, rebate inputs and save flow.
- Authentication no-session and expired-callback recovery states.
- Fresh-browser console check after the final fixes: no errors.
- Automated browser coverage: Chromium at 390 × 844 and WebKit iPhone; 18 of 18 end-to-end tests passed.
- Unit/component coverage: 145 of 145 tests passed. Lint, TypeScript and production export build passed.

## Comparison history

1. Initial audit found the previous implementation changed mostly background and palette while reusing the same generic layout (P1). The shared semantic view model and four complete layout systems replaced that approach.
2. First implementation comparison found Spritecraft and Voltura featured-card backgrounds were being overridden, report profit text could disappear in Cirrus/Lumen, and image upload appeared too low in the add flow (P1/P2). Theme selectors were made more specific, report text tokens were corrected, and image upload moved above the form fields.
3. Automated browser regression then found insufficient Spritecraft profit-card contrast and left-aligned long report totals (P2). The green was adjusted to `#1f7a37`, and non-featured report values were centered and constrained.
4. Final side-by-side and interaction pass found no remaining P0, P1 or P2 issues. Residual P3 differences are intentional: real product data replaces demo values, and the development-only Next indicator is absent from production.

final result: passed
