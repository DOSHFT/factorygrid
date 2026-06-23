# DOCKER_MEMORY.md

## Neo4j + Graphiti Docker Setup

### Add this to your root `docker-compose.yml`:

```yaml
services:
  neo4j:
    image: neo4j:5.26-community
    container_name: ultron-neo4j
    restart: unless-stopped
    ports:
      - "7474:7474"   # Neo4j Browser
      - "7687:7687"   # Bolt protocol
    environment:
      - NEO4J_AUTH=neo4j/${NEO4J_PASSWORD:?Set NEO4J_PASSWORD in .env}
      - NEO4J_PLUGINS=["apoc"]
      - NEO4J_dbms_security_procedures_unrestricted=apoc.*
      - NEO4J_server_memory_heap_initial__size=2G
      - NEO4J_server_memory_heap_max__size=6G
      - NEO4J_dbms_memory_pagecache_size=2G
    volumes:
      - ultron_neo4j_data:/data
      - ultron_neo4j_logs:/logs
      - ultron_neo4j_import:/imports
    networks:
      - ultron-network

volumes:
  ultron_neo4j_data:
  ultron_neo4j_logs:
  ultron_neo4j_import:

networks:
  ultron-network:
    driver: bridge
