Technical Handover Specification: FactoryGrid Multi-Agent Infrastructure

> **Note (June 2026)**: This document describes the overall topology. Key recent evolutions: Bounded Execution lane merged into production RuFloUI backend; Mode A research capability added via hardened Claude Code wrappers (see MODE_A_CLAUDE_CODE_ARTIFACT_FORGE.md). Model choices and exact components have evolved (see current vLLM/LiteLLM config).
1. Architectural Vision
The objective is to establish a high-concurrency, air-gapped Autonomous Software Factory on a single bare-metal workstation. The topology isolates task orchestration, tool execution, proxy gateway management, and hardware acceleration into bounded layers interacting over local loopbacks (localhost) to reduce network latency to zero.
       ┌─────────────────────────────────────────────────────────┐
       │             Host OS (Windows: "BlackBeast")             │
       │  ┌───────────────────────────────────────────────────┐  │
       │  │             WSL 2 Core ("Revelation")             │  │
       │  │  ┌─────────────────────────────────────────────┐  │  │
       │  │  │       vLLM Engine (Native Host Processes)   │  │  │
       │  │  │       - Model: Qwen 2.5 Coder 14B AWQ       │  │  │
       │  │  │       - Resources: Locked 4090 VRAM (22.3GB)│  │  │
       │  │  └──────────────────────▲──────────────────────┘  │  │
       │  │                         │ (IPC Bridge via Host IP)│  │
       │  │  ┌──────────────────────┴──────────────────────┐  │  │
       │  │  │       Docker Engine Subsystem ("FactoryGrid")│  │  │
       │  │  │  ┌─────────────┐ ┌─────────────┐ ┌────────┐ │  │  │
       │  │  │  │  OpenHands  │ │   LiteLLM   │ │ Qdrant │ │  │  │
       │  │  │  │  (Engineer) │ │  (Gateway)  │ │ (VDB)  │ │  │  │
       │  │  │  └──────┬──────┘ └──────▲──────┘ └────────┘ │  │  │
       │  │  └─────────┼───────────────┼───────────────────┘  │  │
       │  └────────────┼───────────────┼──────────────────────┘  │
       │               ▼               │                         │
       │     [ Browser UI Port 3000 ] ─┘                         │
       └─────────────────────────────────────────────────────────┘
2. Machine Topography & Hostnames
Bare-Metal Host Platform: BlackBeast
OS: Windows 11 Pro / Enterprise
CPU: Intel Core i9-13900K (24 Cores / 32 Threads)
System Memory: 64 GB Dual-Channel DDR5 @ 6000 MHz (CL36 XMP)
GPU: 1x NVIDIA GeForce RTX 4090 (24 GB GDDR6X VRAM)
Storage: PCIe Gen4 NVMe SSD execution volume
Linux Virtualization Kernel: Revelation
OS Environment: WSL 2 (Ubuntu 22.04 / 24.04 LTS instance)
Network Integration: Shares default WSL 2 virtual hypervisor loopback backplanes with BlackBeast.
Container Runtime Infrastructure: FactoryGrid
Engine: Docker Desktop running on BlackBeast with active WSL 2 Integration toggled on for the Revelation instance.
Network Topology: Standard internal Docker virtual bridge networking (factory_net).
3. Current Implementation State
Completed & Validated Layers
NVIDIA Driver Passthrough: Fully operational. WSL nvidia-smi kernel space calls correctly populate hardware registers for the RTX 4090.
Docker WSL 2 Integration: Fully operational. Running docker ps inside Revelation natively displays and controls the container stack running on the Windows host.
Inference Layer Acceleration: Upstream production-grade engine vllm==0.7.3 compiled cleanly with explicit CUDA 13.2 wheels. The model Qwen2.5-Coder-14B-Instruct-AWQ successfully mounts via the runtime optimization pass using low-latency awq_marlin computation kernels.
GPU VRAM Reservation: The inference layer successfully completes the hardware memory profile block initialization sequence, taking down 19.9 GB / 24 GB of static VRAM (setting utilization boundaries explicitly to 0.93). Maximum input-to-output sequence arrays are capped at an optimal 32,768 context length.
Gateway Routing Matrix: LiteLLM proxy server and Qdrant Vector database containers are mounted and stable inside the internal bridge network.
Current Blockers / Roadblocks
OpenHands Endpoint Negotiation Failure: OpenHands is actively running, but it fails to execute prompts. It raises an uncaught BadRequestError: litellm.BadRequestError: LLM Provider NOT provided fault when passing token schemas up the chain.
The Root Cause: OpenHands interacts with LiteLLM. LiteLLM rejects raw model strings unless they explicitly declare a target vendor signature block (provider/model). When OpenHands attempts a generation pass, it sends the plain identifier name, causing the downstream proxy network thread to crash.
4. Current Configuration Profiles
Core Grid Management: ~/factorygrid/docker-compose.yml
yaml
networks:
  factory_net:
    driver: bridge

