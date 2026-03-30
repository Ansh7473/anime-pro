import { Hono } from "hono";
import {
  getAnilistId,
  getAnimelokSources,
  getAnimelokMetadata,
  searchAnimelok,
} from "../../lib/providers/animelok.js";
import {
  getDesiDubSources,
  getDesiDubInfo,
} from "../../lib/providers/desidub-v2.js";
import {
  searchAnimeHindiDubbedWP,
  getAnimeHindiDubbedAllSourcesWP,
} from "../../lib/providers/animehindidubbed-wp.js";

const streamingRouter = new Hono();

// Global caches (Titles only)
const titleCache = new Map<string, string>();

async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (retries <= 0) throw e;
    await new Promise((res) => setTimeout(res, delay));
    return fetchWithRetry(fn, retries - 1, delay * 2);
  }
}

const fetchWithTimeout = async (url: string, timeout: number = 6000, options: any = {}) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
};

const withTimeout = async <T>(fn: () => Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> => {
  return Promise.race([
    fn(),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallbackValue), timeoutMs))
  ]);
};

// Helper: Get titles from Jikan
async function getAnimeTitles(malId: string): Promise<string[]> {
  if (titleCache.has(malId)) {
    return JSON.parse(titleCache.get(malId)!);
  }
  try {
    // Jikan is slow, 4s timeout
    const res = await fetchWithTimeout(`https://api.jikan.moe/v4/anime/${malId}`, 4000);
    if (res.ok) {
      const data = (await res.json()) as any;
      const titles: string[] = [];
      if (data.data?.title_english) titles.push(data.data.title_english);
      if (data.data?.title) titles.push(data.data.title);
      if (data.data?.titles) {
        data.data.titles.forEach((t: any) => {
          if (!titles.includes(t.title)) titles.push(t.title);
        });
      }
      if (titles.length > 0) {
        titleCache.set(malId, JSON.stringify(titles));
      }
      return titles;
    }
  } catch (e) {
    console.error(`[Jikan] Title fetch error:`, e);
  }
  return [];
}

// 1. Animelok Provider Route
streamingRouter.get("/sources/animelok", async (c) => {
  const animeId = c.req.query("animeId");
  const ep = parseInt(c.req.query("ep") || "1");
  const malId = animeId || "unknown";

  const titles = await getAnimeTitles(malId);
  if (titles.length === 0) return c.json({ error: "Title not found" }, 404);

  try {
    const aniId = await getAnilistId(malId);
    const idCandidates = [malId];
    if (aniId && aniId !== malId) idCandidates.unshift(aniId);

    const baseSlug = titles[0]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const animelokResults = await fetchWithRetry(async () => {
      for (const id of idCandidates) {
        const candidateSlug = `${baseSlug}-${id}`;
        const results = await getAnimelokSources(candidateSlug, ep);
        if (results.sources && results.sources.length > 0) return results;
      }
      // Try Search Fallback
      const lokResults = await searchAnimelok(titles[0]);
      const lokMatch = lokResults.find((r: any) =>
        titles.some((t) => {
          const rt = (r.title || r.slug || "").toLowerCase();
          const tt = t.toLowerCase();
          return rt.includes(tt) || tt.includes(rt);
        }),
      );
      if (lokMatch) {
        const slug = lokMatch.slug || lokMatch.id;
        return await getAnimelokSources(slug, ep);
      }
      return null;
    });

    if (animelokResults && animelokResults.sources?.length > 0) {
      return c.json({
        provider: "Animelok",
        status: 200,
        data: {
          sources: animelokResults.sources.map((s: any) => ({ ...s, provider: "Animelok" })),
          subtitles: animelokResults.subtitles || []
        },
      });
    }
  } catch (e) {
    console.log("[Streaming] Animelok route error:", e);
  }
  return c.json({ provider: "Animelok", status: 404, message: "No sources found" }, 404);
});

