# Upgrade Path and Versioning

## Scope

M6 introduces an explicit version contract for the control plane:

- database schema version: `2026-03-29`
- runtime config version: `1`

The API persists these in `control_plane_metadata` and refuses to boot when the live database does not match the expected versions.

## Version Sources

- `CONTROL_PLANE_SCHEMA_VERSION` is the schema generation the current API binary expects.
- `CONTROL_PLANE_CONFIG_VERSION` is the runtime config generation expected by the current API binary.
- `control_plane_metadata` stores the applied schema/config version pair plus the last upgrade timestamp.

The expected values ship with the code and are exposed by `/health`.

## Supported Upgrade Procedure

1. Take a logical backup:
   `corepack pnpm ops:backup`
2. Roll out the new application code.
3. Run schema migrations against the target database:
   `corepack pnpm --dir apps/api db:migrate`
4. Verify the applied schema/config metadata:
   `corepack pnpm --dir apps/api db:status`
5. Start the API and confirm `/health` reports the expected versions.
6. Reopen traffic only after API startup and basic route checks succeed.

## Failure Handling

- If the API fails to start with a schema or config version mismatch, do not force startup. Run `db:migrate` or restore the previous supported deployment.
- If `db:migrate` fails partway through, stop the rollout and investigate before restarting application traffic.
- If backup exists but upgrade validation fails, restore from backup into a clean target and rerun the documented upgrade path.

## Rollback Notes

Backward schema rollback is not guaranteed safe. The current migration path is additive and does not ship reverse migrations for every schema change.

For incompatible or partially applied upgrades, the supported rollback path is:

1. stop the new application build
2. restore the last known-good control-plane backup
3. redeploy the previously supported application build

Do not manually drop columns or tables in production as an ad hoc rollback strategy.
