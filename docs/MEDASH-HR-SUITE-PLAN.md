# Medash HR Suite — Rebuild and Migration Plan

## Objective

Create a new product called **Medash HR Suite** while keeping the current Roost HR Suite website and its existing database untouched until the replacement has passed acceptance tests. Treat this branch as a safe planning/staging area; it is not the production site.

## Non-negotiable safety rules

1. Do not delete, overwrite, rename, or repoint the existing production Vercel project.
2. Do not run destructive database migrations against the current Railway PostgreSQL database.
3. Do not copy production secrets into source control or ask the owner to paste secrets into chat.
4. Use a separate staging database for new schema work and testing. Keep the current database as a protected source for a reviewed, tested migration only.
5. Keep the old website available until the owner explicitly approves the new deployment and migration.
6. Do not claim UK or US payroll compliance until country-specific calculations have been implemented, reviewed against authoritative rules, and tested.

## Product scope

### Shared HR features
- Company/workspace setup and secure user authentication
- Role-based access for platform owner/admin, company owner/admin, HR staff, managers and employees
- Employee directory and employee self-service
- Leave requests and balances
- Attendance
- Recruitment and hiring pipeline
- Training
- Performance reviews
- Employee documents
- Reports and audit history
- Payroll records and payslip workflows
- Responsive UI and accessible forms

### International foundation
- Initial markets: Nigeria, United Kingdom and United States
- Store each company’s country, currency, locale and timezone explicitly.
- Keep monetary values as numeric/decimal amounts with an ISO currency code; never assume every amount is naira or dollars.
- Keep country-specific payroll logic in separate modules with tests.
- Nigeria: preserve existing estimates as estimates until independently checked.
- UK: implement PAYE, National Insurance, pension and relevant payroll-year rules only after source review.
- US: design for state-specific rules and federal withholding; do not represent a single generic US calculation as compliant in every state.
- Clearly label unsupported jurisdictions or payroll scenarios rather than returning misleading figures.

### Selar and licensing
- Product checkout: https://selar.com/5w877x1957
- Until an official supported Selar API/webhook is verified, treat purchase confirmation and licence activation as a manual admin workflow.
- Record activation status, customer, plan, activation date, expiry/trial dates and admin audit events.
- Never mark a payment as verified merely because a key has a valid-looking format.
- Keep demo access clearly separate from paid access.

## Proposed low-cost architecture

- **Source control:** GitHub.
- **Web app and same-origin API:** Vercel / Next.js, provided build and route tests pass.
- **Database:** PostgreSQL. Reuse existing Railway PostgreSQL only after confirming safe connectivity and creating a separate database/schema or staging database; do not alter existing production tables during initial development.
- **Authentication:** server-validated sessions/tokens, secure cookie handling where appropriate, strong server-only secrets.
- **File storage:** choose a supported low-cost private object-storage service before enabling employee document uploads; do not store sensitive employee documents in public paths or browser localStorage.
- **Email:** configure a verified sending domain/provider before enabling invitations or automated employee emails.
- **PWA/offline:** treat offline mode as an enhancement. Queue only safe, conflict-aware changes; never let local browser state override server permissions.

## Tenant and data security requirements

- Every tenant-owned record must have a company/workspace identifier.
- The server must derive the permitted tenant from the authenticated identity, not trust a tenant ID supplied by the browser.
- Enforce tenant boundaries on every read, write, export, report and file access.
- Platform administrators must use a separate, audited admin path.
- Add automated tests proving Company A cannot read or modify Company B's data.
- Use least-privilege database access, input validation, rate limits, secure password hashing and audit logging.
- Do not expose database credentials, JWT signing secrets or encryption keys to client-side code.

## Migration and deployment phases

### Phase 1 — Inventory and protect
- Inventory the existing application routes, features, schema, secrets/configuration names and deployments.
- Confirm the current production URL and identify the active database without printing credentials.
- Create backups and verify a restore procedure before any production migration.
- Keep the old site and current database unchanged.

### Phase 2 — New staging foundation
- Establish a separate Medash HR Suite project/repository and staging deployment.
- Add environment-variable checks that fail safely and document required variable names without values.
- Set up a staging database and schema migrations.
- Make health checks report service status without leaking secrets.

### Phase 3 — Backend and access control
- Verify signup, login, logout/session expiry and password reset flows.
- Add company-scoped authorization and audit logging.
- Add automated tests for tenant isolation, admin permissions and unauthorized requests.
- Confirm backend routes and database persistence in a deployed staging environment.

### Phase 4 — Feature migration
- Migrate existing HR modules in small, testable increments.
- Keep feature behaviour and data mappings documented.
- Add data validation and import/export rehearsal before moving any real records.
- Add Nigeria, UK and US locale/currency settings independently from payroll rules.

### Phase 5 — Payments and country payroll
- Implement manual Selar purchase review and licence activation first.
- Verify whether Selar offers an official API/webhook before implementing automated payment confirmation.
- Implement and test payroll engines country by country, with payroll-year/versioned rules and clear estimates/compliance labels.

### Phase 6 — Release checks
- Run production builds, linting, unit tests and end-to-end smoke tests.
- Test signup/login, employee CRUD, leave, reports, payroll, file permissions, Selar flow and tenant isolation.
- Confirm environment variables and database connectivity in staging.
- Test backup/restore and document rollback steps.

### Phase 7 — Owner-approved launch
- Deploy Medash HR Suite under a new Vercel project/domain while the old website stays live.
- Use a separate staging/production database for the new app until a reviewed migration is approved.
- If records must be migrated, take a fresh backup, run a tested non-destructive migration, reconcile row counts and totals, and preserve rollback capability.
- Switch users only after explicit owner approval. Retire nothing until the new app has been stable and the owner confirms.

## Acceptance checklist

- [ ] New app name and branding say Medash HR Suite.
- [ ] Old Roost site remains live and unchanged.
- [ ] Existing database has not been destructively changed.
- [ ] Separate staging database is available.
- [ ] Signup/login and role permissions pass tests.
- [ ] Tenant isolation tests pass.
- [ ] HR modules persist data through the server.
- [ ] Nigeria/UK/US currency and locale options work.
- [ ] Payroll outputs are correctly labelled and country-specific rules are tested.
- [ ] Selar checkout opens the supplied product page.
- [ ] Licence activation reflects verified manual admin action unless an official integration is confirmed.
- [ ] Deployed build and API health checks pass.
- [ ] Backup and rollback procedure has been tested.
- [ ] Owner approves the production cutover.

## Current known constraints

- The existing GitHub repository is `theoeugene131-tech/Roost-Hr-Suite`.
- The existing production site is `https://roost-hr-suite.vercel.app/`.
- The current Railway PostgreSQL database must be treated as protected until its exact usage and backup state are confirmed.
- The Selar checkout URL supplied by the owner is `https://selar.com/5w877x1957`.
- No production cutover is authorized by this plan.