// 2. DesiDub Provider Route
streamingRouter.get("/sources/desidub", async (c) => {
  const animeId = c.req.query("animeId");
  const ep = parseInt(c.req.query("ep") || "1");
  const malId = animeId || "unknown";

  try {
    const titles = await getAnimeTitles(malId);
    if (titles.length === 0) return c.json({ error: "Title not found" }, 404);

    return await withTimeout(async () => {
      try {
        const desidubData = await Promise.any(titles.map(async (title) => {
          const normalizedTitle = title.toLowerCase().trim();
          let knownSlug = null;
          if (normalizedTitle.includes('jujutsu kaisen')) knownSlug = 'jujutsu-kaisen-season-3';
          else if (normalizedTitle.includes('naruto')) knownSlug = 'naruto';
          else if (normalizedTitle.includes('one piece')) knownSlug = 'one-piece';
          else if (normalizedTitle.includes('attack on titan')) knownSlug = 'attack-on-titan';
          else if (normalizedTitle.includes('demon slayer')) knownSlug = 'demon-slayer';
          else if (normalizedTitle.includes('my hero')) knownSlug = 'my-hero-academia';
          else if (normalizedTitle === 'death note') knownSlug = 'death-note';
          else if (normalizedTitle.includes('dragon ball')) knownSlug = 'dragon-ball';
          else if (normalizedTitle.includes('fairy tail')) knownSlug = 'fairy-tail';
          else if (normalizedTitle.includes('hunter x hunter')) knownSlug = 'hunter-x-hunter';

          if (knownSlug) {
            // ATOMIC PARALLELISM: Fire direct patterns and info-scrape track ALL AT ONCE
            return await Promise.any([
              // Track 1: Known Special Cases
              (async () => {
                if (knownSlug === "jujutsu-kaisen-season-3" && ep === 1) {
                  const res = await getDesiDubSources("jujutsu-kaisen-shimetsu-kaiyuu-zenpen-3rd-season-episode-48");
                  if (res && res.length > 0) return res;
                }
                throw new Error("No special case");
              })(),
              
              // Track 2: Direct Pattern 1 (Standard)
              (async () => {
                const res = await getDesiDubSources(`${knownSlug}-episode-${ep}`);
                if (res && res.length > 0) return res;
                throw new Error("Pattern 1 failed");
              })(),

              // Track 3: Direct Pattern 2 (Season 1)
              (async () => {
                const res = await getDesiDubSources(`${knownSlug}-season-1-episode-${ep}`);
                if (res && res.length > 0) return res;
                throw new Error("Pattern 2 failed");
              })(),

              // Track 4: Info Scrape (The slow fallback)
              (async () => {
                const info = await getDesiDubInfo(knownSlug);
                const episodes = info?.episodes;
                if (episodes && Array.isArray(episodes) && episodes.length > 0) {
                  const epData = episodes.find((e: any) => parseInt(e.number) === ep) || episodes[0];
                  if (epData?.slug) {
                    const res = await getDesiDubSources(epData.slug);
                    if (res && res.length > 0) return res;
                  }
                }
                throw new Error("Info scrape failed");
              })()
            ]);
          }
          throw new Error('No slug for title');
        }));

        if (desidubData && desidubData.length > 0) {
          return c.json({
            provider: "DesiDubAnime",
            status: 200,
            data: {
              sources: desidubData.map((s: any) => ({ ...s, provider: "DesiDubAnime" })),
              subtitles: []
            },
          });
        }
      } catch (e) {
        // All titles failed
      }
      return c.json({ provider: "DesiDubAnime", status: 404, message: "No sources found" }, 404);
    }, 9500, c.json({ provider: "DesiDubAnime", status: 404, message: "Request timed out" }, 404));
  } catch (e) {
    return c.json({ provider: "DesiDubAnime", status: 404, message: "Error" }, 404);
  }
});

