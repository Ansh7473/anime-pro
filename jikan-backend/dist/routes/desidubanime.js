import { Hono } from "hono";
import { searchDesiDub, getDesiDubInfo, getDesiDubSources, } from "../lib/providers/desidub-v2.js";
const desidubanimeRouter = new Hono();
// GET /search?q={query}
desidubanimeRouter.get("/search", async (c) => {
    const q = c.req.query("q") || "";
    const results = await searchDesiDub(q);
    return c.json({ provider: "DesiDubAnime", status: 200, results });
});
// GET /info/{slug}
desidubanimeRouter.get("/info/:slug", async (c) => {
    const slug = c.req.param("slug");
    const info = await getDesiDubInfo(slug);
    if (!info)
        return c.json({ error: "Anime not found" }, 404);
    return c.json({ provider: "DesiDubAnime", status: 200, data: info });
});
// GET /watch/{episodeSlug}
desidubanimeRouter.get("/watch/:id", async (c) => {
    const id = c.req.param("id");
    const sources = await getDesiDubSources(id);
    return c.json({ provider: "DesiDubAnime", status: 200, data: { sources } });
});
// DEBUG endpoint - GET /debug/search?q={query}
desidubanimeRouter.get("/debug/search", async (c) => {
    const q = c.req.query("q") || "";
    try {
        const url = `https://www.desidubanime.me/?s=${encodeURIComponent(q)}`;
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            },
        });
        if (!response.ok) {
            return c.json({ error: "Search failed", status: response.status, url }, 500);
        }
        const html = await response.text();
        const cheerio = await import("cheerio");
        const $ = cheerio.load(html);
        const debugInfo = {
            query: q,
            url: url,
            responseStatus: response.status,
            htmlLength: html.length,
            selectorsFound: {
                ".result-item": $(".result-item").length,
                ".items .item": $(".items .item").length,
                ".post": $(".post").length,
                article: $("article").length,
                'a[href*="/anime/"]': $('a[href*="/anime/"]').length,
            },
            sampleLinks: $('a[href*="/anime/"]')
                .slice(0, 5)
                .map((_, el) => ({
                text: $(el).text().trim(),
                href: $(el).attr("href"),
            }))
                .get(),
            bodyPreview: $("body").html()?.substring(0, 1000) || "No body content",
        };
        return c.json({
            provider: "DesiDubAnime-Debug",
            status: 200,
            debug: debugInfo,
        });
    }
    catch (error) {
        return c.json({ error: "Debug search failed", message: error.message }, 500);
    }
});
// DEBUG endpoint - GET /debug/watch/{id}
desidubanimeRouter.get("/debug/watch/:id", async (c) => {
    const id = c.req.param("id");
    try {
        const url = `https://www.desidubanime.me/watch/${id}/`;
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            },
        });
        if (!response.ok) {
            return c.json({ error: "Watch page failed", status: response.status, url }, 500);
        }
        const html = await response.text();
        const cheerio = await import("cheerio");
        const $ = cheerio.load(html);
        const debugInfo = {
            episodeId: id,
            url: url,
            responseStatus: response.status,
            htmlLength: html.length,
            embedElements: $("span[data-embed-id]").length,
            iframeElements: $("iframe").length,
            videoElements: $("video").length,
            sampleEmbeds: $("span[data-embed-id]")
                .slice(0, 3)
                .map((_, el) => ({
                embedId: $(el).attr("data-embed-id"),
                text: $(el).text().trim(),
            }))
                .get(),
            bodyPreview: $("body").html()?.substring(0, 1000) || "No body content",
        };
        return c.json({
            provider: "DesiDubAnime-Debug",
            status: 200,
            debug: debugInfo,
        });
    }
    catch (error) {
        return c.json({ error: "Debug watch failed", message: error.message }, 500);
    }
});
export default desidubanimeRouter;
//# sourceMappingURL=desidubanime.js.map