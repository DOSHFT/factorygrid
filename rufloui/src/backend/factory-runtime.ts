import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface GpuMetrics {
  name: string
  memoryUsedMb: number
  memoryFreeMb: number
  memoryTotalMb: number
  utilizationPct: number
  temperatureC: number
}

export interface FactoryEndpoint {
  name: string
  url: string
  status: 'ok' | 'fail' | 'unknown'
  detail: string
}

export interface FactoryRuntimeSnapshot {
  generatedAt: string
  endpoints: FactoryEndpoint[]
  gpu: GpuMetrics | null
  protectedFilePatterns: string[]
}

const PROTECTED_PATTERNS = [
  'docker-compose.yml',
  '.env',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'Cargo.toml',
  'Cargo.lock',
  'requirements.txt',
  'pyproject.toml',
  'litellm_config.yaml',
  'openhands_state/settings.json',
  'bin/start-vllm-factory.sh',
]

export function classifyProtectedPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  return PROTECTED_PATTERNS.some((pattern) => {
    if (pattern === '.env') return normalized === '.env' || normalized.startsWith('.env.')
    return normalized === pattern || normalized.endsWith(`/${pattern}`)
  })
}

export function protectedFilePatterns(): string[] {
  return [...PROTECTED_PATTERNS]
}

export function summarizeDockerPortBinding(ports: string): string[] {
  return ports
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

export function parseNvidiaSmiCsv(csv: string): GpuMetrics | null {
  const line = csv.trim().split('\n').find(Boolean)
  if (!line) return null
  const [name, used, free, total, utilization, temp] = line.split(',').map((part) => part.trim())
  if (!name) return null
  return {
    name,
    memoryUsedMb: Number(used),
    memoryFreeMb: Number(free),
    memoryTotalMb: Number(total),
    utilizationPct: Number(utilization),
    temperatureC: Number(temp),
  }
}

async function checkEndpoint(name: string, url: string): Promise<FactoryEndpoint> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    return {
      name,
      url,
      status: response.ok ? 'ok' : 'fail',
      detail: `${response.status} ${response.statusText}`.trim(),
    }
  } catch (err) {
    return {
      name,
      url,
      status: 'fail',
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

async function readGpuMetrics(): Promise<GpuMetrics | null> {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=name,memory.used,memory.free,memory.total,utilization.gpu,temperature.gpu',
      '--format=csv,noheader,nounits',
    ], { timeout: 5000 })
    return parseNvidiaSmiCsv(stdout)
  } catch {
    return null
  }
}

export async function getFactoryRuntimeSnapshot(): Promise<FactoryRuntimeSnapshot> {
  const endpoints = await Promise.all([
    checkEndpoint('vLLM', 'http://host.docker.internal:8000/v1/models'),
    checkEndpoint('LiteLLM', 'http://litellm:4000/v1/models'),
    checkEndpoint('Qdrant', 'http://qdrant:6333/collections'),
    checkEndpoint('OpenHands', 'http://agent_openhands:3000/api/settings'),
    Promise.resolve({
      name: 'RuFlo orchestrator',
      url: 'docker compose service: ruflo_orchestrator',
      status: 'unknown' as const,
      detail: 'Readiness is enforced by the orchestrator container healthcheck.',
    }),
  ])

  return {
    generatedAt: new Date().toISOString(),
    endpoints,
    gpu: await readGpuMetrics(),
    protectedFilePatterns: protectedFilePatterns(),
  }
}