// 3. AnimeHindiDubbed-WP Provider Route
streamingRouter.get("/sources/ahd", async (c) => {
  const animeId = c.req.query("animeId");
  const ep = parseInt(c.req.query("ep") || "1");
  const malId = animeId || "unknown";

  try {
    const titles = await getAnimeTitles(malId);
    if (titles.length === 0) return c.json({ error: "Title not found" }, 404);

    return await withTimeout(async () => {
      try {
        const ahdData = await Promise.any(titles.map(async (title) => {
          const results = await searchAnimeHindiDubbedWP(title);
          if (results.length > 0) {
            const match = results.find(r => r.title.rendered.toLowerCase().includes(title.toLowerCase())) || results[0];
            const sources = await getAnimeHindiDubbedAllSourcesWP(match.id, ep);
            if (sources.length > 0) return sources;
          }
          throw new Error('Not found');
        }));

        if (ahdData && ahdData.length > 0) {
          return c.json({
            provider: "AnimeHindiDubbed-WP",
            status: 200,
            data: {
              sources: ahdData.map((s: any) => ({ ...s, provider: "AnimeHindiDubbed-WP" })),
              subtitles: []
            },
          });
        }
      } catch (e) {
        // All titles failed
      }
      return c.json({ provider: "AnimeHindiDubbed-WP", status: 404, message: "No sources found" }, 404);
    }, 8000, c.json({ provider: "AnimeHindiDubbed-WP", status: 404, message: "Request timed out" }, 404));
  } catch (e) {
    return c.json({ provider: "AnimeHindiDubbed-WP", status: 404, message: "Error" }, 404);
  }
});

