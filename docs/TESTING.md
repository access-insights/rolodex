# Testing

## Test layers
- Unit and component tests: Vitest + Testing Library in `apps/web`.
- Accessibility smoke tests: Vitest with `jest-axe`.
- End-to-end tests: Playwright in `e2e`.

## Commands
```bash
npm run test
npm run test:a11y
npm run test:e2e
```

## Coverage focus
- `apps/web/src/test/contacts-detail.test.tsx`
  - Contact detail page renders API-loaded data.
  - Comment creation refreshes detail view and shows new comment.
- `apps/web/src/test/contacts-list-role.test.tsx`
  - Delete action is visible only for admin role.
- `e2e/app-shell.spec.ts`
  - Login flow reaches `/contacts`.
  - Contact ID link opens detail page.
  - New comment is created and displayed.

## CI
GitHub Actions runs lint, unit tests, and accessibility tests on pushes to `main` and pull requests.
