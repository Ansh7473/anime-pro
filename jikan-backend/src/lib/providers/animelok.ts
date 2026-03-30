const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const ANIMELOK_HEADERS = {
  "User-Agent": USER_AGENT,
  Referer: "https://animelok.xyz/",
  Accept: "application/json, text/plain, */*",
};

const anilistCache = new Map<string, string>();

/**
 * Racing Proxy Implementation for Animelok (Vercel Fix)
 */
const fetchWithTimeout = async (url: string, options: any = {}, timeout = 4000) => {
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

// ScraperAPI bypasses Cloudflare IUAM ("Just a moment..." page) which blocks datacenter IPs
// Rotate across 3 keys = 15,000 free requests/month total
const SCRAPER_API_KEYS = [
  process.env.SCRAPER_API_KEY_1 || "6b80a78e7bb23b0cf32a9c6dd7a06c47",
  process.env.SCRAPER_API_KEY_2 || "c0334020e02d6bd704f16647faa5b5f0",
  process.env.SCRAPER_API_KEY_3 || "abecc6c40c322858d4e462a3c072cab6",
].filter(k => k.length > 0);

let scraperKeyIndex = 0;
const getNextScraperKey = () => {
  if (SCRAPER_API_KEYS.length === 0) return "";
  const key = SCRAPER_API_KEYS[scraperKeyIndex % SCRAPER_API_KEYS.length];
  scraperKeyIndex++;
  return key;
};

const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || "https://flaresolverr-production-d1e4.up.railway.app";
console.info(`[Animelok] FLARESOLVERR_URL loaded: "${FLARESOLVERR_URL}" (length: ${FLARESOLVERR_URL.length})`);

// FlareSolverr session — Chromium session persists CF clearance across requests
const FS_SESSION = "animelok-session";
let fsSessionWarmed = false;
let fsSessionWarmExpiry = 0;

const warmFlareSolverrSession = async (): Promise<void> => {
  if (fsSessionWarmed && Date.now() < fsSessionWarmExpiry) return;

  console.info("[Animelok] Warming FlareSolverr session with watch page visit...");
  // Create session (ignore error if it already exists)
  await fetchWithTimeout(`${FLARESOLVERR_URL}/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd: "sessions.create", session: FS_SESSION }),
  }, 10000).catch(() => {});

  // Visit the homepage first (CF bypass)
  await fetchWithTimeout(`${FLARESOLVERR_URL}/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd: "request.get", url: "https://animelok.xyz", session: FS_SESSION, maxTimeout: 30000 }),
  }, 35000).catch(() => {});

  // Also visit a watch page — this sets the proper Referer context the API needs
  const watchRes = await fetchWithTimeout(`${FLARESOLVERR_URL}/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd: "request.get", url: "https://animelok.xyz/watch/one-piece-episode-1", session: FS_SESSION, maxTimeout: 30000 }),
  }, 35000);
  if (!watchRes.ok) throw new Error(`FlareSolverr watch page HTTP ${watchRes.status}`);
  const watchData = (await watchRes.json()) as any;
  if (watchData.status !== "ok") throw new Error(`FlareSolverr watch: ${watchData.message}`);

  fsSessionWarmed = true;
  fsSessionWarmExpiry = Date.now() + 22 * 60 * 60 * 1000;
  console.info("[Animelok] FlareSolverr session warmed — watch page Referer context active");
};

const flaresolverrFetch = async (url: string): Promise<Response> => {
  if (!FLARESOLVERR_URL) throw new Error("No FlareSolverr URL set — add FLARESOLVERR_URL env var");
  await warmFlareSolverrSession();

  // Extract slug from URL for Referer (e.g. one-piece-21 → /watch/one-piece-episode-1)
  // The API checks Referer header to validate the request comes from their watch page
  const slugMatch = url.match(/\/api\/anime\/([^\/]+)\//);
  const slug = slugMatch?.[1] || "one-piece-21";
  const referer = `https://animelok.xyz/watch/${slug}-episode-1`;

  const fsRes = await fetchWithTimeout(`${FLARESOLVERR_URL}/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cmd: "request.get",
      url,
      session: FS_SESSION,
      maxTimeout: 30000,
      headers: {
        Referer: referer,
        Origin: "https://animelok.xyz",
        "Accept": "application/json, text/plain, */*",
      },
    }),
  }, 35000);

  if (!fsRes.ok) throw new Error(`FlareSolverr HTTP ${fsRes.status}`);
  const data = (await fsRes.json()) as any;
  if (data.status !== "ok" || !data.solution?.response) throw new Error(`FlareSolverr: ${data.status} - ${data.message}`);

  let responseText = data.solution.response as string;
  console.info(`[Animelok] FlareSolverr raw preview (${responseText.length}): ${responseText.slice(0, 100)}`);

  // Chrome's JSON viewer wraps JSON in: <html><body><pre>{"json":"here"}</pre></body></html>
  if (responseText.trim().startsWith("<")) {
    const preMatch = responseText.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (preMatch?.[1]) {
      responseText = preMatch[1].trim();
    } else {
      fsSessionWarmed = false;
      throw new Error("FlareSolverr returned unrecognized HTML — resetting session");
    }
  }

  if (responseText.startsWith("Unauthorized") || responseText.includes('"error":"unauthorized"')) {
    fsSessionWarmed = false;
    throw new Error("Animelok API unauthorized — resetting session");
  }

  return new Response(responseText, { status: 200, headers: { "Content-Type": "application/json" } });
};

const fetchWithProxy = async (url: string, options: any = {}) => {
  // Track 1: Direct fetch (works on localhost, fails on cloud due to Cloudflare)
  const directTrack = async () => {
    const res = await fetchWithTimeout(url, options, 3000);
    if (res.status === 403 || res.status === 503) {
      const body = await res.clone().text().catch(() => "");
      if (body.includes("Just a moment") || body.includes("Cloudflare")) {
        throw new Error(`Cloudflare block: ${res.status}`);
      }
      throw new Error(`Direct failed: ${res.status}`);
    }
    return res;
  };

  // Track 2: FlareSolverr with session
  // First call warms session (~30s), all subsequent calls reuse session (~5-10s)
  const flaresolverrTrack = async () => {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await flaresolverrFetch(url);
      console.info(`[Animelok] FlareSolverr (session) success for ${url}`);
      return res;
    } catch (err: any) {
      console.error(`[Animelok FlareSolverr] ${url}: ${err.message}`);
      throw err;
    }
  };

  // Track 3: ScraperAPI premium=true — residential IPs bypass both CF and animelok's datacenter IP block
  // animelok.xyz redirects Railway/datacenter IPs to /blocked — only residential IPs work
  const scraperTrack = async () => {
    await new Promise(r => setTimeout(r, 300));
    const key = getNextScraperKey();
    if (!key) throw new Error("No ScraperAPI key");
    try {
      // premium=true = residential proxy pool, render=true = headless Chrome for CF bypass
      const scraperUrl = `http://api.scraperapi.com?api_key=${key}&url=${encodeURIComponent(url)}&render=true&premium=true`;
      const res = await fetchWithTimeout(scraperUrl, {
        method: "GET",
        headers: {
          "x-sapi-referer": "https://animelok.xyz/",
        }
      }, 60000);  // 60s — premium residential render takes longer
      if (!res.ok) throw new Error(`ScraperAPI ${res.status}`);
      const body = await res.clone().text().catch(() => "");
      console.info(`[Animelok ScraperAPI] preview (${body.length}): ${body.slice(0, 100)}`);
      if (body.includes("Just a moment") || body.includes("cf-browser-verification")) {
        throw new Error("ScraperAPI hit CF challenge");
      }
      if (body.includes("/blocked") || body.includes("Access Denied")) {
        throw new Error("ScraperAPI IP also blocked by animelok");
      }
      if (body.startsWith("Unauthorized") || body === "Unauthorized") {
        throw new Error("ScraperAPI: Unauthorized — animelok rejected request");
      }
      console.info(`[Animelok] ScraperAPI (premium) success for ${url}`);
      return res;
    } catch (err: any) {
      console.error(`[Animelok ScraperAPI] ${url}: ${err.message}`);
      throw err;
    }
  };

  try {
    // FlareSolverr is on Railway (datacenter IP) → gets blocked by animelok's /blocked redirect
    // ScraperAPI premium uses residential IPs that animelok can't bulk-block
    // Direct fetch is for localhost dev only
    const result = await Promise.any([directTrack(), scraperTrack(), flaresolverrTrack()]);
    console.info(`[Animelok] Success for ${url}`);
    return result;
  } catch (e: any) {
    console.error(`[Animelok] Total failure for ${url}: ${e.message}`);
    throw new Error(`Animelok blocked: ${e.message}`);
  }
};


