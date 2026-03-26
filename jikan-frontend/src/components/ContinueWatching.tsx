import React from 'react';
import { motion } from 'framer-motion';
import { Play, Clock, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EpisodeProgress } from './ProgressBar';

interface ContinueWatchingItem {
    animeId: string;
    animeTitle: string;
    animePoster: string;
    episodeNumber: number;
    episodeTitle: string;
    progress: number;
    lastWatched: number;
    totalEpisodes?: number;
}

interface ContinueWatchingProps {
    items: ContinueWatchingItem[];
    onRemove?: (animeId: string) => void;
}

const ContinueWatching: React.FC<ContinueWatchingProps> = ({ items, onRemove }) => {
    if (items.length === 0) return null;

    const formatTimeAgo = (timestamp: number) => {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);

        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
        return `${Math.floor(seconds / 604800)}w ago`;
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{ marginBottom: '2.5rem', padding: '0 4%' }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Clock className="text-red" size={24} />
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Continue Watching</h2>
                </div>
                <span style={{ color: 'var(--net-text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>
                    {items.length} {items.length === 1 ? 'anime' : 'anime'}
                </span>
            </div>

            <div className="continue-watching-grid">
                {items.map((item, index) => (
                    <motion.div
                        key={item.animeId}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: index * 0.1 }}
                        className="continue-watching-card"
                    >
                        {/* Remove button */}
                        {onRemove && (
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    onRemove(item.animeId);
                                }}
                                className="remove-btn"
                                style={{
                                    position: 'absolute',
                                    top: '8px',
                                    right: '8px',
                                    zIndex: 10,
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '50%',
                                    backgroundColor: 'rgba(0,0,0,0.7)',
                                    border: 'none',
                                    color: 'white',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'opacity 0.2s'
                                }}
                            >
                                <X size={14} />
                            </button>
                        )}

                        <Link
                            to={`/watch/${item.animeId}/${item.episodeNumber}`}
                            style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', height: '100%' }}
                            className="card-link"
                        >
                            {/* Thumbnail */}
                            <div className="card-thumbnail" style={{ position: 'relative', overflow: 'hidden' }}>
                                <img
                                    src={item.animePoster}
                                    alt={item.animeTitle}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        transition: 'transform 0.3s ease'
                                    }}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = 'https://picsum.photos/400/225?grayscale';
                                    }}
                                />

                                {/* Play overlay */}
                                <div className="play-overlay" style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 50%)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'opacity 0.3s ease'
                                }}>
                                    <div style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '50%',
                                        backgroundColor: 'var(--net-red)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: '0 4px 15px rgba(229,9,20,0.5)'
                                    }}>
                                        <Play fill="white" size={18} style={{ marginLeft: '2px' }} />
                                    </div>
                                </div>

                                {/* Episode badge */}
                                <div style={{
                                    position: 'absolute',
                                    top: '6px',
                                    left: '6px',
                                    backgroundColor: 'rgba(0,0,0,0.8)',
                                    color: 'white',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    backdropFilter: 'blur(8px)'
                                }}>
                                    EP {item.episodeNumber}
                                </div>

                                {/* Time ago badge */}
                                <div className="time-badge" style={{
                                    position: 'absolute',
                                    bottom: '6px',
                                    right: '6px',
                                    backgroundColor: 'rgba(0,0,0,0.8)',
                                    color: 'var(--net-text-muted)',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '0.6rem',
                                    fontWeight: 600,
                                    backdropFilter: 'blur(8px)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                }}>
                                    <Clock size={10} />
                                    {formatTimeAgo(item.lastWatched)}
                                </div>
                            </div>

                            {/* Content */}
                            <div className="card-content" style={{ padding: '0.75rem' }}>
                                <h3 className="card-title" style={{
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    color: 'white',
                                    margin: '0 0 0.25rem 0',
                                    lineHeight: 1.3,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 1,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden'
                                }}>
                                    {item.animeTitle}
                                </h3>

                                <p className="card-subtitle" style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--net-text-muted)',
                                    margin: '0 0 0.5rem 0',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 1,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden'
                                }}>
                                    {item.episodeTitle}
                                </p>

                                {/* Progress bar */}
                                <EpisodeProgress
                                    current={item.episodeNumber}
                                    total={item.totalEpisodes || 12}
                                />
                            </div>
                        </Link>

                        <style>{`
              .continue-watching-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                gap: 1.25rem;
              }
              .continue-watching-card {
                position: relative;
                border-radius: 10px;
                overflow: hidden;
                background-color: var(--net-bg-lite);
                border: 1px solid rgba(255,255,255,0.05);
                transition: all 0.3s ease;
              }
              .card-thumbnail {
                aspect-ratio: 16/9;
              }
              .remove-btn, .play-overlay {
                opacity: 0;
              }
              .continue-watching-card:hover {
                transform: translateY(-4px);
                border-color: rgba(255,255,255,0.15);
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
              }
              .continue-watching-card:hover .remove-btn, 
              .continue-watching-card:hover .play-overlay {
                opacity: 1;
              }
              .continue-watching-card:hover img {
                transform: scale(1.05);
              }

              @media (max-width: 600px) {
                .continue-watching-grid {
                  grid-template-columns: 1fr;
                  gap: 0.75rem;
                }
                .card-link {
                  flex-direction: row !important;
                  align-items: center;
                  height: 90px !important;
                }
                .card-thumbnail {
                  width: 140px;
                  height: 100% !important;
                  aspect-ratio: auto !important;
                  flex-shrink: 0;
                }
                .card-content {
                  padding: 0.5rem 0.75rem !important;
                  flex-grow: 1;
                  display: flex;
                  flex-direction: column;
                  justify-content: center;
                }
                .card-title {
                  font-size: 0.8rem !important;
                  -webkit-line-clamp: 2 !important;
                }
                .card-subtitle {
                  font-size: 0.7rem !important;
                  margin-bottom: 0.25rem !important;
                }
                .remove-btn {
                  opacity: 1 !important;
                  top: 4px !important;
                  right: 4px !important;
                  width: 24px !important;
                  height: 24px !important;
                }
                .time-badge {
                  display: none !important;
                }
              }
            `}</style>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
};

export default ContinueWatching;
