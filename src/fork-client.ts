type ForkClient = {
  server: { info: (options?: { signal?: AbortSignal }) => Promise<{ pid: number }> };
};

export async function verifyForkClient<T extends ForkClient>(
  client: T,
  expectedPID: number,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const info = await client.server.info({ signal });
  signal?.throwIfAborted();
  if (info.pid !== expectedPID) {
    throw new Error(
      "The registered OpenCode service is not this plugin's host. Session fork was not attempted.",
    );
  }
  return client;
}
