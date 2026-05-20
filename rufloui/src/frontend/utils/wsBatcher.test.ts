import { describe, expect, test, vi } from 'vitest'
import { createBufferedMessageHandler } from './wsBatcher'

describe('createBufferedMessageHandler', () => {
  test('batches rapid websocket messages into one timed flush', () => {
    vi.useFakeTimers()
    const handled: string[] = []
    const handler = createBufferedMessageHandler<{ type: string; payload: unknown }>(
      (msg) => handled.push(msg.type),
      { flushMs: 75 },
    )

    handler({ type: 'task:output', payload: { id: 'task-1', content: 'a' } })
    handler({ type: 'agent:activity', payload: { agentId: 'agent-1' } })
    handler({ type: 'log', payload: { message: 'hello' } })

    expect(handled).toEqual([])

    vi.advanceTimersByTime(74)
    expect(handled).toEqual([])

    vi.advanceTimersByTime(1)
    expect(handled).toEqual(['task:output', 'agent:activity', 'log'])
    vi.useRealTimers()
  })

  test('flushes immediately when the max batch size is reached', () => {
    vi.useFakeTimers()
    const handled: string[] = []
    const handler = createBufferedMessageHandler<{ type: string; payload: unknown }>(
      (msg) => handled.push(msg.type),
      { flushMs: 75, maxBatchSize: 2 },
    )

    handler({ type: 'one', payload: null })
    handler({ type: 'two', payload: null })

    expect(handled).toEqual(['one', 'two'])
    vi.useRealTimers()
  })
})
