import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import './App.css';

// Supabase configuration
const supabaseUrl = 'https://jvmddbqxhfaicyctmmvt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2bWRkYnF4aGZhaWN5Y3RtbXZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY4MDc5NjYsImV4cCI6MjA1MjM4Mzk2Nn0.59rhWuZ3r93r5YBxhcKYVGaNgy6NykDFqIpJbSCWbBo';
const supabase = createClient(supabaseUrl, supabaseKey);

const TOTAL_NOIDS = 5555;
const DAILY_VOTE_LIMIT = 55;

// ============================================
// STATS TRACKING FUNCTIONS (Inline)
// ============================================

async function recordCompleteBattle({
  noid1Id,
  noid2Id,
  winnerId,
  gameMode,
  userId,
  isDailyBattle = false,
  totalVotes = null,
  voteMargin = null
}) {
  try {
    const loserId = winnerId === noid1Id ? noid2Id : noid1Id;
    
    // Get current ranks
    const { data: noid1Data } = await supabase
      .from('noid_stats')
      .select('current_rank')
      .eq('noid_id', noid1Id)
      .single();
    
    const { data: noid2Data } = await supabase
      .from('noid_stats')
      .select('current_rank')
      .eq('noid_id', noid2Id)
      .single();
    
    const noid1Rank = noid1Data?.current_rank || null;
    const noid2Rank = noid2Data?.current_rank || null;
    
    const rankDifference = Math.abs((noid1Rank || 9999) - (noid2Rank || 9999));
    const wasUpset = (
      (winnerId === noid1Id && noid1Rank > noid2Rank) ||
      (winnerId === noid2Id && noid2Rank > noid1Rank)
    );
    const wasUnderdogWin = wasUpset && rankDifference >= 50;
    
    // Record battle history
    await supabase.from('battle_history').insert([{
      noid1_id: noid1Id,
      noid2_id: noid2Id,
      winner_id: winnerId,
      loser_id: loserId,
      game_mode: gameMode,
      noid1_rank_before: noid1Rank,
      noid2_rank_before: noid2Rank,
      was_upset: wasUpset,
      was_underdog_win: wasUnderdogWin,
      rank_difference: rankDifference,
      user_id: userId,
      is_daily_battle: isDailyBattle,
      total_votes: totalVotes,
      vote_margin: voteMargin
    }]);
    
    // Update both NOiDs
    await Promise.all([
      updateNoidStats(noid1Id, winnerId === noid1Id, wasUnderdogWin && winnerId === noid1Id),
      updateNoidStats(noid2Id, winnerId === noid2Id, wasUnderdogWin && winnerId === noid2Id)
    ]);
    
    // Update head-to-head
    await updateHeadToHead(winnerId, loserId);
    
    // Update beaten tracking
    await updateBeatenTracking(winnerId, loserId);
    
    // Update game mode stats
    await Promise.all([
      updateGameModeStats(noid1Id, gameMode, winnerId === noid1Id),
      updateGameModeStats(noid2Id, gameMode, winnerId === noid2Id)
    ]);
    
    console.log('✅ Battle recorded successfully');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Error recording battle:', error);
    return { success: false, error };
  }
}

async function updateNoidStats(noidId, won, wasUnderdogWin = false) {
  try {
    const { data: currentStats } = await supabase
      .from('noid_stats')
      .select('*')
      .eq('noid_id', noidId)
      .single();
    
    const now = new Date().toISOString();
    
    if (!currentStats) {
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
        underdog_wins: wasUnderdogWin ? 1 : 0
      }]);
    } else {
      const newStreak = won 
        ? Math.max(currentStats.current_streak, 0) + 1 
        : Math.min(currentStats.current_streak, 0) - 1;
      
      const newBestStreak = won 
        ? Math.max(currentStats.best_streak, newStreak)
        : currentStats.best_streak;
      
      await supabase
        .from('noid_stats')
        .update({
          total_battles: currentStats.total_battles + 1,
          total_wins: currentStats.total_wins + (won ? 1 : 0),
          total_losses: currentStats.total_losses + (won ? 0 : 1),
          current_streak: newStreak,
          best_streak: newBestStreak,
          last_battle_date: now,
          last_win_date: won ? now : currentStats.last_win_date,
          last_loss_date: won ? currentStats.last_loss_date : now,
          underdog_wins: currentStats.underdog_wins + (wasUnderdogWin ? 1 : 0),
          updated_at: now
        })
        .eq('noid_id', noidId);
    }
  } catch (error) {
    console.error('Error updating noid stats:', error);
  }
}

