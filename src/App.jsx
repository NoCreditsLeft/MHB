import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAccount } from 'wagmi';
import ConnectWalletModal from './ConnectWalletModal';
import MyNoids from './MyNoids';
import './App.css';

// Supabase configuration
const supabaseUrl = 'https://jvmddbqxhfaicyctmmvt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2bWRkYnF4aGZhaWN5Y3RtbXZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyOTg4MDYsImV4cCI6MjA4Mzg3NDgwNn0.SD37h5vkKVQwODXavoRkej6yFsAYhT8nLmxIxs3AoZg';
export const supabase = createClient(supabaseUrl, supabaseKey);

const TOTAL_NOIDS = 5555;
const DAILY_VOTE_LIMIT = 55;

// 1-of-1 NOIDs with unique traits
const ONE_OF_ONE_NOIDS = [
  3399, 4550, 46, 3421, 5521, 4200, 814, 1587, 4234, 1601,
  2480, 1046, 4999, 2290, 1401, 2148, 3921, 4900, 4699, 1187,
  2225, 948, 2214, 1448, 3321, 4221, 4111, 2281, 2231, 2014,
  2187, 4800, 4890, 1748, 4601, 1948, 4400, 4981, 412, 4651,
  3390, 601
];

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
      // New NOiD - first battle
      const initialWins = won ? 1 : 0;
      const initialBattles = 1;
      const initialWinRate = initialBattles > 0 ? (initialWins / initialBattles) : 0.0;
      
      await supabase.from('noid_stats').insert([{
        noid_id: noidId,
        total_battles: initialBattles,
        total_wins: initialWins,
        total_losses: won ? 0 : 1,
        win_rate: initialWinRate,               // ← ADDED
        current_streak: won ? 1 : -1,
        best_streak: won ? 1 : 0,
        first_battle_date: now,
        last_battle_date: now,
        last_win_date: won ? now : null,
        last_loss_date: won ? null : now,
        underdog_wins: wasUnderdogWin ? 1 : 0,
        updated_at: now
      }]);
    } else {
      // Existing NOiD - update stats
      const newBattles = currentStats.total_battles + 1;
      const newWins = currentStats.total_wins + (won ? 1 : 0);
      const newWinRate = newBattles > 0 ? (newWins / newBattles) : 0.0;  // ← ADDED (floating point division)
      
      const newStreak = won 
        ? Math.max(currentStats.current_streak, 0) + 1 
        : Math.min(currentStats.current_streak, 0) - 1;
      
      const newBestStreak = won 
        ? Math.max(currentStats.best_streak, newStreak)
        : currentStats.best_streak;
      
      await supabase
        .from('noid_stats')
        .update({
          total_battles: newBattles,
          total_wins: newWins,
          total_losses: currentStats.total_losses + (won ? 0 : 1),
          win_rate: newWinRate,                                 // ← ADDED HERE
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
    console.error(`Error updating stats for NOiD #${noidId}:`, error);
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
    const chars = 'アィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ01234567890';
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

const Leaderboard = ({ onClose, onViewNoid, getNoidImage }) => {
  const [view, setView] = useState('winrate');
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [images, setImages] = useState({});

  useEffect(() => {
    loadLeaderboard();
  }, [view]);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      let query = supabase.from('noid_stats').select('*');
      
      // For win rate tab, get all NOIDs with at least 3 battles, then sort by Wilson Score
      // For other tabs, use existing logic
      switch (view) {
        case 'winrate':
          query = query.gte('total_battles', 3);
          break;
        case 'totalwins':
          query = query.order('total_wins', { ascending: false }).limit(50);
          break;
        case 'hotstreak':
          query = query.gte('current_streak', 3).order('current_streak', { ascending: false }).limit(50);
          break;
        default:
          query = query.gte('total_battles', 3);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      
      const processedData = (data || []).map(noid => {
        const wins = noid.total_wins;
        const battles = noid.total_battles;
        const winRate = battles > 0 ? ((wins / battles) * 100).toFixed(2) : 0;
        
        // Wilson Score - lower bound of confidence interval for win rate
        // This weighs both win rate AND number of battles
        // More battles = more confidence in the true win rate
        const z = 1.96; // 95% confidence interval
        const p = battles > 0 ? wins / battles : 0;
        const wilsonScore = battles > 0 
          ? ((p + z*z/(2*battles) - z * Math.sqrt((p*(1-p)+z*z/(4*battles))/battles))/(1+z*z/battles)) * 100
          : 0;
        
        return {
          ...noid,
          win_rate: winRate,
          wilson_score: wilsonScore
        };
      });
      
      // Sort by Wilson Score for win rate tab, otherwise use default sorting
      if (view === 'winrate') {
        processedData.sort((a, b) => b.wilson_score - a.wilson_score);
        // Take top 50 after sorting
        setLeaderboardData(processedData.slice(0, 50));
      } else {
        setLeaderboardData(processedData);
      }
      
      // Fetch images for all NOIDs
      const imagePromises = processedData.slice(0, 50).map(noid => 
        getNoidImage(noid.noid_id).then(img => ({ id: noid.noid_id, img }))
      );
      
      Promise.all(imagePromises).then(results => {
        const imageMap = {};
        results.forEach(({ id, img }) => {
          imageMap[id] = img;
        });
        setImages(imageMap);
      });
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
                <img 
                  src={images[noid.noid_id] || 'https://via.placeholder.com/60x60?text=...'} 
                  alt={`NOID #${noid.noid_id}`}
                  className="leaderboard-noid-image"
                />
                
                <div className="rank-badge">
                  {index === 0 && '🥇'}
                  {index === 1 && '🥈'}
                  {index === 2 && '🥉'}
                  {index > 2 && `#${index + 1}`}
                </div>

                <div className="noid-preview">
                  <div className="noid-id">NOID #{noid.noid_id}</div>
                  <a 
                    href={`https://opensea.io/assets/ethereum/0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902/${noid.noid_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opensea-link-leaderboard"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <img src="https://static.seadn.io/logos/Logomark-Transparent%20White.png" alt="OpenSea" />
                  </a>
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

// ============================================
// HELP COMPONENT
// ============================================

const Help = ({ onClose }) => {
  return (
    <div className="help-container">
      <MatrixRain />
      
      <div className="help-header glass-panel">
        <button className="back-btn" onClick={onClose}>
          <span className="back-arrow">←</span>
          Back to Menu
        </button>
        <h2 className="help-title">How to Play</h2>
        <div className="spacer"></div>
      </div>

      <div className="help-content">
        <div className="help-section glass-panel">
          <h3>🎮 Game Modes</h3>
          
          <div className="help-mode">
            <h4>🎲 Rando Battle</h4>
            <p>Two completely random NOIDs face off. Vote for your favorite! Simple, fast, and unpredictable.</p>
            <p className="help-limit">Limit: 55 votes per day</p>
          </div>

          <div className="help-mode">
            <h4>🏆 Sticky Winner</h4>
            <p>The winner stays to fight the next challenger. See how long your favorite NOID can maintain their winning streak!</p>
            <p className="help-limit">Limit: 55 votes per day</p>
          </div>

          <div className="help-mode">
            <h4>👑 One of One Championship</h4>
            <p>Only the 42 rarest NOIDs with unique 1-of-1 traits compete. This is the elite league where legends are made.</p>
            <p className="help-limit">Limit: 55 votes per day</p>
          </div>

          <div className="help-mode">
            <h4>⭐ Daily Battle</h4>
            <p>One matchup, shared by everyone, refreshes at midnight UTC. The entire community votes on the same battle. Come back tomorrow for a new challenge!</p>
            <p className="help-limit">Limit: 1 vote per day</p>
          </div>
        </div>

        <div className="help-section glass-panel">
          <h3>📊 Smart Leaderboard</h3>
          <p>Our leaderboard uses the <strong>Wilson Score</strong> ranking system - the same algorithm used by Reddit and major review sites.</p>
          
          <div className="help-detail">
            <h4>Why Wilson Score?</h4>
            <p>A NOID with 1 win in 1 battle (100% win rate) shouldn't rank above a NOID with 50 wins in 51 battles (98% win rate). Wilson Score solves this by weighing both:</p>
            <ul>
              <li><strong>Win Rate</strong> - Your percentage of victories</li>
              <li><strong>Battle Volume</strong> - How many times you've proven it</li>
            </ul>
            <p>The more battles a NOID wins, the more confident we are in their true skill. This prevents lucky streaks from dominating the leaderboard.</p>
          </div>

          <div className="help-detail">
            <h4>Leaderboard Tabs</h4>
            <ul>
              <li><strong>Win Rate</strong> - Ranked by Wilson Score (min 3 battles)</li>
              <li><strong>Total Wins</strong> - Pure win count, no minimum</li>
              <li><strong>Hot Streak</strong> - Current win streaks (min 3 streak)</li>
            </ul>
          </div>
        </div>

        <div className="help-section glass-panel">
          <h3>💳 Wallet Connection</h3>
          <p>Connect your wallet to:</p>
          <ul>
            <li>Vote on battles (required)</li>
            <li>Track your voting history</li>
            <li>View your owned NOIDs with battle stats</li>
            <li>Prevent vote manipulation</li>
          </ul>
          <p>Your vote limits are tied to your wallet address, not your browser. This means you can't bypass limits by switching browsers or clearing cookies.</p>
        </div>

        <div className="help-section glass-panel">
          <h3>🔒 Fair Play</h3>
          <p>NOIDs Battle uses database-enforced vote limits to ensure fair competition:</p>
          <ul>
            <li>55 votes per day for Rando, Sticky Winner, and One of One</li>
            <li>1 vote per day for Daily Battle</li>
            <li>Limits reset at midnight UTC</li>
            <li>No bypassing via browser switching or private mode</li>
          </ul>
        </div>

        <div className="help-section glass-panel">
          <h3>📈 Statistics Tracking</h3>
          <p>Every vote is recorded and contributes to:</p>
          <ul>
            <li><strong>Total Battles</strong> - How many times a NOID has been voted on</li>
            <li><strong>Wins & Losses</strong> - Complete battle record</li>
            <li><strong>Win Rate</strong> - Percentage calculated from all battles</li>
            <li><strong>Current Streak</strong> - Consecutive wins or losses</li>
            <li><strong>Best Streak</strong> - Highest win streak achieved</li>
            <li><strong>Underdog Wins</strong> - Victories when ranked 50+ places below opponent</li>
            <li><strong>Head-to-Head Records</strong> - History against specific opponents</li>
          </ul>
        </div>

        <div className="help-section glass-panel">
          <h3>🖼️ My NOIDs</h3>
          <p>If you own NOIDs, connect your wallet to see:</p>
          <ul>
            <li>All NOIDs in your wallet</li>
            <li>Battle statistics for each NOID</li>
            <li>Win rates and records</li>
            <li>Current rankings</li>
          </ul>
          <p>Click any NOID to view their complete battle history and profile.</p>
        </div>

        <div className="help-section glass-panel">
          <h3>🌐 OpenSea Integration</h3>
          <p>Click the OpenSea logo on any NOID to view them on OpenSea, check their traits, rarity, and marketplace listings.</p>
        </div>

        <div className="help-section glass-panel">
          <h3>❓ Questions?</h3>
          <p>NOIDs Battle is a community-driven platform built for the NOIDs collection. All battles, votes, and statistics are transparent and verifiable.</p>
          <p className="help-footer">Built by @NoCredits | Version 0.11 (Beta)</p>
        </div>
      </div>
    </div>
  );
};

// ============================================
// NOID PROFILE COMPONENT
// ============================================

const NoidProfile = ({ noidId, onClose, getNoidImage, imageCache, fetchNoidImage, setSelectedNoidId, setView }) => {
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
              <a 
                href={`https://opensea.io/assets/ethereum/0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902/${noidId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="opensea-link-external opensea-link-profile-external"
              >
                <img src="https://static.seadn.io/logos/Logomark-Transparent%20White.png" alt="OpenSea" />
              </a>
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
                          <img 
                            src={imageCache[h2h.opponent_id] || 'https://via.placeholder.com/50x50?text=Loading'} 
                            alt={`NOID #${h2h.opponent_id}`}
                            className="h2h-thumbnail"
                            onClick={() => {
                              setSelectedNoidId(h2h.opponent_id);
                              setView('profile');
                            }}
                            style={{ cursor: 'pointer' }}
                            onError={(e) => {
                              // Fetch image if not in cache
                              if (!imageCache[h2h.opponent_id]) {
                                fetchNoidImage(h2h.opponent_id);
                              }
                            }}
                          />
                          <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                            <span 
                              className="opponent-label"
                              style={{cursor: 'pointer'}}
                              onClick={() => {
                                setSelectedNoidId(h2h.opponent_id);
                                setView('profile');
                              }}
                            >
                              NOID #{h2h.opponent_id}
                            </span>
                            <span className="battles-count">{h2h.battles} battles</span>
                          </div>
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
              <div 
                className="stats-section glass-panel"
                style={{ marginBottom: '80px' }}
              >
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

// Isolated Scroller Component - manages its own state, never causes parent re-renders
const TopNoidsScroller = React.memo(({ onNoidClick }) => {
  const [noids, setNoids] = useState([]);
  const [images, setImages] = useState({});
  const [isReady, setIsReady] = useState(false);
  const scrollerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  useEffect(() => {
    loadNoidsAndImages();
  }, []);

  const loadNoidsAndImages = async () => {
    try {
      const { data } = await supabase
        .from('noid_stats')
        .select('*')
        .gte('total_battles', 5);

      if (!data || data.length === 0) return;

      // Calculate Wilson Score for each NOID
      const processedData = data.map(noid => {
        const wins = noid.total_wins;
        const battles = noid.total_battles;
        const z = 1.96;
        const p = battles > 0 ? wins / battles : 0;
        const wilsonScore = battles > 0 
          ? ((p + z*z/(2*battles) - z * Math.sqrt((p*(1-p)+z*z/(4*battles))/battles))/(1+z*z/battles))
          : 0;
        
        return {
          ...noid,
          wilson_score: wilsonScore
        };
      });

      // Sort by Wilson Score and take top 15
      processedData.sort((a, b) => b.wilson_score - a.wilson_score);
      const top15 = processedData.slice(0, 15);

      // Load ALL images before showing anything
      const imagePromises = top15.map(noid => 
        fetch(`https://api.opensea.io/api/v2/chain/ethereum/contract/0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902/nfts/${noid.noid_id}`, {
          headers: { 'x-api-key': 'f6662070d18f4d54936bdd66b94c3f11' }
        })
        .then(r => r.json())
        .then(d => ({ id: noid.noid_id, url: d.nft?.image_url || null }))
        .catch(() => ({ id: noid.noid_id, url: null }))
      );

      const loadedImages = await Promise.all(imagePromises);
      const imageMap = {};
      loadedImages.forEach(img => {
        if (img.url) imageMap[img.id] = img.url;
      });

      // ONE state update with everything ready
      setNoids(top15);
      setImages(imageMap);
      setIsReady(true);
    } catch (error) {
      console.error('Error loading scroller:', error);
    }
  };

  const handleMouseDown = (e) => {
    if (!scrollerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollerRef.current.offsetLeft);
    setScrollLeft(scrollerRef.current.scrollLeft);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !scrollerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollerRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    scrollerRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleMouseLeave = () => setIsDragging(false);

  if (!isReady || noids.length === 0) return null;

  return (
    <div 
      className="top-noids-scroller"
      ref={scrollerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      <div className="scroller-track">
        {[...noids, ...noids].map((noid, index) => {
          const rank = (index % noids.length) + 1;
          const winRate = noid.total_battles > 0 ? Math.round((noid.total_wins / noid.total_battles) * 100) : 0;
          return (
            <div 
              key={`${noid.noid_id}-${index}`}
              className="scroller-item"
              onClick={() => onNoidClick(noid.noid_id)}
            >
              <div className="scroller-rank">#{rank}</div>
              <img 
                src={images[noid.noid_id] || 'https://via.placeholder.com/100x100'} 
                alt={`NOID #${noid.noid_id}`}
                className="scroller-image"
              />
              <div className="scroller-info">
                <div className="scroller-noid-name">#{noid.noid_id}</div>
                <div className="scroller-stats">
                  {winRate}% • {noid.total_wins}W
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ============================================
// SEARCH MODAL COMPONENT
// ============================================

const SearchModal = ({ isOpen, onClose, onSearch }) => {
  const [searchInput, setSearchInput] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const noidId = parseInt(searchInput);
    
    if (!searchInput || isNaN(noidId)) {
      setError('Please enter a NOID number');
      return;
    }
    
    if (noidId < 1 || noidId > 5555) {
      setError('That NOID lives only in your imagination!');
      return;
    }
    
    // Valid NOID - open profile
    onSearch(noidId);
    setSearchInput('');
    setError('');
  };

  const handleInputChange = (e) => {
    // Only allow numbers
    const value = e.target.value.replace(/[^0-9]/g, '');
    setSearchInput(value);
    setError('');
  };

  const handleClose = () => {
    setSearchInput('');
    setError('');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="search-modal glass-panel" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose}>×</button>
        
        <h2>Search for a NOID</h2>
        
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Enter NOID # (1-5555)"
            value={searchInput}
            onChange={handleInputChange}
            maxLength="4"
            className="search-input"
            autoFocus
          />
          
          {error && <div className="search-error">{error}</div>}
          
          <button type="submit" className="search-submit-btn">
            Go to NOID
          </button>
        </form>
      </div>
    </div>
  );
};

// ============================================
// MUSIC PLAYER COMPONENT
// ============================================

const MusicPlayer = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(0);
  const [showPlayer, setShowPlayer] = useState(false);
  const playerRef = useRef(null);

  const tracks = [
    { id: 'CmYgWhTI7bA', title: 'Track 1' },
    { id: 'FxI2kSAQMZA', title: 'Track 2' },
    { id: '7RlxwBpzm6k', title: 'Track 3' },
    { id: 'oFUUTx7_m1s', title: 'Track 4' },
    { id: 'IQX0Ly8yWqI', title: 'Track 5' },
    { id: 'rrik48YzNGE', title: 'Track 6' },
    { id: 'VA4-t8BDJ6Y', title: 'Track 7' },
    { id: 'R_67sxcPPuQ', title: 'Track 8' },
    { id: 'tVl9klJs_fM', title: 'Track 9' }
  ];

  useEffect(() => {
    // Check if user had music enabled last time
    const musicEnabled = localStorage.getItem('noids_music_enabled') === 'true';
    if (musicEnabled) {
      setShowPlayer(true);
      // Delay auto-play slightly to let YouTube API load
      setTimeout(() => setIsPlaying(true), 1000);
    }

    // Load YouTube IFrame API
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    // YouTube API callback
    window.onYouTubeIframeAPIReady = () => {
      playerRef.current = new window.YT.Player('youtube-player', {
        height: '0',
        width: '0',
        videoId: tracks[0].id,
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          rel: 0
        },
        events: {
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.ENDED) {
              // Move to next track
              const nextTrack = (currentTrack + 1) % tracks.length;
              setCurrentTrack(nextTrack);
              playerRef.current.loadVideoById(tracks[nextTrack].id);
            }
          }
        }
      });
    };
  }, []);

  useEffect(() => {
    if (playerRef.current && playerRef.current.playVideo) {
      if (isPlaying) {
        playerRef.current.playVideo();
        localStorage.setItem('noids_music_enabled', 'true');
      } else {
        playerRef.current.pauseVideo();
        localStorage.setItem('noids_music_enabled', 'false');
      }
    }
  }, [isPlaying]);

  const togglePlay = () => {
    if (!showPlayer) {
      setShowPlayer(true);
      setTimeout(() => setIsPlaying(true), 500);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const skipTrack = () => {
    const nextTrack = (currentTrack + 1) % tracks.length;
    setCurrentTrack(nextTrack);
    if (playerRef.current) {
      playerRef.current.loadVideoById(tracks[nextTrack].id);
    }
  };

  return (
    <>
      <div id="youtube-player" style={{ display: 'none' }}></div>
      <div className="music-player">
        <button 
          className="music-toggle-btn" 
          onClick={togglePlay}
          title={isPlaying ? 'Pause Music' : 'Play Music'}
        >
          <span className="music-icon">{isPlaying ? '🔊' : '🔇'}</span>
        </button>
        {showPlayer && (
          <div className="music-info">
            <span className="music-track-name">{tracks[currentTrack].title}</span>
            <button className="music-skip-btn" onClick={skipTrack} title="Next Track">
              ⏭️
            </button>
          </div>
        )}
      </div>
    </>
  );
};

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
  const [isVoting, setIsVoting] = useState(false);
  const [votedFor, setVotedFor] = useState(null);
  const [imageCache, setImageCache] = useState({});
  const [showSearchModal, setShowSearchModal] = useState(false);
  
  // Get wallet connection status and address
  const { isConnected, address } = useAccount();

  useEffect(() => {
    // Use wallet address as user ID if connected, otherwise generate random ID
    if (isConnected && address) {
      setUserId(address.toLowerCase());
      checkDailyVotes(address.toLowerCase());
    } else {
      let id = localStorage.getItem('noids_user_id');
      if (!id) {
        id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('noids_user_id', id);
      }
      setUserId(id);
      checkDailyVotes(id);
    }
  }, [isConnected, address]);

  const checkDailyVotes = async (uid) => {
    if (!uid) {
      setVotesRemaining(DAILY_VOTE_LIMIT);
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    
    try {
      // Get or create user_stats record
      let { data: userStats, error } = await supabase
        .from('user_stats')
        .select('daily_votes_remaining, last_vote_reset_date')
        .eq('user_id', uid)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking votes:', error);
        setVotesRemaining(DAILY_VOTE_LIMIT);
        return;
      }

      // If user doesn't exist or it's a new day, reset votes
      if (!userStats || userStats.last_vote_reset_date !== today) {
        const { data: updated, error: updateError } = await supabase
          .from('user_stats')
          .upsert({
            user_id: uid,
            daily_votes_remaining: DAILY_VOTE_LIMIT,
            last_vote_reset_date: today,
            last_active: new Date().toISOString()
          }, { onConflict: 'user_id' })
          .select()
          .single();

        if (updateError) {
          console.error('Error resetting votes:', updateError);
          setVotesRemaining(DAILY_VOTE_LIMIT);
          return;
        }

        userStats = updated;
      }

      setVotesRemaining(Math.max(0, userStats.daily_votes_remaining || 0));
      console.log(`✓ Votes remaining: ${userStats.daily_votes_remaining}/${DAILY_VOTE_LIMIT}`);
    } catch (err) {
      console.error('Error fetching vote count:', err);
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

  const getRandomOneOfOne = (exclude = []) => {
    const available = ONE_OF_ONE_NOIDS.filter(id => !exclude.includes(id));
    if (available.length === 0) return getRandomNoid(exclude);
    return available[Math.floor(Math.random() * available.length)];
  };

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

  const fetchNoidImage = React.useCallback(async (tokenId) => {
    if (imageCache[tokenId]) return imageCache[tokenId];

    try {
      const response = await fetch(
        `https://api.opensea.io/api/v2/chain/ethereum/contract/0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902/nfts/${tokenId}`,
        {
          headers: {
            'x-api-key': 'f6662070d18f4d54936bdd66b94c3f11'
          }
        }
      );

      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      const imageUrl = data.nft.image_url;
      
      setImageCache(prev => ({...prev, [tokenId]: imageUrl}));
      return imageUrl;
    } catch (error) {
      console.error(`Error fetching image for NOID #${tokenId}:`, error);
      return null;
    }
  }, [imageCache]);


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
        const id1 = getRandomOneOfOne();
        const id2 = getRandomOneOfOne([id1]);
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
    // Get today's date in UTC
    const todayUTC = new Date().toISOString().split('T')[0];
    
    try {
      // Query for today's pre-generated battle
      const { data, error } = await supabase
        .from('daily_battles')
        .select('*')
        .eq('battle_date', todayUTC)
        .single();

      if (error) {
        console.error('Error loading daily battle:', error);
        if (error.code === 'PGRST116') {
          // No battle found for today
          alert('No daily battle available for today. Please contact support.');
        }
        return;
      }

      if (data) {
        // Fetch images from OpenSea API
        const [img1, img2] = await Promise.all([
          getNoidImage(data.noid1_id),
          getNoidImage(data.noid2_id)
        ]);

        setNoid1({ id: data.noid1_id, image: img1 });
        setNoid2({ id: data.noid2_id, image: img2 });
        setDailyBattleData(data);

        // Check if user has already voted today
        const voteKey = `daily_vote_${userId}_${todayUTC}`;
        const hasVoted = localStorage.getItem(voteKey);
        setUserDailyVoted(!!hasVoted);
      }

    } catch (err) {
      console.error('Unexpected error loading daily battle:', err);
    }
  };

  const handleVote = async (winner) => {
    if (isVoting) return; // Prevent double-clicks
    
    if (gameMode === 'daily') {
      if (userDailyVoted) return;
      
      setIsVoting(true);
      setVotedFor(winner);
      
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
          setIsVoting(false);
          setVotedFor(null);
          return;
        }

        // Fire and forget - record stats in background
        recordCompleteBattle({
          noid1Id: noid1.id,
          noid2Id: noid2.id,
          winnerId: winnerNoid.id,
          gameMode: 'daily',
          userId: userId,
          isDailyBattle: true,
          totalVotes: dailyBattleData.noid1_votes + dailyBattleData.noid2_votes + 1,
          voteMargin: Math.abs(dailyBattleData.noid1_votes - dailyBattleData.noid2_votes)
        }).catch(err => console.error('Stats recording error:', err));

        localStorage.setItem(voteKey, winner.toString());
        setUserDailyVoted(true);
        
        // Update the dailyBattleData with new vote count
        setDailyBattleData({
          ...dailyBattleData,
          [winnerField]: dailyBattleData[winnerField] + 1
        });
        
        // Don't reload - just show the "Thanks for voting" message
        setTimeout(() => {
          setIsVoting(false);
          setVotedFor(null);
        }, 800);
      } catch (err) {
        console.error('Error voting:', err);
        setIsVoting(false);
        setVotedFor(null);
      }
      return;
    }

    if (votesRemaining <= 0) return;
    
    // Show feedback immediately
    setIsVoting(true);
    setVotedFor(winner);

    const winnerNoid = winner === 1 ? noid1 : noid2;
    const newStickyWinner = gameMode === 'sticky' ? winnerNoid : stickyWinner;

    // Fire and forget - background recording
    recordCompleteBattle({
      noid1Id: noid1.id,
      noid2Id: noid2.id,
      winnerId: winnerNoid.id,
      gameMode: gameMode,
      userId: userId,
      isDailyBattle: false
    }).catch(err => console.error('Stats recording error:', err));

    // Record vote in database AND decrement votes_remaining
    supabase
      .from('votes')
      .insert([{
        user_id: userId,
        winner_noid_id: winnerNoid.id,
        loser_noid_id: winner === 1 ? noid2.id : noid1.id,
        game_mode: gameMode
      }])
      .then(async ({ error }) => {
        if (error) {
          console.error('Error recording vote:', error);
          return;
        }
        
        // Decrement daily_votes_remaining
        const { error: updateError } = await supabase.rpc('decrement_daily_votes', {
          wallet_address: userId
        });
        
        if (updateError) {
          console.error('Error decrementing votes:', updateError);
        }
        
        // Refresh vote count
        checkDailyVotes(userId);
      });

    // Load next battle images in background
    const loadNext = async () => {
      try {
        if (gameMode === 'rando') {
          const id1 = getRandomNoid();
          const id2 = getRandomNoid([id1]);
          const [img1, img2] = await Promise.all([
            getNoidImage(id1),
            getNoidImage(id2)
          ]);
          return { noid1: { id: id1, image: img1 }, noid2: { id: id2, image: img2 } };
        } else if (gameMode === 'sticky') {
          if (newStickyWinner) {
            const id2 = getRandomNoid([newStickyWinner.id]);
            const img2 = await getNoidImage(id2);
            return { noid1: newStickyWinner, noid2: { id: id2, image: img2 } };
          } else {
            const id1 = getRandomNoid();
            const id2 = getRandomNoid([id1]);
            const [img1, img2] = await Promise.all([
              getNoidImage(id1),
              getNoidImage(id2)
            ]);
            return { noid1: { id: id1, image: img1 }, noid2: { id: id2, image: img2 } };
          }
        } else if (gameMode === 'oneofone') {
          const id1 = getRandomOneOfOne();
          const id2 = getRandomOneOfOne([id1]);
          const [img1, img2] = await Promise.all([
            getNoidImage(id1),
            getNoidImage(id2)
          ]);
          return { noid1: { id: id1, image: img1 }, noid2: { id: id2, image: img2 } };
        }
      } catch (error) {
        console.error('Error loading next battle:', error);
        return null;
      }
    };

    const nextBattlePromise = loadNext();

    // Wait 800ms for loser to fade out completely
    setTimeout(async () => {
      // Hide Recording Vote message
      setVotedFor(null);
      
      // Wait for next battle to load
      const nextBattle = await nextBattlePromise;
      
      if (nextBattle) {
        // Update all state at once
        setNoid1(nextBattle.noid1);
        setNoid2(nextBattle.noid2);
        // Vote count already updated by checkDailyVotes call
        if (gameMode === 'sticky') {
          setStickyWinner(newStickyWinner);
        }
        
        // Small delay to let new images render, then remove voting state
        setTimeout(() => {
          setIsVoting(false);
        }, 100);
      } else {
        setIsVoting(false);
      }
    }, 800);
  };

  const Menu = () => (
    <div className="menu-container">
      <MatrixRain />
      
      <div className="menu-header">
        <button 
          className="help-header-btn"
          onClick={() => setView('help')}
          title="How to Play"
        >
          <span className="help-icon">❓</span>
        </button>

        <button 
          className="search-header-btn"
          onClick={() => setShowSearchModal(true)}
          title="Search for a NOID"
        >
          <span className="search-icon">🔍</span>
        </button>

        <div className="header-spacer"></div>

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

        {isConnected && (
          <button 
            className="my-noids-header-btn"
            onClick={() => setView('mynoids')}
          >
            <span className="noids-icon">🖼️</span>
            <span className="noids-text">My NOIDs</span>
          </button>
        )}
      </div>
      
      <div className="logo-section">
        <img 
          src="/NOiDS_Battle.png" 
          alt="NOiDS Battle Logo" 
          className="main-logo"
        />
        <p className="subtitle">Which NOID reigns supreme?</p>
      </div>

      <TopNoidsScroller 
        onNoidClick={(noidId) => {
          setSelectedNoidId(noidId);
          setView('profile');
        }}
      />

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
              {userDailyVoted && <span className="voted-badge">âœ“ Voted</span>}
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
      <div>
          
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
        <>
          {isVoting && (
            <div className="voting-overlay">
              <div className="voting-message">Recording Vote...</div>
            </div>
          )}
          <div className="battle-arena">
            <div 
              className={`noid-card glass-card ${
                userDailyVoted && gameMode === 'daily' ? 'disabled' : ''
              } ${
                isVoting && votedFor === 1 ? 'voted-winner' : ''
              } ${
                isVoting && votedFor === 2 ? 'voted-loser' : ''
              } ${
                isVoting ? 'voting' : ''
              }`}
              onClick={() => !userDailyVoted && !isVoting && handleVote(1)}
            >
              <div className="card-glow"></div>
              <div className="image-container">
                <img src={noid1?.image} alt={`NOID #${noid1?.id}`} />
              </div>
              <div className="noid-info">
                <h3>NOID #{noid1?.id}</h3>
                <a 
                  href={`https://opensea.io/assets/ethereum/0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902/${noid1?.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opensea-link-external"
                  onClick={(e) => e.stopPropagation()}
                >
                  <img src="https://static.seadn.io/logos/Logomark-Transparent%20White.png" alt="OpenSea" />
                </a>
                {gameMode === 'daily' && dailyBattleData && userDailyVoted && (
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
            className={`noid-card glass-card ${
              userDailyVoted && gameMode === 'daily' ? 'disabled' : ''
            } ${
              isVoting && votedFor === 2 ? 'voted-winner' : ''
            } ${
              isVoting && votedFor === 1 ? 'voted-loser' : ''
            } ${
              isVoting ? 'voting' : ''
            }`}
            onClick={() => !userDailyVoted && !isVoting && handleVote(2)}
          >
            <div className="card-glow"></div>
            <div className="image-container">
              <img src={noid2?.image} alt={`NOID #${noid2?.id}`} />
            </div>
            <div className="noid-info">
              <h3>NOID #{noid2?.id}</h3>
              <a 
                href={`https://opensea.io/assets/ethereum/0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902/${noid2?.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="opensea-link-external"
                onClick={(e) => e.stopPropagation()}
              >
                <img src="https://static.seadn.io/logos/Logomark-Transparent%20White.png" alt="OpenSea" />
              </a>
              {gameMode === 'daily' && dailyBattleData && userDailyVoted && (
                <div className="vote-count">
                  <span className="vote-label">Votes:</span>
                  <span className="vote-number">{dailyBattleData.noid2_votes}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        </>
      )}

      {gameMode === 'daily' && userDailyVoted && (
        <div className="daily-voted-message glass-panel">
          <span className="check-icon">âœ“</span>
          <p>Thanks for voting! Come back tomorrow for the next battle.</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="app">
      {view === 'menu' && <Menu />}
      {view === 'battle' && <Battle />}
      {view === 'help' && <Help onClose={() => setView('menu')} />}
      {view === 'mynoids' && (
        <MyNoids
          walletAddress={address}
          onClose={() => setView('menu')}
          onViewNoid={(noidId) => {
            setSelectedNoidId(noidId);
            setView('profile');
          }}
          getNoidImage={getNoidImage}
        />
      )}
      {view === 'leaderboard' && (
        <Leaderboard 
          onClose={() => setView('menu')}
          onViewNoid={(noidId) => {
            setSelectedNoidId(noidId);
            setView('profile');
          }}
          getNoidImage={getNoidImage}
        />
      )}
      {view === 'profile' && (
        <NoidProfile
          noidId={selectedNoidId}
          onClose={() => {
            // Go back to mynoids if we came from there, otherwise leaderboard
            const previousView = view === 'mynoids' ? 'mynoids' : 'leaderboard';
            setView(previousView);
          }}
          getNoidImage={getNoidImage}
          imageCache={imageCache}
          fetchNoidImage={fetchNoidImage}
          setSelectedNoidId={setSelectedNoidId}
          setView={setView}
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

      <SearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSearch={(noidId) => {
          setSelectedNoidId(noidId);
          setView('profile');
          setShowSearchModal(false);
        }}
      />

      <footer className="app-footer">
        <div className="footer-content">
          <span className="footer-version">v0.11 (Beta)</span>
          <span className="footer-divider">•</span>
          <span className="footer-credits">NOiDS Battle built and hosted by @NoCredits</span>
        </div>
        <MusicPlayer />
      </footer>
    </div>
  );
}

export default App;
