import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './App';

const CONTRACT_ADDRESS = '0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902';
const OPENSEA_API_KEY = 'f6662070d18f4d54936bdd66b94c3f11';
const TOTAL_NOIDS = 5555;
const VOTING_DURATION = 30;
const COUNTDOWN_DURATION = 20;

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
    if (url) { globalImageCache[noidId] = url; return url; }
    throw new Error('No URL');
  } catch {
    const fallback = `https://gateway.pinata.cloud/ipfs/QmcXuDARMGMv59Q4ZZuoN5rjdM9GQrmp8NjLH5PDLixgAE/${noidId}`;
    globalImageCache[noidId] = fallback;
    return fallback;
  }
};

const useImageLoader = (parentImageCache) => {
  const [images, setImages] = useState({});
  const loadingRef = useRef(new Set());

  const ensureImages = useCallback(async (noidIds) => {
    const missing = noidIds.filter(id => id && !images[id] && !parentImageCache?.[id] && !loadingRef.current.has(id));
    if (missing.length === 0) return;
    missing.forEach(id => loadingRef.current.add(id));
    const results = {};
    for (const id of missing) {
      try { results[id] = await fetchAndCacheImage(id); } catch {}
    }
    if (Object.keys(results).length > 0) setImages(prev => ({ ...prev, ...results }));
    missing.forEach(id => loadingRef.current.delete(id));
  }, [images, parentImageCache]);

  const getImage = useCallback((noidId) => {
    return images[noidId] || parentImageCache?.[noidId] || globalImageCache[noidId] || null;
  }, [images, parentImageCache]);

  return { images, ensureImages, getImage };
};

const CoinFlipOverlay = ({ winnerId, onDismiss, getImage }) => {
  const [phase, setPhase] = useState('flip');
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('reveal'), 1500);
    const t2 = setTimeout(() => onDismiss(), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDismiss]);
  return (
    <div className="h2h-coinflip-overlay">
      <div className="h2h-coinflip-content">
        {phase === 'flip' ? (
          <>
            <div className="h2h-coinflip-coin">🪙</div>
            <h2 className="h2h-coinflip-title">Coin Flip!</h2>
            <p className="h2h-coinflip-subtitle">Tied — deciding by coin flip...</p>
          </>
        ) : (
          <>
            <img src={getImage(winnerId)} alt="" className="h2h-coinflip-winner-img" />
            <h2 className="h2h-coinflip-title" style={{ color: '#FFD700' }}>NOiD #{winnerId} wins!</h2>
            <p className="h2h-coinflip-subtitle">Lucky flip 🍀</p>
          </>
        )}
      </div>
    </div>
  );
};

