# Multi-institution setup

The backend uses one MongoDB database. Every authenticated institution user is assigned an `institutionId`; Mongoose tenant middleware scopes reads, updates, deletes, aggregation pipelines, and new records to that institution. The tenant ID is taken from the authenticated database user, never from a request header or body. Platform administrators are the only role that can bypass tenant scoping.

## Migrate the existing UNIOSUN data

1. Back up the MongoDB database.
2. Set `MONGO_URI` and the following one-time platform-administrator bootstrap values in the deployment environment:
   - `PLATFORM_ADMIN_NAME`
   - `PLATFORM_ADMIN_EMAIL`
   - `PLATFORM_ADMIN_IDENTIFIER`
   - `PLATFORM_ADMIN_PASSWORD` (use a unique password with at least 12 characters)
3. Before deploying the new backend, run `npm run migrate:tenants` once. The migration creates the `uniosun` institution, assigns existing institution records to it, replaces global course/user/group uniqueness indexes with institution-scoped indexes, and creates the platform administrator if one does not already exist.
4. Deploy/restart the backend. Remove the bootstrap password from the deployment environment after the platform administrator is created.
5. Existing users sign in with institution code `uniosun`. New institutions receive their own code.

Do not run the migration against production without a verified backup and a maintenance window.

## Provision institutions

Sign in as the platform administrator with a blank institution code, then create an institution and its first institution administrator through `POST /api/institutions` using the platform-admin bearer token. Required body fields: `name`, `code` (lowercase letters, digits, hyphens), `adminName`, `adminEmail`, `adminIdentifier`, and `adminPassword` (minimum 12 characters). The first administrator can then create users and courses inside that institution.

Normal users must supply their institution code at login. Institution administrators can only manage their own institution; the platform administrator can provision institutions but cannot access tenant data through the application APIs.
