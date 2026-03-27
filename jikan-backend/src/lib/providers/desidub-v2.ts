import * as cheerio from "cheerio";
import { desidubLimiter, delay, retryWithBackoff } from "../rateLimiter.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const decodeB64 = (str: string) => {
  try {
    return Buffer.from(str, "base64").toString("utf-8");
  } catch (e) {
    return "";
  }
};

// Known anime mappings for DesiDubAnime
const KNOWN_ANIME_MAPPING: Record<string, string> = {
    'jujutsu kaisen': 'jujutsu-kaisen-season-3',
    'jujutsu kaisen season 3': 'jujutsu-kaisen-season-3',
    'jujutsu kaisen the culling game': 'jujutsu-kaisen-season-3',
    'one piece': 'one-piece',
    'naruto': 'naruto',
    'attack on titan': 'attack-on-titan',
    'demon slayer': 'demon-slayer',
    'my hero academia': 'my-hero-academia',
    'death note': 'death-note',
    'dragon ball': 'dragon-ball',
    'tokyo ghoul': 'tokyo-ghoul',
    'bleach': 'bleach',
    'sword art online': 'sword-art-online',
    'fullmetal alchemist': 'fullmetal-alchemist',
    'hunter x hunter': 'hunter-x-hunter',
    'fairy tail': 'fairy-tail',
    'black clover': 'black-clover',
    'the promised neverland': 'the-promised-neverland',
};

export async function searchDesiDub(query: string) {
    try {
        await desidubLimiter.acquire();
        await delay(1000); // Additional delay between requests

        const normalizedQuery = query.toLowerCase().trim();
        console.log('[DesiDub] Searching for:', normalizedQuery);

        // First, check if we have a known mapping
        if (KNOWN_ANIME_MAPPING[normalizedQuery]) {
            const slug = KNOWN_ANIME_MAPPING[normalizedQuery];
            console.log('[DesiDub] Found known mapping:', slug);

            // Verify the anime exists by checking the page
            try {
                const url = `https://www.desidubanime.me/anime/${slug}/`;
                const res = await retryWithBackoff(async () => {
                    return await fetch(url, { headers: { "User-Agent": USER_AGENT } });
                }, 2, 1000);

                if (res.ok) {
                    const html = await res.text();
                    const $ = cheerio.load(html);
                    const title = $('.data h1, h1, .title').first().text().trim();
                    const image = $('.poster img, img').first().attr('src') || $('.poster img, img').first().attr('data-src');

                    if (title) {
                        return [{ title, slug, image }];
                    }
                }
            } catch (e) {
                console.log('[DesiDub] Known mapping verification failed:', e);
            }
        }

        // Try to generate likely slug patterns
        const slugCandidates = generateSlugCandidates(normalizedQuery);
        console.log('[DesiDub] Generated slug candidates:', slugCandidates);

        for (const slug of slugCandidates) {
            try {
                const url = `https://www.desidubanime.me/anime/${slug}/`;
                console.log('[DesiDub] Checking slug:', slug);

                const res = await retryWithBackoff(async () => {
                    return await fetch(url, { headers: { "User-Agent": USER_AGENT } });
                }, 2, 1000);

                if (res.ok) {
                    const html = await res.text();
                    const $ = cheerio.load(html);
                    const title = $('.data h1, h1, .title').first().text().trim();
                    const image = $('.poster img, img').first().attr('src') || $('.poster img, img').first().attr('data-src');

                    if (title && title.toLowerCase().includes(normalizedQuery.split(' ')[0])) {
                        console.log('[DesiDub] Found anime via slug generation:', { title, slug });
                        return [{ title, slug, image }];
                    }
                }
            } catch (e) {
                // Continue to next candidate
            }
        }

        // Fallback: Try the search page (even though it might not work)
        const searchUrl = `https://www.desidubanime.me/search/${encodeURIComponent(query)}/`;
        console.log('[DesiDub] Falling back to search URL:', searchUrl);

        const res = await retryWithBackoff(async () => {
            return await fetch(searchUrl, { headers: { "User-Agent": USER_AGENT } });
        }, 3, 2000);

        if (res.ok) {
            const html = await res.text();
            const $ = cheerio.load(html);
            const results: any[] = [];

            // Try to find any anime links on the page
            const animeLinks = $('a[href*="/anime/"]');
            animeLinks.each((_, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().trim();
                const slug = href?.split('/anime/')[1]?.split('/')[0]?.replace(/\/$/, '');

                if (slug && text && text.length > 3) {
                    // Check if the title matches our query
                    if (text.toLowerCase().includes(normalizedQuery.split(' ')[0]) ||
                        normalizedQuery.includes(text.toLowerCase().split(' ')[0])) {
                        if (!results.some(r => r.slug === slug)) {
                            console.log('[DesiDub] Found via search page:', { title: text.substring(0, 50), slug });
                            results.push({ title: text, slug, image: null });
                        }
                    }
                }
            });

            if (results.length > 0) {
                return results.slice(0, 5);
            }
        }

        console.log('[DesiDub] No results found for query:', query);
        return [];
    } catch (e) {
        console.error('[DesiDub Search Error]', e);
        return [];
    }
}

