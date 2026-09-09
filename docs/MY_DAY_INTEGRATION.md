# My Day business contact integration

My Day uses the existing Netlify API, not direct database access. Private relationship memory stays in My Day. Rolodex remains an Access Insights business asset. Only an explicit owner instruction to add/update a named person in Rolodex can cause an assistant write. Reading, email triage, remembering people and research are not write authorization.

## API v1

All assistant operations use `POST /api?action=assistant.<operation>` with a JSON body:

| Operation | Body | Behavior |
| --- | --- | --- |
| status | `{}` | Connection, organization, integration provisioning status and opaque database target fingerprint |
| search | `{query}` | Existing organization-scoped contact search |
| get | `{id}` | Existing contact detail plus exact opaque version |
| save | `{requestId,instructionHash,businessPurpose,operation,id?,expectedVersion?,fields}` | Transactional business create/update and durable receipt |

Requests carry `X-My-Day-Timestamp` (Unix seconds) and `X-My-Day-Signature` (hex HMAC-SHA256 of timestamp, action and exact UTF-8 body, separated by newlines). A two-minute freshness window is enforced. The credential is available only to production functions and the NUC planner server; it never reaches prompts, mobile clients or general research. Invalid signatures and signed calls to legacy/admin actions are rejected.

The dedicated identity is `integration:my-day`, limited to creator contact operations in `DEFAULT_ORG_ID`. Existing Azure authentication remains unchanged for normal users. Every SQL operation includes organization scope and uses the existing RLS context. The production database credential remains inside the existing API; some database owner roles can bypass RLS, so explicit organization predicates are also required and tested. Provision the integration user using the operator script rather than granting user-management rights to the integration.

`fields` supports names, company, title/role, internal contact, referrer, referrer contact ID, LinkedIn URL, contact type/status, email, phone and website methods. Scalar omitted fields are preserved; supported nullable scalar values explicitly clear them. Methods are ADDITIVE in v1: existing methods and their IDs are preserved, exact case-insensitive values are not duplicated. Deleting/replacing contact methods, merging contacts, address enrichment and industry attribute editing remain web-app operations for this first release.

Updates require the version from `assistant.get`; stale edits return 409. Matching normalized name/company, email or LinkedIn creates a duplicate conflict, not an automatic merge. Assistant mutations are serialized per organization. A request ID is bound to a payload fingerprint and receipt in `audit_log`; retrying returns the original receipt, while changing a payload under that ID is rejected. Contact mutation and receipt commit together. Existing web edits still use their established API and are not automatically serialized with assistant creates.

Only a hash of the authorizing instruction is sent to the CRM; the actual owner statement, conversation and local receipt stay in My Day's private backup. An API credential alone cannot establish that a voice utterance was authorized: that is enforced by My Day's server using the actual owner transcript, target identity and sourced field values. Do not hand this credential to a model, public MCP server or browser.

## Provisioning and deployment

1. Run tests against a throwaway Postgres database, never production. `npm run test:assistant` includes auth/schema checks; set `ROLODEX_TEST_DATABASE_URL` to the isolated localhost port 55439 to run mutation/RLS tests.
2. From the signed-in Windows operator environment, run `node scripts/provision-my-day.cjs --configure-only`. This configures a separate production-function credential and matching NUC environment value, without printing either.
3. Deploy the reviewed code through GitHub/Netlify.
4. Run `node scripts/provision-my-day.cjs`. It compares the operator's database target with the running signed API before using the credential, preserves a pre-integration business data snapshot on the NUC, installs migration 013 and provisions the scoped integration actor. No example contacts are created.
5. Deploy My Day planner and review worker, verify signed status/search/detail, and run the encrypted backup with restore verification.

The My Day backup includes private relationships, history, local receipts, artifacts and the pre-integration snapshot. That snapshot is not an ongoing full Rolodex backup. Continuous CRM disaster recovery, including complete schema and subsequent changes, remains a separate backup work item; do not use the existing placeholder CSV export as a backup.

## Enrichment and MCP follow-up

Research can suggest business fields and cite their sources in a private artifact. It cannot auto-write them. The first release only copies new field values directly stated by the owner or verified addresses from an explicitly saved business relationship. Broader source review, field-by-field acceptance and reversible merges should precede automated enrichment.

A later MCP adapter can wrap the same API and permission boundary for Rocky and other clients. It must use a separate scoped identity and a trusted host approval mechanism for writes. Do not expose My Day's private relationship registry through the business CRM or Rocky's shared team context.
