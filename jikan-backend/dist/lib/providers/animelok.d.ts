export declare function getAnilistId(malId: string): Promise<string | null>;
export declare function searchAnimelok(query: string): Promise<any>;
export declare function getAnimelokMetadata(slug: string): Promise<any[]>;
export declare function getAnimelokSources(slug: string, ep: number): Promise<{
    sources: any;
    subtitles: any;
}>;
//# sourceMappingURL=animelok.d.ts.map