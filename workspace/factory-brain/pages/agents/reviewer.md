---
id: agent-reviewer
type: agent
title: "reviewer"
updatedAt: 2026-05-18T15:53:54.378Z
source: "workspace/research/agent-growth/reviewer/source_manifest.json"
tags: ["agent-growth", "factory-brain", "reviewer"]
---

# reviewer

## Compiled Truth
reviewer owns security review, diff policing, dependency risk, and regression gates. Its initial growth loop is seeded with 10 GitHub repositories selected for directly reusable patterns, tooling, or safety controls. The agent should use these sources as a watchlist and promote only verified, role-specific lessons into memory.

---

## Current Watchlist
1. [semgrep/semgrep](https://github.com/semgrep/semgrep) - Static analysis rules and custom policy checks
2. [github/codeql](https://github.com/github/codeql) - Semantic code analysis and query packs
3. [aquasecurity/trivy](https://github.com/aquasecurity/trivy) - Container, dependency, and config vulnerability scanning
4. [gitleaks/gitleaks](https://github.com/gitleaks/gitleaks) - Secret scanning
5. [trufflesecurity/trufflehog](https://github.com/trufflesecurity/trufflehog) - Secret discovery and verification
6. [OWASP/Dependency-Check](https://github.com/OWASP/Dependency-Check) - Dependency vulnerability analysis
7. [owasp-dep-scan/dep-scan](https://github.com/owasp-dep-scan/dep-scan) - Software composition analysis
8. [zaproxy/zaproxy](https://github.com/zaproxy/zaproxy) - Web app dynamic security testing
9. [sonarsource/sonarqube](https://github.com/sonarsource/sonarqube) - Code quality and security gate patterns
10. [pmd/pmd](https://github.com/pmd/pmd) - Static code rule engine examples

## Timeline
- 2026-05-18T15:53:54.378Z: Default growth seed created and indexed into FactoryGrid memory.
