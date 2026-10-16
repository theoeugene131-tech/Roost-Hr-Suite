# Roost International Foundation

Initial markets: Nigeria (NG), United States (US), United Kingdom (GB).

## Scope of this foundation change

- Adds company-scoped database read/update/delete helpers.
- Moves employee PATCH and DELETE operations to company-scoped database methods.
- Adds authenticated company settings endpoints for country, region, currency, locale, timezone, working week, financial-year start, and leave-policy values.
- Adds country defaults and a shared frontend currency formatter.
- Restricts production CORS to configured frontend origins.
- Requires stable production JWT and field-encryption secrets instead of unsafe fallbacks.
- Adds a frontend API client for company settings.

## Required backend environment variables

Configure these in the backend hosting dashboard before deploying this branch:

- `DATABASE_URL`: existing PostgreSQL connection string.
- `JWT_SECRET`: at least 32 random characters. Changing this invalidates existing JWT sessions.
- `ENCRYPTION_KEY`: exactly 64 hexadecimal characters representing 32 random bytes. It must remain stable; changing it makes existing encrypted fields unreadable unless the data is re-encrypted with a migration.
- `CORS_ORIGINS`: comma-separated exact frontend origins, for example the production Vercel origin. Do not include paths.
- `APP_URL`: canonical frontend URL; used as a fallback for the allowed origin and invitation links.

Generate secrets locally with:
```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Do not commit secret values to GitHub.

## Important limitations before production rollout

- The current app still stores several HR modules in browser localStorage. Those modules must be migrated to authenticated, company-scoped APIs before this can be described as fully multi-tenant or production-secure.
- JWTs are still stored in browser localStorage in the current frontend; an HTTP-only session-cookie migration remains recommended.
- Payroll remains jurisdiction-specific. The US and UK payroll engines are not implemented by this foundation. Nigeria's existing estimator requires current-rule review before statutory use.
- Existing encrypted employee fields must be reviewed before changing ENCRYPTION_KEY. The old random-key fallback could already have made data unreadable after a backend restart if no key was configured.
- Build and cross-company access tests must pass before deployment. This branch must not be auto-deployed to production until environment variables and existing encrypted data have been checked.
