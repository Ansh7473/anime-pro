import { useEffect, useState } from 'react';
import HeroBanner from '../components/HeroBanner';
import Row from '../components/Row';
import { animeAPI, normalize, hianimeAPI, normalizeHianime } from '../api/client';
import { motion } from 'framer-motion';
import TopLists from '../components/TopLists';
import { CircularProgress } from '../components/Skeleton';
import ContinueWatching from '../components/ContinueWatching';
import { useWatchHistory } from '../hooks/useWatchHistory';

const Home = () => {
  const [sections, setSections] = useState<any[]>([]);
  const [topLists, setTopLists] = useState<any>(null);
  const [spotlight, setSpotlight] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState('');
  const { watchHistory, removeFromWatchHistory } = useWatchHistory();

  useEffect(() => {
    const fetchHomeData = async () => {
      try {
        console.log('Fetching home data sequentially to avoid rate limiting...');
        setLoadingProgress(0);

        // Fetch Jikan and HiAnime data SEQUENTIALLY to avoid rate limiting
        // Order: 1. Home (top anime) -> 2. Current Seasonal -> 3. Upcoming -> 4. Spotlight -> 5. Top Airing
        let homeRes, seasonalRes, upcomingRes, spotlightRes, topAiringRes;

        try {
          console.log('1. Fetching home data (top anime)...');
          homeRes = await animeAPI.getHome();
          setLoadingProgress(20); // 20% after first API
        } catch (err) {
          console.error('Failed to fetch home data:', err);
          homeRes = { status: 'rejected' };
          setLoadingProgress(20);
        }

        try {
          console.log('2. Fetching current seasonal anime...');
          seasonalRes = await animeAPI.getCurrentSeasonalAnime();
          setLoadingProgress(40); // 40% after second API
        } catch (err) {
          console.error('Failed to fetch current seasonal anime:', err);
          seasonalRes = { status: 'rejected' };
          setLoadingProgress(40);
        }

        try {
          console.log('3. Fetching upcoming seasonal anime...');
          upcomingRes = await animeAPI.getUpcomingSeasonalAnime();
          setLoadingProgress(60); // 60% after third API
        } catch (err) {
          console.error('Failed to fetch upcoming seasonal anime:', err);
          upcomingRes = { status: 'rejected' };
          setLoadingProgress(60);
        }

        try {
          console.log('4. Fetching spotlight anime...');
          spotlightRes = await hianimeAPI.getSpotlight();
          setLoadingProgress(80); // 80% after fourth API
        } catch (err) {
          console.error('Failed to fetch spotlight anime:', err);
          spotlightRes = { status: 'rejected' };
          setLoadingProgress(80);
        }

        try {
          console.log('5. Fetching top airing anime...');
          topAiringRes = await hianimeAPI.getTopAiring(1);
          setLoadingProgress(95); // 95% after fifth API
        } catch (err) {
          console.error('Failed to fetch top airing anime:', err);
          topAiringRes = { status: 'rejected' };
          setLoadingProgress(95);
        }

        const data: any = homeRes?.data?.data || {};
        const featured: any[] = data.featured || [];

        // Process HiAnime spotlight
        let hianimeSpotlight: any[] = [];
        if (spotlightRes?.data?.spotlightAnimes) {
          hianimeSpotlight = (spotlightRes.data.spotlightAnimes || []).map(normalizeHianime);
        }

        // Process HiAnime top airing
        let hianimeTopAiring: any[] = [];
        if (topAiringRes?.data?.results) {
          hianimeTopAiring = (topAiringRes.data.results || []).map(normalizeHianime);
        }

        const normalizeItem = (item: any) => normalize(item);
        const topAnime = (data.topAnime || []).map(normalizeItem);
        const recommendations = (data.recommendations || []).map(normalizeItem);
        const latest = (data.latest || []).map(normalizeItem);
        const tvShows = (data.tvShows || []).map(normalizeItem);
        const movies = (data.movies || []).map(normalizeItem);
        const todaySchedule = (data.todaySchedule || []).map(normalizeItem);

        // Process seasonal and upcoming anime
        const seasonalData = seasonalRes?.data?.data || [];
        const upcomingData = upcomingRes?.data?.data || [];

        setTopLists({
          airing: (data.topAiring || []).map(normalizeItem),
          popular: (data.mostPopular || []).map(normalizeItem),
          completed: (data.topCompleted || []).map(normalizeItem)
        });

        const built: any[] = [];

        // Prioritize HiAnime spotlight at the top
        if (hianimeSpotlight.length > 0) built.push({ title: '🔥 Spotlight Anime', items: hianimeSpotlight });
        if (hianimeTopAiring.length > 0) built.push({ title: '📡 Top Airing Now', items: hianimeTopAiring });

        if (latest.length > 0) built.push({ title: 'Latest Episodes', items: latest });
        if (tvShows.length > 0) built.push({ title: 'TV Shows', items: tvShows });
        if (movies.length > 0) built.push({ title: 'Movies', items: movies });
        if (todaySchedule.length > 0) built.push({ title: "Today's Release Schedule", items: todaySchedule });

        if (seasonalData.length > 0) built.push({ title: 'Current Season Anime', items: seasonalData.map(normalizeItem) });
        if (upcomingData.length > 0) built.push({ title: 'Upcoming Anime', items: upcomingData.map(normalizeItem) });

        if (featured.length > 0) built.push({ title: 'Trending Hindi Dubbed', items: featured.map(normalizeItem).slice(0, 5) });
        if (topAnime.length > 0) built.push({ title: 'Top Rated Global', items: topAnime });
        if (recommendations.length > 0) built.push({ title: 'Recommended for You', items: recommendations });

        setSections(built);

        // Use HiAnime spotlight for hero banner if available
        const heroAnime = hianimeSpotlight[0] || (featured[0] ? normalize(featured[0]) : null) || (latest[0] ? normalize(latest[0]) : null);
        setSpotlight(heroAnime);

      } catch (err: any) {
        console.error('Failed to fetch home data', err);
        setError(`Could not load home page: ${err.message || 'Unknown error'}`);
      } finally {
        setLoadingProgress(100);
        setLoading(false);
      }
    };
    fetchHomeData();
  }, []);

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        style={{ backgroundColor: 'var(--net-bg)', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', padding: '2rem', textAlign: 'center' }}
      >
        <p style={{ color: 'var(--net-red)', fontSize: '1.2rem', fontWeight: 700 }}>⚠ API Error</p>
        <p style={{ color: 'var(--net-text-muted)', maxWidth: '500px' }}>{error}</p>
        <button onClick={() => window.location.reload()} className="btn-primary" style={{ marginTop: '1rem' }}>Retry</button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      style={{ backgroundColor: 'var(--net-bg)', minHeight: '100vh', paddingBottom: '4rem' }}
    >
      {loading ? (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'var(--net-bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          gap: '1.5rem'
        }}>
          <CircularProgress progress={loadingProgress} size={80} strokeWidth={8} />
          <div style={{
            fontSize: '1.1rem',
            fontWeight: 600,
            color: 'var(--net-text)',
            textAlign: 'center',
            maxWidth: '300px'
          }}>
            {loadingProgress < 100 ? `Loading anime data... ${loadingProgress}%` : 'Almost ready!'}
          </div>
          <div style={{
            fontSize: '0.85rem',
            color: 'var(--net-text-muted)',
            textAlign: 'center',
            maxWidth: '400px',
            lineHeight: 1.5
          }}>
            Fetching from multiple sources to give you the best experience
          </div>
        </div>
      ) : (
        <>
          <HeroBanner anime={spotlight} animeList={sections[0]?.items?.slice(0, 5)} />

          <div style={{ marginTop: '-120px', position: 'relative', zIndex: 10 }}>
            {/* Continue Watching Section */}
            {watchHistory.length > 0 && (
              <ContinueWatching
                items={watchHistory.slice(0, 3).map(item => ({
                  id: item.id,
                  animeId: item.anime_id,
                  animeTitle: item.anime_title,
                  animePoster: item.anime_poster,
                  episodeNumber: item.episode_number,
                  episodeTitle: item.episode_title || `Episode ${item.episode_number}`,
                  progress: item.total_seconds > 0 ? (item.progress_seconds / item.total_seconds) * 100 : 0,
                  lastWatched: new Date(item.watched_at).getTime(),
                  totalEpisodes: 0
                }))}
                onRemove={removeFromWatchHistory}
              />
            )}
            {sections.length > 0 ? (
              <>
                {/* Render all regular rows */}
                {sections.map((section, idx) => (
                  <motion.div
                    key={section.title + idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: idx * 0.1 }}
                  >
                    <Row
                      title={section.title}
                      items={section.items}
                      isLargeRow={idx === 0}
                    />
                  </motion.div>
                ))}

                {/* Render Top Lists (Column style) at the bottom */}
                {topLists && (topLists.airing.length > 0 || topLists.popular.length > 0 || topLists.completed.length > 0) && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: sections.length * 0.1 }}
                  >
                    <TopLists
                      airing={topLists.airing}
                      popular={topLists.popular}
                      completed={topLists.completed}
                    />
                  </motion.div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--net-text-muted)' }}>
                No content available. Check that TatakaiAPI is running.
              </div>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
};

export default Home;
