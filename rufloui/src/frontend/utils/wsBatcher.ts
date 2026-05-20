export interface BufferedMessageOptions {
  flushMs?: number
  maxBatchSize?: number
}

export function createBufferedMessageHandler<T>(
  handleMessage: (message: T) => void,
  options: BufferedMessageOptions = {},
): (message: T) => void {
  const flushMs = options.flushMs ?? 75
  const maxBatchSize = options.maxBatchSize ?? 100
  let queue: T[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    const batch = queue
    queue = []
    for (const message of batch) handleMessage(message)
  }

  return (message: T) => {
    queue.push(message)
    if (queue.length >= maxBatchSize) {
      flush()
      return
    }
    if (!timer) timer = setTimeout(flush, flushMs)
  }
}
