import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './App';

// ============================================
// CONSTANTS
// ============================================

const CONTRACT_ADDRESS = '0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902';
const OPENSEA_API_KEY = 'f6662070d18f4d54936bdd66b94c3f11';
const TOTAL_NOIDS = 5555;

const ONE_OF_ONE_NOIDS = [
  3399, 4550, 46, 3421, 5521, 4200, 814, 1587, 4234, 1601,
  2480, 1046, 4999, 2290, 1401, 2148, 3921, 4900, 4699, 1187,
  2225, 948, 2214, 1448, 3321, 4221, 4111, 2281, 2231, 2014,
  2187, 4800, 4890, 1748, 4601, 1948, 4400, 4981, 412, 4651,
  3390, 601
];

const ROUND_NAMES = {
  8: { 1: 'Quarter Finals', 2: 'Semi-Finals', 3: 'Final' },
  16: { 1: 'Pool Play 16', 2: 'Quarter Finals', 3: 'Semi-Finals', 4: 'Final' },
  32: { 1: 'Pool Play 32', 2: 'Pool Play 16', 3: 'Quarter Finals', 4: 'Semi-Finals', 5: 'Final' }
};

const TOTAL_ROUNDS = { 8: 3, 16: 4, 32: 5 };

// ============================================
// GLOBAL IMAGE CACHE (persists across component remounts)
// ============================================

const globalImageCache = {};

const fetchAndCacheImage = async (noidId) => {
  if (globalImageCache[noidId]) return globalImageCache[noidId];
  try {
    const response = await fetch(
      `https://api.opensea.io/api/v2/chain/ethereum/contract/${CONTRACT_ADDRESS}/nfts/${noidId}`,
      { headers: { 'x-api-key': OPENSEA_API_KEY } }
    );
    if (!response.ok) throw new Error('Failed');
    const data = await response.json();
    const url = data.nft?.image_url || data.nft?.display_image_url;
    if (url) {
      globalImageCache[noidId] = url;
      return url;
    }
    throw new Error('No URL');
  } catch {
    const fallback = `https://gateway.pinata.cloud/ipfs/QmcXuDARMGMv59Q4ZZuoN5rjdM9GQrmp8NjLH5PDLixgAE/${noidId}`;
    globalImageCache[noidId] = fallback;
    return fallback;
  }
};

// ============================================
// HOOK: useImageLoader — batch loads images, ONE re-render per batch
// ============================================

const useImageLoader = (parentImageCache) => {
  const [images, setImages] = useState(() => ({ ...globalImageCache }));
  const pendingRef = useRef(new Set());

  // Sync parent cache (from App.jsx) into globalImageCache on mount
  useEffect(() => {
    if (parentImageCache && typeof parentImageCache === 'object') {
      Object.entries(parentImageCache).forEach(([id, url]) => {
        if (url && !globalImageCache[id]) {
          globalImageCache[id] = url;
        }
      });
      // Update local state with any new entries from parent
      setImages(prev => {
        const updated = { ...prev };
        let changed = false;
        Object.entries(parentImageCache).forEach(([id, url]) => {
          if (url && !prev[id]) {
            updated[id] = url;
            changed = true;
          }
        });
        return changed ? updated : prev;
      });
    }
  }, [parentImageCache]);

  const ensureImages = useCallback((noidIds) => {
    const toFetch = noidIds.filter(id => id && !globalImageCache[id] && !pendingRef.current.has(id));
    if (toFetch.length === 0) {
      // Sync local state with global cache
      setImages(prev => {
        const updated = { ...prev };
        let changed = false;
        noidIds.forEach(id => {
          if (id && globalImageCache[id] && !prev[id]) {
            updated[id] = globalImageCache[id];
            changed = true;
          }
        });
        return changed ? updated : prev;
      });
      return;
    }

    toFetch.forEach(id => pendingRef.current.add(id));

    Promise.all(toFetch.map(id => fetchAndCacheImage(id))).then(() => {
      toFetch.forEach(id => pendingRef.current.delete(id));
      setImages(prev => {
        const updated = { ...prev };
        toFetch.forEach(id => {
          if (globalImageCache[id]) updated[id] = globalImageCache[id];
        });
        return updated;
      });
    });
  }, []);

  const getImg = useCallback((noidId) => {
    return images[noidId] || globalImageCache[noidId] || null;
  }, [images]);

  const forceRefreshImages = useCallback((noidIds) => {
    const toFetch = noidIds.filter(id => id);
    if (toFetch.length === 0) return;

    // Clear from cache so they re-fetch
    toFetch.forEach(id => {
      delete globalImageCache[id];
      pendingRef.current.delete(id);
    });

    toFetch.forEach(id => pendingRef.current.add(id));

    Promise.all(toFetch.map(id => fetchAndCacheImage(id))).then(() => {
      toFetch.forEach(id => pendingRef.current.delete(id));
      setImages(prev => {
        const updated = { ...prev };
        toFetch.forEach(id => {
          if (globalImageCache[id]) updated[id] = globalImageCache[id];
        });
        return updated;
      });
    });
  }, []);

  return { images, ensureImages, getImg, forceRefreshImages };
};

// ============================================
// HELPER FUNCTIONS
// ============================================

const fetchOwnedNoids = async (walletAddress) => {
  const noids = [];
  let next = null;
  try {
    do {
      const url = next || `https://api.opensea.io/api/v2/chain/ethereum/account/${walletAddress}/nfts?collection=noidsofficial&limit=50`;
      const response = await fetch(url, {
        headers: { 'x-api-key': OPENSEA_API_KEY }
      });
      if (!response.ok) break;
      const data = await response.json();
      if (data.nfts) {
        data.nfts.forEach(nft => {
          const id = parseInt(nft.identifier);
          if (!isNaN(id)) noids.push(id);
        });
      }
      next = data.next ? `https://api.opensea.io/api/v2/chain/ethereum/account/${walletAddress}/nfts?collection=noidsofficial&limit=50&next=${data.next}` : null;
    } while (next);
  } catch (err) {
    console.error('Error fetching owned NOIDs:', err);
  }
  return noids.sort((a, b) => a - b);
};

const generateTournamentCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const getRoundName = (bracketSize, round) => {
  return ROUND_NAMES[bracketSize]?.[round] || `Round ${round}`;
};

// ============================================
// COUNTDOWN OVERLAY COMPONENT
// ============================================

const CountdownOverlay = ({ seconds, title, subtitle, onComplete }) => {
  const [timeLeft, setTimeLeft] = useState(seconds);

  useEffect(() => {
    setTimeLeft(seconds);
  }, [seconds]);

  useEffect(() => {
    if (timeLeft <= 0) {
      onComplete && onComplete();
      return;
    }
    const timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, onComplete]);

  return (
    <div className="countdown-overlay">
      <div className="countdown-content">
        <h2 className="countdown-title">{subtitle || 'STARTING IN'}</h2>
        <div className="countdown-number">{timeLeft}</div>
        <img src="/NOiDS_Battle_Splash.jpg" alt="NOiDS Battle" className="countdown-splash" />
        <h3 className="countdown-tournament-name">{title}</h3>
      </div>
    </div>
  );
};

// ============================================
// COIN FLIP OVERLAY
// ============================================

