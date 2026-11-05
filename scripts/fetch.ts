/** Fetching for the scripts: GET with retries, and a pool that runs requests a few at a time. */

/** GET a URL's text, or null when it isn't there (404). Network errors, 429 and 5xx are retried. */
export async function get(
  url: string,
  headers: Record<string, string> = {},
): Promise<string | null> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": "skillhub-sync", ...headers } }).catch(
      (error: Error) => error,
    );
    if (!(res instanceof Error)) {
      if (res.status === 404) return null;
      if (res.ok) return res.text();
      if (res.status !== 429 && res.status < 500) throw new Error(`${url}: HTTP ${res.status}`);
    }
    if (attempt === 4)
      throw new Error(`${url}: ${res instanceof Error ? res.message : `HTTP ${res.status}`}`);
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
}

/** Run `work` on every item, `size` at a time. */
export async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: size }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
    }),
  );
}
