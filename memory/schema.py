"""Shared memory graph schema constants."""

NODE_TYPES = {
    "entity",
    "episode",
    "artifact",
    "task",
    "run",
    "source",
    "decision",
}

RELATION_TYPES = {
    "supports",
    "contradicts",
    "supersedes",
    "derived_from",
    "used_in",
    "invalidated_by",
}

TEMPORAL_FIELDS = {
    "valid_from",
    "valid_until",
    "observed_at",
    "superseded_at",
    "reason",
}
