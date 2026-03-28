import { Hono } from "hono";
import { getAnilistId, getAnimelokSources, getAnimelokMetadata, searchAnimelok, } from "../../lib/providers/animelok.js";
import { getDesiDubSources, getDesiDubInfo, } from "../../lib/providers/desidub-v2.js";
import { searchAnimeHindiDubbedWP, getAnimeHindiDubbedAllSourcesWP, } from "../../lib/providers/animehindidubbed-wp.js";
const streamingRouter = new Hono();
// Global caches (Titles only)
const titleCache = new Map();
async function fetchWithRetry(fn, retries = 2, delay = 1000) {
    try {
        return await fn();
    }
    catch (e) {
        if (retries <= 0)
            throw e;
        await new Promise((res) => setTimeout(res, delay));
        return fetchWithRetry(fn, retries - 1, delay * 2);
    }
}
// Helper: Get titles from Jikan
async function getAnimeTitles(malId) {
    if (titleCache.has(malId)) {
        return JSON.parse(titleCache.get(malId));
    }
    try {
        const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}`);
        if (res.ok) {
            const data = (await res.json());
            const titles = [];
            if (data.data?.title_english)
                titles.push(data.data.title_english);
            if (data.data?.title)
                titles.push(data.data.title);
            if (data.data?.titles) {
                data.data.titles.forEach((t) => {
                    if (!titles.includes(t.title))
                        titles.push(t.title);
                });
            }
            if (titles.length > 0) {
                titleCache.set(malId, JSON.stringify(titles));
            }
            return titles;
        }
    }
    catch (e) {
        console.error(`[Jikan] Title fetch error:`, e);
    }
    return [];
}
// Unified Sources Endpoint
streamingRouter.get("/sources", async (c) => {
    const animeId = c.req.query("animeId");
    const ep = parseInt(c.req.query("ep") || "1");
    const malId = animeId || "unknown";
    const titles = await getAnimeTitles(malId);
    if (titles.length === 0)
        return c.json({ error: "Title not found" }, 404);
    const mainTitle = titles[0];
    console.log(`[Streaming] Fetching aggregated sources for ${mainTitle} Ep ${ep}...`);
    let aggregatedSources = [];
    let aggregatedSubtitles = [];
    let providersUsed = [];
    try {
        // Run all provider requests in parallel to avoid timeouts
        const providerPromises = [
            // 1. Animelok sources
            (async () => {
                try {
                    const aniId = await getAnilistId(malId);
                    const idCandidates = [malId];
                    if (aniId && aniId !== malId)
                        idCandidates.unshift(aniId);
                    const baseSlug = titles[0]
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/(^-|-$)/g, "");
                    await fetchWithRetry(async () => {
                        for (const id of idCandidates) {
                            const candidateSlug = `${baseSlug}-${id}`;
                            const results = await getAnimelokSources(candidateSlug, ep);
                            if (results.sources && results.sources.length > 0) {
                                const sourcesWithProvider = results.sources.map((s) => ({
                                    ...s,
                                    provider: "Animelok",
                                }));
                                aggregatedSources.push(...sourcesWithProvider);
                                if (results.subtitles)
                                    aggregatedSubtitles.push(...results.subtitles);
                                providersUsed.push("Animelok");
                                return;
                            }
                        }
                        // Try Search Fallback if ID-slug failed
                        const lokResults = await searchAnimelok(titles[0]);
                        const lokMatch = lokResults.find((r) => titles.some((t) => {
                            const rt = (r.title || r.slug || "").toLowerCase();
                            const tt = t.toLowerCase();
                            return rt.includes(tt) || tt.includes(rt);
                        }));
                        if (lokMatch) {
                            const slug = lokMatch.slug || lokMatch.id;
                            const results = await getAnimelokSources(slug, ep);
                            if (results.sources && results.sources.length > 0) {
                                const sourcesWithProvider = results.sources.map((s) => ({
                                    ...s,
                                    provider: "Animelok (Search)",
                                }));
                                aggregatedSources.push(...sourcesWithProvider);
                                if (results.subtitles)
                                    aggregatedSubtitles.push(...results.subtitles);
                                providersUsed.push("Animelok (Search)");
                            }
                        }
                    });
                }
                catch (e) {
                    console.log("[Streaming] Animelok failed after retries:", e);
                }
            })(),
            // 2. DesiDubAnime sources
            (async () => {
                try {
                    await fetchWithRetry(async () => {
                        console.log("[Streaming] Searching DesiDubAnime for:", titles);
                        console.log("[Streaming] DesiDubAnime: Starting provider execution");
                        // Check for known anime mappings
                        for (const title of titles) {
                            const normalizedTitle = title.toLowerCase().trim();
                            let knownSlug = null;
                            if (normalizedTitle.includes('jujutsu kaisen')) {
                                knownSlug = 'jujutsu-kaisen-season-3';
                            }
                            else if (normalizedTitle.includes('naruto')) {
                                knownSlug = 'naruto';
                            }
                            else if (normalizedTitle === 'one piece' || normalizedTitle.includes('one piece')) {
                                knownSlug = 'one-piece';
                            }
                            else if (normalizedTitle.includes('attack on titan')) {
                                knownSlug = 'attack-on-titan';
                            }
                            else if (normalizedTitle.includes('demon slayer') || normalizedTitle.includes('kimetsu')) {
                                knownSlug = 'demon-slayer';
                            }
                            else if (normalizedTitle.includes('my hero') || normalizedTitle.includes('boku no hero')) {
                                knownSlug = 'my-hero-academia';
                            }
                            else if (normalizedTitle === 'death note') {
                                knownSlug = 'death-note';
                            }
                            else if (normalizedTitle.includes('dragon ball')) {
                                knownSlug = 'dragon-ball';
                            }
                            else if (normalizedTitle.includes('fairy tail')) {
                                knownSlug = 'fairy-tail';
                            }
                            else if (normalizedTitle.includes('hunter x hunter')) {
                                knownSlug = 'hunter-x-hunter';
                            }
                            if (knownSlug) {
                                console.log("[Streaming] Trying DesiDubAnime slug:", knownSlug);
                                // Special case for Jujutsu Kaisen Season 3
                                if (knownSlug === "jujutsu-kaisen-season-3" && ep === 1) {
                                    console.log("[Streaming] DesiDubAnime: JJK S3 Ep 1 -> Ep 48");
                                    const results = await getDesiDubSources("jujutsu-kaisen-shimetsu-kaiyuu-zenpen-3rd-season-episode-48");
                                    if (results.length > 0) {
                                        console.log("[Streaming] DesiDubAnime: Found", results.length, "sources");
                                        const sourcesWithProvider = results.map((s) => ({
                                            ...s,
                                            provider: "DesiDubAnime",
                                        }));
                                        aggregatedSources.push(...sourcesWithProvider);
                                        providersUsed.push("DesiDubAnime");
                                        return;
                                    }
                                }
                                else {
                                    // Try normal episode lookup
                                    const animeInfo = await getDesiDubInfo(knownSlug);
                                    if (animeInfo && animeInfo.episodes && animeInfo.episodes.length > 0) {
                                        const targetEpisode = animeInfo.episodes[0];
                                        if (targetEpisode && targetEpisode.slug) {
                                            const results = await getDesiDubSources(targetEpisode.slug);
                                            if (results.length > 0) {
                                                const sourcesWithProvider = results.map((s) => ({
                                                    ...s,
                                                    provider: "DesiDubAnime",
                                                }));
                                                aggregatedSources.push(...sourcesWithProvider);
                                                providersUsed.push("DesiDubAnime");
                                                return;
                                            }
                                        }
                                    }
                                    else {
                                        // Fallback: Try direct episode slug construction
                                        console.log("[Streaming] DesiDubAnime: No episodes found, trying direct slug");
                                        const directSlug = `${knownSlug}-episode-${ep}`;
                                        try {
                                            const results = await getDesiDubSources(directSlug);
                                            if (results.length > 0) {
                                                console.log("[Streaming] DesiDubAnime: Found", results.length, "sources via direct slug fallback");
                                                const sourcesWithProvider = results.map((s) => ({
                                                    ...s,
                                                    provider: "DesiDubAnime",
                                                }));
                                                aggregatedSources.push(...sourcesWithProvider);
                                                providersUsed.push("DesiDubAnime");
                                                return;
                                            }
                                        }
                                        catch (e) {
                                            console.log("[Streaming] DesiDubAnime direct slug failed:", e);
                                        }
                                    }
                                }
                            }
                        }
                    });
                }
                catch (e) {
                    console.log("[Streaming] DesiDubAnime failed after retries:", e);
                }
                console.log("[Streaming] DesiDubAnime: No sources found for any title");
            })(),
            // 3. AnimeHindiDubbed sources
            (async () => {
                try {
                    await fetchWithRetry(async () => {
                        console.log("[Streaming] Searching AnimeHindiDubbed-WP for:", titles);
                        for (const title of titles) {
                            const ahdResults = await searchAnimeHindiDubbedWP(title);
                            console.log("[Streaming] AnimeHindiDubbed-WP results:", ahdResults.length);
                            if (ahdResults.length > 0) {
                                const match = ahdResults.find((r) => r.title.rendered.toLowerCase().includes(title.toLowerCase())) || ahdResults[0];
                                const sources = await getAnimeHindiDubbedAllSourcesWP(match.id, ep);
                                console.log("[Streaming] AnimeHindiDubbed-WP sources:", sources.length);
                                if (sources.length > 0) {
                                    const sourcesWithProvider = sources.map((s) => ({
                                        ...s,
                                        provider: "AnimeHindiDubbed-WP",
                                    }));
                                    aggregatedSources.push(...sourcesWithProvider);
                                    providersUsed.push("AnimeHindiDubbed-WP");
                                    return;
                                }
                            }
                        }
                    });
                }
                catch (e) {
                    console.log("[Streaming] AnimeHindiDubbed-WP failed after retries:", e);
                }
            })(),
        ];
        // Wait for all providers to complete (with timeout)
        await Promise.allSettled(providerPromises);
        if (aggregatedSources.length > 0) {
            return c.json({
                provider: providersUsed.join(", "),
                status: 200,
                data: { sources: aggregatedSources, subtitles: aggregatedSubtitles },
            });
        }
    }
    catch (e) {
        console.error("[Streaming Router] Error:", e.message);
    }
    return c.json({ provider: "None", status: 404, message: "No sources found" }, 404);
});
// Unified Metadata Endpoint
streamingRouter.get("/episode-metadata", async (c) => {
    const animeId = c.req.query("animeId");
    const malId = animeId || "unknown";
    const titles = await getAnimeTitles(malId);
    if (titles.length === 0)
        return c.json({ error: "Title not found" }, 404);
    // Try all providers in parallel for episode metadata
    const metadataPromises = [
        // 1. Animelok metadata
        (async () => {
            try {
                const aniId = await getAnilistId(malId);
                const idCandidates = [malId];
                if (aniId && aniId !== malId)
                    idCandidates.unshift(aniId);
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
            }
            catch (e) {
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
                    }
                    else if (normalizedTitle.includes('naruto')) {
                        knownSlug = 'naruto';
                    }
                    else if (normalizedTitle.includes('one piece')) {
                        knownSlug = 'one-piece';
                    }
                    else if (normalizedTitle.includes('attack on titan')) {
                        knownSlug = 'attack-on-titan';
                    }
                    else if (normalizedTitle.includes('demon slayer')) {
                        knownSlug = 'demon-slayer';
                    }
                    else if (normalizedTitle.includes('my hero academia')) {
                        knownSlug = 'my-hero-academia';
                    }
                    else if (normalizedTitle === 'death note') {
                        knownSlug = 'death-note';
                    }
                    if (knownSlug) {
                        console.log("[Metadata] Trying DesiDubAnime slug:", knownSlug);
                        const animeInfo = await getDesiDubInfo(knownSlug);
                        if (animeInfo && animeInfo.episodes && animeInfo.episodes.length > 0) {
                            const episodes = animeInfo.episodes.map((ep) => ({
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
            }
            catch (e) {
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
    return c.json({ provider: "None", status: 404, message: "Metadata not found" }, 404);
});
export default streamingRouter;
//# sourceMappingURL=index.js.map