export async function getAnilistId(malId: string): Promise<string | null> {
  if (anilistCache.has(malId)) return anilistCache.get(malId)!;
  try {
    const query = `query ($id: Int) { Media (idMal: $id, type: ANIME) { id } }`;
    // AniList is a public API — no Cloudflare, no proxy needed
    const res = await fetchWithTimeout("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables: { id: parseInt(malId) } }),
    }, 8000);
    if (res.ok) {
      const data = (await res.json()) as any;
      const id = data.data?.Media?.id?.toString();
      if (id) {
        anilistCache.set(malId, id);
        return id;
      }
    }
  } catch (e) {
    console.error(`[Anilist Proxy] ID fetch error:`, e);
  }
  return null;
}

export async function searchAnimelok(query: string) {
  try {
    // Try suggestions first
    const sUrl = `https://animelok.xyz/api/anime/search-suggestions?q=${encodeURIComponent(query)}`;
    const sRes = await fetchWithProxy(sUrl, { headers: ANIMELOK_HEADERS });
    if (sRes.ok) {
      const data = (await sRes.json()) as any;
      if (data.results?.length > 0) return data.results;
      if (data.length > 0) return data;
    }

    // Main search API
    const url = `https://animelok.xyz/api/anime/search?q=${encodeURIComponent(query)}`;
    const res = await fetchWithProxy(url, { headers: ANIMELOK_HEADERS });
    if (res.ok) {
      const data = (await res.json()) as any;
      return data.results || data.anime || data || [];
    }
  } catch (e) {
    console.error(`[Animelok Search Error]:`, e);
  }
  return [];
}

