import { describe, expect, test } from 'vitest'
import { classifyProtectedPath, summarizeDockerPortBinding, parseNvidiaSmiCsv } from './factory-runtime'

describe('factory runtime helpers', () => {
  test('classifies protected config and dependency files', () => {
    expect(classifyProtectedPath('docker-compose.yml')).toBe(true)
    expect(classifyProtectedPath('rufloui/package-lock.json')).toBe(true)
    expect(classifyProtectedPath('src/frontend/App.tsx')).toBe(false)
  })

  test('summarizes docker port bindings without exposing noisy internals', () => {
    expect(summarizeDockerPortBinding('0.0.0.0:4000->4000/tcp, [::]:4000->4000/tcp')).toEqual([
      '0.0.0.0:4000->4000/tcp',
      '[::]:4000->4000/tcp',
    ])
    expect(summarizeDockerPortBinding('')).toEqual([])
  })

  test('parses nvidia-smi csv into typed metrics', () => {
    expect(parseNvidiaSmiCsv('NVIDIA GeForce RTX 4090, 19596, 4543, 24564, 6, 37')).toEqual({
      name: 'NVIDIA GeForce RTX 4090',
      memoryUsedMb: 19596,
      memoryFreeMb: 4543,
      memoryTotalMb: 24564,
      utilizationPct: 6,
      temperatureC: 37,
    })
  })
})