const CoinFlipOverlay = ({ winnerId, getImg }) => {
  const [phase, setPhase] = useState('flip'); // flip, reveal

  useEffect(() => {
    const timer = setTimeout(() => setPhase('reveal'), 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="coinflip-overlay">
      <div className="coinflip-content glass-panel">
        {phase === 'flip' ? (
          <>
            <div className="coinflip-coin">🪙</div>
            <h2 className="coinflip-title">Coin Flip!</h2>
            <p className="coinflip-subtitle">0-0 tie — deciding by coin flip...</p>
          </>
        ) : (
          <>
            <div className="coinflip-winner-img">
              {getImg(winnerId) && <img src={getImg(winnerId)} alt="" />}
            </div>
            <h2 className="coinflip-title" style={{ color: '#ffd700' }}>NOID #{winnerId} wins!</h2>
            <p className="coinflip-subtitle">Lucky flip 🍀</p>
          </>
        )}
      </div>
    </div>
  );
};

// ============================================
// SHARE TOURNAMENT RESULT
// ============================================

const generateTournamentShareCard = async (tournament, getImg) => {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 1200, 630);

  // Border
  ctx.strokeStyle = '#00ff41';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, 1180, 610);

  // Title
  ctx.fillStyle = '#00ff41';
  ctx.font = 'bold 36px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(tournament.tournament_name, 600, 60);

  ctx.font = '20px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('TOURNAMENT COMPLETE', 600, 90);

  const loadImg = (url) => new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

  const [winnerImg, runnerImg, thirdImg] = await Promise.all([
    loadImg(getImg(tournament.winner_noid_id)),
    loadImg(getImg(tournament.runner_up_noid_id)),
    loadImg(getImg(tournament.third_place_noid_id))
  ]);

  // 1st — center large
  if (winnerImg) {
    ctx.save();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(420, 120, 360, 360, 16);
    ctx.stroke();
    ctx.clip();
    ctx.drawImage(winnerImg, 420, 120, 360, 360);
    ctx.restore();
  }
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 48px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('🥇', 600, 520);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px monospace';
  ctx.fillText(`NOID #${tournament.winner_noid_id}`, 600, 555);
  ctx.fillStyle = '#ffd700';
  ctx.font = '18px monospace';
  ctx.fillText('CHAMPION', 600, 580);

  // 2nd — left
  if (runnerImg) {
    ctx.save();
    ctx.strokeStyle = '#c0c0c0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(60, 200, 220, 220, 12);
    ctx.stroke();
    ctx.clip();
    ctx.drawImage(runnerImg, 60, 200, 220, 220);
    ctx.restore();
  }
  ctx.fillStyle = '#c0c0c0';
  ctx.font = 'bold 32px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('🥈', 170, 460);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(`#${tournament.runner_up_noid_id}`, 170, 490);

  // 3rd — right
  if (thirdImg && tournament.third_place_noid_id) {
    ctx.save();
    ctx.strokeStyle = '#cd7f32';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(920, 200, 220, 220, 12);
    ctx.stroke();
    ctx.clip();
    ctx.drawImage(thirdImg, 920, 200, 220, 220);
    ctx.restore();
  }
  if (tournament.third_place_noid_id) {
    ctx.fillStyle = '#cd7f32';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('🥉', 1030, 460);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`#${tournament.third_place_noid_id}`, 1030, 490);
  }

  // Footer
  ctx.fillStyle = '#339933';
  ctx.font = '14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('NOiDS Battle — noids-battle.vercel.app', 600, 615);

  return canvas.toDataURL('image/png');
};

