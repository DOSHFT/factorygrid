# MEMORY_CORE_SPEC.md

## Production Memory Core Implementation

**File to create**: `factorygrid/memory/memory_core.py`

### Requirements
- Hybrid access to Qdrant + Graphiti
- Full error handling and fallback to old system
- Async support for RuFlo

### Code Skeleton (Implement this)

```python
import os
from datetime import datetime
from graphiti_core import Graphiti
from graphiti_core.nodes import EntityNode, EpisodeNode
from graphiti_core.edges import Edge
# ... existing Qdrant imports

class UltronMemoryCore:
    def __init__(self, neo4j_url: str = None):
        self.graphiti = Graphiti(
            url=neo4j_url or os.getenv("GRAPHITI_NEO4J_URL"),
            # other config
        )
        self.qdrant = self._init_qdrant()

    async def add_memory(self, content: str, metadata: dict, source_task_id: str = None):
        """Write new memory with temporal awareness"""
        episode = await self.graphiti.add_episode(content, metadata)
        # Also index in Qdrant with graph node IDs
        await self._sync_to_qdrant(episode, metadata)

    async def query(self, query: str, limit: int = 15, temporal_filter=None):
        """Hybrid retrieval"""
        graph_results = await self.graphiti.search(query, limit=limit)
        vector_results = await self.qdrant.query(...)  # existing logic
        return self._merge_results(graph_results, vector_results)

    async def repair_memory(self, issue: str, related_memories: list):
        """Create supersedes / invalidated_by edges"""
        # Implementation using Graphiti edges
        pass

    async def run_checker_loop(self, memories: list):
        """SAGE-style validation"""
        pass