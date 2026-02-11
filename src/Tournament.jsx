import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './App';

// ============================================
// CONSTANTS
// ============================================

const CONTRACT_ADDRESS = '0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902';
const OPENSEA_API_KEY = 'f6662070d18f4d54936bdd66b94c3f11';
const TOTAL_NOIDS = 5555;

const ROUND_NAMES = {
  8: { 1: 'Quarter Finals', 2: 'Semi-Finals', 3: 'Final' },
  16: { 1: 'Pool Play 16', 2: 'Quarter Finals', 3: 'Semi-Finals', 4: 'Final' },
  32: { 1: 'Pool Play 32', 2: 'Pool Play 16', 3: 'Quarter Finals', 4: 'Semi-Finals', 5: 'Final' }
};

const TOTAL_ROUNDS = { 8: 3, 16: 4, 32: 5 };

// ============================================
// HELPER FUNCTIONS
// ============================================

const fetchNoidImage = async (tokenId, imageCache, setImageCache) => {
  if (imageCache[tokenId]) return imageCache[tokenId];
  try {
    const response = await fetch(
      `https://api.opensea.io/api/v2/chain/ethereum/contract/${CONTRACT_ADDRESS}/nfts/${tokenId}`,
      { headers: { 'x-api-key': OPENSEA_API_KEY } }
    );
    if (!response.ok) throw new Error('Failed');
    const data = await response.json();
    const url = data.nft?.image_url || data.nft?.display_image_url;
    if (url && setImageCache) {
      setImageCache(prev => ({ ...prev, [tokenId]: url }));
    }
    return url || `https://gateway.pinata.cloud/ipfs/QmcXuDARMGMv59Q4ZZuoN5rjdM9GQrmp8NjLH5PDLixgAE/${tokenId}`;
  } catch {
    return `https://gateway.pinata.cloud/ipfs/QmcXuDARMGMv59Q4ZZuoN5rjdM9GQrmp8NjLH5PDLixgAE/${tokenId}`;
  }
};

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
// TOURNAMENT HUB (Browse/Create)
// ============================================

