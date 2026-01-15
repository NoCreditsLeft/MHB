import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAccount } from 'wagmi';
import ConnectWalletModal from './ConnectWalletModal';
import './App.css';

// Supabase configuration
const supabaseUrl = 'https://jvmddbqxhfaicyctmmvt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2bWRkYnF4aGZhaWN5Y3RtbXZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyOTg4MDYsImV4cCI6MjA4Mzg3NDgwNn0.SD37h5vkKVQwODXavoRkej6yFsAYhT8nLmxIxs3AoZg';
export const supabase = createClient(supabaseUrl, supabaseKey);

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
// MATRIX RAIN COMPONENT
// ============================================

const MatrixRain = () => {
  const canvasRef = React.useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Matrix characters - katakana, numbers, and symbols
    const chars = 'アィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ01234567890';
    const fontSize = 14;
    const columns = canvas.width / fontSize;
    
    // Array of y-positions for each column
    const drops = [];
    for (let i = 0; i < columns; i++) {
      drops[i] = Math.random() * -100;
    }

    const draw = () => {
      // Fade effect - paint over previous frame with semi-transparent black
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Set text style
      ctx.fillStyle = '#00ff41';
      ctx.font = `${fontSize}px monospace`;

      // Loop through drops
      for (let i = 0; i < drops.length; i++) {
        // Random character
        const char = chars[Math.floor(Math.random() * chars.length)];
        
        // Draw character
        ctx.fillText(char, i * fontSize, drops[i] * fontSize);

        // Reset drop to top randomly after it crosses screen
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.95) {
          drops[i] = 0;
        }
        
        // Move drop down
        drops[i]++;
      }
    };

    const interval = setInterval(draw, 50);

    // Handle resize
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    
    window.addEventListener('resize', handleResize);

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
        opacity: 0.15
      }}
    />
  );
};

// ============================================
// LEADERBOARD COMPONENT
// ============================================

