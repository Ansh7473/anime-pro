export declare function searchDesiDub(query: string): Promise<any[]>;
export declare function getDesiDubInfo(slug: string): Promise<{
    title: string;
    synopsis: string;
    image: string | undefined;
    episodes: any[];
    animeId: string | null;
} | null>;
export declare function getDesiDubSources(id: string): Promise<any[]>;
//# sourceMappingURL=desidub-v2.d.ts.map