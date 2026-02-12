# Accessibility

The scaffold includes baseline accessibility support:
- Skip-to-content link.
- Keyboard-accessible navigation and route links.
- Visible focus ring styling with `:focus-visible`.
- Reduced motion media query support.
- Forced colors support for high contrast modes.

## Testing approach
- Component-level accessibility assertions in Vitest.
- App-shell accessibility smoke test in Playwright with axe-core.

## Ongoing requirements
- Keep semantic headings and landmarks.
- Ensure every interactive control has an accessible name.
- Verify color contrast before introducing branded styles.