const Leaderboard = ({ onClose, onViewNoid }) => {
  const [view, setView] = useState('winrate');
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, [view]);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      let query = supabase.from('noid_stats').select('*');
      
      switch (view) {
        case 'winrate':
          query = query.gte('total_battles', 10).order('win_rate', { ascending: false }).limit(50);
          break;
        case 'totalwins':
          query = query.order('total_wins', { ascending: false }).limit(50);
          break;
        case 'hotstreak':
          query = query.gte('current_streak', 3).order('current_streak', { ascending: false }).limit(50);
          break;
        default:
          query = query.order('win_rate', { ascending: false }).limit(50);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      
      const processedData = (data || []).map(noid => ({
        ...noid,
        win_rate: noid.total_battles > 0 
          ? ((noid.total_wins / noid.total_battles) * 100).toFixed(2)
          : 0
      }));
      
      setLeaderboardData(processedData);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    }
    setLoading(false);
  };

  const getStreakEmoji = (streak) => {
    if (streak >= 10) return '🔥';
    if (streak >= 5) return '⚡';
    if (streak >= 3) return '✨';
    if (streak <= -3) return '❄️';
    return '';
  };

  return (
    <div className="leaderboard-container">
      <MatrixRain />
      
      <div className="leaderboard-header glass-panel">
        <button className="back-btn" onClick={onClose}>
          <span className="back-arrow">←</span>
          Back to Menu
        </button>
        <h2 className="leaderboard-title">Leaderboard</h2>
        <div className="spacer"></div>
      </div>

      <div className="leaderboard-tabs glass-panel">
        <button 
          className={`tab-btn ${view === 'winrate' ? 'active' : ''}`}
          onClick={() => setView('winrate')}
        >
          <span className="tab-icon">🏆</span>
          Win Rate
        </button>
        <button 
          className={`tab-btn ${view === 'totalwins' ? 'active' : ''}`}
          onClick={() => setView('totalwins')}
        >
          <span className="tab-icon">👑</span>
          Total Wins
        </button>
        <button 
          className={`tab-btn ${view === 'hotstreak' ? 'active' : ''}`}
          onClick={() => setView('hotstreak')}
        >
          <span className="tab-icon">🔥</span>
          Hot Streak
        </button>
      </div>

      <div className="leaderboard-content">
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading stats...</p>
          </div>
        ) : (
          <div className="leaderboard-list">
            {leaderboardData.map((noid, index) => (
              <div 
                key={noid.noid_id} 
                className="leaderboard-item glass-panel"
                onClick={() => onViewNoid(noid.noid_id)}
              >
                <div className="rank-badge">
                  {index === 0 && '🥇'}
                  {index === 1 && '🥈'}
                  {index === 2 && '🥉'}
                  {index > 2 && `#${index + 1}`}
                </div>

                <div className="noid-preview">
                  <div className="noid-id">NOID #{noid.noid_id}</div>
                  {noid.current_streak !== 0 && (
                    <div className="streak-indicator">
                      {getStreakEmoji(noid.current_streak)}
                      <span className={noid.current_streak > 0 ? 'positive' : 'negative'}>
                        {Math.abs(noid.current_streak)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="noid-stats-grid">
                  <div className="stat-item">
                    <span className="stat-label">Win Rate</span>
                    <span className="stat-value">{noid.win_rate}%</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Wins</span>
                    <span className="stat-value wins">{noid.total_wins}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Battles</span>
                    <span className="stat-value">{noid.total_battles}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Best Streak</span>
                    <span className="stat-value streak">{noid.best_streak || 0}</span>
                  </div>
                </div>

                <div className="view-profile-btn">
                  <span>View Profile →</span>
                </div>
              </div>
            ))}

            {leaderboardData.length === 0 && (
              <div className="empty-state glass-panel">
                <p>No stats yet. Start battling to see rankings!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// NOID PROFILE COMPONENT
// ============================================

const NoidProfile = ({ noidId, onClose, getNoidImage }) => {
  const [noidData, setNoidData] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [headToHead, setHeadToHead] = useState([]);
  const [beatenBy, setBeatenBy] = useState([]);
  const [beaten, setBeaten] = useState([]);
  const [gameModeStats, setGameModeStats] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadNoidProfile();
  }, [noidId]);

  const loadNoidProfile = async () => {
    setLoading(true);
    try {
      const { data: stats } = await supabase
        .from('noid_stats')
        .select('*')
        .eq('noid_id', noidId)
        .single();

      if (stats) {
        stats.win_rate = stats.total_battles > 0 
          ? ((stats.total_wins / stats.total_battles) * 100).toFixed(2)
          : 0;
        setNoidData(stats);
      }

      const img = await getNoidImage(noidId);
      setImageUrl(img);

      const { data: h2hData } = await supabase
        .from('head_to_head')
        .select('*')
        .eq('noid_id', noidId)
        .order('battles', { ascending: false })
        .limit(5);
      setHeadToHead(h2hData || []);

      const { data: beatenByData } = await supabase
        .from('noid_beaten_by')
        .select('*')
        .eq('noid_id', noidId)
        .order('times_beaten', { ascending: false })
        .limit(5);
      setBeatenBy(beatenByData || []);

      const { data: beatenData } = await supabase
        .from('noid_beaten')
        .select('*')
        .eq('noid_id', noidId)
        .order('times_beaten', { ascending: false })
        .limit(5);
      setBeaten(beatenData || []);

      const { data: modeData } = await supabase
        .from('noid_gamemode_stats')
        .select('*')
        .eq('noid_id', noidId);
      setGameModeStats(modeData || []);

      const { data: achievementData } = await supabase
        .from('noid_achievements')
        .select('*')
        .eq('noid_id', noidId)
        .order('earned_date', { ascending: false });
      setAchievements(achievementData || []);

    } catch (error) {
      console.error('Error loading profile:', error);
    }
    setLoading(false);
  };

  const getStreakEmoji = (streak) => {
    if (!streak) return '';
    if (streak >= 10) return '🔥';
    if (streak >= 5) return '⚡';
    if (streak >= 3) return '✨';
    if (streak <= -3) return '❄️';
    return '';
  };

  const getGameModeIcon = (mode) => {
    switch (mode) {
      case 'rando': return '🎲';
      case 'sticky': return '🏆';
      case 'oneofone': return '👑';
      case 'daily': return '⭐';
      default: return '🎮';
    }
  };

  const getAchievementIcon = (type) => {
    if (type.includes('win_streak')) return '🔥';
    if (type.includes('wins_')) return '🏆';
    if (type.includes('win_rate')) return '👑';
    if (type === 'first_win') return '⭐';
    return '🎖️';
  };

  if (loading) {
    return (
      <div className="profile-container">
        <MatrixRain />
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading NOID profile...</p>
        </div>
      </div>
    );
  }

  if (!noidData) {
    return (
      <div className="profile-container">
        <MatrixRain />
        <div className="glass-panel empty-state">
          <h2>NOID #{noidId}</h2>
          <p>This NOID hasn't battled yet!</p>
          <button className="back-btn" onClick={onClose}>Back to Menu</button>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-container">
      <MatrixRain />
      
      <div className="profile-header glass-panel">
        <button className="back-btn" onClick={onClose}>
          <span className="back-arrow">←</span>
          Back
        </button>
        <h2 className="profile-title">NOID #{noidId}</h2>
        <div className="spacer"></div>
      </div>

      <div className="profile-content">
        <div className="profile-hero glass-panel">
          <div className="hero-image">
            {imageUrl && <img src={imageUrl} alt={`NOID #${noidId}`} />}
          </div>
          <div className="hero-stats">
            <div className="hero-title">
              <h1>NOID #{noidId}</h1>
              {noidData.current_streak !== 0 && (
                <div className="streak-badge">
                  {getStreakEmoji(noidData.current_streak)}
                  <span className={noidData.current_streak > 0 ? 'positive' : 'negative'}>
                    {Math.abs(noidData.current_streak)} Streak
                  </span>
                </div>
              )}
            </div>

            <div className="hero-main-stats">
              <div className="main-stat">
                <div className="stat-value large">{noidData.win_rate}%</div>
                <div className="stat-label">Win Rate</div>
              </div>
              <div className="main-stat">
                <div className="stat-value large wins">{noidData.total_wins}</div>
                <div className="stat-label">Total Wins</div>
              </div>
              <div className="main-stat">
                <div className="stat-value large">{noidData.total_battles}</div>
                <div className="stat-label">Battles</div>
              </div>
            </div>
          </div>
        </div>

        <div className="profile-tabs glass-panel">
          <button 
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button 
            className={`tab-btn ${activeTab === 'h2h' ? 'active' : ''}`}
            onClick={() => setActiveTab('h2h')}
          >
            Head-to-Head
          </button>
          <button 
            className={`tab-btn ${activeTab === 'achievements' ? 'active' : ''}`}
            onClick={() => setActiveTab('achievements')}
          >
            Achievements
          </button>
        </div>

        {activeTab === 'overview' && (
          <div className="tab-content">
            <div className="stats-section glass-panel">
              <h3 className="section-title">Core Stats</h3>
              <div className="stats-grid">
                <div className="stat-box">
                  <div className="stat-icon">🏆</div>
                  <div className="stat-info">
                    <div className="stat-label">Total Wins</div>
                    <div className="stat-value wins">{noidData.total_wins}</div>
                  </div>
                </div>
                <div className="stat-box">
                  <div className="stat-icon">💔</div>
                  <div className="stat-info">
                    <div className="stat-label">Total Losses</div>
                    <div className="stat-value losses">{noidData.total_losses}</div>
                  </div>
                </div>
                <div className="stat-box">
                  <div className="stat-icon">⚔️</div>
                  <div className="stat-info">
                    <div className="stat-label">Total Battles</div>
                    <div className="stat-value">{noidData.total_battles}</div>
                  </div>
                </div>
                <div className="stat-box">
                  <div className="stat-icon">📊</div>
                  <div className="stat-info">
                    <div className="stat-label">Win Rate</div>
                    <div className="stat-value">{noidData.win_rate}%</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="stats-section glass-panel">
              <h3 className="section-title">Streaks</h3>
              <div className="stats-grid">
                <div className="stat-box">
                  <div className="stat-icon">{getStreakEmoji(noidData.current_streak) || '📈'}</div>
                  <div className="stat-info">
                    <div className="stat-label">Current Streak</div>
                    <div className={`stat-value ${noidData.current_streak > 0 ? 'positive' : noidData.current_streak < 0 ? 'negative' : ''}`}>
                      {noidData.current_streak > 0 ? '+' : ''}{noidData.current_streak || 0}
                    </div>
                  </div>
                </div>
                <div className="stat-box">
                  <div className="stat-icon">🔥</div>
                  <div className="stat-info">
                    <div className="stat-label">Best Streak</div>
                    <div className="stat-value streak">{noidData.best_streak || 0}</div>
                  </div>
                </div>
                <div className="stat-box">
                  <div className="stat-icon">🎯</div>
                  <div className="stat-info">
                    <div className="stat-label">Underdog Wins</div>
                    <div className="stat-value">{noidData.underdog_wins || 0}</div>
                  </div>
                </div>
              </div>
            </div>

            {gameModeStats.length > 0 && (
              <div className="stats-section glass-panel">
                <h3 className="section-title">Performance by Game Mode</h3>
                <div className="mode-stats-list">
                  {gameModeStats.map(mode => {
                    const modeWinRate = mode.battles > 0 
                      ? ((mode.wins / mode.battles) * 100).toFixed(2)
                      : 0;
                    return (
                      <div key={mode.game_mode} className="mode-stat-item">
                        <div className="mode-header">
                          <span className="mode-icon">{getGameModeIcon(mode.game_mode)}</span>
                          <span className="mode-name">{mode.game_mode.toUpperCase()}</span>
                        </div>
                        <div className="mode-numbers">
                          <span className="mode-record">{mode.wins}W - {mode.losses}L</span>
                          <span className="mode-winrate">{modeWinRate}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'h2h' && (
          <div className="tab-content">
            {headToHead.length > 0 && (
              <div className="stats-section glass-panel">
                <h3 className="section-title">Most Battled Opponents</h3>
                <div className="h2h-list">
                  {headToHead.map(h2h => {
                    const winRate = h2h.battles > 0 
                      ? ((h2h.wins / h2h.battles) * 100).toFixed(0)
                      : 0;
                    return (
                      <div key={h2h.opponent_id} className="h2h-item">
                        <div className="h2h-opponent">
                          <span className="opponent-label">NOID #{h2h.opponent_id}</span>
                          <span className="battles-count">{h2h.battles} battles</span>
                        </div>
                        <div className="h2h-record">
                          <span className="record">{h2h.wins}W - {h2h.losses}L</span>
                          <span className="winrate">{winRate}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {beaten.length > 0 && (
              <div className="stats-section glass-panel">
                <h3 className="section-title">💪 Most Beaten Opponents</h3>
                <div className="beaten-list">
                  {beaten.map(b => (
                    <div key={b.beaten_id} className="beaten-item">
                      <span className="beaten-id">NOID #{b.beaten_id}</span>
                      <span className="times-beaten">{b.times_beaten}x</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {beatenBy.length > 0 && (
              <div className="stats-section glass-panel">
                <h3 className="section-title">😤 Beaten By</h3>
                <div className="beaten-list">
                  {beatenBy.map(b => (
                    <div key={b.beaten_by_id} className="beaten-item nemesis">
                      <span className="beaten-id">NOID #{b.beaten_by_id}</span>
                      <span className="times-beaten">{b.times_beaten}x</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {headToHead.length === 0 && beaten.length === 0 && beatenBy.length === 0 && (
              <div className="empty-state glass-panel">
                <p>No head-to-head data yet.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'achievements' && (
          <div className="tab-content">
            <div className="stats-section glass-panel">
              <h3 className="section-title">Achievements Unlocked</h3>
              {achievements.length > 0 ? (
                <div className="achievements-grid">
                  {achievements.map(achievement => (
                    <div key={achievement.id} className="achievement-item">
                      <div className="achievement-icon">
                        {getAchievementIcon(achievement.achievement_type)}
                      </div>
                      <div className="achievement-info">
                        <div className="achievement-name">{achievement.achievement_name}</div>
                        <div className="achievement-desc">{achievement.achievement_description}</div>
                        <div className="achievement-date">
                          {new Date(achievement.earned_date).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <p>No achievements yet. Keep battling!</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// MAIN APP COMPONENT
// ============================================

function App() {
  const [gameMode, setGameMode] = useState('menu');
  const [view, setView] = useState('menu'); // menu, battle, leaderboard, profile
  const [selectedNoidId, setSelectedNoidId] = useState(null);
  const [noid1, setNoid1] = useState(null);
  const [noid2, setNoid2] = useState(null);
  const [votesRemaining, setVotesRemaining] = useState(DAILY_VOTE_LIMIT);
  const [stickyWinner, setStickyWinner] = useState(null);
  const [dailyBattleData, setDailyBattleData] = useState(null);
  const [userDailyVoted, setUserDailyVoted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [pendingGameMode, setPendingGameMode] = useState(null);
  
  // Get wallet connection status and address
  const { isConnected, address } = useAccount();

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

  // Cache for storing fetched image URLs
  const [imageCache, setImageCache] = useState({});

  const fetchNoidImageFromOpenSea = async (tokenId) => {
    // Check cache first
    if (imageCache[tokenId]) {
      return imageCache[tokenId];
    }

    try {
      const response = await fetch(
        `https://api.opensea.io/api/v2/chain/ethereum/contract/0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902/nfts/${tokenId}`,
        {
          headers: {
            'X-API-KEY': 'f6662070d18f4d54936bdd66b94c3f11'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`OpenSea API error: ${response.status}`);
      }

      const data = await response.json();
      const imageUrl = data.nft?.image_url || data.nft?.display_image_url;
      
      if (imageUrl) {
        // Cache the URL
        setImageCache(prev => ({ ...prev, [tokenId]: imageUrl }));
        return imageUrl;
      }

      throw new Error('No image URL in response');
    } catch (error) {
      console.error(`Error fetching image for NOID #${tokenId}:`, error);
      // Fallback to IPFS if API fails
      return `https://gateway.pinata.cloud/ipfs/QmcXuDARMGMv59Q4ZZuoN5rjdM9GQrmp8NjLH5PDLixgAE/${tokenId}`;
    }
  };

  const getNoidImage = async (tokenId) => {
    return await fetchNoidImageFromOpenSea(tokenId);
  };

  const startBattle = async (mode) => {
    // Check if wallet is connected before starting battle
    if (!isConnected) {
      setPendingGameMode(mode);
      setShowWalletModal(true);
      return;
    }
    
    setGameMode(mode);
    setView('battle');
    setLoading(true);

    try {
      if (mode === 'rando') {
        const id1 = getRandomNoid();
        const id2 = getRandomNoid([id1]);
        const [img1, img2] = await Promise.all([
          getNoidImage(id1),
          getNoidImage(id2)
        ]);
        setNoid1({ id: id1, image: img1 });
        setNoid2({ id: id2, image: img2 });
      } else if (mode === 'sticky') {
        if (stickyWinner) {
          const id2 = getRandomNoid([stickyWinner.id]);
          const img2 = await getNoidImage(id2);
          setNoid1(stickyWinner);
          setNoid2({ id: id2, image: img2 });
        } else {
          const id1 = getRandomNoid();
          const id2 = getRandomNoid([id1]);
          const [img1, img2] = await Promise.all([
            getNoidImage(id1),
            getNoidImage(id2)
          ]);
          setNoid1({ id: id1, image: img1 });
          setNoid2({ id: id2, image: img2 });
        }
      } else if (mode === 'oneofone') {
        const id1 = getRandomNoid();
        const id2 = getRandomNoid([id1]);
        const [img1, img2] = await Promise.all([
          getNoidImage(id1),
          getNoidImage(id2)
        ]);
        setNoid1({ id: id1, image: img1 });
        setNoid2({ id: id2, image: img2 });
      } else if (mode === 'daily') {
        await loadDailyBattle();
      }
    } catch (error) {
      console.error('Error loading battle:', error);
    }

    setLoading(false);
  };

  const handleWalletConnected = () => {
    setShowWalletModal(false);
    if (pendingGameMode) {
      startBattle(pendingGameMode);
      setPendingGameMode(null);
    }
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

        // Fetch images from OpenSea API
        const [img1, img2] = await Promise.all([
          getNoidImage(id1),
          getNoidImage(id2)
        ]);

        setNoid1({ id: id1, image: img1 });
        setNoid2({ id: id2, image: img2 });
        setDailyBattleData(newBattle);
      } else {
        // Fetch images from OpenSea API
        const [img1, img2] = await Promise.all([
          getNoidImage(data.noid1_id),
          getNoidImage(data.noid2_id)
        ]);

        setNoid1({ id: data.noid1_id, image: img1 });
        setNoid2({ id: data.noid2_id, image: img2 });
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
      <MatrixRain />
      
      <button 
        className="wallet-header-btn"
        onClick={() => setShowWalletModal(true)}
      >
        {isConnected ? (
          <>
            <span className="wallet-icon">💳</span>
            <span className="wallet-text">{address.slice(0, 6)}...{address.slice(-4)}</span>
          </>
        ) : (
          <>
            <span className="wallet-icon">💳</span>
            <span className="wallet-text">Connect Wallet</span>
          </>
        )}
      </button>
      
      <div className="logo-section">
        <img 
          src="/NOiDS_Battle.png" 
          alt="NOiDS Battle Logo" 
          className="main-logo"
        />
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

        <button 
          className="stats-btn glass-panel"
          onClick={() => setView('leaderboard')}
        >
          📊 View Stats & Leaderboard
        </button>
      </div>
    </div>
  );

  const Battle = () => (
    <div className="battle-container">
      <MatrixRain />
      
      <div className="battle-header glass-panel">
        <button className="back-btn" onClick={() => setView('menu')}>
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
      {view === 'menu' && <Menu />}
      {view === 'battle' && <Battle />}
      {view === 'leaderboard' && (
        <Leaderboard 
          onClose={() => setView('menu')}
          onViewNoid={(noidId) => {
            setSelectedNoidId(noidId);
            setView('profile');
          }}
        />
      )}
      {view === 'profile' && (
        <NoidProfile
          noidId={selectedNoidId}
          onClose={() => setView('leaderboard')}
          getNoidImage={getNoidImage}
        />
      )}
      
      <ConnectWalletModal
        isOpen={showWalletModal}
        onClose={() => {
          setShowWalletModal(false);
          setPendingGameMode(null);
        }}
        onConnect={handleWalletConnected}
      />
    </div>
  );
}

export default App;
