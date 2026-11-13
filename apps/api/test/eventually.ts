/**
 * Calls `read` every 100ms until `done(value)` holds or `timeoutMs` passes, then returns
 * the last value. For waiting on background work (queues, workers) in integration tests.
 */
export async function eventually<T>(
  read: () => T | Promise<T>,
  done: (value: T) => boolean,
  timeoutMs = 5000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  const attempt = async (): Promise<T> => {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
    return attempt();
  };
  return attempt();
}
