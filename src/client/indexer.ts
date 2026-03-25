import type { IndexEntry } from './types';
import { getCapturedAuth } from './auth-capture';

const TAG = '[ssb:indexer]';

export type IndexState = {
  entries: IndexEntry[];
  building: boolean;
};

/**
 * Request the server to crawl settings via headless Playwright.
 * Interface is identical to the old client-side DOM crawling version:
 * `buildIndex(onProgress?) → Promise<IndexEntry[]>`
 */
export async function buildIndex(
  onProgress?: (msg: string) => void,
): Promise<IndexEntry[]> {
  const risuAuth = getCapturedAuth();
  if (!risuAuth) {
    console.warn(`${TAG} no risu-auth token captured yet — try navigating to another page first`);
    onProgress?.('Auth token not available');
    return [];
  }

  console.log(`${TAG} requesting server-side crawl`);
  onProgress?.('Crawling settings (server)...');

  try {
    const resp = await fetch('/setting-searchbar/build-index', {
      method: 'POST',
      headers: { 'risu-auth': risuAuth },
    });

    if (resp.status === 429) {
      console.warn(`${TAG} crawl already in progress`);
      onProgress?.('Crawl in progress, try again later');
      return [];
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
    console.log(`${TAG} received ${entries.length} entries (${allowed} requests allowed, ${blocked} blocked)`);
    console.table(requestLog.filter((r) => r.action === 'blocked').slice(0, 20));

    onProgress?.(`${entries.length} items indexed`);
    return entries;
  } catch (err) {
    console.error(`${TAG} fetch error:`, err);
    onProgress?.('Network error');
    return [];
  }
}