async function updateHeadToHead(winnerId, loserId) {
  try {
    const now = new Date().toISOString();
    
    // Winner's record
    const { data: winnerRecord } = await supabase
      .from('head_to_head')
      .select('*')
      .eq('noid_id', winnerId)
      .eq('opponent_id', loserId)
      .single();
    
    if (!winnerRecord) {
      await supabase.from('head_to_head').insert([{
        noid_id: winnerId,
        opponent_id: loserId,
        battles: 1,
        wins: 1,
        losses: 0,
        last_battle_date: now,
        last_winner: winnerId
      }]);
    } else {
      await supabase
        .from('head_to_head')
        .update({
          battles: winnerRecord.battles + 1,
          wins: winnerRecord.wins + 1,
          last_battle_date: now,
          last_winner: winnerId
        })
        .eq('noid_id', winnerId)
        .eq('opponent_id', loserId);
    }
    
    // Loser's record
    const { data: loserRecord } = await supabase
      .from('head_to_head')
      .select('*')
      .eq('noid_id', loserId)
      .eq('opponent_id', winnerId)
      .single();
    
    if (!loserRecord) {
      await supabase.from('head_to_head').insert([{
        noid_id: loserId,
        opponent_id: winnerId,
        battles: 1,
        wins: 0,
        losses: 1,
        last_battle_date: now,
        last_winner: winnerId
      }]);
    } else {
      await supabase
        .from('head_to_head')
        .update({
          battles: loserRecord.battles + 1,
          losses: loserRecord.losses + 1,
          last_battle_date: now,
          last_winner: winnerId
        })
        .eq('noid_id', loserId)
        .eq('opponent_id', winnerId);
    }
  } catch (error) {
    console.error('Error updating head-to-head:', error);
  }
}

async function updateBeatenTracking(winnerId, loserId) {
  try {
    const now = new Date().toISOString();
    
    // Winner's "beaten" list
    const { data: beatenRecord } = await supabase
      .from('noid_beaten')
      .select('*')
      .eq('noid_id', winnerId)
      .eq('beaten_id', loserId)
      .single();
    
    if (!beatenRecord) {
      await supabase.from('noid_beaten').insert([{
        noid_id: winnerId,
        beaten_id: loserId,
        times_beaten: 1,
        last_beaten_date: now
      }]);
    } else {
      await supabase
        .from('noid_beaten')
        .update({
          times_beaten: beatenRecord.times_beaten + 1,
          last_beaten_date: now
        })
        .eq('noid_id', winnerId)
        .eq('beaten_id', loserId);
    }
    
    // Loser's "beaten by" list
    const { data: beatenByRecord } = await supabase
      .from('noid_beaten_by')
      .select('*')
      .eq('noid_id', loserId)
      .eq('beaten_by_id', winnerId)
      .single();
    
    if (!beatenByRecord) {
      await supabase.from('noid_beaten_by').insert([{
        noid_id: loserId,
        beaten_by_id: winnerId,
        times_beaten: 1,
        last_beaten_date: now
      }]);
    } else {
      await supabase
        .from('noid_beaten_by')
        .update({
          times_beaten: beatenByRecord.times_beaten + 1,
          last_beaten_date: now
        })
        .eq('noid_id', loserId)
        .eq('beaten_by_id', winnerId);
    }
  } catch (error) {
    console.error('Error updating beaten tracking:', error);
  }
}