// Helper function to generate likely slug candidates
function generateSlugCandidates(query: string): string[] {
    const candidates: string[] = [];
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);

    // Common patterns
    candidates.push(words.join('-')); // basic kebab-case
    candidates.push(words.join('-') + '-season-1'); // with season
    candidates.push(words.join('-') + '-dub'); // with dub
    candidates.push(words.join('-') + '-hindi'); // with hindi

    // For multi-word titles, try different combinations
    if (words.length > 2) {
        candidates.push(words.slice(0, -1).join('-')); // without last word
        candidates.push(words.slice(0, 2).join('-')); // first two words
    }

    // Try with numbers if they exist
    const numberMatch = query.match(/(\d+)/);
    if (numberMatch) {
        const base = words.filter(w => !w.match(/^\d+$/)).join('-');
        candidates.push(`${base}-${numberMatch[1]}`);
        candidates.push(`${base}-season-${numberMatch[1]}`);
    }

    // Remove duplicates and return
    return [...new Set(candidates)];
}

// Extract anime ID from the page HTML
function extractAnimeId(html: string): string | null {
  // Look for data-anime-id or similar attributes
  const animeIdMatch = html.match(/data-anime-id=["']?(\d+)["']?/);
  if (animeIdMatch) return animeIdMatch[1];

  // Look for post ID or anime ID in script tags
  const scriptMatch = html.match(/anime_id["']?\s*:\s*["']?(\d+)["']?/);
  if (scriptMatch) return scriptMatch[1];

  // Look for post ID in the URL or HTML
  const postIdMatch = html.match(/postid["']?\s*:\s*["']?(\d+)["']?/);
  if (postIdMatch) return postIdMatch[1];

  return null;
}

export async function getDesiDubInfo(slug: string) {
  try {
    await desidubLimiter.acquire();
    await delay(1000);

    const url = `https://www.desidubanime.me/anime/${slug}/`;
    console.log("[DesiDub] Getting info:", url);

    const res = await retryWithBackoff(
      async () => {
        return await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      },
      3,
      2000,
    );

    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Extract anime ID for AJAX calls
    const animeId = extractAnimeId(html);
    console.log("[DesiDub] Extracted anime ID:", animeId);

    let episodes: any[] = [];

    // Try AJAX API first if we have anime ID
    if (animeId) {
      try {
        console.log("[DesiDub] Trying AJAX API for episodes");
        const ajaxUrl = `https://www.desidubanime.me/wp-admin/admin-ajax.php?action=get_episodes&anime_id=${animeId}&page=1&order=desc`;

        const ajaxRes = await retryWithBackoff(
          async () => {
            return await fetch(ajaxUrl, {
              headers: {
                "User-Agent": USER_AGENT,
                "Accept": "*/*",
                "Referer": url
              }
            });
          },
          2,
          1000,
        );

        if (ajaxRes.ok) {
          const ajaxData = await ajaxRes.json() as any;
          if (ajaxData.success && ajaxData.data?.episodes) {
            episodes = ajaxData.data.episodes.map((ep: any) => ({
              number: ep.meta_number || ep.number?.replace('Episode ', ''),
              slug: ep.url?.split('/watch/')[1]?.split('/')[0]?.replace(/\/$/, ''),
              title: ep.title,
              image: ep.thumbnail,
              date: ep.released,
              url: ep.url
            })).filter((ep: any) => ep.slug && ep.number);

            console.log("[DesiDub] Found", episodes.length, "episodes via AJAX API");
          }
        }
      } catch (ajaxError) {
        console.log("[DesiDub] AJAX API failed:", ajaxError);
      }
    }

    // Fallback to HTML scraping if AJAX failed
    if (episodes.length === 0) {
      console.log("[DesiDub] Falling back to HTML scraping");

      // Try multiple selectors for episodes
      const episodeSelectors = [
        ".episodios li",
        ".episode-list li",
        ".episodes li",
        '[class*="episode"]',
        'a[href*="/watch/"]',
      ];

      for (const selector of episodeSelectors) {
        const items = $(selector);
        console.log(
          `[DesiDub] Trying episode selector "${selector}":`,
          items.length,
          "episodes",
        );

        if (items.length > 0) {
          items.each((_, el) => {
            const href = $(el).find("a").attr("href") || $(el).attr("href");
            const epNum =
              $(el)
                .find(".episodionum, .episode-number, .ep-num")
                .text()
                .trim() ||
              $(el)
                .text()
                .match(/Episode\s*(\d+)/i)?.[1] ||
              $(el).attr("data-episode") ||
              $(el).find("a").text().match(/(\d+)/)?.[1] ||
              "";
            const date = $(el).find(".episodiodate, .episode-date").text().trim();
            const epSlug = href
              ?.split("/watch/")[1]
              ?.split("/")[0]
              ?.replace(/\/$/, "");

            console.log("[DesiDub] Found potential episode:", {
              href,
              epNum,
              text: $(el).text().trim().substring(0, 100),
              epSlug
            });

            if (epSlug && epNum) {
              episodes.push({ number: epNum, slug: epSlug, date });
            }
          });

          if (episodes.length > 0) {
            console.log("[DesiDub] Found", episodes.length, "episodes via HTML scraping");
            break;
          }
        }
      }
    }

    return {
      title: $(".data h1, h1, .title").first().text().trim(),
      synopsis: $(".wp-content p, .synopsis, .description")
        .first()
        .text()
        .trim(),
      image:
        $(".poster img, img").first().attr("src") ||
        $(".poster img, img").first().attr("data-src"),
      episodes,
      animeId, // Include anime ID for future AJAX calls
    };
  } catch (e) {
    console.error("[DesiDub Info Error]", e);
  }
  return null;
}

export async function getDesiDubSources(id: string) {
  try {
    await desidubLimiter.acquire();
    await delay(1000);

    const url = `https://www.desidubanime.me/watch/${id}/`;
    console.log("[DesiDub] Getting sources:", url);

    const response = await retryWithBackoff(
      async () => {
        return await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      },
      3,
      2000,
    );

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    const sources: any[] = [];

    // Try multiple selectors for embed data - ordered by specificity
    const embedSelectors = [
      "span[data-embed-id]", // Primary embed data
      "[data-embed]", // Alternative embed data
      "iframe[data-embed-id]", // Iframe with embed data
      "[data-player-id]", // Player ID data
      "iframe[src]", // Direct iframes
      "video source[src]", // Video sources
      "[data-src]", // Data source attributes
    ];

    for (const selector of embedSelectors) {
      const items = $(selector);
      console.log(
        `[DesiDub] Trying embed selector "${selector}":`,
        items.length,
        "items",
      );

      if (items.length > 0) {
        items.each((_, el) => {
          const embedData =
            $(el).attr("data-embed-id") || $(el).attr("data-embed");
          const playerId = $(el).attr("data-player-id");
          const src = $(el).attr("src") || $(el).attr("data-src");

          if (embedData) {
            // Handle base64 encoded embed data
            const [b64Name, b64Url] = embedData.split(":");
            if (!b64Name || !b64Url) return;
            const serverName = decodeB64(b64Name);
            let finalUrl = decodeB64(b64Url);
            if (!finalUrl || !serverName) return;

            if (finalUrl.includes("<iframe")) {
              const iframeSrc = finalUrl.match(/src=['"]([^'"]+)['"]/)?.[1];
              if (iframeSrc) finalUrl = iframeSrc;
            }

            if (finalUrl && !finalUrl.includes("googletagmanager")) {
              // Enhanced server name and category detection
              const serverNameLower = serverName.toLowerCase();
              const isDub =
                serverNameLower.includes("dub") ||
                serverNameLower.includes("hindi") ||
                serverNameLower.includes("mirror") ||
                serverNameLower.includes("stream");
              const isMulti =
                serverNameLower.includes("multi") ||
                serverNameLower.includes("abyss") ||
                serverNameLower.includes("vmoly");

              // Clean server name
              let cleanName = serverName
                .replace(/dub$/i, "")
                .replace(/multi$/i, "")
                .trim();
              if (cleanName.length === 0) cleanName = serverName;

              // Determine language and category
              let category = "hindi"; // Default for DesiDub
              let language = "Hindi";

              if (isMulti) {
                category = "multi";
                language = "Multi";
              } else if (!isDub) {
                category = "sub";
                language = "Japanese";
              }

              // Ensure proper URL format
              if (finalUrl.startsWith("//")) finalUrl = `https:${finalUrl}`;
              if (!finalUrl.startsWith("http")) return; // Skip invalid URLs

              sources.push({
                name: cleanName,
                url: finalUrl,
                category: category,
                language: language,
                isM3U8: finalUrl.includes(".m3u8"),
                isEmbed: !finalUrl.includes(".m3u8"),
                provider: "DesiDubAnime",
              });
            }
          } else if (playerId) {
            // Handle player ID based sources
            const isDub =
              playerId.toLowerCase().includes("dub") ||
              playerId.toLowerCase().includes("hindi");
            sources.push({
              name: "PlayerID",
              url: `https://www.desidubanime.me/player/${playerId}`,
              category: isDub ? "hindi" : "sub",
              language: isDub ? "Hindi" : "Japanese",
              isM3U8: false,
              isEmbed: true,
              provider: "DesiDubAnime",
            });
          } else if (src) {
            // Handle direct sources
            let srcUrl = src; // Make mutable copy
            const srcLower = srcUrl.toLowerCase();
            const isDub =
              srcLower.includes("dub") ||
              srcLower.includes("hindi") ||
              srcLower.includes("mirror") ||
              srcLower.includes("stream");

            if (srcUrl.startsWith("//")) srcUrl = `https:${srcUrl}`;

            // Skip if not a valid URL or analytics
            if (
              !srcUrl.startsWith("http") ||
              srcUrl.includes("googletagmanager") ||
              srcUrl.includes("analytics")
            )
              return;

            sources.push({
              name: "Direct",
              url: srcUrl,
              category: isDub ? "hindi" : "sub",
              language: isDub ? "Hindi" : "Japanese",
              isM3U8: srcUrl.includes(".m3u8"),
              isEmbed: !srcUrl.includes(".m3u8"),
              provider: "DesiDubAnime",
            });
          }
        });

        if (sources.length > 0) {
          console.log(
            "[DesiDub] Found",
            sources.length,
            "sources with selector:",
            selector,
          );
          break;
        }
      }
    }

    return sources;
  } catch (e) {
    console.error("[DesiDub Sources Error]", e);
  }
  return [];
}
