/**
 * useFavorites
 * Works WITHOUT login: data is saved to localStorage.
 * If the user is logged in, it also syncs to Supabase so favorites are available across devices.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface Favorite {
    id: string;
    user_id?: string;
    anime_id: string;
    anime_title: string;
    anime_poster: string;
    created_at: string;
}

const STORAGE_KEY = 'animepro_favorites';

function loadFromStorage(): Favorite[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveToStorage(favs: Favorite[], sourceId?: string) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
        window.dispatchEvent(new CustomEvent('favorites_updated', { detail: { sourceId } }));
    } catch { /* silent fail */ }
}

export const useFavorites = () => {
    const [favorites, setFavorites] = useState<Favorite[]>(loadFromStorage);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    // On mount: merge localStorage with Supabase (if logged in)
    useEffect(() => {
        const init = async () => {
            const local = loadFromStorage();
            if (user && supabase) {
                try {
                    const { data } = await supabase
                        .from('favorites')
                        .select('*')
                        .eq('user_id', user.id)
                        .order('created_at', { ascending: false });

                    const remote: Favorite[] = data || [];

                    // Merge: remote wins, but include local-only items
                    const remoteIds = new Set(remote.map(f => f.anime_id));
                    const localOnly = local.filter(f => !remoteIds.has(f.anime_id));

                    const merged = [...remote, ...localOnly];
                    setFavorites(merged);
                    saveToStorage(merged);

                    // Push local-only items to Supabase
                    if (localOnly.length > 0) {
                        await supabase.from('favorites').insert(
                            localOnly.map(f => ({
                                user_id: user.id,
                                anime_id: f.anime_id,
                                anime_title: f.anime_title,
                                anime_poster: f.anime_poster,
                            }))
                        );
                    }
                } catch (e) {
                    console.warn('Supabase sync failed, using local:', e);
                    setFavorites(local);
                }
            } else {
                setFavorites(local);
            }
            setLoading(false);
        };
        init();

        const handleUpdate = (e: any) => {
            // Only update if the event came from a different instance
            if (e.detail?.sourceId !== instanceId.current) {
                setFavorites(loadFromStorage());
            }
        };
        window.addEventListener('favorites_updated', handleUpdate);
        return () => window.removeEventListener('favorites_updated', handleUpdate);
    }, [user]);

    const instanceId = useRef(Math.random().toString(36).substr(2, 9));

    const addFavorite = useCallback(async (anime: any): Promise<{ error?: any }> => {
        const animeIdStr = String(anime.id || anime.mal_id);
        const newFav: Favorite = {
            id: `local_${Date.now()}_${animeIdStr}`,
            anime_id: animeIdStr,
            anime_title: anime.title || 'Unknown',
            anime_poster: anime.poster || anime.image || '',
            created_at: new Date().toISOString(),
        };

        setFavorites(prev => {
            if (prev.some(f => f.anime_id === newFav.anime_id)) return prev;
            const updated = [newFav, ...prev];
            // Side effect after state update
            setTimeout(() => saveToStorage(updated, instanceId.current), 0);
            return updated;
        });

        // Also save to Supabase if logged in
        if (user && supabase) {
            try {
                await supabase.from('favorites').insert({
                    user_id: user.id,
                    anime_id: newFav.anime_id,
                    anime_title: newFav.anime_title,
                    anime_poster: newFav.anime_poster,
                });
            } catch (e) {
                console.warn('Supabase add failed:', e);
            }
        }

        return {};
    }, [user]);

    const removeFavorite = useCallback(async (animeId: string): Promise<{ error?: any }> => {
        const animeIdStr = String(animeId);
        setFavorites(prev => {
            const updated = prev.filter(f => f.anime_id !== animeIdStr);
            setTimeout(() => saveToStorage(updated, instanceId.current), 0);
            return updated;
        });

        if (user && supabase) {
            try {
                await supabase
                    .from('favorites')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('anime_id', animeId);
            } catch (e) {
                console.warn('Supabase remove failed:', e);
            }
        }

        return {};
    }, [user]);

    const isFavorite = useCallback((animeId: string) => {
        return favorites.some(f => f.anime_id === String(animeId));
    }, [favorites]);

    return { favorites, loading, addFavorite, removeFavorite, isFavorite };
};
