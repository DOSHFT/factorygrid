# Restore FactoryGrid UAT Copy

Copy this folder into a fresh WSL Ubuntu box, then run:

```bash
cd factorygrid
cp .env.example .env
# edit .env with local-only secrets/endpoints
npm --prefix ruflo_project install
npm --prefix rufloui install --legacy-peer-deps
docker compose up -d
./bin/factory-doctor.sh
```

Excluded on purpose: `.env`, OpenHands secrets, Qdrant runtime storage, logs, dependency folders, build output, model blobs, and credential-bearing files.
