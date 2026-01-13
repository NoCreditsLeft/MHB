import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = 'https://jvmddbqxhfaicyctmmvt.supabase.co';
const supabaseKey = 'sb_publishable_Gn7WXHUlJkrcKNwS38pD-g_DEDG3WB1';
const supabase = createClient(supabaseUrl, supabaseKey);

const TOTAL_NOIDS = 5555;
const DAILY_VOTE_LIMIT = 55;

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

  const getNoidImage = async (tokenId) => {
    // Use our Vercel serverless function to avoid CORS issues
    try {
      const response = await fetch(`/api/noid-image?tokenId=${tokenId}`);
      const data = await response.json();
      return data.imageUrl;
    } catch (err) {
      console.error('Error fetching NOID image:', err);
      return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${tokenId}&size=512`;
    }
  };

  const startBattle = async (mode) => {
    setGameMode(mode);
    setLoading(true);

    if (mode === 'rando') {
      const id1 = getRandomNoid();
      const id2 = getRandomNoid([id1]);
      const [img1, img2] = await Promise.all([getNoidImage(id1), getNoidImage(id2)]);
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
        const [img1, img2] = await Promise.all([getNoidImage(id1), getNoidImage(id2)]);
        setNoid1({ id: id1, image: img1 });
        setNoid2({ id: id2, image: img2 });
      }
    } else if (mode === 'oneofone') {
      const id1 = getRandomNoid();
      const id2 = getRandomNoid([id1]);
      const [img1, img2] = await Promise.all([getNoidImage(id1), getNoidImage(id2)]);
      setNoid1({ id: id1, image: img1 });
      setNoid2({ id: id2, image: img2 });
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

      if (data) {
        setDailyBattleData(data);
        const [img1, img2] = await Promise.all([
          getNoidImage(data.noid1_id), 
          getNoidImage(data.noid2_id)
        ]);
        setNoid1({ id: data.noid1_id, image: img1 });
        setNoid2({ id: data.noid2_id, image: img2 });
      } else {
        const id1 = getRandomNoid();
        const id2 = getRandomNoid([id1]);
        
        const { data: newBattle } = await supabase
          .from('daily_battles')
          .insert({
            battle_date: today,
            noid1_id: id1,
            noid2_id: id2,
            noid1_votes: 0,
            noid2_votes: 0
          })
          .select()
          .single();

        if (newBattle) {
          setDailyBattleData(newBattle);
          const [img1, img2] = await Promise.all([getNoidImage(id1), getNoidImage(id2)]);
          setNoid1({ id: id1, image: img1 });
          setNoid2({ id: id2, image: img2 });
        }
      }

      const voteKey = `daily_vote_${userId}_${today}`;
      const hasVoted = localStorage.getItem(voteKey);
      setUserDailyVoted(!!hasVoted);
    } catch (err) {
      console.error('Error loading daily battle:', err);
    }
  };

  const handleVote = async (winner) => {
    if (gameMode === 'daily') {
      if (userDailyVoted) {
        alert('You already voted in today\'s battle!');
        return;
      }
      await submitDailyVote(winner);
    } else {
      if (votesRemaining <= 0) {
        alert('You\'ve used all your daily votes! Come back tomorrow.');
        return;
      }
      await submitRegularVote(winner);
    }
  };

  const submitDailyVote = async (winner) => {
    const today = new Date().toISOString().split('T')[0];
    const winnerField = winner === 1 ? 'noid1_votes' : 'noid2_votes';

    try {
      await supabase
        .from('daily_battles')
        .update({
          [winnerField]: dailyBattleData[winnerField] + 1
        })
        .eq('id', dailyBattleData.id);

      const voteKey = `daily_vote_${userId}_${today}`;
      localStorage.setItem(voteKey, 'true');
      setUserDailyVoted(true);
      await loadDailyBattle();
    } catch (err) {
      console.error('Error submitting daily vote:', err);
    }
  };

  const submitRegularVote = async (winner) => {
    const winnerNoid = winner === 1 ? noid1 : noid2;
    const loserNoid = winner === 1 ? noid2 : noid1;

    try {
      await supabase.from('votes').insert({
        user_id: userId,
        winner_id: winnerNoid.id,
        loser_id: loserNoid.id,
        game_mode: gameMode
      });

      await supabase.rpc('increment_noid_wins', { noid_id: winnerNoid.id });
      await supabase.rpc('increment_noid_battles', { noid_id: winnerNoid.id });
      await supabase.rpc('increment_noid_battles', { noid_id: loserNoid.id });
    } catch (err) {
      console.error('Error recording vote:', err);
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
      <div className="logo">
        <h1>NOiDS BATTLE</h1>
        <p>Which NOID reigns supreme?</p>
      </div>

      <div className="game-modes">
        <h2>Single Player Modes</h2>
        <p className="votes-remaining">Daily Votes: {votesRemaining}/55</p>
        
        <button 
          className="mode-btn"
          onClick={() => startBattle('rando')}
          disabled={votesRemaining <= 0}
        >
          <h3>🎲 Rando Battle</h3>
          <p>Two random NOiDS face off</p>
        </button>

        <button 
          className="mode-btn"
          onClick={() => startBattle('sticky')}
          disabled={votesRemaining <= 0}
        >
          <h3>🏆 Sticky Winner</h3>
          <p>Winner stays, challenger appears</p>
        </button>

        <button 
          className="mode-btn"
          onClick={() => startBattle('oneofone')}
          disabled={votesRemaining <= 0}
        >
          <h3>👑 One of One Championship</h3>
          <p>Battle of the rarest</p>
        </button>

        <h2 style={{ marginTop: '40px' }}>Community Mode</h2>
        
        <button 
          className="mode-btn daily"
          onClick={() => startBattle('daily')}
        >
          <h3>⭐ Daily Battle</h3>
          <p>One battle, one vote, 24 hours</p>
          {userDailyVoted && <span className="voted-badge">✓ Voted</span>}
        </button>
      </div>

      {votesRemaining <= 0 && (
        <div className="limit-notice">
          You've used all your daily votes! Come back tomorrow.
        </div>
      )}
    </div>
  );

  const Battle = () => (
    <div className="battle-container">
      <div className="battle-header">
        <button className="back-btn" onClick={() => setGameMode('menu')}>
          ← Back to Menu
        </button>
        <div className="mode-title">
          {gameMode === 'rando' && '🎲 Rando Battle'}
          {gameMode === 'sticky' && '🏆 Sticky Winner'}
          {gameMode === 'oneofone' && '👑 One of One'}
          {gameMode === 'daily' && '⭐ Daily Battle'}
        </div>
        {gameMode !== 'daily' && (
          <div className="votes-counter">
            Votes: {votesRemaining}/55
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading">Loading NOiDS...</div>
      ) : (
        <div className="battle-arena">
          <div 
            className="noid-card"
            onClick={() => !userDailyVoted && handleVote(1)}
            style={{ cursor: userDailyVoted && gameMode === 'daily' ? 'not-allowed' : 'pointer' }}
          >
            <img src={noid1?.image} alt={`NOID #${noid1?.id}`} />
            <div className="noid-info">
              <h3>NOID #{noid1?.id}</h3>
              {gameMode === 'daily' && dailyBattleData && (
                <div className="vote-count">
                  {dailyBattleData.noid1_votes} votes
                </div>
              )}
            </div>
          </div>

          <div className="vs-divider">
            <span>VS</span>
          </div>

          <div 
            className="noid-card"
            onClick={() => !userDailyVoted && handleVote(2)}
            style={{ cursor: userDailyVoted && gameMode === 'daily' ? 'not-allowed' : 'pointer' }}
          >
            <img src={noid2?.image} alt={`NOID #${noid2?.id}`} />
            <div className="noid-info">
              <h3>NOID #{noid2?.id}</h3>
              {gameMode === 'daily' && dailyBattleData && (
                <div className="vote-count">
                  {dailyBattleData.noid2_votes} votes
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {gameMode === 'daily' && userDailyVoted && (
        <div className="voted-notice">
          Thanks for voting! Check back tomorrow for a new battle.
        </div>
      )}
    </div>
  );

  return (
    <div className="app">
      {gameMode === 'menu' ? <Menu /> : <Battle />}
      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .app {
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
          padding: 20px;
        }

        .menu-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 40px 20px;
        }

        .logo {
          text-align: center;
          margin-bottom: 60px;
        }

        .logo h1 {
          font-size: 4rem;
          font-weight: 900;
          color: white;
          text-shadow: 4px 4px 0px rgba(0, 0, 0, 0.2);
          letter-spacing: -2px;
          margin-bottom: 10px;
        }

        .logo p {
          font-size: 1.2rem;
          color: rgba(255, 255, 255, 0.9);
        }

        .game-modes {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .game-modes h2 {
          color: white;
          font-size: 1.5rem;
          margin-top: 20px;
          margin-bottom: 10px;
        }

        .votes-remaining {
          color: rgba(255, 255, 255, 0.9);
          font-size: 1rem;
          margin-bottom: 10px;
        }

        .mode-btn {
          background: white;
          border: none;
          border-radius: 16px;
          padding: 24px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
          text-align: left;
          position: relative;
        }

        .mode-btn:hover:not(:disabled) {
          transform: translateY(-4px);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
        }

        .mode-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .mode-btn.daily {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          color: white;
        }

        .mode-btn.daily h3,
        .mode-btn.daily p {
          color: white;
        }

        .mode-btn h3 {
          font-size: 1.5rem;
          margin-bottom: 8px;
          color: #667eea;
        }

        .mode-btn p {
          font-size: 1rem;
          color: #666;
        }

        .voted-badge {
          position: absolute;
          top: 24px;
          right: 24px;
          background: rgba(255, 255, 255, 0.3);
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: bold;
        }

        .limit-notice {
          background: rgba(255, 255, 255, 0.2);
          color: white;
          padding: 20px;
          border-radius: 12px;
          text-align: center;
          margin-top: 30px;
          font-size: 1.1rem;
        }

        .battle-container {
          max-width: 1200px;
          margin: 0 auto;
        }

        .battle-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 40px;
          flex-wrap: wrap;
          gap: 20px;
        }

        .back-btn {
          background: rgba(255, 255, 255, 0.2);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 1rem;
          transition: all 0.3s ease;
        }

        .back-btn:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        .mode-title {
          color: white;
          font-size: 2rem;
          font-weight: bold;
          flex: 1;
          text-align: center;
        }

        .votes-counter {
          background: rgba(255, 255, 255, 0.2);
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: bold;
        }

        .loading {
          text-align: center;
          color: white;
          font-size: 2rem;
          padding: 100px 0;
        }

        .battle-arena {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 40px;
          align-items: center;
        }

        .noid-card {
          background: white;
          border-radius: 20px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        }

        .noid-card:hover {
          transform: scale(1.05);
          box-shadow: 0 15px 50px rgba(0, 0, 0, 0.3);
        }

        .noid-card img {
          width: 100%;
          height: auto;
          border-radius: 12px;
          display: block;
        }

        .noid-info {
          margin-top: 16px;
          text-align: center;
        }

        .noid-info h3 {
          color: #667eea;
          font-size: 1.5rem;
          margin-bottom: 8px;
        }

        .vote-count {
          color: #666;
          font-size: 1.1rem;
          font-weight: bold;
        }

        .vs-divider {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .vs-divider span {
          background: white;
          color: #667eea;
          font-size: 2rem;
          font-weight: bold;
          padding: 20px 30px;
          border-radius: 50%;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        }

        .voted-notice {
          background: rgba(255, 255, 255, 0.2);
          color: white;
          padding: 30px;
          border-radius: 16px;
          text-align: center;
          margin-top: 40px;
          font-size: 1.3rem;
        }

        @media (max-width: 768px) {
          .battle-arena {
            grid-template-columns: 1fr;
            gap: 30px;
          }

          .vs-divider {
            order: 2;
          }

          .logo h1 {
            font-size: 2.5rem;
          }

          .mode-title {
            font-size: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}

export default App;
