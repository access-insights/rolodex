# Testing

## Test layers
- Unit and component tests: Vitest + Testing Library in `apps/web`.
- Accessibility smoke tests: Vitest with `jest-axe`.
- End-to-end smoke tests: Playwright + axe-core in `e2e`.

## Commands
```bash
npm run test
npm run test:a11y
npm run test:e2e
```

## CI
GitHub Actions runs lint, unit tests, and accessibility tests on pushes to `main` and pull requests.
