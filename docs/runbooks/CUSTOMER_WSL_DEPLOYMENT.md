# Customer WSL Deployment Export

Create a customer handoff bundle from the live Revelation factory:

```bash
cd /home/revelation/factorygrid
bin/factory-export-customer.sh /mnt/d/UAT/releases
```

Outputs:
- `factorygrid-customer-<timestamp>.tar.gz`
- `factorygrid-customer-<timestamp>.run`
- `factorygrid-customer-<timestamp>.sha256`
- `factorygrid-customer-<timestamp>.manifest.txt`

Recommended customer install:

```bash
chmod +x factorygrid-customer-<timestamp>.run
./factorygrid-customer-<timestamp>.run --target $HOME/factorygrid
cd $HOME/factorygrid
nano .env
docker compose up -d
./bin/factory-doctor.sh
```

Options:
- `--target /path/to/factorygrid`: install somewhere other than `$HOME/factorygrid`
- `--skip-deps`: copy files only; do not run `npm install`
- `--start`: run `docker compose up -d` after install
- `--force`: overwrite target without first moving it to a timestamped backup

The export is built from the sanitized UAT copy. It excludes local secrets, `.env`, OpenHands runtime secrets, Qdrant storage, logs, `node_modules`, build outputs, model blobs, and credential files.
