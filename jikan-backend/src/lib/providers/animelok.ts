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

const fetchWithProxy = async (url: string, options: any = {}) => {
  const API_KEY = "cfx_d98b6726b0533d81fc41a33e881a2a58";
  // Encode target URL before sending to proxy
  const proxyUrl = `https://proxy.corsfix.com/?url=${encodeURIComponent(url)}`;

  const directTrack = async () => {
    const res = await fetchWithTimeout(url, options, 3000); 
    if (res.status === 403 || res.status === 503 || res.status === 404) {
      throw new Error(`Direct failed: ${res.status}`);
    }
    return res;
  };

  const proxyTrack = async () => {
    // 500ms delay to favor direct fetches
    await new Promise(r => setTimeout(r, 500)); 
    
    // Hardened browser-like headers for proxy track to bypass detection
    const proxyOptions = {
      ...options,
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://animelok.xyz/",
        "Sec-Ch-Ua": '"Chromium";v="125", "Not.A/Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
        ...options.headers,
        "x-corsfix-key": API_KEY,
      }
    };

    const res = await fetchWithTimeout(proxyUrl, proxyOptions, 7000);
    if (!res.ok) {
       // Debugging: Log the status code using clone to preserve stream
       const resClone = res.clone();
       const body = await resClone.text().catch(() => "N/A");
       console.log(`[Animelok Debug] Proxy ${res.status} for ${url}: ${body.substring(0, 100)}`);
       if (res.status !== 404) throw new Error(`Proxy failed: ${res.status}`);
    }
    return res;
  };

  try {
    const result = await Promise.any([directTrack(), proxyTrack()]);
    console.log(`[Animelok] Success for ${url}`);
    return result;
  } catch (e: any) {
    console.error(`[Animelok] Total failure for ${url}: ${e.message}`);
    // If both failed, attempt one last desperate direct fetch to see the raw response
    return await fetchWithTimeout(url, options, 2000).catch(() => {
        throw new Error("Network saturation/Total failure");
    });
  }
};

export async function getAnilistId(malId: string): Promise<string | null> {
  if (anilistCache.has(malId)) return anilistCache.get(malId)!;
  try {
    const query = `query ($id: Int) { Media (idMal: $id, type: ANIME) { id } }`;
    const res = await fetchWithProxy("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables: { id: parseInt(malId) } }),
    });
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
