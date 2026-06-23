# FactoryGrid Backup And Restore

FactoryGrid backups are local tar bundles with a manifest and checksum. The backup script captures config, runtime scripts, RuFlo state, RuFlo UI persistence, OpenHands state, selected logs, and best-effort Qdrant collection snapshots through the Qdrant HTTP API.

## Backup

```bash
bin/factory-backup.sh
```

By default `.env` is excluded so secrets are not copied into routine archives. For an offline encrypted/secrets backup, run:

```bash
FACTORY_BACKUP_INCLUDE_SECRETS=yes bin/factory-backup.sh
```

## Inspect Restore

Restore defaults to dry-run inspection:

```bash
bin/factory-restore.sh /home/revelation/factorygrid_backups/factorygrid-YYYYmmddTHHMMSSZ.tar.gz
```

## Apply Restore

Apply restore only after inspecting the manifest and stopping affected services:

```bash
bin/factory-restore.sh --apply /home/revelation/factorygrid_backups/factorygrid-YYYYmmddTHHMMSSZ.tar.gz
```

The script copies current selected files to `factorygrid.pre-restore-<timestamp>` before overwriting.

## Notes

- Qdrant backups use collection snapshot APIs when `http://127.0.0.1:6333` is reachable.
- Neo4j Community Edition requires offline backup semantics for a consistent database dump; the routine backup records this limitation instead of pretending an online dump is safe.
- A backup is only considered valid after the archive checksum verifies and `factory-restore.sh` can inspect the manifest.
