import type { IndexEntry } from './types';
import { getCapturedAuth } from './auth-capture';

const TAG = '[ssb:indexer]';
const RETRY_INTERVAL_MS = 2000;
const MAX_RETRIES = 30; // 2s × 30 = 60s max wait

export type IndexState = {
  entries: IndexEntry[];
  building: boolean;
};

/**
 * Request the server to crawl settings via headless Playwright.
 * Interface is identical to the old client-side DOM crawling version:
 * `buildIndex(onProgress?, force?) → Promise<IndexEntry[]>`
 *
 * When `force` is false (default), the server returns a cached result if available.
 * When `force` is true, the server re-crawls from scratch.
 */
export async function buildIndex(
  onProgress?: (msg: string) => void,
  force = false,
): Promise<IndexEntry[]> {
  const risuAuth = getCapturedAuth();
  if (!risuAuth) {
    console.warn(`${TAG} no risu-auth token captured yet — try navigating to another page first`);
    onProgress?.('Auth token not available');
    return [];
  }

  console.debug(`${TAG} requesting server-side crawl (force=${force})`);
  onProgress?.(force ? 'Re-crawling settings...' : 'Loading settings index...');

  try {
    const headers: Record<string, string> = { 'risu-auth': risuAuth };
    if (force) {
      headers['x-ssb-force-crawl'] = 'true';
    }
    const resp = await fetch('/setting-searchbar/build-index', {
      method: 'POST',
      headers,
    });

    if (resp.status === 429) {
      console.debug(`${TAG} crawl in progress, waiting...`);
      onProgress?.('Crawl in progress, waiting...');
      return waitForCrawl(headers, onProgress);
    }

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`${TAG} server returned ${resp.status}: ${body}`);
      onProgress?.('Crawl failed');
      return [];
    }

    const result: { entries: IndexEntry[]; requestLog: { method: string; url: string; action: string }[] } = await resp.json();
    const { entries, requestLog } = result;

    const allowed = requestLog.filter((r) => r.action === 'allowed').length;
    const blocked = requestLog.filter((r) => r.action === 'blocked').length;
    console.debug(`${TAG} received ${entries.length} entries (${allowed} requests allowed, ${blocked} blocked)`);
    console.debug(`${TAG} blocked requests:`, requestLog.filter((r) => r.action === 'blocked').slice(0, 10));

    onProgress?.(`${entries.length} items indexed`);
    return entries;
  } catch (err) {
    console.error(`${TAG} fetch error:`, err);
    onProgress?.('Network error');
    return [];
  }
}

/** Poll until the in-progress crawl finishes, then return the result. */
async function waitForCrawl(
  headers: Record<string, string>,
  onProgress?: (msg: string) => void,
): Promise<IndexEntry[]> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
    onProgress?.(`Waiting for crawl... (${i + 1})`);

    try {
      const resp = await fetch('/setting-searchbar/build-index', {
        method: 'POST',
        headers,
      });

      if (resp.status === 429) continue;

      if (!resp.ok) {
        console.error(`${TAG} server returned ${resp.status}`);
        onProgress?.('Crawl failed');
        return [];
      }

      const result: { entries: IndexEntry[]; requestLog: { method: string; url: string; action: string }[] } = await resp.json();
      console.debug(`${TAG} received ${result.entries.length} entries after waiting`);
      onProgress?.(`${result.entries.length} items indexed`);
      return result.entries;
    } catch (err) {
      console.error(`${TAG} fetch error while waiting:`, err);
    }
  }

  console.warn(`${TAG} gave up waiting after ${MAX_RETRIES} retries`);
  onProgress?.('Crawl timed out');
  return [];
}
