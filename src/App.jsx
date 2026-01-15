import { useState, useEffect } from 'react';
import './App.css';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { createClient } from '@supabase/supabase-js';
import MyNoids from './MyNoids';
import ConnectWalletModal from './ConnectWalletModal';

const supabaseUrl = 'https://jvmddbqxhfaicyctmmvt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2bWRkYnF4aGZhaWN5Y3RtbXZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyOTg4MDYsImV4cCI6MjA4Mzg3NDgwNn0.SD37h5vkKVQwODXavoRkej6yFsAYhT8nLmxIxs3AoZg';
export const supabase = createClient(supabaseUrl, supabaseKey);

const OPENSEA_API_KEY = 'f6662070d18f4d54936bdd66b94c3f11';

const ONE_OF_ONE_NOIDS = [
  3399, 4550, 46, 3421, 5521, 4200, 814, 1587, 4234, 1601,
  2480, 1046, 4999, 2290, 1401, 2148, 3921, 4900, 4699, 1187,
  2225, 948, 2214, 1448, 3321, 4221, 4111, 2281, 2231, 2014,
  2187, 4800, 4890, 1748, 4601, 1948, 4400, 4981, 412, 4651,
  3390, 601
];

function App() {
  const [noid1, setNoid1] = useState(null);
  const [noid2, setNoid2] = useState(null);
  const [loading, setLoading] = useState(true);
  const [votedToday, setVotedToday] = useState(0);
  const [recording, setRecording] = useState(false);
  const [winner, setWinner] = useState(null);
  const [view, setView] = useState('battle');
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [leaderboardTab, setLeaderboardTab] = useState('winRate');
  const [gameMode, setGameMode] = useState('rando');
  const [stickyWinner, setStickyWinner] = useState(null);
  const [imageCache, setImageCache] = useState({});
  const [profileNoid, setProfileNoid] = useState(null);
  const [profileStats, setProfileStats] = useState(null);
  const [profileTab, setProfileTab] = useState('overview');
  const [headToHeadData, setHeadToHeadData] = useState([]);
  const [dailyBattleData, setDailyBattleData] = useState(null);
  const [userDailyVoted, setUserDailyVoted] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);

  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const userId = isConnected && address ? address.toLowerCase() : getOrCreateUserId();

  function getOrCreateUserId() {
    let id = localStorage.getItem('noids_user_id');
    if (!id) {
      id = 'user_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('noids_user_id', id);
    }
    return id;
  }

  const today = new Date().toISOString().split('T')[0];
  const voteKey = `votes_${userId}_${today}`;
  const dailyVoteKey = `daily_vote_${userId}_${today}`;

  useEffect(() => {
    const votes = parseInt(localStorage.getItem(voteKey) || '0');
    setVotedToday(votes);
    
    const dailyVoted = localStorage.getItem(dailyVoteKey) === 'true';
    setUserDailyVoted(dailyVoted);
  }, [voteKey, dailyVoteKey]);

  useEffect(() => {
    if (view === 'battle') {
      if (gameMode === 'daily') {
        loadDailyBattle();
      } else {
        loadBattle();
      }
    } else if (view === 'leaderboard') {
      loadLeaderboard();
    }
  }, [view, gameMode]);

  useEffect(() => {
    if (profileNoid) {
      loadProfileData(profileNoid);
    }
  }, [profileNoid, profileTab]);

  const loadProfileData = async (noidId) => {
    try {
      const { data: stats } = await supabase
        .from('noid_stats')
        .select('*')
        .eq('noid_id', noidId)
        .single();

      setProfileStats(stats || {
        noid_id: noidId,
        total_battles: 0,
        total_wins: 0,
        total_losses: 0,
        win_rate: 0,
        current_streak: 0,
        best_streak: 0
      });

      if (profileTab === 'headToHead') {
        const { data: h2h } = await supabase
          .from('head_to_head')
          .select('*')
          .or(`noid1_id.eq.${noidId},noid2_id.eq.${noidId}`)
          .order('total_battles', { ascending: false })
          .limit(20);

        const formattedData = h2h?.map(record => {
          const isNoid1 = record.noid1_id === noidId;
          const opponentId = isNoid1 ? record.noid2_id : record.noid1_id;
          const wins = isNoid1 ? record.noid1_wins : record.noid2_wins;
          const losses = isNoid1 ? record.noid2_wins : record.noid1_wins;

          return {
            opponent_id: opponentId,
            battles: record.total_battles,
            wins: wins,
            losses: losses,
            win_rate: record.total_battles > 0 ? ((wins / record.total_battles) * 100).toFixed(1) : '0.0'
          };
        }) || [];

        setHeadToHeadData(formattedData);

        // Preload opponent images
        formattedData.forEach(record => {
          if (!imageCache[record.opponent_id]) {
            fetchNoidImage(record.opponent_id);
          }
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const fetchNoidImage = async (tokenId) => {
    if (imageCache[tokenId]) return imageCache[tokenId];

    try {
      const response = await fetch(
        `https://api.opensea.io/api/v2/chain/ethereum/contract/0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902/nfts/${tokenId}`,
        {
          headers: {
            'x-api-key': OPENSEA_API_KEY
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
  };

  const loadDailyBattle = async () => {
    setLoading(true);
    try {
      // Get today's date in UTC
      const todayUTC = new Date().toISOString().split('T')[0];
      
      // Query for today's pre-generated battle
      const { data: existingBattle, error } = await supabase
        .from('daily_battles')
        .select('*')
        .eq('battle_date', todayUTC)
        .single();

      if (error) {
        console.error('Error fetching daily battle:', error);
        throw error;
      }

      if (existingBattle) {
        setDailyBattleData(existingBattle);
        setNoid1(existingBattle.noid1_id);
        setNoid2(existingBattle.noid2_id);
        
        await Promise.all([
          fetchNoidImage(existingBattle.noid1_id),
          fetchNoidImage(existingBattle.noid2_id)
        ]);
      } else {
        // This should never happen if we have 2 years of pre-generated battles
        console.error('No daily battle found for today:', todayUTC);
        alert('No daily battle available for today. Please contact support.');
      }
    } catch (error) {
      console.error('Error loading daily battle:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBattle = async () => {
    setLoading(true);
    setWinner(null);

    try {
      let noid1Id, noid2Id;

      if (gameMode === 'sticky' && stickyWinner) {
        noid1Id = stickyWinner;
        noid2Id = getRandomNoid(noid1Id);
      } else if (gameMode === 'oneOfOne') {
        noid1Id = ONE_OF_ONE_NOIDS[Math.floor(Math.random() * ONE_OF_ONE_NOIDS.length)];
        noid2Id = ONE_OF_ONE_NOIDS[Math.floor(Math.random() * ONE_OF_ONE_NOIDS.length)];
        while (noid2Id === noid1Id) {
          noid2Id = ONE_OF_ONE_NOIDS[Math.floor(Math.random() * ONE_OF_ONE_NOIDS.length)];
        }
      } else {
        noid1Id = Math.floor(Math.random() * 5555) + 1;
        noid2Id = Math.floor(Math.random() * 5555) + 1;
        while (noid2Id === noid1Id) {
          noid2Id = Math.floor(Math.random() * 5555) + 1;
        }
      }

      setNoid1(noid1Id);
      setNoid2(noid2Id);

      await Promise.all([
        fetchNoidImage(noid1Id),
        fetchNoidImage(noid2Id)
      ]);

    } catch (error) {
      console.error('Error loading battle:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRandomNoid = (exclude = null) => {
    let noidId;
    if (gameMode === 'oneOfOne') {
      noidId = ONE_OF_ONE_NOIDS[Math.floor(Math.random() * ONE_OF_ONE_NOIDS.length)];
      while (noidId === exclude) {
        noidId = ONE_OF_ONE_NOIDS[Math.floor(Math.random() * ONE_OF_ONE_NOIDS.length)];
      }
    } else {
      noidId = Math.floor(Math.random() * 5555) + 1;
      while (noidId === exclude) {
        noidId = Math.floor(Math.random() * 5555) + 1;
      }
    }
    return noidId;
  };

  const handleVote = async (selectedNoid) => {
    if (!isConnected) {
      setShowWalletModal(true);
      return;
    }

    if (gameMode === 'daily') {
      if (userDailyVoted) {
        alert('You have already voted in today\'s Daily Battle! Come back tomorrow.');
        return;
      }
    } else {
      if (votedToday >= 55) {
        alert('You have used all 55 votes for today! Come back tomorrow.');
        return;
      }
    }

    setRecording(true);
    setWinner(selectedNoid);

    const loserId = selectedNoid === noid1 ? noid2 : noid1;

    try {
      if (gameMode === 'daily') {
        const voteField = selectedNoid === dailyBattleData.noid1_id ? 'noid1_votes' : 'noid2_votes';
        const currentVotes = dailyBattleData[voteField];

        await supabase
          .from('daily_battles')
          .update({ [voteField]: currentVotes + 1 })
          .eq('id', dailyBattleData.id);

        setDailyBattleData(prev => ({
          ...prev,
          [voteField]: currentVotes + 1
        }));

        localStorage.setItem(dailyVoteKey, 'true');
        setUserDailyVoted(true);
      } else {
        localStorage.setItem(voteKey, (votedToday + 1).toString());
        setVotedToday(votedToday + 1);
      }

      await supabase.from('votes').insert({
        user_id: userId,
        winner_noid_id: selectedNoid,
        loser_noid_id: loserId,
        game_mode: gameMode
      });

      const { data: winnerStats } = await supabase
        .from('noid_stats')
        .select('*')
        .eq('noid_id', selectedNoid)
        .single();

      const { data: loserStats } = await supabase
        .from('noid_stats')
        .select('*')
        .eq('noid_id', loserId)
        .single();

      const winnerRank = winnerStats?.current_rank || 9999;
      const loserRank = loserStats?.current_rank || 9999;
      const wasUpset = winnerRank > loserRank;
      const wasUnderdogWin = winnerRank > loserRank + 500;

      await supabase.from('battle_history').insert({
        noid1_id: noid1,
        noid2_id: noid2,
        winner_noid_id: selectedNoid,
        loser_noid_id: loserId,
        game_mode: gameMode,
        winner_rank_before: winnerRank,
        loser_rank_before: loserRank,
        was_upset: wasUpset,
        was_underdog_win: wasUnderdogWin,
        is_daily_battle: gameMode === 'daily'
      });

      const winnerCurrentStreak = winnerStats?.current_streak || 0;
      const newWinnerStreak = winnerCurrentStreak + 1;
      const winnerBestStreak = winnerStats?.best_streak || 0;

      await supabase.rpc('upsert_noid_stats', {
        p_noid_id: selectedNoid,
        p_battles_inc: 1,
        p_wins_inc: 1,
        p_losses_inc: 0,
        p_new_streak: newWinnerStreak,
        p_best_streak: Math.max(newWinnerStreak, winnerBestStreak),
        p_underdog_wins_inc: wasUnderdogWin ? 1 : 0
      });

      await supabase.rpc('upsert_noid_stats', {
        p_noid_id: loserId,
        p_battles_inc: 1,
        p_wins_inc: 0,
        p_losses_inc: 1,
        p_new_streak: 0,
        p_best_streak: loserStats?.best_streak || 0,
        p_underdog_wins_inc: 0
      });

      await supabase.rpc('update_head_to_head', {
        p_noid1_id: noid1,
        p_noid2_id: noid2,
        p_winner_id: selectedNoid
      });

      await supabase.from('noid_beaten').insert({
        winner_noid_id: selectedNoid,
        loser_noid_id: loserId,
        game_mode: gameMode
      });

      await supabase.rpc('upsert_gamemode_stats', {
        p_noid_id: selectedNoid,
        p_game_mode: gameMode,
        p_battles_inc: 1,
        p_wins_inc: 1
      });

      await supabase.rpc('upsert_gamemode_stats', {
        p_noid_id: loserId,
        p_game_mode: gameMode,
        p_battles_inc: 1,
        p_wins_inc: 0
      });

      setTimeout(() => {
        setRecording(false);
        
        if (gameMode === 'daily') {
          // Don't reload for daily battles
        } else {
          const newStickyWinner = gameMode === 'sticky' ? selectedNoid : null;
          setStickyWinner(newStickyWinner);
          loadBattle();
        }
      }, 2000);

    } catch (error) {
      console.error('Error recording vote:', error);
      setRecording(false);
      alert('Error recording vote. Please try again.');
    }
  };

  const loadLeaderboard = async () => {
    try {
      let query = supabase.from('noid_stats').select('*');

      if (leaderboardTab === 'winRate') {
        query = query.gte('total_battles', 3).order('win_rate', { ascending: false });
      } else if (leaderboardTab === 'totalWins') {
        query = query.order('total_wins', { ascending: false });
      } else if (leaderboardTab === 'hotStreak') {
        query = query.gte('current_streak', 3).order('current_streak', { ascending: false });
      }

      const { data } = await query.limit(50);
      setLeaderboardData(data || []);

      if (data) {
        data.forEach(noid => {
          if (!imageCache[noid.noid_id]) {
            fetchNoidImage(noid.noid_id);
          }
        });
      }
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    }
  };

  useEffect(() => {
    if (view === 'leaderboard') {
      loadLeaderboard();
    }
  }, [leaderboardTab]);

  const handleConnectWallet = () => {
    connect({ connector: injected() });
    setShowWalletModal(false);
  };

  const resetVotes = () => {
    localStorage.removeItem(voteKey);
    localStorage.removeItem(dailyVoteKey);
    setVotedToday(0);
    setUserDailyVoted(false);
    alert('Votes reset! This is a beta feature for testing.');
  };

  const viewProfile = (noidId) => {
    setProfileNoid(noidId);
    setProfileTab('overview');
    setView('profile');
  };

  if (view === 'myNoids') {
    return (
      <div className="app">
        <div className="matrix-bg"></div>
        <div className="app-content">
          <MyNoids 
            onBack={() => setView('battle')} 
            imageCache={imageCache}
            fetchNoidImage={fetchNoidImage}
            onViewProfile={viewProfile}
            onResetVotes={resetVotes}
          />
        </div>
        <footer className="app-footer">
          <span className="footer-version">v0.11 (Beta)</span>
          <span className="footer-credits">NOiDS Battle built and hosted by @NoCredits</span>
        </footer>
      </div>
    );
  }

  if (view === 'profile' && profileNoid) {
    return (
      <div className="app">
        <div className="matrix-bg"></div>
        <div className="app-content">
          <div className="profile-view">
            <div className="profile-header">
              <button className="back-button" onClick={() => setView('battle')}>
                ← Back to Battle
              </button>
              <h1 className="profile-title">NOID #{profileNoid}</h1>
            </div>

            <div className="profile-main">
              <div className="profile-image-container">
                <img 
                  src={imageCache[profileNoid] || 'https://via.placeholder.com/300x300?text=Loading...'} 
                  alt={`NOID #${profileNoid}`}
                  className="profile-image"
                />
              </div>

              <div className="profile-info">
                <h2>NOID #{profileNoid}</h2>
                <a 
                  href={`https://opensea.io/assets/ethereum/0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902/${profileNoid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opensea-link-profile"
                >
                  <img 
                    src="https://static.seadn.io/logos/Logomark-Transparent%20White.png" 
                    alt="OpenSea"
                    className="opensea-icon"
                  />
                </a>

                {profileStats && (
                  <>
                    {profileStats.current_streak > 0 && (
                      <div className="streak-badge">
                        🔥 {profileStats.current_streak} Streak
                      </div>
                    )}

                    <div className="profile-stats-grid">
                      <div className="profile-stat">
                        <div className="profile-stat-value">{profileStats.win_rate?.toFixed(2) || '0.00'}%</div>
                        <div className="profile-stat-label">WIN RATE</div>
                      </div>
                      <div className="profile-stat">
                        <div className="profile-stat-value">{profileStats.total_wins || 0}</div>
                        <div className="profile-stat-label">TOTAL WINS</div>
                      </div>
                      <div className="profile-stat">
                        <div className="profile-stat-value">{profileStats.total_battles || 0}</div>
                        <div className="profile-stat-label">BATTLES</div>
                      </div>
                    </div>

                    <div className="profile-record">
                      Record: {profileStats.total_wins || 0}W - {profileStats.total_losses || 0}L
                    </div>
                    {profileStats.best_streak > 0 && (
                      <div className="profile-best-streak">
                        Best Streak: {profileStats.best_streak}
                      </div>
                    )}
                    {profileStats.current_rank && (
                      <div className="profile-rank">
                        Current Rank: #{profileStats.current_rank}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="profile-tabs">
              <button 
                className={`profile-tab ${profileTab === 'overview' ? 'active' : ''}`}
                onClick={() => setProfileTab('overview')}
              >
                Overview
              </button>
              <button 
                className={`profile-tab ${profileTab === 'headToHead' ? 'active' : ''}`}
                onClick={() => setProfileTab('headToHead')}
              >
                Head-to-Head
              </button>
              <button 
                className={`profile-tab ${profileTab === 'achievements' ? 'active' : ''}`}
                onClick={() => setProfileTab('achievements')}
              >
                Achievements
              </button>
            </div>

            <div className="profile-content">
              {profileTab === 'overview' && (
                <div className="profile-overview">
                  <h3>Career Statistics</h3>
                  {profileStats && (
                    <div className="stats-list">
                      <div className="stat-row">
                        <span>Total Battles:</span>
                        <span>{profileStats.total_battles || 0}</span>
                      </div>
                      <div className="stat-row">
                        <span>Total Wins:</span>
                        <span>{profileStats.total_wins || 0}</span>
                      </div>
                      <div className="stat-row">
                        <span>Total Losses:</span>
                        <span>{profileStats.total_losses || 0}</span>
                      </div>
                      <div className="stat-row">
                        <span>Win Rate:</span>
                        <span>{profileStats.win_rate?.toFixed(2) || '0.00'}%</span>
                      </div>
                      <div className="stat-row">
                        <span>Current Streak:</span>
                        <span>{profileStats.current_streak || 0}</span>
                      </div>
                      <div className="stat-row">
                        <span>Best Streak:</span>
                        <span>{profileStats.best_streak || 0}</span>
                      </div>
                      <div className="stat-row">
                        <span>Underdog Wins:</span>
                        <span>{profileStats.underdog_wins || 0}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {profileTab === 'headToHead' && (
                <div className="profile-head-to-head">
                  <h3>MOST BATTLED OPPONENTS</h3>
                  {headToHeadData.length > 0 ? (
                    <div className="h2h-list">
                      {headToHeadData.map((record, index) => (
                        <div key={index} className="h2h-row">
                          <div className="h2h-opponent">
                            <img 
                              src={imageCache[record.opponent_id] || 'https://via.placeholder.com/50x50?text=Loading'} 
                              alt={`NOID #${record.opponent_id}`}
                              className="h2h-thumbnail"
                              onClick={() => viewProfile(record.opponent_id)}
                              style={{ cursor: 'pointer' }}
                            />
                            <span 
                              className="h2h-opponent-link"
                              onClick={() => viewProfile(record.opponent_id)}
                            >
                              NOID #{record.opponent_id}
                            </span>
                          </div>
                          <div className="h2h-battles">{record.battles} battles</div>
                          <div className="h2h-record">{record.wins}W - {record.losses}L</div>
                          <div className="h2h-winrate">{record.win_rate}%</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>No head-to-head data available yet.</p>
                  )}
                </div>
              )}

              {profileTab === 'achievements' && (
                <div className="profile-achievements">
                  <h3>Achievements</h3>
                  <p>Achievement system coming soon...</p>
                </div>
              )}
            </div>
          </div>
        </div>
        <footer className="app-footer">
          <span className="footer-version">v0.11 (Beta)</span>
          <span className="footer-credits">NOiDS Battle built and hosted by @NoCredits</span>
        </footer>
      </div>
    );
  }

  if (view === 'leaderboard') {
    return (
      <div className="app">
        <div className="matrix-bg"></div>
        <div className="app-content">
          <div className="leaderboard-view">
            <div className="leaderboard-header">
              <button className="back-button" onClick={() => setView('battle')}>
                ← Back to Battle
              </button>
              <h1 className="leaderboard-title">LEADERBOARD</h1>
            </div>

            <div className="leaderboard-tabs">
              <button 
                className={`leaderboard-tab ${leaderboardTab === 'winRate' ? 'active' : ''}`}
                onClick={() => setLeaderboardTab('winRate')}
              >
                Win Rate
              </button>
              <button 
                className={`leaderboard-tab ${leaderboardTab === 'totalWins' ? 'active' : ''}`}
                onClick={() => setLeaderboardTab('totalWins')}
              >
                Total Wins
              </button>
              <button 
                className={`leaderboard-tab ${leaderboardTab === 'hotStreak' ? 'active' : ''}`}
                onClick={() => setLeaderboardTab('hotStreak')}
              >
                Hot Streak
              </button>
            </div>

            <div className="leaderboard-list">
              {leaderboardData.map((noid, index) => (
                <div key={noid.noid_id} className="leaderboard-item" onClick={() => viewProfile(noid.noid_id)}>
                  <div className="leaderboard-rank">#{index + 1}</div>
                  <img 
                    src={imageCache[noid.noid_id] || 'https://via.placeholder.com/60x60?text=Loading...'} 
                    alt={`NOID #${noid.noid_id}`}
                    className="leaderboard-image"
                  />
                  <div className="leaderboard-info">
                    <div className="leaderboard-noid-name">NOID #{noid.noid_id}</div>
                    <div className="leaderboard-stats">
                      {leaderboardTab === 'winRate' && (
                        <>
                          <span>{noid.win_rate.toFixed(2)}% Win Rate</span>
                          <span className="stat-separator">•</span>
                          <span>{noid.total_battles} battles</span>
                        </>
                      )}
                      {leaderboardTab === 'totalWins' && (
                        <>
                          <span>{noid.total_wins} Wins</span>
                          <span className="stat-separator">•</span>
                          <span>{noid.total_battles} battles</span>
                        </>
                      )}
                      {leaderboardTab === 'hotStreak' && (
                        <>
                          <span>🔥 {noid.current_streak} Win Streak</span>
                          <span className="stat-separator">•</span>
                          <span>Best: {noid.best_streak}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <a 
                    href={`https://opensea.io/assets/ethereum/0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902/${noid.noid_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opensea-link-leaderboard"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <img 
                      src="https://static.seadn.io/logos/Logomark-Transparent%20White.png" 
                      alt="OpenSea"
                      className="opensea-icon"
                    />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
        <footer className="app-footer">
          <span className="footer-version">v0.11 (Beta)</span>
          <span className="footer-credits">NOiDS Battle built and hosted by @NoCredits</span>
        </footer>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="matrix-bg"></div>
      
      <div className="app-content">
        <header className="app-header">
          <h1 className="app-title">NOiDS BATTLE</h1>
          <div className="header-controls">
            {isConnected ? (
              <>
                <button className="my-noids-button" onClick={() => setView('myNoids')}>
                  My NOIDs
                </button>
                <button className="wallet-button connected" onClick={() => disconnect()}>
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </button>
              </>
            ) : (
              <button className="wallet-button" onClick={() => setShowWalletModal(true)}>
                Connect Wallet
              </button>
            )}
          </div>
        </header>

        <div className="mode-selector">
          <button 
            className={`mode-button ${gameMode === 'rando' ? 'active' : ''}`}
            onClick={() => {
              setGameMode('rando');
              setStickyWinner(null);
            }}
          >
            🎲 Rando Battle
          </button>
          <button 
            className={`mode-button ${gameMode === 'sticky' ? 'active' : ''}`}
            onClick={() => {
              setGameMode('sticky');
              setStickyWinner(null);
            }}
          >
            🏆 Sticky Winner
          </button>
          <button 
            className={`mode-button ${gameMode === 'oneOfOne' ? 'active' : ''}`}
            onClick={() => {
              setGameMode('oneOfOne');
              setStickyWinner(null);
            }}
          >
            👑 One of One Championship
          </button>
          <button 
            className={`mode-button ${gameMode === 'daily' ? 'active' : ''}`}
            onClick={() => {
              setGameMode('daily');
              setStickyWinner(null);
            }}
          >
            ⭐ Daily Battle
          </button>
        </div>

        <div className="vote-counter">
          {gameMode === 'daily' ? (
            userDailyVoted ? (
              <span className="votes-used">✓ Voted Today</span>
            ) : (
              <span>1 vote available today</span>
            )
          ) : (
            <>
              <span>{votedToday} / 55 votes used today</span>
              {votedToday >= 55 && <span className="votes-maxed"> - Come back tomorrow!</span>}
            </>
          )}
        </div>

        {loading ? (
          <div className="loading">Loading battle...</div>
        ) : (
          <div className="battle-container">
            <div 
              className={`battle-card ${winner === noid1 ? 'winner' : winner === noid2 ? 'loser' : ''}`}
              onClick={() => !recording && !userDailyVoted && handleVote(noid1)}
            >
              <img 
                src={imageCache[noid1] || 'https://via.placeholder.com/300x300?text=Loading...'} 
                alt={`NOID #${noid1}`}
                className="noid-image"
              />
              <div className="noid-info">
                <h2>NOID #{noid1}</h2>
                <a 
                  href={`https://opensea.io/assets/ethereum/0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902/${noid1}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opensea-link-battle"
                  onClick={(e) => e.stopPropagation()}
                >
                  <img 
                    src="https://static.seadn.io/logos/Logomark-Transparent%20White.png" 
                    alt="OpenSea"
                    className="opensea-icon"
                  />
                </a>
              </div>
              {gameMode === 'daily' && dailyBattleData && userDailyVoted && (
                <div className="vote-count">
                  {dailyBattleData.noid1_votes} votes
                </div>
              )}
            </div>

            <div className="vs-divider">VS</div>

            <div 
              className={`battle-card ${winner === noid2 ? 'winner' : winner === noid1 ? 'loser' : ''}`}
              onClick={() => !recording && !userDailyVoted && handleVote(noid2)}
            >
              <img 
                src={imageCache[noid2] || 'https://via.placeholder.com/300x300?text=Loading...'} 
                alt={`NOID #${noid2}`}
                className="noid-image"
              />
              <div className="noid-info">
                <h2>NOID #{noid2}</h2>
                <a 
                  href={`https://opensea.io/assets/ethereum/0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902/${noid2}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opensea-link-battle"
                  onClick={(e) => e.stopPropagation()}
                >
                  <img 
                    src="https://static.seadn.io/logos/Logomark-Transparent%20White.png" 
                    alt="OpenSea"
                    className="opensea-icon"
                  />
                </a>
              </div>
              {gameMode === 'daily' && dailyBattleData && userDailyVoted && (
                <div className="vote-count">
                  {dailyBattleData.noid2_votes} votes
                </div>
              )}
            </div>

            {recording && (
              <div className="recording-overlay">
                {gameMode === 'daily' ? (
                  <>
                    <div className="recording-text">Thanks for voting!</div>
                    <div className="recording-subtext">Come back tomorrow for the next Daily Battle</div>
                  </>
                ) : (
                  <div className="recording-text">Recording Vote...</div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="leaderboard-link">
          <button onClick={() => setView('leaderboard')}>
            View Leaderboard →
          </button>
        </div>
      </div>

      <footer className="app-footer">
        <span className="footer-version">v0.11 (Beta)</span>
        <span className="footer-credits">NOiDS Battle built and hosted by @NoCredits</span>
      </footer>

      {showWalletModal && (
        <ConnectWalletModal 
          onConnect={handleConnectWallet}
          onClose={() => setShowWalletModal(false)}
        />
      )}
    </div>
  );
}

export default App;