const H2HLobby = ({ walletAddress, onCreateBattle, onJoinBattle, getImage, ensureImages }) => {
  const [battles, setBattles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('live');

  const loadBattles = useCallback(async () => {
    try {
      let query = supabase.from('h2h_battles').select('*').order('created_at', { ascending: false }).limit(50);
      if (filter === 'live') query = query.in('status', ['pending', 'countdown', 'live']);
      else if (filter === 'completed') query = query.eq('status', 'completed');
      const { data, error } = await query;
      if (error) throw error;
      setBattles(data || []);
      const noidIds = [];
      (data || []).forEach(b => { if (b.noid1_id) noidIds.push(b.noid1_id); if (b.noid2_id) noidIds.push(b.noid2_id); });
      if (noidIds.length > 0) ensureImages(noidIds);
    } catch (err) { console.error('Error loading H2H:', err); }
    finally { setLoading(false); }
  }, [filter, ensureImages]);

  useEffect(() => { loadBattles(); const i = setInterval(loadBattles, 5000); return () => clearInterval(i); }, [loadBattles]);

  const getStatusLabel = (b) => {
    if (b.status === 'pending') return '🟡 Waiting...';
    if (b.status === 'countdown') return '⏳ Starting...';
    if (b.status === 'live') return '🔴 LIVE';
    if (b.status === 'completed') return b.is_coin_flip ? '🪙 Coin Flip' : '✅ Finished';
    return b.status;
  };

  const getResultText = (b) => {
    if (b.status !== 'completed') return null;
    const margin = Math.abs(b.noid1_votes - b.noid2_votes);
    const w = b.winner_id, l = w === b.noid1_id ? b.noid2_id : b.noid1_id;
    if (b.is_coin_flip) return `#${w} won by coin flip!`;
    if (margin >= 4) return `#${w} SMOKED #${l}!`;
    if (margin >= 2) return `#${w} beat #${l}`;
    return `#${w} edged out #${l}`;
  };

  return (
    <div className="h2h-lobby">
      <div className="h2h-lobby-header">
        <h2>⚔️ Head to Head Battles</h2>
        {walletAddress && <button className="h2h-create-btn" onClick={onCreateBattle}>+ Create H2H</button>}
      </div>
      <div className="h2h-filter-tabs">
        {['live', 'completed', 'all'].map(f => (
          <button key={f} className={`h2h-filter-tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'live' ? '🔴 Live' : f === 'completed' ? '✅ Finished' : '📋 All'}
          </button>
        ))}
      </div>
      {loading ? <div className="h2h-loading">Loading battles...</div>
       : battles.length === 0 ? (
        <div className="h2h-empty">
          <p>{filter === 'live' ? 'No live battles right now' : 'No battles found'}</p>
          {walletAddress && <p>Create one to get started!</p>}
        </div>
      ) : (
        <div className="h2h-battle-list">
          {battles.map(b => (
            <button key={b.id} className={`h2h-battle-card ${b.status === 'live' ? 'h2h-card-live' : ''} ${b.status === 'countdown' ? 'h2h-card-countdown' : ''}`} onClick={() => onJoinBattle(b)}>
              <div className="h2h-card-matchup">
                <div className="h2h-card-noid">
                  {getImage(b.noid1_id) ? <img src={getImage(b.noid1_id)} alt="" className="h2h-card-img" /> : <div className="h2h-card-img-placeholder">#{b.noid1_id}</div>}
                  <span className="h2h-card-number">#{b.noid1_id}</span>
                </div>
                <div className="h2h-card-vs">
                  <span>VS</span>
                  <span className={`h2h-card-status h2h-status-${b.status}`}>{getStatusLabel(b)}</span>
                </div>
                <div className="h2h-card-noid">
                  {getImage(b.noid2_id) ? <img src={getImage(b.noid2_id)} alt="" className="h2h-card-img" /> : <div className="h2h-card-img-placeholder">#{b.noid2_id}</div>}
                  <span className="h2h-card-number">#{b.noid2_id}</span>
                </div>
              </div>
              {b.status === 'completed' && (
                <div className="h2h-card-result">
                  <span className="h2h-card-score">{b.noid1_votes} - {b.noid2_votes}</span>
                  <span className="h2h-card-result-text">{getResultText(b)}</span>
                </div>
              )}
              {(b.status === 'live' || b.status === 'countdown') && (
                <div className="h2h-card-live-indicator">{b.status === 'live' ? 'TAP TO VOTE' : 'STARTING SOON'}</div>
              )}
              {b.status === 'pending' && (
                <div className="h2h-card-live-indicator" style={{color: '#ffa500', background: 'rgba(255,165,0,0.15)'}}>WAITING TO START</div>
              )}
            </button>
          ))}
        </div>
      )}
      {!walletAddress && <div className="h2h-wallet-notice">Connect wallet to create battles. Anyone can view and vote!</div>}
    </div>
  );
};

const CreateH2H = ({ walletAddress, onCancel, onCreated, getImage, ensureImages }) => {
  const [myNoids, setMyNoids] = useState([]);
  const [selectedNoid, setSelectedNoid] = useState(null);
  const [opponentId, setOpponentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchMyNoids = async () => {
      try {
        let allNoids = [], cursor = null;
        do {
          let url = `https://api.opensea.io/api/v2/chain/ethereum/account/${walletAddress}/nfts?collection=noidsofficial&limit=200`;
          if (cursor) url += `&next=${cursor}`;
          const response = await fetch(url, { headers: { 'x-api-key': OPENSEA_API_KEY } });
          if (!response.ok) throw new Error('Failed to fetch NOiDS');
          const data = await response.json();
          allNoids = [...allNoids, ...(data.nfts || []).map(n => ({ id: parseInt(n.identifier), image: n.image_url || n.display_image_url }))];
          cursor = data.next;
        } while (cursor);
        allNoids.sort((a, b) => a.id - b.id);
        setMyNoids(allNoids);
        allNoids.forEach(n => { if (n.image) globalImageCache[n.id] = n.image; });
      } catch (err) { console.error('Error fetching NOiDS:', err); setError('Could not load your NOiDS'); }
      finally { setLoading(false); }
    };
    fetchMyNoids();
  }, [walletAddress]);

  const handleCreate = async () => {
    const oppId = parseInt(opponentId);
    if (!selectedNoid) { setError('Select one of your NOiDS'); return; }
    if (!oppId || oppId < 1 || oppId > TOTAL_NOIDS) { setError(`Enter a valid NOiD number (1-${TOTAL_NOIDS})`); return; }
    if (oppId === selectedNoid.id) { setError("Can't battle yourself!"); return; }
    setCreating(true); setError(null);
    try {
      await fetchAndCacheImage(oppId);
      const { data, error: insertError } = await supabase.from('h2h_battles').insert({
        noid1_id: selectedNoid.id, noid2_id: oppId, creator_wallet: walletAddress,
        status: 'pending', noid1_votes: 0, noid2_votes: 0,
        battle_url: `h2h-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
      }).select().single();
      if (insertError) throw insertError;
      onCreated(data);
    } catch (err) { console.error('Error creating H2H:', err); setError('Failed to create battle. Try again.'); }
    finally { setCreating(false); }
  };

  useEffect(() => {
    const oppId = parseInt(opponentId);
    if (oppId && oppId >= 1 && oppId <= TOTAL_NOIDS) ensureImages([oppId]);
  }, [opponentId, ensureImages]);

  const oppId = parseInt(opponentId);
  const validOpponent = oppId && oppId >= 1 && oppId <= TOTAL_NOIDS && oppId !== selectedNoid?.id;

  return (
    <div className="h2h-create">
      <h2>⚔️ Create Head to Head</h2>
      <div className="h2h-create-section">
        <h3>1. Select Your NOiD</h3>
        {loading ? <div className="h2h-loading">Loading your NOiDS...</div>
         : myNoids.length === 0 ? <div className="h2h-empty">You don't own any NOiDS</div>
         : (
          <div className="h2h-noid-picker">
            {myNoids.map(noid => (
              <button key={noid.id} className={`h2h-noid-pick ${selectedNoid?.id === noid.id ? 'selected' : ''}`} onClick={() => setSelectedNoid(noid)}>
                <img src={noid.image || getImage(noid.id)} alt="" className="h2h-pick-img" />
                <span>#{noid.id}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="h2h-create-section">
        <h3>2. Choose Opponent NOiD</h3>
        <div className="h2h-opponent-input">
          <input type="number" min="1" max={TOTAL_NOIDS} placeholder="Enter NOiD number..." value={opponentId} onChange={(e) => setOpponentId(e.target.value)} className="h2h-input" />
          {validOpponent && getImage(oppId) && (
            <div className="h2h-opponent-preview">
              <img src={getImage(oppId)} alt="" className="h2h-preview-img" />
              <span>NOiD #{oppId}</span>
            </div>
          )}
        </div>
      </div>
      {selectedNoid && validOpponent && (
        <div className="h2h-create-preview">
          <div className="h2h-preview-matchup">
            <div className="h2h-preview-noid">
              <img src={selectedNoid.image || getImage(selectedNoid.id)} alt="" />
              <span>#{selectedNoid.id}</span>
            </div>
            <div className="h2h-preview-vs">VS</div>
            <div className="h2h-preview-noid">
              {getImage(oppId) ? <img src={getImage(oppId)} alt="" /> : <div className="h2h-preview-placeholder">#{oppId}</div>}
              <span>#{oppId}</span>
            </div>
          </div>
          <p className="h2h-preview-info">20s countdown → 30s voting → Winner declared</p>
        </div>
      )}
      {error && <div className="h2h-error">{error}</div>}
      <div className="h2h-create-actions">
        <button className="h2h-cancel-btn" onClick={onCancel}>Cancel</button>
        <button className="h2h-go-btn" onClick={handleCreate} disabled={!selectedNoid || !validOpponent || creating}>
          {creating ? 'Creating...' : '⚔️ Create H2H Battle'}
        </button>
      </div>
    </div>
  );
};

const LiveH2H = ({ battle: initialBattle, walletAddress, showWalletModal, getImage, ensureImages, onClose }) => {
  const [battle, setBattle] = useState(initialBattle);
  const [phase, setPhase] = useState('loading');
  const [countdown, setCountdown] = useState(COUNTDOWN_DURATION);
  const [votingTimeLeft, setVotingTimeLeft] = useState(VOTING_DURATION);
  const [hasVoted, setHasVoted] = useState(false);
  const [votedFor, setVotedFor] = useState(null);
  const [showCoinFlip, setShowCoinFlip] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const pollingRef = useRef(null);
  const timerRef = useRef(null);
  const viewerRef = useRef(null);

  const isCreator = walletAddress && battle?.creator_wallet === walletAddress;
  const viewerId = walletAddress || `anon-${Math.random().toString(36).substr(2, 8)}`;

  // Ping viewer presence every 5 seconds
  useEffect(() => {
    if (!battle) return;
    const ping = async () => {
      try {
        const { data } = await supabase.rpc('h2h_ping_viewer', { p_battle_id: battle.id, p_viewer_id: viewerId });
        if (typeof data === 'number') setViewerCount(data);
      } catch {}
    };
    ping();
    viewerRef.current = setInterval(ping, 5000);
    return () => clearInterval(viewerRef.current);
  }, [battle?.id, viewerId]);

  useEffect(() => { if (battle) ensureImages([battle.noid1_id, battle.noid2_id]); }, [battle?.noid1_id, battle?.noid2_id, ensureImages]);

  useEffect(() => {
    const checkVote = async () => {
      if (!walletAddress || !battle) return;
      const { data } = await supabase.from('h2h_votes').select('voted_for_noid_id').eq('battle_id', battle.id).eq('voter_wallet', walletAddress).single();
      if (data) { setHasVoted(true); setVotedFor(data.voted_for_noid_id); }
    };
    checkVote();
  }, [walletAddress, battle?.id]);

  // Start battle (creator only)
  const handleStart = async () => {
    const now = new Date();
    const countdownUntil = new Date(now.getTime() + COUNTDOWN_DURATION * 1000);
    const votingEndsAt = new Date(countdownUntil.getTime() + VOTING_DURATION * 1000);
    await supabase.from('h2h_battles').update({
      status: 'countdown',
      countdown_until: countdownUntil.toISOString(),
      voting_ends_at: votingEndsAt.toISOString()
    }).eq('id', battle.id);
    setBattle(prev => ({ ...prev, status: 'countdown', countdown_until: countdownUntil.toISOString(), voting_ends_at: votingEndsAt.toISOString() }));
  };

  useEffect(() => {
    if (!battle) return;
    const updatePhase = () => {
      const now = new Date();
      if (battle.status === 'completed') { setPhase('completed'); return; }
      if (battle.status === 'pending') { setPhase('pending'); return; }
      if (battle.countdown_until) {
        const end = new Date(battle.countdown_until);
        if (now < end) { setPhase('countdown'); setCountdown(Math.ceil((end - now) / 1000)); return; }
      }
      if (battle.voting_ends_at) {
        const end = new Date(battle.voting_ends_at);
        if (now < end) { setPhase('voting'); setVotingTimeLeft(Math.ceil((end - now) / 1000)); return; }
      }
      if (battle.status !== 'completed') { setPhase('voting'); setVotingTimeLeft(0); }
    };
    updatePhase();
    const i = setInterval(updatePhase, 1000);
    return () => clearInterval(i);
  }, [battle]);

  useEffect(() => {
    if (phase !== 'countdown') return;
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); setPhase('voting'); supabase.from('h2h_battles').update({ status: 'live' }).eq('id', battle.id); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, battle?.id]);

  useEffect(() => {
    if (phase !== 'voting') return;
    timerRef.current = setInterval(() => {
      setVotingTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); finalizeBattle(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  useEffect(() => {
    if (!battle) return;
    pollingRef.current = setInterval(async () => {
      const { data } = await supabase.from('h2h_battles').select('*').eq('id', battle.id).single();
      if (data) {
        setBattle(data);
        if (data.status === 'completed' && phase !== 'completed') {
          if (data.is_coin_flip) setShowCoinFlip(true);
          setPhase('completed');
        }
      }
    }, 2000);
    return () => clearInterval(pollingRef.current);
  }, [battle?.id, phase]);

  const finalizeBattle = async () => {
    try {
      const { data: latest } = await supabase.from('h2h_battles').select('*').eq('id', battle.id).single();
      if (!latest || latest.status === 'completed') return;
      let winnerId, isCoinFlip = false;
      if (latest.noid1_votes > latest.noid2_votes) winnerId = latest.noid1_id;
      else if (latest.noid2_votes > latest.noid1_votes) winnerId = latest.noid2_id;
      else {
        isCoinFlip = true;
        if (latest.noid1_first_vote_at && latest.noid2_first_vote_at)
          winnerId = new Date(latest.noid1_first_vote_at) <= new Date(latest.noid2_first_vote_at) ? latest.noid1_id : latest.noid2_id;
        else if (latest.noid1_first_vote_at) winnerId = latest.noid1_id;
        else if (latest.noid2_first_vote_at) winnerId = latest.noid2_id;
        else winnerId = Math.random() < 0.5 ? latest.noid1_id : latest.noid2_id;
      }
      await supabase.from('h2h_battles').update({ status: 'completed', winner_id: winnerId, is_coin_flip: isCoinFlip }).eq('id', battle.id);
      setBattle(prev => ({ ...prev, status: 'completed', winner_id: winnerId, is_coin_flip: isCoinFlip }));
      if (isCoinFlip) setShowCoinFlip(true);
      setPhase('completed');
    } catch (err) { console.error('Error finalizing H2H:', err); }
  };

  const handleVote = async (noidId) => {
    if (hasVoted || phase !== 'voting') return;
    if (!walletAddress) { showWalletModal(); return; }
    try {
      const { error: voteError } = await supabase.from('h2h_votes').insert({ battle_id: battle.id, voter_wallet: walletAddress, voted_for_noid_id: noidId });
      if (voteError) { if (voteError.code === '23505') { setHasVoted(true); return; } throw voteError; }
      const field = noidId === battle.noid1_id ? 'noid1_votes' : 'noid2_votes';
      const firstVoteField = noidId === battle.noid1_id ? 'noid1_first_vote_at' : 'noid2_first_vote_at';
      await supabase.rpc('increment_h2h_votes', { p_battle_id: battle.id, p_field: field, p_first_vote_field: firstVoteField });
      setHasVoted(true); setVotedFor(noidId);
      setBattle(prev => ({ ...prev, [field]: (prev[field] || 0) + 1 }));
    } catch (err) { console.error('Error voting:', err); }
  };

  const shareToX = () => {
    if (!battle || battle.status !== 'completed') return;
    const w = battle.winner_id, l = w === battle.noid1_id ? battle.noid2_id : battle.noid1_id;
    const margin = Math.abs(battle.noid1_votes - battle.noid2_votes);
    let headline;
    if (battle.is_coin_flip) headline = `NOiD #${l} was edged out by NOiD #${w}`;
    else if (margin >= 4) headline = `NOiD #${l} just got absolutely SMOKED by NOiD #${w}`;
    else if (margin >= 2) headline = `NOiD #${l} was beaten by NOiD #${w}`;
    else headline = `NOiD #${l} was edged out by NOiD #${w}`;
    const text = `Head to Head Battle Results!\n${headline}\n\n🥇 NOiD #${w}\n🥈 NOiD #${l}\n\nThink your NOiD has what it takes?\nBattle it out at noidsbattle.com\n\n#NOiDSBattle @thehumanoids`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
  };

  const downloadShareImage = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 630;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, 1200, 630);
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 4; ctx.strokeRect(10, 10, 1180, 610);
    ctx.fillStyle = '#00ff41'; ctx.font = 'bold 42px monospace'; ctx.textAlign = 'center';
    ctx.fillText('⚔️ HEAD TO HEAD ⚔️', 600, 60);
    const w = battle.winner_id, l = w === battle.noid1_id ? battle.noid2_id : battle.noid1_id;
    const loadImg = (src) => new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
    try {
      const [winImg, loseImg] = await Promise.all([loadImg(getImage(w)), loadImg(getImage(l))]);
      ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 6; ctx.strokeRect(100, 100, 250, 250); ctx.drawImage(winImg, 100, 100, 250, 250);
      ctx.fillStyle = '#FFD700'; ctx.font = 'bold 28px monospace'; ctx.fillText(`🥇 #${w}`, 225, 390);
      ctx.strokeStyle = '#888'; ctx.lineWidth = 4; ctx.strokeRect(850, 120, 200, 200); ctx.drawImage(loseImg, 850, 120, 200, 200);
      ctx.fillStyle = '#888'; ctx.font = 'bold 24px monospace'; ctx.fillText(`🥈 #${l}`, 950, 360);
    } catch (e) { console.error('Share image error:', e); }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 60px monospace'; ctx.fillText('VS', 600, 250);
    const winVotes = w === battle.noid1_id ? battle.noid1_votes : battle.noid2_votes;
    const loseVotes = w === battle.noid1_id ? battle.noid2_votes : battle.noid1_votes;
    ctx.fillStyle = '#00ff41'; ctx.font = 'bold 48px monospace'; ctx.fillText(`${winVotes} - ${loseVotes}`, 600, 450);
    const margin = Math.abs(battle.noid1_votes - battle.noid2_votes);
    const result = battle.is_coin_flip ? 'Won by coin flip! 🪙' : margin >= 4 ? 'SMOKED! 💨' : margin >= 2 ? 'Beaten!' : 'Close one!';
    ctx.fillStyle = '#fff'; ctx.font = '28px monospace'; ctx.fillText(result, 600, 510);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '18px monospace'; ctx.fillText('noidsbattle.com | #NOiDSBattle', 600, 590);
    const link = document.createElement('a'); link.download = `h2h-${battle.noid1_id}-vs-${battle.noid2_id}.png`; link.href = canvas.toDataURL('image/png'); link.click();
  };

  if (!battle) return null;
  const winnerId = battle.winner_id;

  return (
    <div className="h2h-live">
      {showCoinFlip && <CoinFlipOverlay winnerId={battle.winner_id} onDismiss={() => setShowCoinFlip(false)} getImage={getImage} />}

      {/* Viewer count badge - shown during pending, countdown, voting */}
      {(phase === 'pending' || phase === 'countdown' || phase === 'voting') && viewerCount > 0 && (
        <div className="h2h-viewer-count">👁 {viewerCount} watching</div>
      )}

      {phase === 'pending' && (
        <div className="h2h-countdown-phase">
          <h2 className="h2h-phase-title">⚔️ HEAD TO HEAD ⚔️</h2>
          <div className="h2h-splash-matchup">
            <div className="h2h-splash-noid">
              {getImage(battle.noid1_id) ? <img src={getImage(battle.noid1_id)} alt="" className="h2h-splash-img" /> : <div className="h2h-splash-placeholder">#{battle.noid1_id}</div>}
              <span className="h2h-splash-number">NOiD #{battle.noid1_id}</span>
            </div>
            <div className="h2h-splash-vs">VS</div>
            <div className="h2h-splash-noid">
              {getImage(battle.noid2_id) ? <img src={getImage(battle.noid2_id)} alt="" className="h2h-splash-img" /> : <div className="h2h-splash-placeholder">#{battle.noid2_id}</div>}
              <span className="h2h-splash-number">NOiD #{battle.noid2_id}</span>
            </div>
          </div>
          {isCreator ? (
            <button className="h2h-start-btn" onClick={handleStart}>🚀 Start Now</button>
          ) : (
            <div className="h2h-waiting-text">
              <div className="h2h-waiting-pulse"></div>
              <span>Waiting for creator to start...</span>
            </div>
          )}
        </div>
      )}

      {phase === 'countdown' && (
        <div className="h2h-countdown-phase">
          <h2 className="h2h-phase-title">⚔️ HEAD TO HEAD ⚔️</h2>
          <div className="h2h-splash-matchup">
            <div className="h2h-splash-noid">
              {getImage(battle.noid1_id) ? <img src={getImage(battle.noid1_id)} alt="" className="h2h-splash-img" /> : <div className="h2h-splash-placeholder">#{battle.noid1_id}</div>}
              <span className="h2h-splash-number">NOiD #{battle.noid1_id}</span>
            </div>
            <div className="h2h-splash-vs">VS</div>
            <div className="h2h-splash-noid">
              {getImage(battle.noid2_id) ? <img src={getImage(battle.noid2_id)} alt="" className="h2h-splash-img" /> : <div className="h2h-splash-placeholder">#{battle.noid2_id}</div>}
              <span className="h2h-splash-number">NOiD #{battle.noid2_id}</span>
            </div>
          </div>
          <div className="h2h-countdown-timer">
            <span className="h2h-countdown-number">{countdown}</span>
            <span className="h2h-countdown-label">Voting starts in...</span>
          </div>
        </div>
      )}

      {phase === 'voting' && (
        <>
          <div className="live-round-info glass-panel">
            <span className="round-name-live">⚔️ Head to Head</span>
            <span className="matchup-counter">Match 1 of 1</span>
          </div>

          <div className={`live-timer ${votingTimeLeft <= 5 ? 'urgent' : ''}`}>
            <div className="timer-number">{votingTimeLeft}</div>
            <div className="timer-label">seconds</div>
          </div>

          <div className="battle-arena tournament-arena">
            <div
              className={`noid-card glass-card ${hasVoted && votedFor === battle.noid1_id ? 'voted-winner' : ''} ${hasVoted && votedFor !== battle.noid1_id ? 'voted-other' : ''}`}
              onClick={() => handleVote(battle.noid1_id)}
              style={{ cursor: hasVoted ? 'default' : 'pointer', border: '3px solid #FFD700' }}
            >
              <div className="card-glow"></div>
              <div className="image-container">
                {getImage(battle.noid1_id) && <img src={getImage(battle.noid1_id)} alt={`NOiD #${battle.noid1_id}`} />}
              </div>
              <div className="noid-info">
                <h3>NOiD #{battle.noid1_id}</h3>
                {hasVoted && (
                  <div className="vote-count"><span className="vote-label">Votes:</span><span className="vote-number">{battle.noid1_votes}</span></div>
                )}
              </div>
            </div>

            <div className="vs-divider"><div className="vs-circle"><span>VS</span></div></div>

            <div
              className={`noid-card glass-card ${hasVoted && votedFor === battle.noid2_id ? 'voted-winner' : ''} ${hasVoted && votedFor !== battle.noid2_id ? 'voted-other' : ''}`}
              onClick={() => handleVote(battle.noid2_id)}
              style={{ cursor: hasVoted ? 'default' : 'pointer', border: '3px solid #FFD700' }}
            >
              <div className="card-glow"></div>
              <div className="image-container">
                {getImage(battle.noid2_id) && <img src={getImage(battle.noid2_id)} alt={`NOiD #${battle.noid2_id}`} />}
              </div>
              <div className="noid-info">
                <h3>NOiD #{battle.noid2_id}</h3>
                {hasVoted && (
                  <div className="vote-count"><span className="vote-label">Votes:</span><span className="vote-number">{battle.noid2_votes}</span></div>
                )}
              </div>
            </div>
          </div>

          {hasVoted && <div className="voted-confirmation glass-panel"><span>✔ Vote recorded — waiting for timer...</span></div>}
        </>
      )}

      {phase === 'completed' && battle.winner_id && (
        <div className="h2h-completed-phase">
          <h2 className="h2h-phase-title">⚔️ BATTLE RESULTS</h2>
          <div className="battle-arena tournament-arena">
            <div className={`noid-card glass-card ${winnerId === battle.noid1_id ? 'voted-winner' : 'voted-other'}`}
              style={winnerId === battle.noid1_id ? { border: '4px solid #FFD700', boxShadow: '0 0 30px rgba(255,215,0,0.4)' } : {}}
            >
              <div className="card-glow"></div>
              <div className="image-container">
                {getImage(battle.noid1_id) && <img src={getImage(battle.noid1_id)} alt="" />}
              </div>
              <div className="noid-info">
                <h3>{winnerId === battle.noid1_id ? '🥇' : '🥈'} NOiD #{battle.noid1_id}</h3>
                <div className="vote-count"><span className="vote-label">Votes:</span><span className="vote-number">{battle.noid1_votes}</span></div>
              </div>
            </div>

            <div className="vs-divider">
              <div className="vs-circle">
                <span>{battle.noid1_votes} - {battle.noid2_votes}</span>
              </div>
              {battle.is_coin_flip && <span className="h2h-coinflip-badge">🪙 Coin Flip</span>}
            </div>

            <div className={`noid-card glass-card ${winnerId === battle.noid2_id ? 'voted-winner' : 'voted-other'}`}
              style={winnerId === battle.noid2_id ? { border: '4px solid #FFD700', boxShadow: '0 0 30px rgba(255,215,0,0.4)' } : {}}
            >
              <div className="card-glow"></div>
              <div className="image-container">
                {getImage(battle.noid2_id) && <img src={getImage(battle.noid2_id)} alt="" />}
              </div>
              <div className="noid-info">
                <h3>{winnerId === battle.noid2_id ? '🥇' : '🥈'} NOiD #{battle.noid2_id}</h3>
                <div className="vote-count"><span className="vote-label">Votes:</span><span className="vote-number">{battle.noid2_votes}</span></div>
              </div>
            </div>
          </div>

          <div className="h2h-share-actions">
            <button className="h2h-share-btn" onClick={() => { downloadShareImage(); shareToX(); }}>📸 Share to 𝕏</button>
            <button className="h2h-back-btn" onClick={onClose}>← Back to Lobby</button>
          </div>
        </div>
      )}

      {phase === 'loading' && <div className="h2h-loading">Loading battle...</div>}
    </div>
  );
};

const HeadToHead = ({ walletAddress, onClose, showWalletModal, onViewNoid, parentImageCache }) => {
  const [screen, setScreen] = useState('lobby');
  const [activeBattle, setActiveBattle] = useState(null);
  const { ensureImages, getImage } = useImageLoader(parentImageCache);

  return (
    <div className="h2h-container">
      <div className="h2h-nav-header glass-panel">
        <button className="back-btn" onClick={onClose}><span className="back-arrow">←</span> Back to Menu</button>
        <div className="h2h-nav-title">⚔️ Head to Head</div>
      </div>
      {screen === 'lobby' && <H2HLobby walletAddress={walletAddress} onCreateBattle={() => { if (!walletAddress) showWalletModal(); else setScreen('create'); }} onJoinBattle={(b) => { setActiveBattle(b); setScreen('battle'); }} getImage={getImage} ensureImages={ensureImages} />}
      {screen === 'create' && <CreateH2H walletAddress={walletAddress} onCancel={() => setScreen('lobby')} onCreated={(b) => { setActiveBattle(b); setScreen('battle'); }} getImage={getImage} ensureImages={ensureImages} />}
      {screen === 'battle' && activeBattle && <LiveH2H battle={activeBattle} walletAddress={walletAddress} showWalletModal={showWalletModal} getImage={getImage} ensureImages={ensureImages} onClose={() => { setActiveBattle(null); setScreen('lobby'); }} />}
    </div>
  );
};

export default HeadToHead;