services:
  # --- INFRASTRUCTURE: VECTOR DATABASE ---
  qdrant:
    image: qdrant/qdrant:latest
    container_name: factory_qdrant
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - ./qdrant_storage:/qdrant/storage
    networks:
      - factory_net
    restart: unless-stopped

  # --- GATEWAY ROUTER: LITELLM ---
  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    container_name: factory_litellm
    ports:
      - "4000:4000"
    volumes:
      - ./litellm_config.yaml:/app/config.yaml
    command: [ "--config", "/app/config.yaml", "--port", "4000" ]
    extra_hosts:
      - "host.docker.internal:host-gateway"
    networks:
      - factory_net
    restart: unless-stopped
    depends_on:
      - qdrant

  # --- SWARM ORCHESTRATOR: RUFLO QUEEN ---
  ruflo_orchestrator:
    image: node:20-slim
    container_name: factory_ruflo
    volumes:
      - ./ruflo_project:/app
      - /var/run/docker.sock:/var/run/docker.sock
    working_dir: /app
    environment:
      - OPENAI_API_BASE=http://docker.internal
      - OPENAI_API_KEY=factory-secret-key
    command: sh -c "npm install -g ruflo@latest && npx ruflo@latest start"
    networks:
      - factory_net
    restart: unless-stopped
    depends_on:
      - litellm

  # --- AGENT WORKER INFRASTRUCTURE: DETACHED RUNTIMES ---
  qwen_code_worker:
    image: node:20-slim
    container_name: agent_qwen_code
    volumes:
      - ./workspace:/workspace
    working_dir: /workspace
    environment:
      - OPENAI_API_BASE=http://docker.internal
    command: tail -f /dev/null
    networks:
      - factory_net
    restart: unless-stopped

  # --- AUTONOMOUS AGENT WORKER ---
  openhands_engineer:
    image: ghcr.io/all-hands-ai/openhands:latest
    container_name: agent_openhands
    pull_policy: always
    ports:
      - "3000:3000"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./workspace:/opt/workspace_base
    environment:
      - LLM_PROVIDER=openai
      - LLM_MODEL=openai/qwen-coder-14b
      - LLM_BASE_URL=http://docker.internal
      - LLM_API_KEY=factory-secret-key
      - TAVILY_API_KEY=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
      - SANDBOX_USER_ID=0
      - SANDBOX_TIMEOUT=120
    networks:
      - factory_net
    restart: unless-stopped
Use code with caution.
Gateway Routing Table: ~/factorygrid/litellm_config.yaml
yaml
model_list:
  # Primary vLLM Local Engine Mapping
  - model_name: qwen-coder-14b
    litellm_params:
      model: openai/Qwen/Qwen2.5-Coder-14B-Instruct-AWQ
      api_base: http://172.17.0
      api_key: "not-needed"

  # Secondary Reasoning Layer (LM Studio Windows Fallback placeholder)
  - model_name: qwen-architect-35b
    litellm_params:
      model: openai/qwen3.6-35b-a3b
      api_base: http://172.17.0
      api_key: "not-needed"
Use code with caution.
5. Network Address & Interface Maps
vLLM Core Native Endpoint: http://localhost:8000/v1 (Accessible straight from Revelation bash).
Docker Container Bridge Loopback: Containers target the underlying Linux host interface machine using the specific gateway IP 172.17.0.1 inside the internal virtual switches.
LiteLLM Central Proxy Port: Exposed to the cluster at http://docker.internal.
OpenHands Web Console Panel: Mounted onto the host platform interface, accessible via browser at http://localhost:3000.
6. Immediate Action Plan for CODEX
To complete this handshake loop, execute these precise structural adjustments:
Verify Token Routing Mapping: Confirm if OpenHands should target the generic model alias qwen-coder-14b via LiteLLM (:4000/v1) or if it needs its parameters adjusted inside the browser panel settings block to clear the LLM Provider NOT provided validation crash.
Initialize Workspace Mounting Permissions: Ensure that container instances executing real coding cycles have full chmod 777 access vectors into the unified filesystem workspace directory located at ~/factorygrid/workspace.
Execute Network Verification: Test container breakout tracking by querying curl http://172.17.0 straight from inside a running container to guarantee absolute socket visibility between Docker and the native vLLM daemon.
Next Step for the User: You are completely set up and ready to hand off this specification file. When you feed this document to your coding agent or loop back to finish the build, would you like to target fixing the OpenHands to LiteLLM prefix routing mapping, or should we run the container network socket verification test first?