const TournamentHub = ({ walletAddress, onClose, onViewTournament, onCreateTournament }) => {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, open, active, completed
  const [hubImages, setHubImages] = useState({});

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

      // For each tournament, get entry count
      const tourneysWithCounts = await Promise.all((data || []).map(async (t) => {
        const { count } = await supabase
          .from('tournament_entries')
          .select('*', { count: 'exact', head: true })
          .eq('tournament_id', t.id);
        return { ...t, entry_count: count || 0 };
      }));

      setTournaments(tourneysWithCounts);

      // Load winner images for completed tournaments
      tourneysWithCounts.forEach(async (t) => {
        if (t.winner_noid_id && !hubImages[t.winner_noid_id]) {
          const url = await fetchNoidImage(t.winner_noid_id, hubImages, null);
          setHubImages(prev => ({ ...prev, [t.winner_noid_id]: url }));
        }
      });
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
        <button className="create-tournament-btn" onClick={onCreateTournament}>
          + Create
        </button>
      </div>

      <div className="tournament-filters glass-panel">
        {['all', 'open', 'active', 'completed'].map(f => (
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
                {t.winner_noid_id && hubImages[t.winner_noid_id] && (
                  <img src={hubImages[t.winner_noid_id]} alt={`#${t.winner_noid_id}`} className="tl-winner-img" />
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
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. NOiDS Royal Rumble"
            className="form-input"
            maxLength={50}
          />
        </div>

        <div className="form-group">
          <label>Your Display Name (optional)</label>
          <input
            type="text"
            value={creatorName}
            onChange={(e) => setCreatorName(e.target.value)}
            placeholder={`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`}
            className="form-input"
            maxLength={30}
          />
        </div>

        <div className="form-group">
          <label>Bracket Size</label>
          <div className="option-row">
            {[8, 16, 32].map(size => (
              <button
                key={size}
                className={`option-btn ${bracketSize === size ? 'active' : ''}`}
                onClick={() => setBracketSize(size)}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Max Entries Per Player</label>
          <div className="option-row">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                className={`option-btn ${!unlimitedEntries && maxEntriesPerPlayer === n ? 'active' : ''}`}
                onClick={() => { setMaxEntriesPerPlayer(n); setUnlimitedEntries(false); }}
              >
                {n}
              </button>
            ))}
            <button
              className={`option-btn ${unlimitedEntries ? 'active' : ''}`}
              onClick={() => setUnlimitedEntries(true)}
            >
              ∞
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Round Timer</label>
          <div className="option-row">
            {[15, 30, 60].map(t => (
              <button
                key={t}
                className={`option-btn ${roundTimer === t ? 'active' : ''}`}
                onClick={() => setRoundTimer(t)}
              >
                {t}s
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Access</label>
          <div className="option-row">
            <button
              className={`option-btn ${!isGated ? 'active' : ''}`}
              onClick={() => setIsGated(false)}
            >
              🌐 Open
            </button>
            <button
              className={`option-btn ${isGated ? 'active' : ''}`}
              onClick={() => {
                setIsGated(true);
                if (!gateCode) setGateCode(generateTournamentCode());
              }}
            >
              🔒 Code-Gated
            </button>
          </div>
          {isGated && (
            <div className="gate-code-display">
              <span>Entry Code: </span>
              <strong>{gateCode}</strong>
              <button className="copy-btn" onClick={() => navigator.clipboard.writeText(gateCode)}>📋</button>
            </div>
          )}
        </div>

        <button
          className="start-btn"
          onClick={handleCreate}
          disabled={creating || !name.trim()}
        >
          {creating ? 'Creating...' : 'Create Tournament'}
        </button>
      </div>
    </div>
  );
};

// ============================================
// TOURNAMENT LOBBY (View/Join/Start)
// ============================================

const TournamentLobby = ({ tournamentId, walletAddress, onClose, onStart, getNoidImage, imageCache, setImageCache }) => {
  const [tournament, setTournament] = useState(null);
  const [entries, setEntries] = useState([]);
  const [ownedNoids, setOwnedNoids] = useState([]);
  const [loadingOwned, setLoadingOwned] = useState(false);
  const [showEntryPicker, setShowEntryPicker] = useState(false);
  const [gateInput, setGateInput] = useState('');
  const [gateUnlocked, setGateUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [entryImages, setEntryImages] = useState({});

  useEffect(() => {
    loadLobby();
    const interval = setInterval(loadLobby, 5000); // Poll for new entries
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
        // If tournament just started, trigger the onStart callback
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

      // Load images for entries
      if (e && e.length > 0) {
        e.forEach(async (entry) => {
          if (!entryImages[entry.noid_id]) {
            const url = await fetchNoidImage(entry.noid_id, imageCache, setImageCache);
            setEntryImages(prev => ({ ...prev, [entry.noid_id]: url }));
          }
        });
      }
    } catch (err) {
      console.error('Error loading lobby:', err);
    }
    setLoading(false);
  };

  const [pickerImages, setPickerImages] = useState({});

  const loadOwnedNoids = async () => {
    setLoadingOwned(true);
    const noids = await fetchOwnedNoids(walletAddress);
    setOwnedNoids(noids);
    setShowEntryPicker(true);
    setLoadingOwned(false);

    // Load images in background
    noids.forEach(async (noidId) => {
      if (!pickerImages[noidId] && !entryImages[noidId]) {
        const url = await fetchNoidImage(noidId, imageCache, setImageCache);
        setPickerImages(prev => ({ ...prev, [noidId]: url }));
      }
    });
  };

  const handleEnterNoid = async (noidId) => {
    if (!tournament) return;

    // Check if already entered
    const alreadyEntered = entries.filter(e => e.entered_by_wallet === walletAddress.toLowerCase());
    const maxEntries = tournament.max_entries_per_player;
    if (maxEntries && alreadyEntered.length >= maxEntries) {
      alert(`Max ${maxEntries} entries per player`);
      return;
    }

    // Check if NOID already in tournament
    if (entries.some(e => e.noid_id === noidId)) {
      alert(`NOID #${noidId} is already entered`);
      return;
    }

    // Check if tournament full
    if (entries.length >= tournament.bracket_size) {
      alert('Tournament is full');
      return;
    }

    try {
      const { error } = await supabase.from('tournament_entries').insert([{
        tournament_id: tournamentId,
        noid_id: noidId,
        entered_by_wallet: walletAddress.toLowerCase()
      }]);

      if (error) throw error;
      await loadLobby();

      // Auto-close picker if player hit their max or tournament is now full
      const newEntryCount = entries.length + 1;
      const newPlayerEntries = alreadyEntered.length + 1;
      if (newEntryCount >= tournament.bracket_size) {
        setShowEntryPicker(false);
      } else if (maxEntries && newPlayerEntries >= maxEntries) {
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

  const handleFillAndStart = async () => {
    if (!tournament) return;
    const remaining = tournament.bracket_size - entries.length;
    if (remaining <= 0) {
      await handleStartTournament();
      return;
    }

    if (!window.confirm(`Fill ${remaining} empty slots with random NOIDs and start?`)) return;

    try {
      // Generate random NOIDs that aren't already entered
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

      await handleStartTournament();
    } catch (err) {
      console.error('Error filling tournament:', err);
      alert('Failed to fill and start');
    }
  };

  const handleStartTournament = async () => {
    try {
      // Reload entries to get all (including just-added randoms)
      const { data: allEntries } = await supabase
        .from('tournament_entries')
        .select('*')
        .eq('tournament_id', tournamentId);

      if (!allEntries || allEntries.length !== tournament.bracket_size) {
        alert('Not enough entries to start');
        return;
      }

      // Shuffle entries for random bracket placement
      const shuffled = [...allEntries].sort(() => Math.random() - 0.5);

      // Assign seed positions
      await Promise.all(shuffled.map((entry, idx) =>
        supabase.from('tournament_entries')
          .update({ seed_position: idx })
          .eq('id', entry.id)
      ));

      // Generate all matchups for round 1
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

      // Generate empty matchups for subsequent rounds
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

      // Set first matchup of round 1 to active
      const { data: firstMatchup } = await supabase
        .from('tournament_matchups')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('round', 1)
        .eq('matchup_index', 0)
        .single();

      if (firstMatchup) {
        await supabase.from('tournament_matchups')
          .update({ status: 'active', started_at: new Date().toISOString() })
          .eq('id', firstMatchup.id);
      }

      // Update tournament status
      const now = new Date().toISOString();
      await supabase.from('tournaments')
        .update({
          status: 'active',
          started_at: now,
          current_round: 1,
          current_matchup_index: 0,
          matchup_started_at: now
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
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading tournament...</p>
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="tournament-container">
        <div className="empty-state glass-panel">
          <p>Tournament not found.</p>
          <button className="back-btn" onClick={onClose}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="tournament-container">
      <div className="tournament-header glass-panel">
        <button className="back-btn" onClick={onClose}>
          <span className="back-arrow">←</span>
          Back
        </button>
        <h2 className="tournament-title">{tournament.tournament_name}</h2>
        <div className="spacer"></div>
      </div>

      <div className="lobby-info glass-panel">
        <div className="lobby-info-row">
          <span>Created by</span>
          <strong>{tournament.creator_name || `${tournament.creator_wallet.slice(0, 6)}...${tournament.creator_wallet.slice(-4)}`}</strong>
        </div>
        <div className="lobby-info-row">
          <span>Bracket</span>
          <strong>{tournament.bracket_size} NOIDs</strong>
        </div>
        <div className="lobby-info-row">
          <span>Round Timer</span>
          <strong>{tournament.round_timer}s</strong>
        </div>
        <div className="lobby-info-row">
          <span>Max Per Player</span>
          <strong>{tournament.max_entries_per_player || '∞'}</strong>
        </div>
        <div className="lobby-info-row">
          <span>Access</span>
          <strong>{tournament.is_gated ? '🔒 Code-Gated' : '🌐 Open'}</strong>
        </div>
        <div className="lobby-info-row">
          <span>Entries</span>
          <strong className="entries-count">{entries.length} / {tournament.bracket_size}</strong>
        </div>
      </div>

      {/* Gate code input for private tournaments */}
      {needsGateCode && (
        <div className="gate-input-section glass-panel">
          <p>This tournament requires an entry code:</p>
          <div className="gate-input-row">
            <input
              type="text"
              value={gateInput}
              onChange={(e) => setGateInput(e.target.value)}
              placeholder="Enter code"
              className="form-input"
              maxLength={6}
            />
            <button
              className="option-btn active"
              onClick={() => {
                if (gateInput === tournament.gate_code) {
                  setGateUnlocked(true);
                } else {
                  alert('Incorrect code');
                }
              }}
            >
              Unlock
            </button>
          </div>
        </div>
      )}

      {/* Entry slots */}
      <div className="lobby-entries glass-panel">
        <h3 className="section-title">Bracket Slots</h3>
        <div className="entry-grid">
          {Array.from({ length: tournament.bracket_size }).map((_, idx) => {
            const entry = entries[idx];
            const isMyEntry = entry && entry.entered_by_wallet === walletAddress?.toLowerCase();
            return (
              <div key={idx} className={`entry-slot ${entry ? 'filled' : 'empty'}`}>
                {entry ? (
                  <>
                    <img
                      src={entryImages[entry.noid_id] || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect fill="%23111" width="60" height="60"/></svg>'}
                      alt={`#${entry.noid_id}`}
                      className="entry-slot-img"
                    />
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

      {/* Action buttons */}
      <div className="lobby-actions">
        {canEnter && !needsGateCode && walletAddress && (
          <button className="start-btn" onClick={loadOwnedNoids} disabled={loadingOwned}>
            {loadingOwned ? 'Loading NOIDs...' : '+ Enter Your NOIDs'}
          </button>
        )}

        {isCreator && tournament.status === 'open' && (
          <button
            className="start-btn fill-start-btn"
            onClick={isFull ? handleStartTournament : handleFillAndStart}
          >
            {isFull ? '🚀 Start Tournament' : `🚀 Fill & Start (${tournament.bracket_size - entries.length} random)`}
          </button>
        )}
      </div>

      {/* NOID picker modal */}
      {showEntryPicker && (
        <div className="modal-overlay" onClick={() => setShowEntryPicker(false)}>
          <div className="noid-picker-modal glass-panel" onClick={e => e.stopPropagation()}>
            <div className="picker-header">
              <h3>Select NOIDs to Enter</h3>
              <button className="modal-close" onClick={() => setShowEntryPicker(false)}>×</button>
            </div>
            <div className="picker-info">
              {tournament.max_entries_per_player
                ? `You can enter ${tournament.max_entries_per_player - myEntries.length} more`
                : 'Unlimited entries'}
            </div>
            <div className="picker-grid">
              {ownedNoids.length === 0 ? (
                <p className="picker-empty">No NOIDs found in your wallet</p>
              ) : (
                ownedNoids.map(noidId => {
                  const alreadyIn = entries.some(e => e.noid_id === noidId);
                  const atLimit = tournament.max_entries_per_player && myEntries.length >= tournament.max_entries_per_player;
                  const imgUrl = pickerImages[noidId] || entryImages[noidId];
                  return (
                    <button
                      key={noidId}
                      className={`picker-item has-image ${alreadyIn ? 'entered' : ''}`}
                      onClick={() => !alreadyIn && !atLimit && handleEnterNoid(noidId)}
                      disabled={alreadyIn || atLimit}
                    >
                      {imgUrl && <img src={imgUrl} alt={`#${noidId}`} className="picker-item-img" />}
                      <span>#{noidId}</span>
                      {alreadyIn && <span className="picker-check">✓</span>}
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
// LIVE TOURNAMENT (Active battle view)
// ============================================

const LiveTournament = ({ tournamentId, walletAddress, onClose, imageCache, setImageCache, onViewNoid }) => {
  const [tournament, setTournament] = useState(null);
  const [matchups, setMatchups] = useState([]);
  const [activeMatchup, setActiveMatchup] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [hasVoted, setHasVoted] = useState(false);
  const [votedFor, setVotedFor] = useState(null);
  const [isVoting, setIsVoting] = useState(false);
  const [noid1Image, setNoid1Image] = useState(null);
  const [noid2Image, setNoid2Image] = useState(null);
  const [showBracket, setShowBracket] = useState(false);
  const [roundTransition, setRoundTransition] = useState(null);
  const [tournamentComplete, setTournamentComplete] = useState(false);
  const timerRef = useRef(null);
  const pollRef = useRef(null);

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

      if (remaining <= 0) {
        clearInterval(timerRef.current);
        // Timer expired — the server/creator advances the matchup
        // We just poll for the update
      }
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

      // Find active matchup
      const active = (allMatchups || []).find(m => m.status === 'active');
      if (active && active.id !== activeMatchup?.id) {
        setActiveMatchup(active);
        setHasVoted(false);
        setVotedFor(null);

        // Load images
        const [img1, img2] = await Promise.all([
          fetchNoidImage(active.noid1_id, imageCache, setImageCache),
          fetchNoidImage(active.noid2_id, imageCache, setImageCache)
        ]);
        setNoid1Image(img1);
        setNoid2Image(img2);

        // Check if already voted
        if (walletAddress) {
          const { data: existingVote } = await supabase
            .from('tournament_votes')
            .select('voted_for_noid_id')
            .eq('matchup_id', active.id)
            .eq('voter_wallet', walletAddress.toLowerCase())
            .single();

          if (existingVote) {
            setHasVoted(true);
            setVotedFor(existingVote.voted_for_noid_id);
          }
        }
      } else if (active) {
        // Update vote counts on existing active matchup
        setActiveMatchup(active);
      }

      // Check if timer expired on active matchup and we're the creator
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
    if (hasVoted || isVoting || !activeMatchup || !walletAddress) return;

    setIsVoting(true);
    setVotedFor(noidId);

    try {
      // Record vote
      const { error: voteError } = await supabase.from('tournament_votes').insert([{
        matchup_id: activeMatchup.id,
        tournament_id: tournamentId,
        voter_wallet: walletAddress.toLowerCase(),
        voted_for_noid_id: noidId
      }]);

      if (voteError) {
        if (voteError.code === '23505') {
          // Already voted (unique constraint)
          setHasVoted(true);
          setIsVoting(false);
          return;
        }
        throw voteError;
      }

      // Update vote count
      const field = noidId === activeMatchup.noid1_id ? 'noid1_votes' : 'noid2_votes';
      const firstVoteField = noidId === activeMatchup.noid1_id ? 'noid1_first_vote_at' : 'noid2_first_vote_at';

      const updateData = { [field]: activeMatchup[field] + 1 };

      // Set first vote timestamp if not already set
      if (!activeMatchup[firstVoteField]) {
        updateData[firstVoteField] = new Date().toISOString();
      }

      await supabase.from('tournament_matchups')
        .update(updateData)
        .eq('id', activeMatchup.id);

      setHasVoted(true);
    } catch (err) {
      console.error('Error voting:', err);
      setVotedFor(null);
    }
    setIsVoting(false);
  };

  const advanceMatchup = async (completedMatchup, allMatchups, t) => {
    try {
      // Determine winner
      let winnerId;
      let isCoinFlip = false;

      if (completedMatchup.noid1_votes > completedMatchup.noid2_votes) {
        winnerId = completedMatchup.noid1_id;
      } else if (completedMatchup.noid2_votes > completedMatchup.noid1_votes) {
        winnerId = completedMatchup.noid2_id;
      } else if (completedMatchup.noid1_votes === 0 && completedMatchup.noid2_votes === 0) {
        // 0-0 coin flip
        winnerId = Math.random() < 0.5 ? completedMatchup.noid1_id : completedMatchup.noid2_id;
        isCoinFlip = true;
      } else {
        // Tied but not 0-0 — first vote wins
        if (completedMatchup.noid1_first_vote_at && completedMatchup.noid2_first_vote_at) {
          winnerId = new Date(completedMatchup.noid1_first_vote_at) <= new Date(completedMatchup.noid2_first_vote_at)
            ? completedMatchup.noid1_id
            : completedMatchup.noid2_id;
        } else if (completedMatchup.noid1_first_vote_at) {
          winnerId = completedMatchup.noid1_id;
        } else {
          winnerId = completedMatchup.noid2_id;
        }
      }

      const loserId = winnerId === completedMatchup.noid1_id ? completedMatchup.noid2_id : completedMatchup.noid1_id;

      // Mark matchup completed
      await supabase.from('tournament_matchups')
        .update({
          winner_id: winnerId,
          is_coin_flip: isCoinFlip,
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', completedMatchup.id);

      // Record in stats (skip coin flips)
      if (!isCoinFlip) {
        // Import recordCompleteBattle indirectly — we call it via supabase
        // Instead, we replicate the essential stats recording
        await recordTournamentBattle(completedMatchup.noid1_id, completedMatchup.noid2_id, winnerId, walletAddress);
      }

      // Find next matchup in current round
      const currentRoundMatchups = allMatchups
        .filter(m => m.round === completedMatchup.round)
        .sort((a, b) => a.matchup_index - b.matchup_index);

      const nextInRound = currentRoundMatchups.find(
        m => m.matchup_index > completedMatchup.matchup_index && m.status === 'pending'
      );

      if (nextInRound) {
        // Advance winner to next round bracket slot
        await feedWinnerToNextRound(winnerId, completedMatchup, allMatchups, t);

        // Activate next matchup in same round
        const now = new Date().toISOString();
        await supabase.from('tournament_matchups')
          .update({ status: 'active', started_at: now })
          .eq('id', nextInRound.id);

        await supabase.from('tournaments')
          .update({
            current_matchup_index: nextInRound.matchup_index,
            matchup_started_at: now
          })
          .eq('id', tournamentId);
      } else {
        // Round is done — feed winner and check if tournament is over
        await feedWinnerToNextRound(winnerId, completedMatchup, allMatchups, t);

        const totalRounds = TOTAL_ROUNDS[t.bracket_size];
        if (completedMatchup.round >= totalRounds) {
          // Tournament complete!
          await completeTournament(t, winnerId, allMatchups, completedMatchup, loserId);
        } else {
          // Start next round
          const nextRound = completedMatchup.round + 1;
          const nextRoundMatchups = allMatchups
            .filter(m => m.round === nextRound)
            .sort((a, b) => a.matchup_index - b.matchup_index);

          if (nextRoundMatchups.length > 0) {
            // Brief transition
            setRoundTransition(getRoundName(t.bracket_size, nextRound));
            setTimeout(() => setRoundTransition(null), 2000);

            const now = new Date().toISOString();
            await supabase.from('tournament_matchups')
              .update({ status: 'active', started_at: now })
              .eq('id', nextRoundMatchups[0].id);

            await supabase.from('tournaments')
              .update({
                current_round: nextRound,
                current_matchup_index: 0,
                matchup_started_at: now
              })
              .eq('id', tournamentId);
          }
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

    const nextMatchup = allMatchups.find(
      m => m.round === nextRound && m.matchup_index === nextMatchupIndex
    );

    if (nextMatchup) {
      await supabase.from('tournament_matchups')
        .update({ [slot]: winnerId })
        .eq('id', nextMatchup.id);
    }
  };

  const completeTournament = async (t, winnerId, allMatchups, finalMatchup, loserId) => {
    try {
      // Determine 3rd place: the two semi-final losers
      // For simplicity, 3rd place = both semi-final losers, but we pick one
      const totalRounds = TOTAL_ROUNDS[t.bracket_size];
      const semiFinalRound = totalRounds - 1;
      const semiFinals = allMatchups.filter(m => m.round === semiFinalRound && m.status === 'completed');
      let thirdPlaceId = null;
      for (const sf of semiFinals) {
        const sfLoser = sf.winner_id === sf.noid1_id ? sf.noid2_id : sf.noid1_id;
        if (sfLoser !== loserId) {
          thirdPlaceId = sfLoser;
          break;
        }
      }

      await supabase.from('tournaments')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          winner_noid_id: winnerId,
          runner_up_noid_id: loserId,
          third_place_noid_id: thirdPlaceId
        })
        .eq('id', tournamentId);

      // Record tournament results
      const results = [
        { tournament_id: tournamentId, noid_id: winnerId, placement: 1, rounds_survived: totalRounds },
        { tournament_id: tournamentId, noid_id: loserId, placement: 2, rounds_survived: totalRounds }
      ];
      if (thirdPlaceId) {
        results.push({ tournament_id: tournamentId, noid_id: thirdPlaceId, placement: 3, rounds_survived: totalRounds - 1 });
      }

      await supabase.from('tournament_results').insert(results);

      setTournamentComplete(true);
    } catch (err) {
      console.error('Error completing tournament:', err);
    }
  };

  const recordTournamentBattle = async (noid1Id, noid2Id, winnerId, userId) => {
    // Replicate the core stats recording from App.jsx
    try {
      const loserId = winnerId === noid1Id ? noid2Id : noid1Id;

      // Record battle history
      await supabase.from('battle_history').insert([{
        noid1_id: noid1Id,
        noid2_id: noid2Id,
        winner_id: winnerId,
        loser_id: loserId,
        game_mode: 'tournament',
        user_id: userId || 'tournament',
        is_daily_battle: false
      }]);

      // Update noid_stats for both
      for (const [noidId, won] of [[noid1Id, winnerId === noid1Id], [noid2Id, winnerId === noid2Id]]) {
        const { data: current } = await supabase
          .from('noid_stats')
          .select('*')
          .eq('noid_id', noidId)
          .single();

        const now = new Date().toISOString();

        if (!current) {
          await supabase.from('noid_stats').insert([{
            noid_id: noidId,
            total_battles: 1,
            total_wins: won ? 1 : 0,
            total_losses: won ? 0 : 1,
            current_streak: won ? 1 : -1,
            best_streak: won ? 1 : 0,
            first_battle_date: now,
            last_battle_date: now,
            last_win_date: won ? now : null,
            last_loss_date: won ? null : now,
            underdog_wins: 0
          }]);
        } else {
          const newStreak = won
            ? Math.max(current.current_streak, 0) + 1
            : Math.min(current.current_streak, 0) - 1;
          const newBestStreak = won ? Math.max(current.best_streak, newStreak) : current.best_streak;

          await supabase.from('noid_stats')
            .update({
              total_battles: current.total_battles + 1,
              total_wins: current.total_wins + (won ? 1 : 0),
              total_losses: current.total_losses + (won ? 0 : 1),
              current_streak: newStreak,
              best_streak: newBestStreak,
              last_battle_date: now,
              last_win_date: won ? now : current.last_win_date,
              last_loss_date: won ? current.last_loss_date : now,
              updated_at: now
            })
            .eq('noid_id', noidId);
        }

        // Update game mode stats
        const { data: modeStats } = await supabase
          .from('noid_gamemode_stats')
          .select('*')
          .eq('noid_id', noidId)
          .eq('game_mode', 'tournament')
          .single();

        if (!modeStats) {
          await supabase.from('noid_gamemode_stats').insert([{
            noid_id: noidId,
            game_mode: 'tournament',
            battles: 1,
            wins: won ? 1 : 0,
            losses: won ? 0 : 1
          }]);
        } else {
          await supabase.from('noid_gamemode_stats')
            .update({
              battles: modeStats.battles + 1,
              wins: modeStats.wins + (won ? 1 : 0),
              losses: modeStats.losses + (won ? 0 : 1)
            })
            .eq('noid_id', noidId)
            .eq('game_mode', 'tournament');
        }
      }

      // Update head-to-head and beaten tracking
      const losId = winnerId === noid1Id ? noid2Id : noid1Id;
      const now = new Date().toISOString();

      // H2H winner
      const { data: h2hW } = await supabase.from('head_to_head')
        .select('*').eq('noid_id', winnerId).eq('opponent_id', losId).single();
      if (!h2hW) {
        await supabase.from('head_to_head').insert([{ noid_id: winnerId, opponent_id: losId, battles: 1, wins: 1, losses: 0, last_battle_date: now, last_winner: winnerId }]);
      } else {
        await supabase.from('head_to_head').update({ battles: h2hW.battles + 1, wins: h2hW.wins + 1, last_battle_date: now, last_winner: winnerId }).eq('noid_id', winnerId).eq('opponent_id', losId);
      }

      // H2H loser
      const { data: h2hL } = await supabase.from('head_to_head')
        .select('*').eq('noid_id', losId).eq('opponent_id', winnerId).single();
      if (!h2hL) {
        await supabase.from('head_to_head').insert([{ noid_id: losId, opponent_id: winnerId, battles: 1, wins: 0, losses: 1, last_battle_date: now, last_winner: winnerId }]);
      } else {
        await supabase.from('head_to_head').update({ battles: h2hL.battles + 1, losses: h2hL.losses + 1, last_battle_date: now, last_winner: winnerId }).eq('noid_id', losId).eq('opponent_id', winnerId);
      }

    } catch (err) {
      console.error('Error recording tournament battle stats:', err);
    }
  };

  // ---- RENDER ----

  if (!tournament) {
    return (
      <div className="tournament-container">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading tournament...</p>
        </div>
      </div>
    );
  }

  if (showBracket) {
    return (
      <TournamentBracket
        tournament={tournament}
        matchups={matchups}
        imageCache={imageCache}
        setImageCache={setImageCache}
        onClose={() => setShowBracket(false)}
        onViewNoid={onViewNoid}
      />
    );
  }

  if (tournamentComplete) {
    const getPodiumImg = (noidId) => imageCache[noidId] || null;
    // Load podium images if not cached
    [tournament.winner_noid_id, tournament.runner_up_noid_id, tournament.third_place_noid_id].forEach(id => {
      if (id && !imageCache[id]) {
        fetchNoidImage(id, imageCache, setImageCache);
      }
    });

    return (
      <div className="tournament-container">
        <div className="tournament-header glass-panel">
          <button className="back-btn" onClick={onClose}>
            <span className="back-arrow">←</span>
            Back
          </button>
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
                {getPodiumImg(tournament.winner_noid_id) && (
                  <img src={getPodiumImg(tournament.winner_noid_id)} alt="" className="podium-img" />
                )}
                <span className="podium-noid">NOID #{tournament.winner_noid_id}</span>
                <span className="podium-label">Champion</span>
              </div>
            )}
            {tournament.runner_up_noid_id && (
              <div className="podium-place second" onClick={() => onViewNoid && onViewNoid(tournament.runner_up_noid_id)} style={{ cursor: onViewNoid ? 'pointer' : 'default' }}>
                <span className="podium-medal">🥈</span>
                {getPodiumImg(tournament.runner_up_noid_id) && (
                  <img src={getPodiumImg(tournament.runner_up_noid_id)} alt="" className="podium-img" />
                )}
                <span className="podium-noid">NOID #{tournament.runner_up_noid_id}</span>
                <span className="podium-label">Runner-up</span>
              </div>
            )}
            {tournament.third_place_noid_id && (
              <div className="podium-place third" onClick={() => onViewNoid && onViewNoid(tournament.third_place_noid_id)} style={{ cursor: onViewNoid ? 'pointer' : 'default' }}>
                <span className="podium-medal">🥉</span>
                {getPodiumImg(tournament.third_place_noid_id) && (
                  <img src={getPodiumImg(tournament.third_place_noid_id)} alt="" className="podium-img" />
                )}
                <span className="podium-noid">NOID #{tournament.third_place_noid_id}</span>
                <span className="podium-label">3rd Place</span>
              </div>
            )}
          </div>
          <div className="complete-actions">
            <button className="start-btn" onClick={() => setShowBracket(true)}>View Bracket</button>
            <button className="back-btn" onClick={onClose}>Back to Tournaments</button>
          </div>
        </div>
      </div>
    );
  }

  if (roundTransition) {
    return (
      <div className="tournament-container">
        <div className="round-transition">
          <h2>{roundTransition}</h2>
          <p>Next round starting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tournament-container">
      <div className="tournament-header glass-panel">
        <button className="back-btn" onClick={onClose}>
          <span className="back-arrow">←</span>
          Back
        </button>
        <h2 className="tournament-title">{tournament.tournament_name}</h2>
        <button className="bracket-toggle-btn" onClick={() => setShowBracket(true)}>
          📊 Bracket
        </button>
      </div>

      {/* Round info bar */}
      <div className="live-round-info glass-panel">
        <span className="round-name-live">
          {activeMatchup ? activeMatchup.round_name : 'Waiting...'}
        </span>
        {activeMatchup && (
          <span className="matchup-counter">
            Match {activeMatchup.matchup_index + 1} of {matchups.filter(m => m.round === activeMatchup.round).length}
          </span>
        )}
      </div>

      {/* Timer */}
      {activeMatchup && (
        <div className={`live-timer ${timeLeft <= 5 ? 'urgent' : ''}`}>
          <div className="timer-number">{timeLeft}</div>
          <div className="timer-label">seconds</div>
        </div>
      )}

      {/* Battle cards */}
      {activeMatchup ? (
        <div className="battle-arena tournament-arena">
          <div
            className={`noid-card glass-card ${hasVoted && votedFor === activeMatchup.noid1_id ? 'voted-winner' : ''} ${hasVoted && votedFor !== activeMatchup.noid1_id && hasVoted ? 'voted-other' : ''}`}
            onClick={() => handleVote(activeMatchup.noid1_id)}
            style={{ cursor: hasVoted ? 'default' : 'pointer' }}
          >
            <div className="card-glow"></div>
            <div className="image-container">
              {noid1Image && <img src={noid1Image} alt={`NOID #${activeMatchup.noid1_id}`} />}
            </div>
            <div className="noid-info">
              <h3>NOID #{activeMatchup.noid1_id}</h3>
              {hasVoted && (
                <div className="vote-count">
                  <span className="vote-label">Votes:</span>
                  <span className="vote-number">{activeMatchup.noid1_votes}</span>
                </div>
              )}
            </div>
          </div>

          <div className="vs-divider">
            <div className="vs-circle"><span>VS</span></div>
          </div>

          <div
            className={`noid-card glass-card ${hasVoted && votedFor === activeMatchup.noid2_id ? 'voted-winner' : ''} ${hasVoted && votedFor !== activeMatchup.noid2_id && hasVoted ? 'voted-other' : ''}`}
            onClick={() => handleVote(activeMatchup.noid2_id)}
            style={{ cursor: hasVoted ? 'default' : 'pointer' }}
          >
            <div className="card-glow"></div>
            <div className="image-container">
              {noid2Image && <img src={noid2Image} alt={`NOID #${activeMatchup.noid2_id}`} />}
            </div>
            <div className="noid-info">
              <h3>NOID #{activeMatchup.noid2_id}</h3>
              {hasVoted && (
                <div className="vote-count">
                  <span className="vote-label">Votes:</span>
                  <span className="vote-number">{activeMatchup.noid2_votes}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Waiting for next matchup...</p>
        </div>
      )}

      {hasVoted && (
        <div className="voted-confirmation glass-panel">
          <span>✓ Vote recorded — waiting for timer...</span>
        </div>
      )}
    </div>
  );
};

// ============================================
// BRACKET VIEW
// ============================================

const TournamentBracket = ({ tournament, matchups, imageCache, setImageCache, onClose, onViewNoid }) => {
  const totalRounds = TOTAL_ROUNDS[tournament.bracket_size];
  const [bracketImages, setBracketImages] = useState({});

  useEffect(() => {
    // Collect all unique NOID IDs from matchups
    const noidIds = new Set();
    matchups.forEach(m => {
      if (m.noid1_id) noidIds.add(m.noid1_id);
      if (m.noid2_id) noidIds.add(m.noid2_id);
    });
    // Load images
    noidIds.forEach(async (noidId) => {
      if (!bracketImages[noidId] && !imageCache[noidId]) {
        const url = await fetchNoidImage(noidId, imageCache, setImageCache);
        setBracketImages(prev => ({ ...prev, [noidId]: url }));
      }
    });
  }, [matchups]);

  const getNoidImg = (noidId) => bracketImages[noidId] || imageCache[noidId] || null;

  const getMatchupsByRound = (round) => {
    return matchups
      .filter(m => m.round === round)
      .sort((a, b) => a.matchup_index - b.matchup_index);
  };

  return (
    <div className="tournament-container">
      <div className="tournament-header glass-panel">
        <button className="back-btn" onClick={onClose}>
          <span className="back-arrow">←</span>
          Back
        </button>
        <h2 className="tournament-title">{tournament.tournament_name} — Bracket</h2>
        <div className="spacer"></div>
      </div>

      <div className="bracket-view">
        <div className="bracket-scroll">
          {Array.from({ length: totalRounds }).map((_, rIdx) => {
            const round = rIdx + 1;
            const roundMatchups = getMatchupsByRound(round);
            const roundName = getRoundName(tournament.bracket_size, round);

            return (
              <div key={round} className={`bracket-round ${roundName === 'Quarter Finals' || roundName === 'Semi-Finals' || roundName === 'Final' ? 'bracket-round-late' : ''} ${roundName === 'Semi-Finals' ? 'bracket-round-semis' : ''} ${roundName === 'Final' ? 'bracket-round-final' : ''}`}>
                <div className="bracket-round-header">{roundName}</div>
                <div className="bracket-matchups">
                  {roundMatchups.map(m => (
                    <div key={m.id} className={`bracket-matchup ${m.status}`}>
                      <div className={`bracket-noid ${m.winner_id === m.noid1_id ? 'winner' : ''} ${m.winner_id === m.noid2_id ? 'loser' : ''}`}>
                        {m.noid1_id && getNoidImg(m.noid1_id) && (
                          <img src={getNoidImg(m.noid1_id)} alt="" className="bracket-noid-img" />
                        )}
                        <span 
                          className="bracket-noid-id clickable"
                          onClick={(e) => { if (m.noid1_id && onViewNoid) { e.stopPropagation(); onViewNoid(m.noid1_id); } }}
                        >{m.noid1_id ? `#${m.noid1_id}` : 'TBD'}</span>
                        {m.status === 'completed' && <span className="bracket-votes">{m.noid1_votes}</span>}
                      </div>
                      <div className={`bracket-noid ${m.winner_id === m.noid2_id ? 'winner' : ''} ${m.winner_id === m.noid1_id ? 'loser' : ''}`}>
                        {m.noid2_id && getNoidImg(m.noid2_id) && (
                          <img src={getNoidImg(m.noid2_id)} alt="" className="bracket-noid-img" />
                        )}
                        <span 
                          className="bracket-noid-id clickable"
                          onClick={(e) => { if (m.noid2_id && onViewNoid) { e.stopPropagation(); onViewNoid(m.noid2_id); } }}
                        >{m.noid2_id ? `#${m.noid2_id}` : 'TBD'}</span>
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

const Tournament = ({ walletAddress, onClose, showWalletModal, onViewNoid }) => {
  const [tournamentView, setTournamentView] = useState('hub'); // hub, create, lobby, live
  const [activeTournamentId, setActiveTournamentId] = useState(null);
  const [imageCache, setImageCache] = useState({});

  const handleViewTournament = async (tournamentId) => {
    // Check tournament status to decide which view
    const { data: t } = await supabase
      .from('tournaments')
      .select('status')
      .eq('id', tournamentId)
      .single();

    setActiveTournamentId(tournamentId);
    if (t?.status === 'active' || t?.status === 'completed') {
      setTournamentView('live');
    } else {
      setTournamentView('lobby');
    }
  };

  if (!walletAddress) {
    return (
      <div className="tournament-container">
        <div className="tournament-header glass-panel">
          <button className="back-btn" onClick={onClose}>
            <span className="back-arrow">←</span>
            Back to Menu
          </button>
          <h2 className="tournament-title">🏟️ Tournaments</h2>
          <div className="spacer"></div>
        </div>
        <div className="empty-state glass-panel">
          <p>Connect your wallet to access tournaments.</p>
          <button className="start-btn" onClick={showWalletModal}>Connect Wallet</button>
        </div>
      </div>
    );
  }

  switch (tournamentView) {
    case 'hub':
      return (
        <TournamentHub
          walletAddress={walletAddress}
          onClose={onClose}
          onViewTournament={handleViewTournament}
          onCreateTournament={() => setTournamentView('create')}
        />
      );
    case 'create':
      return (
        <CreateTournament
          walletAddress={walletAddress}
          onClose={() => setTournamentView('hub')}
          onCreated={(id) => {
            setActiveTournamentId(id);
            setTournamentView('lobby');
          }}
        />
      );
    case 'lobby':
      return (
        <TournamentLobby
          tournamentId={activeTournamentId}
          walletAddress={walletAddress}
          onClose={() => setTournamentView('hub')}
          onStart={(id) => {
            setActiveTournamentId(id);
            setTournamentView('live');
          }}
          imageCache={imageCache}
          setImageCache={setImageCache}
        />
      );
    case 'live':
      return (
        <LiveTournament
          tournamentId={activeTournamentId}
          walletAddress={walletAddress}
          onClose={() => setTournamentView('hub')}
          imageCache={imageCache}
          setImageCache={setImageCache}
          onViewNoid={onViewNoid}
        />
      );
    default:
      return null;
  }
};

export default Tournament;
