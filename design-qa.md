# Design QA：库存卡片快捷操作

## Evidence

- Source visual truth: [Figma recommendation board](https://www.figma.com/design/tKJ47uJaFTXeGuSE7XCpqz?node-id=2-3), local capture `/tmp/dewu-inventory-button-audit.png` (1340 × 1280 px), focused card crop `/tmp/dewu-inventory-button-source-card.png` (700 × 260 px).
- Browser-rendered implementation: `/tmp/dewu-inventory-button-implementation-full.jpg` (378 × 819 px), focused card crop `/tmp/dewu-inventory-button-implementation-card.jpg` (330 × 250 px).
- Combined comparison input: `/tmp/dewu-design-qa-comparison-mobile.jpg` (393 × 852 px).
- CSS viewport: 393 × 852; device pixel ratio: 1. The in-app browser's raw viewport capture excludes its outer chrome and produced 378 × 819 pixels, so the source and implementation card regions were cropped and fitted into one 393 × 852 comparison canvas before judging.
- State: Cirrus/cloud theme, one `pending` inventory group, quantity 1, primary action `确认到货`.
- Browser console: no warning or error entries on the clean QA origin.

## Full-view comparison evidence

The implementation keeps the existing white inventory card, cloud background, product hierarchy, status chip, cost and bottom navigation. The repeated card action changes from a visually dominant black fill to the approved cloud-blue treatment without changing the surrounding inventory layout.

## Focused region comparison evidence

The focused source and implementation card regions were placed together in `/tmp/dewu-design-qa-comparison-mobile.jpg`. The implemented action uses the Figma tokens exactly: `#e3f2ff` background, `#7db8e8` border, `#0e61ad` text, 52 px height and a pill radius. The quantity marker uses the approved soft gray-blue treatment (`#edf3f8` / `#334f6d`).

## Required fidelity surfaces

- Fonts and typography: the app's existing Avenir Next / PingFang stack and hierarchy are preserved. The action remains 15 px semibold to match the production inventory typography; the Figma's larger display example is intentionally adapted to the denser real card.
- Spacing and layout rhythm: card dimensions, padding, separator, 28 px card radius and bottom navigation remain unchanged. The action target is exactly 52 px high, exceeding the 44 px mobile minimum. Existing page `pb-36` provides 144 px of bottom safety.
- Colors and visual tokens: cloud-blue action and soft quantity badge match the approved tokens. Text contrast is 5.53:1 for the action and 7.57:1 for the quantity badge, both meeting WCAG AA for their text sizes.
- Image quality and asset fidelity: the QA fixture uses a crop from the user's real product thumbnail rather than a placeholder or generated approximation. Production image rendering code is unchanged.
- Copy and content: workflow labels and inventory copy are unchanged. Only the quantity presentation changes from `×1` to the clearer `数量 1`.

## Findings

- No actionable P0, P1 or P2 mismatch remains.
- Accepted difference: the Figma focus card intentionally simplifies product metadata, while the production component retains name, style code, size, platform, status and cost because the request was to improve the action treatment without removing information or changing logic.

## Comparison history

1. Initial browser capture showed stale localhost service-worker styling and a broken temporary image URL. This was test-environment evidence, not a product-code defect.
2. Fixes: moved the QA preview to a clean localhost origin, supplied the user's real product thumbnail, and recaptured at a verified 393 × 852 CSS viewport.
3. Post-fix evidence: `/tmp/dewu-design-qa-comparison-mobile.jpg`; computed styles confirm the approved colors, 52 px height and soft quantity badge, with no browser console errors.

## Primary interactions tested

- The browser-rendered primary button is present, enabled, labelled `确认到货`, and measures 52 px high.
- Component tests verify that pressing the quick-action button invokes the existing workflow handler; inventory page tests verify status filtering, batch selection and freight flows remain intact.

## Implementation checklist

- [x] Replace repeated black inventory actions with cloud-blue buttons.
- [x] Replace the black quantity pill with a soft gray-blue quantity label.
- [x] Preserve workflow labels, click handlers, card links and inventory state logic.
- [x] Verify mobile target size, contrast, reduced-motion behavior, console and automated regression suite.

final result: passed
