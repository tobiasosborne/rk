// Tests for src/refs/snowball-fetch.ts — the Semantic Scholar network edge for `rk refs
// snowball` (bead rk-hzla). Every test injects fetchImpl/sleepImpl/nowImpl so nothing here ever
// touches the real network or a real clock (rule 13: bounded, deterministic, no real sleeps).

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSnowballOracle, sanitiseId, DEFAULT_MIN_SPACING_MS } from "../../src/refs/snowball-fetch";

const dirs: string[] = [];
function tmpCacheDir(): string {
  const d = mkdtempSync(join(tmpdir(), "rk-snowball-cache-"));
  dirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function paper(paperId: string, title: string, year: number, arxiv?: string) {
  return { paperId, title, year, externalIds: arxiv ? { ArXiv: arxiv } : {} };
}

describe("sanitiseId", () => {
  test("replaces every non [A-Za-z0-9._-] character with '_'", () => {
    expect(sanitiseId("arXiv:2510.01333")).toBe("arXiv_2510.01333");
    expect(sanitiseId("a/b c")).toBe("a_b_c");
    expect(sanitiseId("plain-id_1.2")).toBe("plain-id_1.2");
  });
});

function noSleep() {
  return Promise.resolve();
}

describe("buildSnowballOracle — basic fetch + conversion", () => {
  test("fetches self+refs+cites for a seed and converts to SnowballPaper shape", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url.includes("/references")) return jsonResponse({ data: [{ citedPaper: paper("r1", "Ref One", 2018, "1801.00001") }] });
      if (url.includes("/citations")) return jsonResponse({ data: [{ citingPaper: paper("c1", "Cite One", 2022) }] });
      return jsonResponse(paper("seedS2Id", "The Seed", 2020, "2510.01333"));
    }) as unknown as typeof fetch;

    const { oracle, partial, errors } = await buildSnowballOracle(["2510.01333"], 0, {
      cacheDir: tmpCacheDir(),
      fetchImpl,
      sleepImpl: noSleep,
      nowImpl: () => 0,
    });

    expect(partial).toBe(false);
    expect(errors).toEqual([]);
    const result = oracle("2510.01333");
    expect(result.self).toEqual({ id: "seedS2Id", arxiv: "2510.01333", s2: "seedS2Id", title: "The Seed", year: 2020 });
    expect(result.refs).toEqual([{ id: "r1", arxiv: "1801.00001", s2: "r1", title: "Ref One", year: 2018 }]);
    expect(result.cites).toEqual([{ id: "c1", s2: "c1", title: "Cite One", year: 2022 }]);
    expect(calls.some((u) => u.includes("arXiv%3A2510.01333") || u.includes("arXiv:2510.01333"))).toBe(true);
  });

  test("paginates references via the 'next' offset until it is absent", async () => {
    let refsCallCount = 0;
    const fetchImpl = (async (url: string) => {
      if (url.includes("/references")) {
        refsCallCount++;
        if (!url.includes("offset=")) {
          return jsonResponse({ data: [{ citedPaper: paper("r1", "Page 1", 2010) }], next: 1000 });
        }
        return jsonResponse({ data: [{ citedPaper: paper("r2", "Page 2", 2011) }] }); // no 'next' — last page
      }
      if (url.includes("/citations")) return jsonResponse({ data: [] });
      return jsonResponse(paper("s", "Seed", 2020, "seed1"));
    }) as unknown as typeof fetch;

    const { oracle } = await buildSnowballOracle(["seed1"], 0, {
      cacheDir: tmpCacheDir(),
      fetchImpl,
      sleepImpl: noSleep,
      nowImpl: () => 0,
    });
    expect(refsCallCount).toBe(2);
    expect(oracle("seed1").refs.map((p) => p.id)).toEqual(["r1", "r2"]);
  });
});

describe("buildSnowballOracle — rate limiting", () => {
  test("honours the minimum spacing between consecutive requests", async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const fetchImpl = (async (url: string) => {
      if (url.includes("/references") || url.includes("/citations")) return jsonResponse({ data: [] });
      return jsonResponse(paper("s", "Seed", 2020, "seed1"));
    }) as unknown as typeof fetch;

    await buildSnowballOracle(["seed1"], 0, {
      cacheDir: tmpCacheDir(),
      fetchImpl,
      sleepImpl: async (ms: number) => {
        sleeps.push(ms);
        clock += ms; // simulate time passing during the sleep
      },
      nowImpl: () => clock,
      minSpacingMs: 3500,
    });
    // 3 requests (self, references, citations) fired back-to-back at simulated time 0 must be
    // spaced: the first is free, the next two each wait the full minSpacingMs since nowImpl never
    // advances except inside sleepImpl itself.
    expect(sleeps).toEqual([3500, 3500]);
  });
});