export async function getAnimelokMetadata(slug: string) {
  let allEpisodes: any[] = [];
  let page = 0;
  const pageSize = 250;

  try {
    while (page < 10) {
      // Safety limit of 2500 episodes
      const url = `https://animelok.xyz/api/anime/${slug}/episodes-range?page=${page}&pageSize=${pageSize}`;
      const res = await fetchWithProxy(url, { headers: ANIMELOK_HEADERS });
      if (!res.ok) break;

      const data = (await res.json()) as any;
      const eps = (data.episodes || []).map((ep: any) => ({
        number: ep.number,
        title: ep.name,
        image: ep.img,
        description: ep.description,
        isFiller: ep.isFiller,
      }));

      if (eps.length === 0) break;
      allEpisodes.push(...eps);

      // If we got fewer than pageSize, it's likely the last page
      if (eps.length < pageSize) break;
      page++;
    }
    return allEpisodes;
  } catch (e) {
    console.error("[Animelok Metadata Error]", e);
  }
  return allEpisodes;
}

export async function getAnimelokSources(slug: string, ep: number) {
  try {
    const url = `https://animelok.xyz/api/anime/${slug}/episodes/${ep}`;
    const res = await fetchWithProxy(url, { headers: ANIMELOK_HEADERS });
    if (res.ok) {
      const data = (await res.json()) as any;
      const servers = data.episode?.servers || [];

      const sources = servers.map((s: any) => {
        const tip = s.tip?.toLowerCase() || "";
        const name = s.name?.toLowerCase() || "";
        const languages = s.languages || [];

        let category = "sub";
        if (languages.includes("HINDI") || name.includes("hindi"))
          category = "hindi";
        else if (languages.includes("ENGLISH") && tip.includes("dub"))
          category = "dub";
        else if (languages.length > 1) category = "multi";

        let finalUrl = s.url || "";
        if (finalUrl.startsWith("[") && finalUrl.endsWith("]")) {
          try {
            const parsed = JSON.parse(finalUrl);
            if (parsed && parsed.length > 0 && parsed[0].url) {
              finalUrl = parsed[0].url;
            }
          } catch (e) {
            // ignore parse error if not valid json
          }
        } 

        return {
          name: s.name + (s.tip ? ` (${s.tip})` : ""),
          url: finalUrl,
          category: category,
          language:
            languages[0] || (category === "dub" ? "English" : "Japanese"),
          isM3U8:
            finalUrl.includes(".m3u8") ||
            finalUrl.includes("master.m3u8") ||
            finalUrl.includes("uwu.m3u8"),
        };
      });

      const subtitlesList = data.episode?.subtitles || [];
      const parsedSubtitles = subtitlesList.map((sub: any) => ({
        language: sub.name || "Unknown",
        url: sub.url,
      }));

      return { sources, subtitles: parsedSubtitles };
    }
  } catch (e) {
    console.error("[Animelok Sources Error]", e);
  }
  return { sources: [], subtitles: [] };
}