// Main Aggregated Sources Endpoint (Optional fallback)
streamingRouter.get("/sources", async (c) => {
  const animeId = c.req.query("animeId");
  const ep = parseInt(c.req.query("ep") || "1");
  const malId = animeId || "unknown";

  const titles = await getAnimeTitles(malId);
  if (titles.length === 0) return c.json({ error: "Title not found" }, 404);

  const mainTitle = titles[0];
  console.log(
    `[Streaming] Fetching aggregated sources for ${mainTitle} Ep ${ep}...`,
  );

  const allAggregatedSources: any[] = [];
  const allAggregatedSubtitles: any[] = [];
  const successfulProviders: string[] = [];

  // Re-use provider logic functions (internal calls)
  const results = await Promise.allSettled([
    (async () => {
      // Internal fetch logic for Animelok
      try {
        const aniId = await getAnilistId(malId);
        const idCandidates = [malId];
        if (aniId && aniId !== malId) idCandidates.unshift(aniId);
        const baseSlug = titles[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const res = await fetchWithRetry(async () => {
          for (const id of idCandidates) {
            const results = await getAnimelokSources(`${baseSlug}-${id}`, ep);
            if (results && results.sources && results.sources.length > 0) return results;
          }
          const search = await searchAnimelok(titles[0]);
          const match = search.find((r: any) => titles.some((t) => (r.title || r.slug || "").toLowerCase().includes(t.toLowerCase())));
          if (match) return await getAnimelokSources(match.slug || match.id, ep);
          return null;
        });
        if (res && res.sources && res.sources.length > 0) {
          successfulProviders.push("Animelok");
          return { sources: res.sources.map((s: any) => ({ ...s, provider: "Animelok" })), subtitles: res.subtitles || [] };
        }
      } catch (e) { console.log("Animelok fetch failed", e); }
      return null;
    })(),
    (async () => {
      // Internal fetch logic for DesiDub
      try {
        const res = await fetchWithRetry(async () => {
          for (const title of titles) {
            const normalizedTitle = title.toLowerCase().trim();
            let knownSlug = null;
            if (normalizedTitle.includes('jujutsu kaisen')) knownSlug = 'jujutsu-kaisen-season-3';
            else if (normalizedTitle.includes('naruto')) knownSlug = 'naruto';
            else if (normalizedTitle.includes('one piece')) knownSlug = 'one-piece';
            if (knownSlug) {
              const info = await getDesiDubInfo(knownSlug);
              const epData = info?.episodes?.find((e: any) => parseInt(e.number) === ep) || info?.episodes?.[0];
              if (epData) {
                const s = await getDesiDubSources(epData.slug || `${knownSlug}-episode-${ep}`);
                if (s && s.length > 0) return s;
              }
            }
          }
          return null;
        });
        if (res && res.length > 0) {
          successfulProviders.push("DesiDubAnime");
          return { sources: res.map((s: any) => ({ ...s, provider: "DesiDubAnime" })), subtitles: [] };
        }
      } catch (e) { console.log("DesiDub fetch failed", e); }
      return null;
    })(),
    (async () => {
      // Internal fetch logic for AHD
      try {
        const res = await fetchWithRetry(async () => {
          for (const title of titles) {
            const search = await searchAnimeHindiDubbedWP(title);
            if (search && search.length > 0) {
              const s = await getAnimeHindiDubbedAllSourcesWP(search[0].id, ep);
              if (s && s.length > 0) return s;
            }
          }
          return null;
        });
        if (res && res.length > 0) {
          successfulProviders.push("AnimeHindiDubbed-WP");
          return { sources: res.map((s: any) => ({ ...s, provider: "AnimeHindiDubbed-WP" })), subtitles: [] };
        }
      } catch (e) { console.log("AHD fetch failed", e); }
      return null;
    })()
  ]);

  results.forEach(result => {
    if (result.status === "fulfilled" && result.value) {
      allAggregatedSources.push(...result.value.sources);
      allAggregatedSubtitles.push(...result.value.subtitles);
    }
  });

  if (allAggregatedSources.length > 0) {
    return c.json({
      provider: "Aggregated",
      status: 200,
      data: { sources: allAggregatedSources, subtitles: allAggregatedSubtitles },
    });
  }

  return c.json({ provider: "None", status: 404, message: "No sources found" }, 404);
});

// Unified Metadata Endpoint
streamingRouter.get("/episode-metadata", async (c) => {
  const animeId = c.req.query("animeId");
  const malId = animeId || "unknown";
  const titles = await getAnimeTitles(malId);
  if (titles.length === 0) return c.json({ error: "Title not found" }, 404);

  // Try all providers in parallel for episode metadata
  const metadataPromises = [
    // 1. Animelok metadata
    (async () => {
      try {
        const aniId = await getAnilistId(malId);
        const idCandidates = [malId];
        if (aniId && aniId !== malId) idCandidates.unshift(aniId);

        const baseSlug = titles[0]
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

        for (const id of idCandidates) {
          const candidateSlug = `${baseSlug}-${id}`;
          const episodes = await getAnimelokMetadata(candidateSlug);
          if (episodes.length > 0) {
            return {
              provider: "Animelok",
              episodes: episodes
            };
          }
        }
      } catch (e) {
        console.log("[Metadata] Animelok failed:", e);
      }
      return null;
    })(),

    // 2. DesiDubAnime metadata
    (async () => {
      try {
        console.log("[Metadata] Checking DesiDubAnime for:", titles);

        // Check for known anime mappings
        for (const title of titles) {
          const normalizedTitle = title.toLowerCase().trim();
          let knownSlug = null;

          if (normalizedTitle.includes('jujutsu kaisen')) {
            knownSlug = 'jujutsu-kaisen-season-3';
          } else if (normalizedTitle.includes('naruto')) {
            knownSlug = 'naruto';
          } else if (normalizedTitle.includes('one piece')) {
            knownSlug = 'one-piece';
          } else if (normalizedTitle.includes('attack on titan')) {
            knownSlug = 'attack-on-titan';
          } else if (normalizedTitle.includes('demon slayer')) {
            knownSlug = 'demon-slayer';
          } else if (normalizedTitle.includes('my hero academia')) {
            knownSlug = 'my-hero-academia';
          } else if (normalizedTitle === 'death note') {
            knownSlug = 'death-note';
          }

          if (knownSlug) {
            console.log("[Metadata] Trying DesiDubAnime slug:", knownSlug);
            const animeInfo = await getDesiDubInfo(knownSlug);
            if (animeInfo && animeInfo.episodes && animeInfo.episodes.length > 0) {
              const episodes = animeInfo.episodes.map((ep: any) => ({
                id: ep.slug || `episode-${ep.number}`,
                number: parseInt(ep.number) || 1,
                title: ep.title || `Episode ${ep.number}`,
                image: ep.image || '',
                aired: ep.date || '',
              }));

              return {
                provider: "DesiDubAnime",
                episodes: episodes
              };
            }
          }
        }
      } catch (e) {
        console.log("[Metadata] DesiDubAnime failed:", e);
      }
      return null;
    })(),
  ];

  // Wait for all metadata providers to complete
  const results = await Promise.allSettled(metadataPromises);

  // Return the first successful result
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      return c.json({
        provider: result.value.provider,
        status: 200,
        data: { episodes: result.value.episodes },
      });
    }
  }

  return c.json(
    { provider: "None", status: 404, message: "Metadata not found" },
    404,
  );
});

export default streamingRouter;