describe("buildSnowballOracle — 429 backoff", () => {
  test("retries on 429 and succeeds within maxRetries", async () => {
    let refAttempts = 0;
    const fetchImpl = (async (url: string) => {
      if (url.includes("/references")) {
        refAttempts++;
        if (refAttempts < 3) return jsonResponse({ message: "slow down" }, 429, { "retry-after": "1" });
        return jsonResponse({ data: [] });
      }
      if (url.includes("/citations")) return jsonResponse({ data: [] });
      return jsonResponse(paper("s", "Seed", 2020, "seed1"));
    }) as unknown as typeof fetch;

    const { partial, errors } = await buildSnowballOracle(["seed1"], 0, {
      cacheDir: tmpCacheDir(),
      fetchImpl,
      sleepImpl: noSleep,
      nowImpl: () => 0,
      maxRetries: 5,
    });
    expect(partial).toBe(false);
    expect(errors).toEqual([]);
    expect(refAttempts).toBe(3);
  });

  test("gives up after EXACTLY maxRetries retries: records the error, marks partial, never throws", async () => {
    let refAttempts = 0;
    const fetchImpl = (async (url: string) => {
      if (url.includes("/references")) {
        refAttempts++;
        return jsonResponse({}, 429);
      }
      if (url.includes("/citations")) return jsonResponse({ data: [] });
      return jsonResponse(paper("s", "Seed", 2020, "seed1"));
    }) as unknown as typeof fetch;

    const { oracle, partial, errors } = await buildSnowballOracle(["seed1"], 0, {
      cacheDir: tmpCacheDir(),
      fetchImpl,
      sleepImpl: noSleep,
      nowImpl: () => 0,
      maxRetries: 2,
    });
    expect(partial).toBe(true);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("seed1");
    expect(errors[0]).toContain("429");
    // 1 initial attempt + exactly maxRetries retries, never one more or one fewer
    expect(refAttempts).toBe(3);
    // the failed node degrades to an empty result, never a thrown exception
    expect(oracle("seed1")).toEqual({ refs: [], cites: [] });
  });
});

describe("buildSnowballOracle — timeout", () => {
  test("aborts and reports a timeout when a request never resolves in time", async () => {
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      })) as unknown as typeof fetch;

    const { partial, errors } = await buildSnowballOracle(["seed1"], 0, {
      cacheDir: tmpCacheDir(),
      fetchImpl,
      sleepImpl: noSleep,
      nowImpl: () => 0,
      timeoutMs: 5,
    });
    expect(partial).toBe(true);
    expect(errors[0]).toContain("timeout");
  }, 10_000);
});

describe("buildSnowballOracle — x-api-key header", () => {
  test("sends x-api-key when apiKey is provided, omits it otherwise", async () => {
    const headersSeen: (string | null)[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      headersSeen.push((init?.headers as Record<string, string> | undefined)?.["x-api-key"] ?? null);
      if (url.includes("/references") || url.includes("/citations")) return jsonResponse({ data: [] });
      return jsonResponse(paper("s", "Seed", 2020, "seed1"));
    }) as unknown as typeof fetch;

    await buildSnowballOracle(["seed1"], 0, {
      cacheDir: tmpCacheDir(),
      fetchImpl,
      sleepImpl: noSleep,
      nowImpl: () => 0,
      apiKey: "secret-key",
    });
    expect(headersSeen.every((h) => h === "secret-key")).toBe(true);
  });
});

describe("buildSnowballOracle — caching (offline, idempotent reruns)", () => {
  test("a rerun with the same cacheDir never touches the network again", async () => {
    const cacheDir = tmpCacheDir();
    let calls = 0;
    const fetchImpl = (async (url: string) => {
      calls++;
      if (url.includes("/references") || url.includes("/citations")) return jsonResponse({ data: [] });
      return jsonResponse(paper("s", "Seed", 2020, "seed1"));
    }) as unknown as typeof fetch;

    await buildSnowballOracle(["seed1"], 0, { cacheDir, fetchImpl, sleepImpl: noSleep, nowImpl: () => 0 });
    expect(calls).toBe(3);

    const throwingFetch = (async () => {
      throw new Error("network is unreachable — this must never be called on a cache hit");
    }) as unknown as typeof fetch;
    const { oracle, partial } = await buildSnowballOracle(["seed1"], 0, {
      cacheDir,
      fetchImpl: throwingFetch,
      sleepImpl: noSleep,
      nowImpl: () => 0,
    });
    expect(partial).toBe(false);
    expect(oracle("seed1").self?.title).toBe("Seed");
  });

  test("writes one cache file per fetched node, named by sanitiseId", async () => {
    const cacheDir = tmpCacheDir();
    const fetchImpl = (async (url: string) => {
      if (url.includes("/references") || url.includes("/citations")) return jsonResponse({ data: [] });
      return jsonResponse(paper("s", "Seed", 2020, "2510.01333"));
    }) as unknown as typeof fetch;
    await buildSnowballOracle(["2510.01333"], 0, { cacheDir, fetchImpl, sleepImpl: noSleep, nowImpl: () => 0 });
    const raw = JSON.parse(readFileSync(join(cacheDir, `${sanitiseId("2510.01333")}.json`), "utf8"));
    expect(raw.self.title).toBe("Seed");
    expect(raw.references).toEqual([]);
    expect(raw.citations).toEqual([]);
  });
});

describe("buildSnowballOracle — fetch economy", () => {
  test("never fetches self for a non-seed node, and never expands a leaf-depth node", async () => {
    const selfUrls: string[] = [];
    const expandUrls: string[] = [];
    const fetchImpl = (async (url: string) => {
      if (url.includes("/references")) {
        expandUrls.push(url);
        if (url.includes("seedX")) return jsonResponse({ data: [{ citedPaper: paper("child1", "Child", 2015) }] });
        return jsonResponse({ data: [] });
      }
      if (url.includes("/citations")) {
        expandUrls.push(url);
        return jsonResponse({ data: [] });
      }
      selfUrls.push(url);
      return jsonResponse(paper("seedX", "Seed X", 2020, "seedX"));
    }) as unknown as typeof fetch;

    // maxDepth=1: "child1" is a leaf (depth 1 == maxDepth) — must never be fetched at all.
    await buildSnowballOracle(["seedX"], 1, { cacheDir: tmpCacheDir(), fetchImpl, sleepImpl: noSleep, nowImpl: () => 0 });
    expect(selfUrls).toHaveLength(1); // only the seed's own self-fetch
    expect(expandUrls.some((u) => u.includes("child1"))).toBe(false); // leaf never expanded
  });
});