async function updateGameModeStats(noidId, gameMode, won) {
  try {
    const { data: existing } = await supabase
      .from('noid_gamemode_stats')
      .select('*')
      .eq('noid_id', noidId)
      .eq('game_mode', gameMode)
      .single();
    
    if (!existing) {
      await supabase.from('noid_gamemode_stats').insert([{
        noid_id: noidId,
        game_mode: gameMode,
        battles: 1,
        wins: won ? 1 : 0,
        losses: won ? 0 : 1
      }]);
    } else {
      await supabase
        .from('noid_gamemode_stats')
        .update({
          battles: existing.battles + 1,
          wins: existing.wins + (won ? 1 : 0),
          losses: existing.losses + (won ? 0 : 1)
        })
        .eq('noid_id', noidId)
        .eq('game_mode', gameMode);
    }
  } catch (error) {
    console.error('Error updating game mode stats:', error);
  }
}

// ============================================
// MAIN APP COMPONENT
// ============================================

function App() {
  const [gameMode, setGameMode] = useState('menu');
  const [noid1, setNoid1] = useState(null);
  const [noid2, setNoid2] = useState(null);
  const [votesRemaining, setVotesRemaining] = useState(DAILY_VOTE_LIMIT);
  const [stickyWinner, setStickyWinner] = useState(null);
  const [dailyBattleData, setDailyBattleData] = useState(null);
  const [userDailyVoted, setUserDailyVoted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    let id = localStorage.getItem('noids_user_id');
    if (!id) {
      id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('noids_user_id', id);
    }
    setUserId(id);
    checkDailyVotes(id);
  }, []);

  const checkDailyVotes = (uid) => {
    const today = new Date().toISOString().split('T')[0];
    const key = `votes_${uid}_${today}`;
    const stored = localStorage.getItem(key);
    
    if (stored) {
      const votes = parseInt(stored);
      setVotesRemaining(DAILY_VOTE_LIMIT - votes);
    } else {
      setVotesRemaining(DAILY_VOTE_LIMIT);
    }
  };

  const getRandomNoid = (exclude = []) => {
    let num;
    do {
      num = Math.floor(Math.random() * TOTAL_NOIDS) + 1;
    } while (exclude.includes(num));
    return num;
  };

  const getNoidImage = (tokenId) => {
    return `https://dweb.link/ipfs/QmcXuDARMGMv59Q4ZZuoN5rjdM9GQrmp8NjLH5PDLixgAE/${tokenId}`;
  };

  const startBattle = async (mode) => {
    setGameMode(mode);
    setLoading(true);

    if (mode === 'rando') {
      const id1 = getRandomNoid();
      const id2 = getRandomNoid([id1]);
      setNoid1({ id: id1, image: getNoidImage(id1) });
      setNoid2({ id: id2, image: getNoidImage(id2) });
    } else if (mode === 'sticky') {
      if (stickyWinner) {
        const id2 = getRandomNoid([stickyWinner.id]);
        setNoid1(stickyWinner);
        setNoid2({ id: id2, image: getNoidImage(id2) });
      } else {
        const id1 = getRandomNoid();
        const id2 = getRandomNoid([id1]);
        setNoid1({ id: id1, image: getNoidImage(id1) });
        setNoid2({ id: id2, image: getNoidImage(id2) });
      }
    } else if (mode === 'oneofone') {
      const id1 = getRandomNoid();
      const id2 = getRandomNoid([id1]);
      setNoid1({ id: id1, image: getNoidImage(id1) });
      setNoid2({ id: id2, image: getNoidImage(id2) });
    } else if (mode === 'daily') {
      await loadDailyBattle();
    }

    setLoading(false);
  };

  const loadDailyBattle = async () => {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const { data, error } = await supabase
        .from('daily_battles')
        .select('*')
        .eq('battle_date', today)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading daily battle:', error);
        return;
      }

      if (!data) {
        const id1 = getRandomNoid();
        const id2 = getRandomNoid([id1]);
        
        const { data: newBattle, error: insertError } = await supabase
          .from('daily_battles')
          .insert([{
            battle_date: today,
            noid1_id: id1,
            noid2_id: id2,
            noid1_votes: 0,
            noid2_votes: 0
          }])
          .select()
          .single();

        if (insertError) {
          console.error('Error creating daily battle:', insertError);
          return;
        }

        setNoid1({ id: id1, image: getNoidImage(id1) });
        setNoid2({ id: id2, image: getNoidImage(id2) });
        setDailyBattleData(newBattle);
      } else {
        setNoid1({ id: data.noid1_id, image: getNoidImage(data.noid1_id) });
        setNoid2({ id: data.noid2_id, image: getNoidImage(data.noid2_id) });
        setDailyBattleData(data);
      }

      const voteKey = `daily_vote_${userId}_${today}`;
      const hasVoted = localStorage.getItem(voteKey);
      setUserDailyVoted(!!hasVoted);

    } catch (err) {
      console.error('Unexpected error:', err);
    }
  };

  const handleVote = async (winner) => {
    if (gameMode === 'daily') {
      if (userDailyVoted) return;
      
      const today = new Date().toISOString().split('T')[0];
      const voteKey = `daily_vote_${userId}_${today}`;
      
      const winnerField = winner === 1 ? 'noid1_votes' : 'noid2_votes';
      const winnerNoid = winner === 1 ? noid1 : noid2;

      try {
        const { error } = await supabase
          .from('daily_battles')
          .update({ [winnerField]: dailyBattleData[winnerField] + 1 })
          .eq('battle_date', today);

        if (error) {
          console.error('Error updating daily battle:', error);
          return;
        }

        // Record complete battle with all stats
        await recordCompleteBattle({
          noid1Id: noid1.id,
          noid2Id: noid2.id,
          winnerId: winnerNoid.id,
          gameMode: 'daily',
          userId: userId,
          isDailyBattle: true,
          totalVotes: dailyBattleData.noid1_votes + dailyBattleData.noid2_votes + 1,
          voteMargin: Math.abs(dailyBattleData.noid1_votes - dailyBattleData.noid2_votes)
        });

        localStorage.setItem(voteKey, winner.toString());
        setUserDailyVoted(true);
        
        await loadDailyBattle();
      } catch (err) {
        console.error('Error voting:', err);
      }
      return;
    }

    if (votesRemaining <= 0) return;

    const winnerNoid = winner === 1 ? noid1 : noid2;

    try {
      // Record complete battle with all stats
      await recordCompleteBattle({
        noid1Id: noid1.id,
        noid2Id: noid2.id,
        winnerId: winnerNoid.id,
        gameMode: gameMode,
        userId: userId,
        isDailyBattle: false
      });

      const { error: voteError } = await supabase
        .from('votes')
        .insert([{
          user_id: userId,
          winner_noid_id: winnerNoid.id,
          loser_noid_id: winner === 1 ? noid2.id : noid1.id,
          game_mode: gameMode
        }]);

      if (voteError) console.error('Error recording vote:', voteError);
    } catch (err) {
      console.error('Error in vote handling:', err);
    }

    const today = new Date().toISOString().split('T')[0];
    const key = `votes_${userId}_${today}`;
    const currentVotes = parseInt(localStorage.getItem(key) || '0');
    localStorage.setItem(key, (currentVotes + 1).toString());
    setVotesRemaining(DAILY_VOTE_LIMIT - currentVotes - 1);

    if (gameMode === 'sticky') {
      setStickyWinner(winnerNoid);
    }

    setTimeout(() => startBattle(gameMode), 1000);
  };

  const Menu = () => (
    <div className="menu-container">
      <div className="matrix-rain" />
      
      <div className="logo-section">
        <img 
          src="https://c.animaapp.com/9Omv44Zl/img/noidss-1-2@2x.png" 
          alt="NOiDS Logo" 
          className="main-logo"
        />
        <h2 className="tagline">BATTLE</h2>
        <p className="subtitle">Which NOID reigns supreme?</p>
      </div>

      <div className="game-modes">
        <div className="glass-panel">
          <div className="panel-header">
            <h3>Single Player</h3>
            <div className="votes-badge">
              <span className="votes-text">Votes:</span>
              <span className="votes-number">{votesRemaining}/55</span>
            </div>
          </div>
          
          <button 
            className="mode-btn"
            onClick={() => startBattle('rando')}
            disabled={votesRemaining <= 0}
          >
            <div className="btn-icon">🎲</div>
            <div className="btn-content">
              <h4>Rando Battle</h4>
              <p>Two random NOiDS face off</p>
            </div>
          </button>

          <button 
            className="mode-btn"
            onClick={() => startBattle('sticky')}
            disabled={votesRemaining <= 0}
          >
            <div className="btn-icon">🏆</div>
            <div className="btn-content">
              <h4>Sticky Winner</h4>
              <p>Winner stays, challenger appears</p>
            </div>
          </button>

          <button 
            className="mode-btn"
            onClick={() => startBattle('oneofone')}
            disabled={votesRemaining <= 0}
          >
            <div className="btn-icon">👑</div>
            <div className="btn-content">
              <h4>One of One Championship</h4>
              <p>Battle of the rarest</p>
            </div>
          </button>
        </div>

        <div className="glass-panel community-panel">
          <div className="panel-header">
            <h3>Community Mode</h3>
          </div>
          
          <button 
            className="mode-btn community-btn"
            onClick={() => startBattle('daily')}
          >
            <div className="btn-icon">⭐</div>
            <div className="btn-content">
              <h4>Daily Battle</h4>
              <p>One battle, one vote, 24 hours</p>
              {userDailyVoted && <span className="voted-badge">✓ Voted</span>}
            </div>
          </button>
        </div>

        {votesRemaining <= 0 && (
          <div className="limit-notice glass-panel">
            <span className="notice-icon">⏰</span>
            <p>You've used all your daily votes!<br/>Come back tomorrow.</p>
          </div>
        )}
      </div>
    </div>
  );

  const Battle = () => (
    <div className="battle-container">
      <div className="matrix-rain" />
      
      <div className="battle-header glass-panel">
        <button className="back-btn" onClick={() => setGameMode('menu')}>
          <span className="back-arrow">←</span>
          Back to Menu
        </button>
        <div className="mode-title">
          {gameMode === 'rando' && <><span className="mode-icon">🎲</span> Rando Battle</>}
          {gameMode === 'sticky' && <><span className="mode-icon">🏆</span> Sticky Winner</>}
          {gameMode === 'oneofone' && <><span className="mode-icon">👑</span> One of One</>}
          {gameMode === 'daily' && <><span className="mode-icon">⭐</span> Daily Battle</>}
        </div>
        {gameMode !== 'daily' && (
          <div className="votes-badge">
            <span className="votes-text">Votes:</span>
            <span className="votes-number">{votesRemaining}/55</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading NOiDS...</p>
        </div>
      ) : (
        <div className="battle-arena">
          <div 
            className={`noid-card glass-card ${userDailyVoted && gameMode === 'daily' ? 'disabled' : ''}`}
            onClick={() => !userDailyVoted && handleVote(1)}
          >
            <div className="card-glow"></div>
            <div className="image-container">
              <img src={noid1?.image} alt={`NOID #${noid1?.id}`} />
            </div>
            <div className="noid-info">
              <h3>NOID #{noid1?.id}</h3>
              {gameMode === 'daily' && dailyBattleData && (
                <div className="vote-count">
                  <span className="vote-label">Votes:</span>
                  <span className="vote-number">{dailyBattleData.noid1_votes}</span>
                </div>
              )}
            </div>
          </div>

          <div className="vs-divider">
            <div className="vs-circle">
              <span>VS</span>
            </div>
          </div>

          <div 
            className={`noid-card glass-card ${userDailyVoted && gameMode === 'daily' ? 'disabled' : ''}`}
            onClick={() => !userDailyVoted && handleVote(2)}
          >
            <div className="card-glow"></div>
            <div className="image-container">
              <img src={noid2?.image} alt={`NOID #${noid2?.id}`} />
            </div>
            <div className="noid-info">
              <h3>NOID #{noid2?.id}</h3>
              {gameMode === 'daily' && dailyBattleData && (
                <div className="vote-count">
                  <span className="vote-label">Votes:</span>
                  <span className="vote-number">{dailyBattleData.noid2_votes}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {gameMode === 'daily' && userDailyVoted && (
        <div className="daily-voted-message glass-panel">
          <span className="check-icon">✓</span>
          <p>Thanks for voting! Come back tomorrow for the next battle.</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="app">
      {gameMode === 'menu' ? <Menu /> : <Battle />}
    </div>
  );
}

export default App;