const ShareTournamentButton = ({ tournament, getImg }) => {
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    setSharing(true);
    try {
      const dataUrl = await generateTournamentShareCard(tournament, getImg);

      // Download the image
      const link = document.createElement('a');
      link.download = 'tournament-result.png';
      link.href = dataUrl;
      link.click();

      // Open Twitter intent with pre-written post
      const tweetText = `"${tournament.tournament_name}" Tournament Results!\n\n🥇 NOID #${tournament.winner_noid_id}\n🥈 NOID #${tournament.runner_up_noid_id}${tournament.third_place_noid_id ? `\n🥉 NOID #${tournament.third_place_noid_id}` : ''}\n\nBattle it out at noidsbattle.com\n\n#NOiDSBattle @thehumanoids`;

      setTimeout(() => {
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`, '_blank');
      }, 500);
    } catch (err) {
      console.error('Error sharing:', err);
    }
    setSharing(false);
  };

  return (
    <button className="start-btn share-tournament-btn" onClick={handleShare} disabled={sharing}>
      {sharing ? 'Generating...' : '📤 Share Results to X'}
    </button>
  );
};

// ============================================
// LIVE TOURNAMENTS HOOK + BANNER (exported for App.jsx)
// ============================================

export const useLiveTournaments = () => {
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    const checkLive = async () => {
      try {
        const { count } = await supabase
          .from('tournaments')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active');
        setLiveCount(count || 0);
      } catch {
        setLiveCount(0);
      }
    };
    checkLive();
    const interval = setInterval(checkLive, 10000);
    return () => clearInterval(interval);
  }, []);

  return liveCount;
};

export const LiveTournamentBanner = ({ onClick }) => {
  const liveCount = useLiveTournaments();
  if (liveCount === 0) return null;

  return (
    <button className="live-tournament-banner" onClick={onClick}>
      <span className="ltb-pulse"></span>
      <span className="ltb-text">🔴 {liveCount} Live Tournament{liveCount > 1 ? 's' : ''}</span>
      <span className="ltb-arrow">→</span>
    </button>
  );
};

// ============================================
// TOURNAMENT HUB
// ============================================

const TournamentHub = ({ walletAddress, onClose, onViewTournament, onCreateTournament, parentImageCache, showWalletModal }) => {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open');
  const { ensureImages, getImg, forceRefreshImages } = useImageLoader(parentImageCache);

  useEffect(() => {
    loadTournaments();
  }, [filter]);

  const loadTournaments = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('tournaments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const tourneysWithCounts = await Promise.all((data || []).map(async (t) => {
        const { count } = await supabase
          .from('tournament_entries')
          .select('*', { count: 'exact', head: true })
          .eq('tournament_id', t.id);
        return { ...t, entry_count: count || 0 };
      }));

      // Sort: open first, then active, then completed, then by date
      tourneysWithCounts.sort((a, b) => {
        const statusOrder = { open: 0, active: 1, completed: 2, cancelled: 3 };
        const aOrder = statusOrder[a.status] ?? 9;
        const bOrder = statusOrder[b.status] ?? 9;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return new Date(b.created_at) - new Date(a.created_at);
      });

      setTournaments(tourneysWithCounts);

      // Preload winner images
      const winnerIds = tourneysWithCounts.map(t => t.winner_noid_id).filter(Boolean);
      if (winnerIds.length > 0) ensureImages(winnerIds);
    } catch (err) {
      console.error('Error loading tournaments:', err);
    }
    setLoading(false);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'open': return { text: 'Open', color: '#00ff41' };
      case 'active': return { text: 'LIVE', color: '#ff4444' };
      case 'completed': return { text: 'Finished', color: '#888888' };
      case 'cancelled': return { text: 'Cancelled', color: '#666666' };
      default: return { text: status, color: '#888888' };
    }
  };

  return (
    <div className="tournament-container">
      <div className="tournament-header glass-panel">
        <button className="back-btn" onClick={onClose}>
          <span className="back-arrow">←</span>
          Back to Menu
        </button>
        <h2 className="tournament-title">🏟️ Tournaments</h2>
        <button className="create-tournament-btn" onClick={() => walletAddress ? onCreateTournament() : showWalletModal()}>
          + Create
        </button>
      </div>

      <div className="tournament-filters glass-panel">
        {['open', 'active', 'completed', 'all'].map(f => (
          <button
            key={f}
            className={`tab-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? '📋 All' : f === 'open' ? '🟢 Open' : f === 'active' ? '🔴 Live' : '✅ Finished'}
          </button>
        ))}
      </div>

      <div className="tournament-list">
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading tournaments...</p>
          </div>
        ) : tournaments.length === 0 ? (
          <div className="empty-state glass-panel">
            <p>No tournaments found. Create one!</p>
          </div>
        ) : (
          tournaments.map(t => {
            const badge = getStatusBadge(t.status);
            return (
              <div
                key={t.id}
                className="tournament-list-item glass-panel"
                onClick={() => onViewTournament(t.id)}
              >
                {t.winner_noid_id && getImg(t.winner_noid_id) && (
                  <img src={getImg(t.winner_noid_id)} alt={`#${t.winner_noid_id}`} className="tl-winner-img" />
                )}
                <div className="tl-main">
                  <div className="tl-name">{t.tournament_name}</div>
                  <div className="tl-meta">
                    <span className="tl-creator">
                      by {t.creator_name || `${t.creator_wallet.slice(0, 6)}...${t.creator_wallet.slice(-4)}`}
                    </span>
                    <span className="tl-divider">•</span>
                    <span>{t.bracket_size}-bracket</span>
                    <span className="tl-divider">•</span>
                    <span>{t.round_timer}s rounds</span>
                    {t.is_gated && <span className="tl-gated">🔒</span>}
                  </div>
                </div>
                <div className="tl-right">
                  <div className="tl-entries">{t.entry_count}/{t.bracket_size}</div>
                  <div className="tl-status-badge" style={{ color: badge.color, borderColor: badge.color }}>
                    {badge.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// ============================================
// CREATE TOURNAMENT
// ============================================

const CreateTournament = ({ walletAddress, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [creatorName, setCreatorName] = useState('');
  const [bracketSize, setBracketSize] = useState(8);
  const [maxEntriesPerPlayer, setMaxEntriesPerPlayer] = useState(1);
  const [unlimitedEntries, setUnlimitedEntries] = useState(false);
  const [isGated, setIsGated] = useState(false);
  const [gateCode, setGateCode] = useState('');
  const [roundTimer, setRoundTimer] = useState(15);
  const [includeOneOfOne, setIncludeOneOfOne] = useState(true);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return alert('Enter a tournament name');
    if (isGated && !gateCode.trim()) return alert('Enter an entry code for gated tournament');

    setCreating(true);
    try {
      const { data, error } = await supabase.from('tournaments').insert([{
        creator_wallet: walletAddress.toLowerCase(),
        creator_name: creatorName.trim() || null,
        tournament_name: name.trim(),
        bracket_size: bracketSize,
        max_entries_per_player: unlimitedEntries ? null : maxEntriesPerPlayer,
        is_gated: isGated,
        gate_code: isGated ? gateCode.trim() : null,
        round_timer: roundTimer,
        include_oneofone: includeOneOfOne,
        status: 'open'
      }]).select().single();

      if (error) throw error;
      onCreated(data.id);
    } catch (err) {
      console.error('Error creating tournament:', err);
      alert('Failed to create tournament');
    }
    setCreating(false);
  };

  return (
    <div className="tournament-container">
      <div className="tournament-header glass-panel">
        <button className="back-btn" onClick={onClose}>
          <span className="back-arrow">←</span>
          Back
        </button>
        <h2 className="tournament-title">Create Tournament</h2>
        <div className="spacer"></div>
      </div>

      <div className="create-form glass-panel">
        <div className="form-group">
          <label>Tournament Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. NOiDS Royal Rumble" className="form-input" maxLength={50} />
        </div>

        <div className="form-group">
          <label>Your Display Name (optional)</label>
          <input type="text" value={creatorName} onChange={(e) => setCreatorName(e.target.value)} placeholder={`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`} className="form-input" maxLength={30} />
        </div>

        <div className="form-group">
          <label>Bracket Size</label>
          <div className="option-row">
            {[8, 16, 32].map(size => (
              <button key={size} className={`option-btn ${bracketSize === size ? 'active' : ''}`} onClick={() => setBracketSize(size)}>{size}</button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Max Entries Per Player</label>
          <div className="option-row">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} className={`option-btn ${!unlimitedEntries && maxEntriesPerPlayer === n ? 'active' : ''}`} onClick={() => { setMaxEntriesPerPlayer(n); setUnlimitedEntries(false); }}>{n}</button>
            ))}
            <button className={`option-btn ${unlimitedEntries ? 'active' : ''}`} onClick={() => setUnlimitedEntries(true)}>∞</button>
          </div>
        </div>

        <div className="form-group">
          <label>Round Timer</label>
          <div className="option-row">
            {[15, 30, 60].map(t => (
              <button key={t} className={`option-btn ${roundTimer === t ? 'active' : ''}`} onClick={() => setRoundTimer(t)}>{t}s</button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Access</label>
          <div className="option-row">
            <button className={`option-btn ${!isGated ? 'active' : ''}`} onClick={() => setIsGated(false)}>🌐 Open</button>
            <button className={`option-btn ${isGated ? 'active' : ''}`} onClick={() => { setIsGated(true); if (!gateCode) setGateCode(generateTournamentCode()); }}>🔒 Code-Gated</button>
          </div>
          {isGated && (
            <div className="gate-code-display">
              <span>Entry Code: </span>
              <strong>{gateCode}</strong>
              <button className="copy-btn" onClick={() => navigator.clipboard.writeText(gateCode)}>📋</button>
            </div>
          )}
        </div>

        <div className="form-group">
          <label>Include 1:1s?</label>
          <div className="option-row">
            <button className={`option-btn ${includeOneOfOne ? 'active' : ''}`} onClick={() => setIncludeOneOfOne(true)}>✅ Yes</button>
            <button className={`option-btn ${!includeOneOfOne ? 'active' : ''}`} onClick={() => setIncludeOneOfOne(false)}>❌ No 1:1s</button>
          </div>
        </div>

        <button className="start-btn" onClick={handleCreate} disabled={creating || !name.trim()}>
          {creating ? 'Creating...' : 'Create Tournament'}
        </button>
      </div>
    </div>
  );
};

// ============================================
// TOURNAMENT LOBBY
// ============================================

const TournamentLobby = ({ tournamentId, walletAddress, onClose, onStart, parentImageCache }) => {
  const [tournament, setTournament] = useState(null);
  const [entries, setEntries] = useState([]);
  const [ownedNoids, setOwnedNoids] = useState([]);
  const [loadingOwned, setLoadingOwned] = useState(false);
  const [showEntryPicker, setShowEntryPicker] = useState(false);
  const [gateInput, setGateInput] = useState('');
  const [gateUnlocked, setGateUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const { ensureImages, getImg, forceRefreshImages } = useImageLoader(parentImageCache);

  useEffect(() => {
    loadLobby();
    const interval = setInterval(loadLobby, 5000);
    return () => clearInterval(interval);
  }, [tournamentId]);

  const loadLobby = async () => {
    try {
      const { data: t } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', tournamentId)
        .single();

      if (t) {
        setTournament(t);
        if (t.status === 'active' || t.status === 'completed') {
          onStart(tournamentId);
          return;
        }
      }

      const { data: e } = await supabase
        .from('tournament_entries')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('entered_at', { ascending: true });

      setEntries(e || []);

      // Batch load all entry images
      if (e && e.length > 0) {
        ensureImages(e.map(entry => entry.noid_id));
      }
    } catch (err) {
      console.error('Error loading lobby:', err);
    }
    setLoading(false);
  };

  const loadOwnedNoids = async () => {
    setLoadingOwned(true);
    const noids = await fetchOwnedNoids(walletAddress);
    setOwnedNoids(noids);
    setShowEntryPicker(true);
    setLoadingOwned(false);
    ensureImages(noids);
  };

  const handleEnterNoid = async (noidId) => {
    if (!tournament) return;
    const alreadyEntered = entries.filter(e => e.entered_by_wallet === walletAddress.toLowerCase());
    const maxEntries = tournament.max_entries_per_player;
    if (maxEntries && alreadyEntered.length >= maxEntries) { alert(`Max ${maxEntries} entries per player`); return; }
    if (entries.some(e => e.noid_id === noidId)) { alert(`NOID #${noidId} is already entered`); return; }
    if (entries.length >= tournament.bracket_size) { alert('Tournament is full'); return; }

    try {
      const { error } = await supabase.from('tournament_entries').insert([{
        tournament_id: tournamentId,
        noid_id: noidId,
        entered_by_wallet: walletAddress.toLowerCase()
      }]);
      if (error) throw error;
      await loadLobby();

      const newEntryCount = entries.length + 1;
      const newPlayerEntries = alreadyEntered.length + 1;
      if (newEntryCount >= tournament.bracket_size || (maxEntries && newPlayerEntries >= maxEntries)) {
        setShowEntryPicker(false);
      }
    } catch (err) {
      console.error('Error entering NOID:', err);
      alert('Failed to enter NOID');
    }
  };

  const handleRemoveEntry = async (entryId) => {
    try {
      await supabase.from('tournament_entries').delete().eq('id', entryId);
      await loadLobby();
    } catch (err) {
      console.error('Error removing entry:', err);
    }
  };

  const handleDeleteTournament = async () => {
    if (!window.confirm('Delete this tournament? This cannot be undone.')) return;
    try {
      await supabase.from('tournament_entries').delete().eq('tournament_id', tournamentId);
      await supabase.from('tournaments').delete().eq('id', tournamentId);
      onClose();
    } catch (err) {
      console.error('Error deleting tournament:', err);
    }
  };

  const handleFillRemaining = async () => {
    if (!tournament) return;
    const remaining = tournament.bracket_size - entries.length;
    if (remaining <= 0) return;
    if (!window.confirm(`Fill ${remaining} empty slots with random NOiDS?`)) return;

    try {
      const existingIds = entries.map(e => e.noid_id);
      const randomEntries = [];
      while (randomEntries.length < remaining) {
        const randId = Math.floor(Math.random() * TOTAL_NOIDS) + 1;
        if (!existingIds.includes(randId) && !randomEntries.some(r => r.noid_id === randId)) {
          randomEntries.push({
            tournament_id: tournamentId,
            noid_id: randId,
            entered_by_wallet: walletAddress.toLowerCase(),
            is_random_fill: true
          });
        }
      }
      if (randomEntries.length > 0) {
        const { error } = await supabase.from('tournament_entries').insert(randomEntries);
        if (error) throw error;
      }
      await loadLobby();
    } catch (err) {
      console.error('Error filling tournament:', err);
      alert('Failed to fill slots');
    }
  };

  const handleStartTournament = async () => {
    try {
      const { data: allEntries } = await supabase
        .from('tournament_entries')
        .select('*')
        .eq('tournament_id', tournamentId);

      if (!allEntries || allEntries.length !== tournament.bracket_size) {
        alert('Not enough entries to start');
        return;
      }

      // Shuffle
      const shuffled = [...allEntries].sort(() => Math.random() - 0.5);

      // Assign seeds
      await Promise.all(shuffled.map((entry, idx) =>
        supabase.from('tournament_entries').update({ seed_position: idx }).eq('id', entry.id)
      ));

      // Generate round 1 matchups
      const totalRounds = TOTAL_ROUNDS[tournament.bracket_size];
      const round1Matchups = [];
      for (let i = 0; i < shuffled.length; i += 2) {
        round1Matchups.push({
          tournament_id: tournamentId,
          round: 1,
          round_name: getRoundName(tournament.bracket_size, 1),
          matchup_index: i / 2,
          noid1_id: shuffled[i].noid_id,
          noid2_id: shuffled[i + 1].noid_id,
          status: 'pending'
        });
      }

      // Later rounds (empty)
      const laterMatchups = [];
      for (let round = 2; round <= totalRounds; round++) {
        const matchupsInRound = tournament.bracket_size / Math.pow(2, round);
        for (let i = 0; i < matchupsInRound; i++) {
          laterMatchups.push({
            tournament_id: tournamentId,
            round: round,
            round_name: getRoundName(tournament.bracket_size, round),
            matchup_index: i,
            noid1_id: null,
            noid2_id: null,
            status: 'pending'
          });
        }
      }

      const { error: matchupError } = await supabase
        .from('tournament_matchups')
        .insert([...round1Matchups, ...laterMatchups]);
      if (matchupError) throw matchupError;

      // Set 15s countdown before first matchup activates
      const countdownEnd = new Date(Date.now() + 15000).toISOString();
      await supabase.from('tournaments')
        .update({
          status: 'active',
          started_at: new Date().toISOString(),
          current_round: 1,
          current_matchup_index: 0,
          countdown_until: countdownEnd
        })
        .eq('id', tournamentId);

      onStart(tournamentId);
    } catch (err) {
      console.error('Error starting tournament:', err);
      alert('Failed to start tournament');
    }
  };

  const isCreator = tournament?.creator_wallet === walletAddress?.toLowerCase();
  const canEnter = tournament?.status === 'open' && entries.length < (tournament?.bracket_size || 0);
  const isFull = entries.length >= (tournament?.bracket_size || 0);
  const needsGateCode = tournament?.is_gated && !gateUnlocked && !isCreator;
  const myEntries = entries.filter(e => e.entered_by_wallet === walletAddress?.toLowerCase());

  if (loading) {
    return (
      <div className="tournament-container">
        <div className="loading-state"><div className="loading-spinner"></div><p>Loading tournament...</p></div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="tournament-container">
        <div className="empty-state glass-panel"><p>Tournament not found.</p><button className="back-btn" onClick={onClose}>Back</button></div>
      </div>
    );
  }

  return (
    <div className="tournament-container">
      <div className="tournament-header glass-panel">
        <button className="back-btn" onClick={onClose}><span className="back-arrow">←</span>Back</button>
        <h2 className="tournament-title">{tournament.tournament_name}</h2>
        <div className="spacer"></div>
      </div>

      <div className="lobby-info glass-panel">
        <div className="lobby-info-row"><span>Created by</span><strong>{tournament.creator_name || `${tournament.creator_wallet.slice(0, 6)}...${tournament.creator_wallet.slice(-4)}`}</strong></div>
        <div className="lobby-info-row"><span>Bracket</span><strong>{tournament.bracket_size} NOiDS</strong></div>
        <div className="lobby-info-row"><span>Round Timer</span><strong>{tournament.round_timer}s</strong></div>
        <div className="lobby-info-row"><span>Max Per Player</span><strong>{tournament.max_entries_per_player || '∞'}</strong></div>
        <div className="lobby-info-row"><span>Access</span><strong>{tournament.is_gated ? '🔒 Code-Gated' : '🌐 Open'}</strong></div>
        <div className="lobby-info-row"><span>1:1 NOiDS</span><strong>{tournament.include_oneofone === false ? '❌ Excluded' : '✅ Allowed'}</strong></div>
        <div className="lobby-info-row"><span>Entries</span><strong className="entries-count">{entries.length} / {tournament.bracket_size}</strong></div>
      </div>

      {needsGateCode && (
        <div className="gate-input-section glass-panel">
          <p>This tournament requires an entry code:</p>
          <div className="gate-input-row">
            <input type="text" value={gateInput} onChange={(e) => setGateInput(e.target.value)} placeholder="Enter code" className="form-input" maxLength={6} />
            <button className="option-btn active" onClick={() => { if (gateInput === tournament.gate_code) { setGateUnlocked(true); } else { alert('Incorrect code'); } }}>Unlock</button>
          </div>
        </div>
      )}

      <div className="lobby-entries glass-panel">
        <div className="section-header-row">
          <h3 className="section-title">Bracket Slots</h3>
          {entries.length > 0 && (
            <button className="refresh-images-btn" onClick={() => forceRefreshImages(entries.map(e => e.noid_id))}>
              🔄 Refresh Images
            </button>
          )}
        </div>
        <div className="entry-grid">
          {Array.from({ length: tournament.bracket_size }).map((_, idx) => {
            const entry = entries[idx];
            const isMyEntry = entry && entry.entered_by_wallet === walletAddress?.toLowerCase();
            return (
              <div key={idx} className={`entry-slot ${entry ? 'filled' : 'empty'}`}>
                {entry ? (
                  <>
                    <img src={getImg(entry.noid_id) || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect fill="%23111" width="60" height="60"/></svg>'} alt={`#${entry.noid_id}`} className="entry-slot-img" />
                    <span className="entry-slot-id">#{entry.noid_id}</span>
                    {entry.is_random_fill && <span className="entry-slot-random">RNG</span>}
                    {isMyEntry && tournament.status === 'open' && (
                      <button className="entry-remove-btn" onClick={() => handleRemoveEntry(entry.id)}>✕</button>
                    )}
                  </>
                ) : (
                  <span className="entry-slot-empty">—</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="lobby-actions">
        {canEnter && !needsGateCode && walletAddress && (
          <button className="start-btn" onClick={loadOwnedNoids} disabled={loadingOwned}>
            {loadingOwned ? 'Loading NOiDS...' : '+ Enter Your NOiDS'}
          </button>
        )}
        {isCreator && tournament.status === 'open' && isFull && (
          <button className="start-btn fill-start-btn" onClick={handleStartTournament}>🚀 Start Tournament</button>
        )}
        {isCreator && tournament.status === 'open' && !isFull && (
          <button className="start-btn fill-start-btn" onClick={handleFillRemaining}>🎲 Fill Remaining ({tournament.bracket_size - entries.length} random)</button>
        )}
        {isCreator && tournament.status === 'open' && (
          <button className="delete-tournament-btn" onClick={handleDeleteTournament}>🗑️ Delete Tournament</button>
        )}
      </div>

      {showEntryPicker && (
        <div className="modal-overlay" onClick={() => setShowEntryPicker(false)}>
          <div className="noid-picker-modal glass-panel" onClick={e => e.stopPropagation()}>
            <div className="picker-header">
              <h3>Select NOiDS to Enter</h3>
              <button className="refresh-images-btn" onClick={() => forceRefreshImages(ownedNoids)}>🔄</button>
              <button className="modal-close" onClick={() => setShowEntryPicker(false)}>×</button>
            </div>
            <div className="picker-info">
              {tournament.max_entries_per_player ? `You can enter ${tournament.max_entries_per_player - myEntries.length} more` : 'Unlimited entries'}
            </div>
            <div className="picker-grid">
              {ownedNoids.length === 0 ? (
                <p className="picker-empty">No NOiDS found in your wallet</p>
              ) : (
                ownedNoids
                  .filter(noidId => tournament.include_oneofone !== false || !ONE_OF_ONE_NOIDS.includes(noidId))
                  .map(noidId => {
                    const alreadyIn = entries.some(e => e.noid_id === noidId);
                    const atLimit = tournament.max_entries_per_player && myEntries.length >= tournament.max_entries_per_player;
                    const imgUrl = getImg(noidId);
                    return (
                      <button key={noidId} className={`picker-item has-image ${alreadyIn ? 'entered' : ''}`} onClick={() => !alreadyIn && !atLimit && handleEnterNoid(noidId)} disabled={alreadyIn || atLimit}>
                        {imgUrl && <img src={imgUrl} alt={`#${noidId}`} className="picker-item-img" />}
                        <span>#{noidId}</span>
                        {alreadyIn && <span className="picker-check">✔</span>}
                      </button>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// LIVE TOURNAMENT
// ============================================

const LiveTournament = ({ tournamentId, walletAddress, onClose, onViewNoid, parentImageCache, showWalletModal }) => {
  const [tournament, setTournament] = useState(null);
  const [matchups, setMatchups] = useState([]);
  const [activeMatchup, setActiveMatchup] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [hasVoted, setHasVoted] = useState(false);
  const [votedFor, setVotedFor] = useState(null);
  const [isVoting, setIsVoting] = useState(false);
  const [showBracket, setShowBracket] = useState(false);
  const [roundTransition, setRoundTransition] = useState(null);
  const [tournamentComplete, setTournamentComplete] = useState(false);
  const [startingCountdown, setStartingCountdown] = useState(null);
  const [coinFlipData, setCoinFlipData] = useState(null); // { winnerId, loserId }
  const timerRef = useRef(null);
  const pollRef = useRef(null);
  const activeMatchupIdRef = useRef(null);
  const { ensureImages, getImg, forceRefreshImages } = useImageLoader(parentImageCache);

  useEffect(() => {
    loadTournamentState();
    pollRef.current = setInterval(loadTournamentState, 2000);
    return () => {
      clearInterval(pollRef.current);
      clearInterval(timerRef.current);
    };
  }, [tournamentId]);

  useEffect(() => {
    if (activeMatchup && activeMatchup.started_at && tournament) {
      startTimer();
    }
    return () => clearInterval(timerRef.current);
  }, [activeMatchup?.id, tournament?.round_timer]);

  const startTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (!activeMatchup?.started_at || !tournament?.round_timer) return;
      const elapsed = (Date.now() - new Date(activeMatchup.started_at).getTime()) / 1000;
      const remaining = Math.max(0, tournament.round_timer - elapsed);
      setTimeLeft(Math.ceil(remaining));
      if (remaining <= 0) clearInterval(timerRef.current);
    }, 100);
  };

  const loadTournamentState = async () => {
    try {
      const { data: t } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', tournamentId)
        .single();

      if (!t) return;
      setTournament(t);

      // Starting countdown check
      if (t.countdown_until) {
        const remaining = Math.max(0, Math.ceil((new Date(t.countdown_until).getTime() - Date.now()) / 1000));
        if (remaining > 0) {
          // Only show CountdownOverlay for the very first round start
          const isFirstStart = (t.current_round || 1) === 1 && (t.current_matchup_index || 0) === 0 && !roundTransition;
          if (isFirstStart) {
            setStartingCountdown(remaining);
          }
          return;
        } else {
          setStartingCountdown(null);
          // Creator activates first matchup after countdown
          if (t.creator_wallet === walletAddress?.toLowerCase()) {
            const { data: firstMatchup } = await supabase
              .from('tournament_matchups')
              .select('id, status')
              .eq('tournament_id', tournamentId)
              .eq('round', t.current_round || 1)
              .eq('matchup_index', t.current_matchup_index || 0)
              .single();

            if (firstMatchup && firstMatchup.status === 'pending') {
              const now = new Date().toISOString();
              await supabase.from('tournament_matchups')
                .update({ status: 'active', started_at: now })
                .eq('id', firstMatchup.id);
              await supabase.from('tournaments')
                .update({ countdown_until: null, matchup_started_at: now })
                .eq('id', tournamentId);
            }
          }
        }
      }

      if (t.status === 'completed') {
        setTournamentComplete(true);
        clearInterval(pollRef.current);
      }

      const { data: allMatchups } = await supabase
        .from('tournament_matchups')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('round', { ascending: true })
        .order('matchup_index', { ascending: true });

      setMatchups(allMatchups || []);

      // Preload images
      const noidIds = new Set();
      (allMatchups || []).forEach(m => {
        if (m.noid1_id) noidIds.add(m.noid1_id);
        if (m.noid2_id) noidIds.add(m.noid2_id);
      });
      if (noidIds.size > 0) ensureImages([...noidIds]);

      // Find active matchup
      const active = (allMatchups || []).find(m => m.status === 'active');
      if (active && active.id !== activeMatchupIdRef.current) {
        activeMatchupIdRef.current = active.id;
        setActiveMatchup(active);
        setHasVoted(false);
        setVotedFor(null);
        setRoundTransition(null);

        if (walletAddress || localStorage.getItem('anon_voter_id')) {
          const voterId = walletAddress?.toLowerCase() || localStorage.getItem('anon_voter_id');
          const { data: existingVote } = await supabase
            .from('tournament_votes')
            .select('voted_for_noid_id')
            .eq('matchup_id', active.id)
            .eq('voter_wallet', voterId)
            .single();
          if (existingVote) {
            setHasVoted(true);
            setVotedFor(existingVote.voted_for_noid_id);
          }
        }
      } else if (active) {
        setActiveMatchup(active);
      }

      // Timer expired — creator advances
      if (active && t.creator_wallet === walletAddress?.toLowerCase()) {
        const elapsed = (Date.now() - new Date(active.started_at).getTime()) / 1000;
        if (elapsed >= t.round_timer) {
          await advanceMatchup(active, allMatchups, t);
        }
      }
    } catch (err) {
      console.error('Error loading tournament state:', err);
    }
  };

  const handleVote = async (noidId) => {
    if (hasVoted || isVoting || !activeMatchup) return;
    const voterId = walletAddress?.toLowerCase() || (() => {
      let id = localStorage.getItem('anon_voter_id');
      if (!id) { id = 'anon-' + Math.random().toString(36).substr(2, 12); localStorage.setItem('anon_voter_id', id); }
      return id;
    })();
    setIsVoting(true);
    setVotedFor(noidId);

    try {
      const { error: voteError } = await supabase.from('tournament_votes').insert([{
        matchup_id: activeMatchup.id,
        tournament_id: tournamentId,
        voter_wallet: voterId,
        voted_for_noid_id: noidId
      }]);

      if (voteError) {
        if (voteError.code === '23505') { setHasVoted(true); setIsVoting(false); return; }
        throw voteError;
      }

      // ATOMIC increment — fixes race condition
      const field = noidId === activeMatchup.noid1_id ? 'noid1_votes' : 'noid2_votes';
      const firstVoteField = noidId === activeMatchup.noid1_id ? 'noid1_first_vote_at' : 'noid2_first_vote_at';

      await supabase.rpc('increment_matchup_votes', {
        p_matchup_id: activeMatchup.id,
        p_field: field,
        p_first_vote_field: firstVoteField
      });

      setHasVoted(true);
    } catch (err) {
      console.error('Error voting:', err);
      setVotedFor(null);
    }
    setIsVoting(false);
  };

  const advanceMatchup = async (completedMatchup, allMatchups, t) => {
    try {
      const { data: freshMatchup } = await supabase
        .from('tournament_matchups')
        .select('*')
        .eq('id', completedMatchup.id)
        .single();

      if (!freshMatchup || freshMatchup.status === 'completed') return;

      let winnerId, isCoinFlip = false;

      if (freshMatchup.noid1_votes > freshMatchup.noid2_votes) {
        winnerId = freshMatchup.noid1_id;
      } else if (freshMatchup.noid2_votes > freshMatchup.noid1_votes) {
        winnerId = freshMatchup.noid2_id;
      } else if (freshMatchup.noid1_votes === 0 && freshMatchup.noid2_votes === 0) {
        winnerId = Math.random() < 0.5 ? freshMatchup.noid1_id : freshMatchup.noid2_id;
        isCoinFlip = true;
      } else {
        if (freshMatchup.noid1_first_vote_at && freshMatchup.noid2_first_vote_at) {
          winnerId = new Date(freshMatchup.noid1_first_vote_at) <= new Date(freshMatchup.noid2_first_vote_at) ? freshMatchup.noid1_id : freshMatchup.noid2_id;
        } else if (freshMatchup.noid1_first_vote_at) {
          winnerId = freshMatchup.noid1_id;
        } else {
          winnerId = freshMatchup.noid2_id;
        }
      }

      const loserId = winnerId === freshMatchup.noid1_id ? freshMatchup.noid2_id : freshMatchup.noid1_id;

      await supabase.from('tournament_matchups')
        .update({ winner_id: winnerId, is_coin_flip: isCoinFlip, status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', freshMatchup.id);

      if (!isCoinFlip) {
        recordTournamentBattle(freshMatchup.noid1_id, freshMatchup.noid2_id, winnerId, walletAddress || 'system').catch(console.error);
      } else {
        setCoinFlipData({ winnerId, loserId });
        setTimeout(() => setCoinFlipData(null), 3000);
      }

      await feedWinnerToNextRound(winnerId, freshMatchup, allMatchups, t);

      const currentRoundMatchups = allMatchups
        .filter(m => m.round === freshMatchup.round)
        .sort((a, b) => a.matchup_index - b.matchup_index);

      const nextInRound = currentRoundMatchups.find(m => m.matchup_index > freshMatchup.matchup_index && m.status === 'pending');

      if (nextInRound) {
        const now = new Date().toISOString();
        await supabase.from('tournament_matchups').update({ status: 'active', started_at: now }).eq('id', nextInRound.id);
        await supabase.from('tournaments').update({ current_matchup_index: nextInRound.matchup_index, matchup_started_at: now }).eq('id', tournamentId);
      } else {
        const totalRounds = TOTAL_ROUNDS[t.bracket_size];
        if (freshMatchup.round >= totalRounds) {
          await completeTournament(t, winnerId, allMatchups, freshMatchup, loserId);
        } else {
          // Round transition: 20s countdown
          const nextRound = freshMatchup.round + 1;
          const nextRoundName = getRoundName(t.bracket_size, nextRound);
          setRoundTransition(nextRoundName);

          const countdownEnd = new Date(Date.now() + 20000).toISOString();
          await supabase.from('tournaments')
            .update({ current_round: nextRound, current_matchup_index: 0, countdown_until: countdownEnd })
            .eq('id', tournamentId);
        }
      }
    } catch (err) {
      console.error('Error advancing matchup:', err);
    }
  };

  const feedWinnerToNextRound = async (winnerId, completedMatchup, allMatchups, t) => {
    const totalRounds = TOTAL_ROUNDS[t.bracket_size];
    if (completedMatchup.round >= totalRounds) return;
    const nextRound = completedMatchup.round + 1;
    const nextMatchupIndex = Math.floor(completedMatchup.matchup_index / 2);
    const slot = completedMatchup.matchup_index % 2 === 0 ? 'noid1_id' : 'noid2_id';
    const nextMatchup = allMatchups.find(m => m.round === nextRound && m.matchup_index === nextMatchupIndex);
    if (nextMatchup) {
      await supabase.from('tournament_matchups').update({ [slot]: winnerId }).eq('id', nextMatchup.id);
    }
  };

  const completeTournament = async (t, winnerId, allMatchups, finalMatchup, loserId) => {
    try {
      const totalRounds = TOTAL_ROUNDS[t.bracket_size];
      const semiFinalRound = totalRounds - 1;
      const semiFinals = allMatchups.filter(m => m.round === semiFinalRound && m.status === 'completed');
      let thirdPlaceId = null;
      for (const sf of semiFinals) {
        const sfLoser = sf.winner_id === sf.noid1_id ? sf.noid2_id : sf.noid1_id;
        if (sfLoser !== loserId) { thirdPlaceId = sfLoser; break; }
      }

      await supabase.from('tournaments')
        .update({ status: 'completed', completed_at: new Date().toISOString(), winner_noid_id: winnerId, runner_up_noid_id: loserId, third_place_noid_id: thirdPlaceId, countdown_until: null })
        .eq('id', tournamentId);

      const results = [
        { tournament_id: tournamentId, noid_id: winnerId, placement: 1, rounds_survived: totalRounds },
        { tournament_id: tournamentId, noid_id: loserId, placement: 2, rounds_survived: totalRounds }
      ];
      if (thirdPlaceId) results.push({ tournament_id: tournamentId, noid_id: thirdPlaceId, placement: 3, rounds_survived: totalRounds - 1 });
      await supabase.from('tournament_results').insert(results);

      setTournamentComplete(true);
    } catch (err) {
      console.error('Error completing tournament:', err);
    }
  };

  const recordTournamentBattle = async (noid1Id, noid2Id, winnerId, userId) => {
    try {
      const loserId = winnerId === noid1Id ? noid2Id : noid1Id;
      const now = new Date().toISOString();

      await supabase.from('battle_history').insert([{
        noid1_id: noid1Id, noid2_id: noid2Id, winner_id: winnerId, loser_id: loserId,
        game_mode: 'tournament', user_id: userId || 'tournament', is_daily_battle: false
      }]);

      for (const [noidId, won] of [[noid1Id, winnerId === noid1Id], [noid2Id, winnerId === noid2Id]]) {
        const { data: current } = await supabase.from('noid_stats').select('*').eq('noid_id', noidId).single();
        if (!current) {
          await supabase.from('noid_stats').insert([{
            noid_id: noidId, total_battles: 1, total_wins: won ? 1 : 0, total_losses: won ? 0 : 1,
            current_streak: won ? 1 : -1, best_streak: won ? 1 : 0,
            first_battle_date: now, last_battle_date: now,
            last_win_date: won ? now : null, last_loss_date: won ? null : now, underdog_wins: 0
          }]);
        } else {
          const newStreak = won ? Math.max(current.current_streak, 0) + 1 : Math.min(current.current_streak, 0) - 1;
          await supabase.from('noid_stats').update({
            total_battles: current.total_battles + 1, total_wins: current.total_wins + (won ? 1 : 0),
            total_losses: current.total_losses + (won ? 0 : 1), current_streak: newStreak,
            best_streak: won ? Math.max(current.best_streak, newStreak) : current.best_streak,
            last_battle_date: now, last_win_date: won ? now : current.last_win_date,
            last_loss_date: won ? current.last_loss_date : now, updated_at: now
          }).eq('noid_id', noidId);
        }

        const { data: ms } = await supabase.from('noid_gamemode_stats').select('*').eq('noid_id', noidId).eq('game_mode', 'tournament').single();
        if (!ms) {
          await supabase.from('noid_gamemode_stats').insert([{ noid_id: noidId, game_mode: 'tournament', battles: 1, wins: won ? 1 : 0, losses: won ? 0 : 1 }]);
        } else {
          await supabase.from('noid_gamemode_stats').update({ battles: ms.battles + 1, wins: ms.wins + (won ? 1 : 0), losses: ms.losses + (won ? 0 : 1) }).eq('noid_id', noidId).eq('game_mode', 'tournament');
        }
      }

      // H2H
      const { data: h2hW } = await supabase.from('head_to_head').select('*').eq('noid_id', winnerId).eq('opponent_id', loserId).single();
      if (!h2hW) { await supabase.from('head_to_head').insert([{ noid_id: winnerId, opponent_id: loserId, battles: 1, wins: 1, losses: 0, last_battle_date: now, last_winner: winnerId }]); }
      else { await supabase.from('head_to_head').update({ battles: h2hW.battles + 1, wins: h2hW.wins + 1, last_battle_date: now, last_winner: winnerId }).eq('noid_id', winnerId).eq('opponent_id', loserId); }

      const { data: h2hL } = await supabase.from('head_to_head').select('*').eq('noid_id', loserId).eq('opponent_id', winnerId).single();
      if (!h2hL) { await supabase.from('head_to_head').insert([{ noid_id: loserId, opponent_id: winnerId, battles: 1, wins: 0, losses: 1, last_battle_date: now, last_winner: winnerId }]); }
      else { await supabase.from('head_to_head').update({ battles: h2hL.battles + 1, losses: h2hL.losses + 1, last_battle_date: now, last_winner: winnerId }).eq('noid_id', loserId).eq('opponent_id', winnerId); }
    } catch (err) {
      console.error('Error recording tournament battle stats:', err);
    }
  };

  // Determine round-specific border style for battle cards
  const getRoundBorderStyle = () => {
    if (!activeMatchup) return {};
    const roundName = activeMatchup.round_name || '';
    if (roundName === 'Final') return { border: '20px solid #ffd700' };
    if (roundName === 'Semi-Finals') return { border: '10px solid #4488ff' };
    if (roundName === 'Quarter Finals') return { border: '3px solid #9944ff' };
    return {};
  };

  // Preload podium images via effect, not in render body
  useEffect(() => {
    if (tournamentComplete && tournament) {
      const podiumIds = [tournament.winner_noid_id, tournament.runner_up_noid_id, tournament.third_place_noid_id].filter(Boolean);
      if (podiumIds.length > 0) ensureImages(podiumIds);
    }
  }, [tournamentComplete, tournament?.winner_noid_id, tournament?.runner_up_noid_id, tournament?.third_place_noid_id]);

  // ---- RENDER ----

  if (!tournament) {
    return (<div className="tournament-container"><div className="loading-state"><div className="loading-spinner"></div><p>Loading tournament...</p></div></div>);
  }

  // Starting countdown (15s)
  if (startingCountdown && startingCountdown > 0) {
    return (
      <div className="tournament-container">
        <CountdownOverlay seconds={startingCountdown} title={tournament.tournament_name} subtitle="Tournament starting..." onComplete={() => setStartingCountdown(null)} />
      </div>
    );
  }

  if (showBracket) {
    return <TournamentBracket tournament={tournament} matchups={matchups} getImg={getImg} onClose={() => setShowBracket(false)} onViewNoid={onViewNoid} forceRefreshImages={forceRefreshImages} />;
  }

  if (tournamentComplete) {
    return (
      <div className="tournament-container">
        <div className="tournament-header glass-panel">
          <button className="back-btn" onClick={onClose}><span className="back-arrow">←</span>Back</button>
          <h2 className="tournament-title">{tournament.tournament_name}</h2>
          <div className="spacer"></div>
        </div>
        <div className="tournament-complete glass-panel">
          <div className="trophy-icon">🏆</div>
          <h2>Tournament Complete!</h2>
          <div className="podium">
            {tournament.winner_noid_id && (
              <div className="podium-place first" onClick={() => onViewNoid && onViewNoid(tournament.winner_noid_id)} style={{ cursor: onViewNoid ? 'pointer' : 'default' }}>
                <span className="podium-medal">🥇</span>
                {getImg(tournament.winner_noid_id) && <img src={getImg(tournament.winner_noid_id)} alt="" className="podium-img" />}
                <span className="podium-noid">NOID #{tournament.winner_noid_id}</span>
                <span className="podium-label">Champion</span>
              </div>
            )}
            {tournament.runner_up_noid_id && (
              <div className="podium-place second" onClick={() => onViewNoid && onViewNoid(tournament.runner_up_noid_id)} style={{ cursor: onViewNoid ? 'pointer' : 'default' }}>
                <span className="podium-medal">🥈</span>
                {getImg(tournament.runner_up_noid_id) && <img src={getImg(tournament.runner_up_noid_id)} alt="" className="podium-img" />}
                <span className="podium-noid">NOID #{tournament.runner_up_noid_id}</span>
                <span className="podium-label">Runner-up</span>
              </div>
            )}
            {tournament.third_place_noid_id && (
              <div className="podium-place third" onClick={() => onViewNoid && onViewNoid(tournament.third_place_noid_id)} style={{ cursor: onViewNoid ? 'pointer' : 'default' }}>
                <span className="podium-medal">🥉</span>
                {getImg(tournament.third_place_noid_id) && <img src={getImg(tournament.third_place_noid_id)} alt="" className="podium-img" />}
                <span className="podium-noid">NOID #{tournament.third_place_noid_id}</span>
                <span className="podium-label">3rd Place</span>
              </div>
            )}
          </div>
          <div className="complete-actions">
            <ShareTournamentButton tournament={tournament} getImg={getImg} />
            <button className="start-btn" onClick={() => setShowBracket(true)}>View Bracket</button>
            <button className="back-btn" onClick={onClose}><span className="back-arrow">←</span>Back to Tournaments</button>
          </div>
        </div>
      </div>
    );
  }

  // Round transition with bracket + countdown
  if (roundTransition || (tournament.countdown_until && !startingCountdown)) {
    const countdownEnd = tournament.countdown_until ? new Date(tournament.countdown_until).getTime() : 0;
    const remaining = Math.max(0, Math.ceil((countdownEnd - Date.now()) / 1000));

    if (remaining > 0) {
      return (
        <div className="tournament-container">
          <div className="tournament-header glass-panel">
            <button className="back-btn" onClick={onClose}><span className="back-arrow">←</span>Back</button>
            <h2 className="tournament-title">{tournament.tournament_name}</h2>
            <div className="spacer"></div>
          </div>
          <div className="round-transition-screen">
            <h2 className="round-transition-title">NEXT ROUND STARTING IN</h2>
            <div className="round-transition-countdown">
              <div className="countdown-number">{remaining}</div>
            </div>
            <img src="/NOiDS_Battle_Splash.jpg" alt="NOiDS Battle" className="round-transition-splash" />
            <h3 className="round-transition-round-name">{roundTransition || getRoundName(tournament.bracket_size, tournament.current_round)}</h3>
          </div>
        </div>
      );
    } else if (roundTransition && tournament.creator_wallet === walletAddress?.toLowerCase()) {
      const nextRoundMatchups = matchups
        .filter(m => m.round === tournament.current_round && m.status === 'pending')
        .sort((a, b) => a.matchup_index - b.matchup_index);

      if (nextRoundMatchups.length > 0) {
        const now = new Date().toISOString();
        supabase.from('tournament_matchups').update({ status: 'active', started_at: now }).eq('id', nextRoundMatchups[0].id)
          .then(() => supabase.from('tournaments').update({ countdown_until: null, matchup_started_at: now }).eq('id', tournamentId))
          .then(() => setRoundTransition(null));
      }
    }
  }

  const roundBorder = getRoundBorderStyle();

  return (
    <div className="tournament-container">
      <div className="tournament-header glass-panel">
        <button className="back-btn" onClick={onClose}><span className="back-arrow">←</span>Back</button>
        <h2 className="tournament-title">{tournament.tournament_name}</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="refresh-images-btn" onClick={() => {
            const allIds = matchups.flatMap(m => [m.noid1_id, m.noid2_id]).filter(Boolean);
            forceRefreshImages([...new Set(allIds)]);
          }}>🔄</button>
          <button className="bracket-toggle-btn" onClick={() => setShowBracket(true)}>📊 Bracket</button>
        </div>
      </div>

      {coinFlipData && <CoinFlipOverlay winnerId={coinFlipData.winnerId} getImg={getImg} />}

      <div className="live-round-info glass-panel">
        <span className="round-name-live">{activeMatchup ? activeMatchup.round_name : 'Waiting...'}</span>
        {activeMatchup && <span className="matchup-counter">Match {activeMatchup.matchup_index + 1} of {matchups.filter(m => m.round === activeMatchup.round).length}</span>}
      </div>

      {activeMatchup && (
        <div className={`live-timer ${timeLeft <= 5 ? 'urgent' : ''}`}>
          <div className="timer-number">{timeLeft}</div>
          <div className="timer-label">seconds</div>
        </div>
      )}

      {activeMatchup ? (
        <div className="battle-arena tournament-arena">
          <div
            className={`noid-card glass-card ${hasVoted && votedFor === activeMatchup.noid1_id ? 'voted-winner' : ''} ${hasVoted && votedFor !== activeMatchup.noid1_id && hasVoted ? 'voted-other' : ''}`}
            onClick={() => handleVote(activeMatchup.noid1_id)}
            style={{ cursor: hasVoted ? 'default' : 'pointer', ...roundBorder }}
          >
            <div className="card-glow"></div>
            <div className="image-container">
              {getImg(activeMatchup.noid1_id) && <img src={getImg(activeMatchup.noid1_id)} alt={`NOID #${activeMatchup.noid1_id}`} />}
            </div>
            <div className="noid-info">
              <h3>NOID #{activeMatchup.noid1_id}</h3>
              {hasVoted && (
                <div className="vote-count"><span className="vote-label">Votes:</span><span className="vote-number">{activeMatchup.noid1_votes}</span></div>
              )}
            </div>
          </div>

          <div className="vs-divider"><div className="vs-circle"><span>VS</span></div></div>

          <div
            className={`noid-card glass-card ${hasVoted && votedFor === activeMatchup.noid2_id ? 'voted-winner' : ''} ${hasVoted && votedFor !== activeMatchup.noid2_id && hasVoted ? 'voted-other' : ''}`}
            onClick={() => handleVote(activeMatchup.noid2_id)}
            style={{ cursor: hasVoted ? 'default' : 'pointer', ...roundBorder }}
          >
            <div className="card-glow"></div>
            <div className="image-container">
              {getImg(activeMatchup.noid2_id) && <img src={getImg(activeMatchup.noid2_id)} alt={`NOID #${activeMatchup.noid2_id}`} />}
            </div>
            <div className="noid-info">
              <h3>NOID #{activeMatchup.noid2_id}</h3>
              {hasVoted && (
                <div className="vote-count"><span className="vote-label">Votes:</span><span className="vote-number">{activeMatchup.noid2_votes}</span></div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="loading-state"><div className="loading-spinner"></div><p>Waiting for next matchup...</p></div>
      )}

      {hasVoted && <div className="voted-confirmation glass-panel"><span>✔ Vote recorded — waiting for timer...</span></div>}
    </div>
  );
};

// ============================================
// INLINE BRACKET (round transition screen)
// ============================================

const TournamentBracketInline = ({ tournament, matchups, getImg }) => {
  const totalRounds = TOTAL_ROUNDS[tournament.bracket_size];
  return (
    <div className="bracket-view bracket-inline">
      <div className="bracket-scroll">
        {Array.from({ length: totalRounds }).map((_, rIdx) => {
          const round = rIdx + 1;
          const roundMatchups = matchups.filter(m => m.round === round).sort((a, b) => a.matchup_index - b.matchup_index);
          const roundName = getRoundName(tournament.bracket_size, round);
          return (
            <div key={round} className={`bracket-round ${getRoundClass(roundName)}`}>
              <div className="bracket-round-header">{roundName}</div>
              <div className="bracket-matchups">
                {roundMatchups.map(m => (
                  <div key={m.id} className={`bracket-matchup ${m.status}`}>
                    <div className={`bracket-noid ${m.winner_id === m.noid1_id ? 'winner' : ''} ${m.winner_id === m.noid2_id ? 'loser' : ''}`}>
                      {m.noid1_id && getImg(m.noid1_id) && <img src={getImg(m.noid1_id)} alt="" className="bracket-noid-img" />}
                      <span className="bracket-noid-id">{m.noid1_id ? `#${m.noid1_id}` : 'TBD'}</span>
                      {m.status === 'completed' && <span className="bracket-votes">{m.noid1_votes}</span>}
                    </div>
                    <div className={`bracket-noid ${m.winner_id === m.noid2_id ? 'winner' : ''} ${m.winner_id === m.noid1_id ? 'loser' : ''}`}>
                      {m.noid2_id && getImg(m.noid2_id) && <img src={getImg(m.noid2_id)} alt="" className="bracket-noid-img" />}
                      <span className="bracket-noid-id">{m.noid2_id ? `#${m.noid2_id}` : 'TBD'}</span>
                      {m.status === 'completed' && <span className="bracket-votes">{m.noid2_votes}</span>}
                    </div>
                    {m.is_coin_flip && <span className="bracket-coinflip">🪙</span>}
                    {m.status === 'active' && <span className="bracket-live">LIVE</span>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const getRoundClass = (roundName) => {
  if (roundName === 'Quarter Finals') return 'bracket-round-qf';
  if (roundName === 'Semi-Finals') return 'bracket-round-sf';
  if (roundName === 'Final') return 'bracket-round-final';
  return '';
};

// ============================================
// BRACKET VIEW (full page)
// ============================================

const TournamentBracket = ({ tournament, matchups, getImg, onClose, onViewNoid, forceRefreshImages }) => {
  const totalRounds = TOTAL_ROUNDS[tournament.bracket_size];

  return (
    <div className="tournament-container">
      <div className="tournament-header glass-panel">
        <button className="back-btn" onClick={onClose}><span className="back-arrow">←</span>Back</button>
        <h2 className="tournament-title">{tournament.tournament_name} — Bracket</h2>
        <button className="refresh-images-btn" onClick={() => {
          const allIds = matchups.flatMap(m => [m.noid1_id, m.noid2_id]).filter(Boolean);
          forceRefreshImages && forceRefreshImages([...new Set(allIds)]);
        }}>🔄 Refresh Images</button>
      </div>
      <div className="bracket-view">
        <div className="bracket-scroll">
          {Array.from({ length: totalRounds }).map((_, rIdx) => {
            const round = rIdx + 1;
            const roundMatchups = matchups.filter(m => m.round === round).sort((a, b) => a.matchup_index - b.matchup_index);
            const roundName = getRoundName(tournament.bracket_size, round);
            return (
              <div key={round} className={`bracket-round ${getRoundClass(roundName)}`}>
                <div className="bracket-round-header">{roundName}</div>
                <div className="bracket-matchups">
                  {roundMatchups.map(m => (
                    <div key={m.id} className={`bracket-matchup ${m.status}`}>
                      <div className={`bracket-noid ${m.winner_id === m.noid1_id ? 'winner' : ''} ${m.winner_id === m.noid2_id ? 'loser' : ''}`}>
                        {m.noid1_id && getImg(m.noid1_id) && <img src={getImg(m.noid1_id)} alt="" className="bracket-noid-img" />}
                        <span className="bracket-noid-id clickable" onClick={(e) => { if (m.noid1_id && onViewNoid) { e.stopPropagation(); onViewNoid(m.noid1_id); } }}>{m.noid1_id ? `#${m.noid1_id}` : 'TBD'}</span>
                        {m.status === 'completed' && <span className="bracket-votes">{m.noid1_votes}</span>}
                      </div>
                      <div className={`bracket-noid ${m.winner_id === m.noid2_id ? 'winner' : ''} ${m.winner_id === m.noid1_id ? 'loser' : ''}`}>
                        {m.noid2_id && getImg(m.noid2_id) && <img src={getImg(m.noid2_id)} alt="" className="bracket-noid-img" />}
                        <span className="bracket-noid-id clickable" onClick={(e) => { if (m.noid2_id && onViewNoid) { e.stopPropagation(); onViewNoid(m.noid2_id); } }}>{m.noid2_id ? `#${m.noid2_id}` : 'TBD'}</span>
                        {m.status === 'completed' && <span className="bracket-votes">{m.noid2_votes}</span>}
                      </div>
                      {m.is_coin_flip && <span className="bracket-coinflip">🪙</span>}
                      {m.status === 'active' && <span className="bracket-live">LIVE</span>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ============================================
// MAIN TOURNAMENT COMPONENT (Router)
// ============================================

const Tournament = ({ walletAddress, onClose, showWalletModal, onViewNoid, parentImageCache }) => {
  const [tournamentView, setTournamentView] = useState('hub');
  const [activeTournamentId, setActiveTournamentId] = useState(null);

  const handleViewTournament = async (tournamentId) => {
    const { data: t } = await supabase.from('tournaments').select('status').eq('id', tournamentId).single();
    setActiveTournamentId(tournamentId);
    if (t?.status === 'active' || t?.status === 'completed') {
      setTournamentView('live');
    } else {
      setTournamentView('lobby');
    }
  };

  if (!walletAddress && tournamentView === 'create') {
    // Only creating requires wallet
    showWalletModal();
    setTournamentView('hub');
  }

  switch (tournamentView) {
    case 'hub':
      return <TournamentHub walletAddress={walletAddress} onClose={onClose} onViewTournament={handleViewTournament} onCreateTournament={() => setTournamentView('create')} parentImageCache={parentImageCache} showWalletModal={showWalletModal} />;
    case 'create':
      return <CreateTournament walletAddress={walletAddress} onClose={() => setTournamentView('hub')} onCreated={(id) => { setActiveTournamentId(id); setTournamentView('lobby'); }} />;
    case 'lobby':
      return <TournamentLobby tournamentId={activeTournamentId} walletAddress={walletAddress} onClose={() => setTournamentView('hub')} onStart={(id) => { setActiveTournamentId(id); setTournamentView('live'); }} parentImageCache={parentImageCache} />;
    case 'live':
      return <LiveTournament tournamentId={activeTournamentId} walletAddress={walletAddress} onClose={() => setTournamentView('hub')} onViewNoid={onViewNoid} parentImageCache={parentImageCache} showWalletModal={showWalletModal} />;
    default:
      return null;
  }
};

export default Tournament;
