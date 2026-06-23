# Factory Hook Gates

These hooks make the development stack YOLO-capable without removing disaster recovery or structural guardrails.

## Hard Gates

1. `pre_work_snapshot.sh <run_id>`
   - Required before any write-capable work.
   - Writes `workspace/dr/<run_id>_snapshot.json`.
2. `gate_architecture.py <blueprint>`
   - Requires a valid architecture blueprint with relative `allowed_write_paths`.
3. `gate_diff_scope.py <blueprint>`
   - Blocks diffs outside the blueprint.
   - Blocks protected infrastructure edits unless `infrastructure_run=true`.
4. `gate_validation.py <validation_report>`
   - Requires real command evidence with `[EXIT_CODE: 0]` and `[STATUS: PASS]`.
5. `gate_review.py <review_log>`
   - Requires passed review and no security findings.

## YOLO Policy

This is a dev environment. Agents may proceed without per-step approval after `pre_work_snapshot.sh` succeeds. The hooks block only missing DR, missing artifacts, out-of-bounds writes, failed tests, or failed review.

6. `gate_technology_choice.py <technology_tradeoff_matrix.md>`
   - Required for complex multilayer systems.
   - Requires GitHub risk report reference, reversal triggers, and connector harness acknowledgement.

7. `gate_product_docs.py <product_root>`
   - Required for productized work.
   - Requires `BOM.md`, `docs/Architecture.md`, and a lessons-learned document under the product root.
   - Blocks product-specific scripts from becoming undocumented factory-global tools.


8. `gate_export_coverage.py`
   - Required for UAT/PROD environment updates and customer/export changes.
   - Requires `docs/runbooks/FACTORY_EXPORT_COVERAGE.md`, export scripts, exclusion coverage, and no staged secret/runtime paths.
   - Must pass before `factory-secure-backup.sh` or `factory-export-customer.sh` completes.
