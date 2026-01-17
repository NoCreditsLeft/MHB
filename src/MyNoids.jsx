import React, { useState, useEffect } from 'react';
import { supabase } from './App';
import { useAccount } from 'wagmi';
import './MyNoids.css';

const NOIDS_CONTRACT = '0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902';
const OPENSEA_API_KEY = 'f6662070d18f4d54936bdd66b94c3f11';

function MyNoids({ walletAddress, onClose, onViewNoid, getNoidImage }) {
  const [noids, setNoids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { address } = useAccount();

  useEffect(() => {
    if (walletAddress) {
      fetchWalletNoids();
    }
  }, [walletAddress]);

  const fetchWalletNoids = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch NOIDs owned by wallet from OpenSea API
      const response = await fetch(
        `https://api.opensea.io/api/v2/chain/ethereum/account/${walletAddress}/nfts?collection=noidsofficial&limit=200`,
        {
          headers: {
            'Accept': 'application/json',
            ...(OPENSEA_API_KEY && { 'X-API-KEY': OPENSEA_API_KEY })
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch NOIDs from OpenSea');
      }

      const data = await response.json();
      const ownedNoids = data.nfts || [];

      // Extract token IDs
      const tokenIds = ownedNoids.map(nft => parseInt(nft.identifier));

      if (tokenIds.length === 0) {
        setNoids([]);
        setLoading(false);
        return;
      }

      // Fetch stats for each NOID from Supabase
      const { data: statsData, error: statsError } = await supabase
        .from('noid_stats')
        .select('*')
        .in('noid_id', tokenIds);

      if (statsError) {
        console.error('Error fetching stats:', statsError);
      }

      // Combine NFT data with stats
      const noidsWithStats = await Promise.all(
        ownedNoids.map(async (nft) => {
          const tokenId = parseInt(nft.identifier);
          const stats = statsData?.find(s => s.noid_id === tokenId) || {
            total_battles: 0,
            total_wins: 0,
            total_losses: 0,
            win_rate: 0,
            current_rank: null
          };

          // Fetch image
          const image = await getNoidImage(tokenId);

          return {
            id: tokenId,
            image: image,
            ...stats
          };
        })
      );

      // Sort by win rate (descending), then by total wins
      noidsWithStats.sort((a, b) => {
        if (b.win_rate !== a.win_rate) {
          return b.win_rate - a.win_rate;
        }
        return b.total_wins - a.total_wins;
      });

      setNoids(noidsWithStats);
    } catch (err) {
      console.error('Error fetching wallet NOIDs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="my-noids-container">
      <div className="my-noids-header glass-panel">
        <button className="back-btn" onClick={onClose}>
          <span className="back-arrow">←</span>
          Back to Menu
        </button>
        <h1 className="my-noids-title">My NOIDs</h1>
        <div className="header-right">
          <div className="wallet-address">
            {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
          </div>
          <button 
            className="reset-votes-btn"
            onClick={async () => {
              const uid = address.toLowerCase();
              const today = new Date().toISOString().split('T')[0];
              
              // Reset daily_votes_remaining to 55 in database
              const { error } = await supabase
                .from('user_stats')
                .upsert({
                  user_id: uid,
                  daily_votes_remaining: 55,
                  last_vote_reset_date: today,
                  last_active: new Date().toISOString()
                }, { onConflict: 'user_id' });
              
              if (error) {
                console.error('Error resetting votes:', error);
                alert('Failed to reset votes. Check console for errors.');
              } else {
                alert('Votes reset to 55! Refreshing...');
                window.location.reload();
              }
            }}
            title="Reset daily votes to 55 (Beta Mode only)"
          >
            🔄 Reset Votes (Beta)
          </button>
        </div>
      </div>

      {loading && (
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading your NOIDs...</p>
        </div>
      )}

      {error && (
        <div className="error-state glass-panel">
          <span className="error-icon">⚠️</span>
          <p>{error}</p>
          <button onClick={fetchWalletNoids} className="retry-btn">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && noids.length === 0 && (
        <div className="empty-state glass-panel">
          <span className="empty-icon">🔍</span>
          <h2>No NOIDs Found</h2>
          <p>This wallet doesn't own any NOIDs yet.</p>
        </div>
      )}

      {!loading && !error && noids.length > 0 && (
        <>
          <div className="noids-summary glass-panel">
            <div className="summary-stat">
              <span className="stat-label">Total NOIDs</span>
              <span className="stat-value">{noids.length}</span>
            </div>
            <div className="summary-stat">
              <span className="stat-label">In Battles</span>
              <span className="stat-value">
                {noids.filter(n => n.total_battles > 0).length > 0
                  ? (noids.filter(n => n.total_battles > 0).reduce((sum, n) => sum + parseFloat(n.win_rate || 0), 0) / noids.filter(n => n.total_battles > 0).length).toFixed(1)
                  : 0}%
              </span>
            </div>
            <div className="summary-stat">
              <span className="stat-label">Total Wins</span>
              <span className="stat-value">
                {noids.reduce((sum, n) => sum + n.total_wins, 0)}
              </span>
            </div>
            <div className="summary-stat">
              <span className="stat-label">Avg Win Rate</span>
              <span className="stat-value">
                {noids.length > 0
                  ? (noids.reduce((sum, n) => sum + parseFloat(n.win_rate || 0), 0) / noids.length).toFixed(1)
                  : 0}%
              </span>
            </div>
          </div>

          <div className="noids-grid">
            {noids.map((noid) => (
              <div
                key={noid.id}
                className="noid-card glass-card"
                onClick={() => onViewNoid(noid.id)}
              >
                <div className="card-glow"></div>
                <div className="noid-image-container">
                  <img src={noid.image} alt={`NOID #${noid.id}`} />
                  {noid.current_rank && (
                    <div className="rank-badge">#{noid.current_rank}</div>
                  )}
                </div>
                <div className="noid-card-info">
                  <h3>NOID #{noid.id}</h3>
                  
                  {noid.total_battles > 0 ? (
                    <div className="noid-stats">
                      <div className="stat-row">
                        <span className="stat-label">Win Rate:</span>
                        <span className={`stat-value ${
                          noid.win_rate >= 60 ? 'high' : 
                          noid.win_rate >= 40 ? 'medium' : 'low'
                        }`}>
                          {noid.win_rate}%
                        </span>
                      </div>
                      <div className="stat-row">
                        <span className="stat-label">Record:</span>
                        <span className="stat-value">
                          {noid.total_wins}W - {noid.total_losses}L
                        </span>
                      </div>
                      <div className="stat-row">
                        <span className="stat-label">Battles:</span>
                        <span className="stat-value">{noid.total_battles}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="no-battles">
                      <span>No battles yet</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default MyNoids;
