/**
 * AnimeHindiDubbed Provider - WordPress API Version
 * Uses the WordPress REST API to fetch anime data and video sources
 * API Endpoint: https://animehindidubbed.in/wp-json/wp/v2/posts?search={query}
 */
export interface AnimeHindiDubbedSearchResult {
    id: number;
    title: {
        rendered: string;
    };
    slug: string;
    link: string;
    content: {
        rendered: string;
    };
}
export interface AnimeHindiDubbedEpisode {
    name: string;
    url: string;
}
export interface AnimeHindiDubbedInfo {
    id: number;
    title: string;
    slug: string;
    link: string;
    episodes: AnimeHindiDubbedEpisode[];
    servers: string[];
}
export interface AnimeHindiDubbedSource {
    url: string;
    type: "iframe" | "direct";
    quality?: string;
    server: string;
    provider: string;
    language: string;
}
/**
 * Search for anime using WordPress API
 */
export declare function searchAnimeHindiDubbedWP(query: string): Promise<AnimeHindiDubbedSearchResult[]>;
/**
 * Get anime info including episodes from WordPress API
 */
export declare function getAnimeHindiDubbedInfoWP(postId: number): Promise<AnimeHindiDubbedInfo | null>;
/**
 * Get video sources for a specific episode
 */
export declare function getAnimeHindiDubbedSourcesWP(postId: number, episodeName: string): Promise<AnimeHindiDubbedSource[]>;
/**
 * Get all sources for a specific episode number from all servers
 */
export declare function getAnimeHindiDubbedAllSourcesWP(postId: number, episodeNumber: number): Promise<AnimeHindiDubbedSource[]>;
//# sourceMappingURL=animehindidubbed-wp.d.ts.map