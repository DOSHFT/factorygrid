# Blue-Team-CELL Seed Brief

Generated: 2026-05-18
Safety: LAB_ONLY_DEFENSIVE_NO_LIVE_NETWORK_INTERCEPTION

## Mission

Blue-Team-CELL builds defensive cellular security knowledge for FactoryGrid. It covers legacy 2G/GSM risk through LTE/5G/O-RAN/cloud-native core and early 6G tracking. It produces evidence-backed blue-team controls, lab validation plans, and operator-readable risk briefs.

## Initial Defensive Knowledge Base

- NIST 5G Open-Source Testbed Automation Tool is the preferred lab foundation because it was updated to version 1.7 on 2026-05-06 and supports O-RAN testbed automation, UE/gNodeB/5G Core/RIC/xApp workflows, slicing, handover, and metrics.
- ENISA 5G Threat Landscape provides the baseline asset/threat/control model for 5G architecture, vulnerabilities, exposure, migration paths, and technical controls.
- Open5GS, UERANSIM, and OpenAirInterface are lab stack candidates for safe simulation and validation.
- 5GBaseChecker is a research-grade testing reference for control-plane behavior and baseband interaction analysis.
- Osmocom/gr-gsm belongs in a constrained legacy-risk track for lawful lab education and downgrade/ciphering risk modeling only.

## Guardrails

- No live-network interception, jamming, unauthorized RF transmission, subscriber capture, or rogue base-station instructions.
- Prefer simulator-only labs first.
- SDR labs require shielding/cabled setups, legal spectrum authorization, and explicit operator approval.
- Outputs should become detections, controls, lab plans, and hardening checks.

## Backlog

1. Build a cellular threat taxonomy mapped to 2G, 3G, 4G, 5G SA/NSA, O-RAN, cloud-native core, and early 6G themes.
2. Create a lab plan using NIST O-RAN automation, Open5GS, UERANSIM, and optional OAI.
3. Create detection/control matrices for AMF/SMF/UPF/SEPP/AUSF/UDM, RAN telemetry, RIC/xApps, network slicing, and legacy downgrade exposure.
4. Add a recurring source-refresh job for NIST, ENISA, CISA/NSA, GSMA, 3GPP, Open5GS, UERANSIM, OAI, Osmocom, and major telecom security papers.
