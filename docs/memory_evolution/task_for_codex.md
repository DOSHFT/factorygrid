.env additions:
envNEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=<local-secret>
GRAPHITI_EMBEDDING_MODEL=grok-4   # or your best local model
Start Command:
Bashdocker compose up -d neo4j
After starting: Open http://localhost:7474, login, and run :sysinfo to verify.
text---

### **3. `docs/memory_evolution/MEMORY_CORE_SPEC.md`**

```markdown
# MEMORY_CORE_SPEC.md

**File to create**: `factorygrid/memory/memory_core.py`

```python
import os
import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from graphiti_core import Graphiti
from graphiti_core.driver.neo4j_driver import Neo4jDriver
from graphiti_core.nodes import EntityNode, EpisodeNode
from graphiti_core.edges import Edge

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class UltronMemoryCore:
    """Production hybrid memory core for Project Ultron"""

    def __init__(self):
        self.neo4j_uri = os.getenv("NEO4J_URI", "bolt://neo4j:7687")
        self.neo4j_user = os.getenv("NEO4J_USER", "neo4j")
        self.neo4j_password = os.getenv("NEO4J_PASSWORD")

        driver = Neo4jDriver(
            uri=self.neo4j_uri,
            user=self.neo4j_user,
            password=self.neo4j_password
        )
        self.graphiti = Graphiti(graph_driver=driver)
        self.graphiti.build_indices_and_constraints()  # Run once

        # Qdrant fallback (will be removed later)
        self.qdrant_fallback = None  # Initialize if needed

    async def add_episode(self, content: str, metadata: Dict[str, Any]) -> str:
        """Add new memory with temporal awareness"""
        try:
            episode = await self.graphiti.add_episode(
                name=metadata.get("task_id", f"episode_{datetime.now().isoformat()}"),
                episode_body=content,
                metadata=metadata
            )
            logger.info(f"Added episode: {episode.uuid}")
            return episode.uuid
        except Exception as e:
            logger.error(f"Graphiti error: {e}")
            # Fallback to old system if needed
            return "fallback"

    async def query(self, query_text: str, limit: int = 20) -> List[Dict]:
        """Hybrid search"""
        try:
            graph_results = await self.graphiti.search(
                query=query_text,
                limit=limit
            )
            return graph_results
        except Exception as e:
            logger.warning(f"Graphiti query failed: {e}")
            return []

    async def repair_memory(self, issue: str, related_episodes: List[str]):
        """Create supersedes / invalidated_by relationships"""
        # Implementation using Graphiti edges
        pass  # Codex to expand with full logic

    async def run_checker_loop(self, task_result: Dict):
        """SAGE-style validation and repair trigger"""
        # Detect contradictions, apply decay, create repair tasks
        pass  # Codex to expand
Implementation Note: Make this class fully async and robust with fallbacks.
text---

### **4. `docs/memory_evolution/TASKS_FOR_CODEX.md`**

```markdown
# TASKS_FOR_CODEX.md

**Exact Prompt to paste into Codex (or Grok CLI)**

You are implementing the complete Memory Evolution for Project Ultron.

1. Update docker-compose.yml with Neo4j from DOCKER_MEMORY.md
2. Create the full `factorygrid/memory/` directory with memory_core.py (use MEMORY_CORE_SPEC.md)
3. Create RuFlo skills for MemoryWriter, MemoryReader, MemoryChecker
4. Update RuFlo Queen to use the new UltronMemoryCore and run the SAGE loop after every major task
5. Add automatic MemoryRepairTask creation on any validation failure
6. Decommission old Qdrant primary usage (keep only as fallback)
7. Update Architecture.md and README.md to reflect the new memory system
8. Create a migration script to import existing Factory Brain markdown into Graphiti

Work step by step. Be production conservative: full logging, error handling, and backward compatibility during transition.

Start now.

These four files form the complete package.
Next Action: Create the folder docs/memory_evolution/, paste all four files, then paste the content of TASKS_FOR_CODEX.md into Codex.
