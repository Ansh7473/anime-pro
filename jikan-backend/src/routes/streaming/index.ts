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

    // Try deterministic ID slugs
    for (const id of idCandidates) {
      const candidateSlug = `${baseSlug}-${id}`;
      const results = await getAnimelokSources(candidateSlug, ep);
      if (results.sources && results.sources.length > 0) {
        return c.json({
          provider: "Animelok",
          status: 200,
          data: {
            sources: results.sources.map((s: any) => ({ ...s, provider: "Animelok" })),
            subtitles: results.subtitles || []
          },
        });
      }
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
      const results = await getAnimelokSources(slug, ep);
      if (results.sources && results.sources.length > 0) {
        return c.json({
          provider: "Animelok (Search)",
          status: 200,
          data: {
            sources: results.sources.map((s: any) => ({ ...s, provider: "Animelok (Search)" })),
            subtitles: results.subtitles || []
          },
        });
      }
    }
  } catch (e) {
    console.log("[Streaming] Animelok failed:", e);
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

  // Sequential Provider Execution (1s staggered delay)
  const providerFns = [
    async () => {
      // 1. Animelok sources (sequential logic)
      try {
        console.log("[Streaming] Sequential Provider: Attempting Animelok...");
        const aniId = await getAnilistId(malId);
        const idCandidates = [malId];
        if (aniId && aniId !== malId) idCandidates.unshift(aniId);
        const baseSlug = titles[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

        for (const id of idCandidates) {
          const results = await getAnimelokSources(`${baseSlug}-${id}`, ep);
          if (results && results.sources && results.sources.length > 0) {
            successfulProviders.push("Animelok");
            allAggregatedSources.push(...results.sources.map((s: any) => ({ ...s, provider: "Animelok" })));
            if (results.subtitles) allAggregatedSubtitles.push(...results.subtitles);
            return;
          }
        }
        const search = await searchAnimelok(titles[0]);
        const match = search.find((r: any) => titles.some((t) => (r.title || r.slug || "").toLowerCase().includes(t.toLowerCase())));
        if (match) {
          const res = await getAnimelokSources(match.slug || match.id, ep);
          if (res && res.sources && res.sources.length > 0) {
            successfulProviders.push("Animelok");
            allAggregatedSources.push(...res.sources.map((s: any) => ({ ...s, provider: "Animelok (Search)" })));
            if (res.subtitles) allAggregatedSubtitles.push(...res.subtitles);
          }
        }
      } catch (e) { console.log("[Streaming] Animelok sequential fetch failed", e); }
    },
    async () => {
      // 2. DesiDubAnime sources (sequential logic)
      try {
        console.log("[Streaming] Sequential Provider: Attempting DesiDubAnime (1s delay)...");
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
              if (s && s.length > 0) {
                successfulProviders.push("DesiDubAnime");
                allAggregatedSources.push(...s.map((it: any) => ({ ...it, provider: "DesiDubAnime" })));
                return;
              }
            }
          }
        }
      } catch (e) { console.log("[Streaming] DesiDub sequential fetch failed", e); }
    },
    async () => {
      // 3. AnimeHindiDubbed-WP sources (sequential logic)
      try {
        console.log("[Streaming] Sequential Provider: Attempting AHD (1s delay)...");
        for (const title of titles) {
          const search = await searchAnimeHindiDubbedWP(title);
          if (search && search.length > 0) {
            const s = await getAnimeHindiDubbedAllSourcesWP(search[0].id, ep);
            if (s && s.length > 0) {
              successfulProviders.push("AnimeHindiDubbed-WP");
              allAggregatedSources.push(...s.map((it: any) => ({ ...it, provider: "AnimeHindiDubbed-WP" })));
              return;
            }
          }
        }
      } catch (e) { console.log("[Streaming] AHD sequential fetch failed", e); }
    }
  ];

  for (let i = 0; i < providerFns.length; i++) {
    await providerFns[i]();
    if (i < providerFns.length - 1) {
      await new Promise(r => setTimeout(r, 1000)); // 1s staggered delay
    }
  }

  if (allAggregatedSources.length > 0) {
    return c.json({
      provider: successfulProviders.join(", "),
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

  let metadataResult: any = null;

  // Sequential Metadata Execution (1s staggered delay)
  const metadataFns = [
    async () => {
      // 1. Animelok metadata
      try {
        console.log("[Metadata] Sequential Provider: Attempting Animelok...");
        const aniId = await getAnilistId(malId);
        const idCandidates = [malId];
        if (aniId && aniId !== malId) idCandidates.unshift(aniId);
        const baseSlug = titles[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

        for (const id of idCandidates) {
          const candidateSlug = `${baseSlug}-${id}`;
          const episodes = await getAnimelokMetadata(candidateSlug);
          if (episodes.length > 0) {
            metadataResult = { provider: "Animelok", episodes: episodes };
            return;
          }
        }
      } catch (e) { console.log("[Metadata] Animelok failed", e); }
    },
    async () => {
      // 2. DesiDubAnime metadata
      if (metadataResult) return; 
      try {
        console.log("[Metadata] Sequential Provider: Attempting DesiDubAnime (1s delay)...");
        for (const title of titles) {
          const normalizedTitle = title.toLowerCase().trim();
          let knownSlug = null;
          if (normalizedTitle.includes('jujutsu kaisen')) knownSlug = 'jujutsu-kaisen-season-3';
          else if (normalizedTitle.includes('naruto')) knownSlug = 'naruto';
          else if (normalizedTitle.includes('one piece')) knownSlug = 'one-piece';
          
          if (knownSlug) {
            const animeInfo = await getDesiDubInfo(knownSlug);
            if (animeInfo && animeInfo.episodes && animeInfo.episodes.length > 0) {
              metadataResult = {
                provider: "DesiDubAnime",
                episodes: animeInfo.episodes.map((ep: any) => ({
                  id: ep.slug || `episode-${ep.number}`,
                  number: parseInt(ep.number) || 1,
                  title: ep.title || `Episode ${ep.number}`,
                  image: ep.image || '',
                  aired: ep.date || '',
                }))
              };
              return;
            }
          }
        }
      } catch (e) { console.log("[Metadata] DesiDubAnime failed", e); }
    }
  ];

  for (let i = 0; i < metadataFns.length; i++) {
    await metadataFns[i]();
    if (metadataResult) break;
    if (i < metadataFns.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (metadataResult) {
    return c.json({
      provider: metadataResult.provider,
      status: 200,
      data: { episodes: metadataResult.episodes },
    });
  }

  return c.json(
    { provider: "None", status: 404, message: "Metadata not found" },
    404,
  );
});

export default streamingRouter;
