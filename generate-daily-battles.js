const { createClient } = require('@supabase/supabase-js');

// Configuration
const OPENSEA_API_KEY = 'f6662070d18f4d54936bdd66b94c3f11';
const CONTRACT_ADDRESS = '0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902';
const SUPABASE_URL = 'https://jvmddbqxhfaicyctmmvt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2bWRkYnF4aGZhaWN5Y3RtbXZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyOTg4MDYsImV4cCI6MjA4Mzg3NDgwNn0.SD37h5vkKVQwODXavoRkej6yFsAYhT8nLmxIxs3AoZg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Step 1: Fetch top 250 NOIDs by rarity from OpenSea
async function fetchTop250Noids(fetch) {
  console.log('Step 1: Fetching top 250 NOIDs by rarity from OpenSea...');
  
  const noids = [];
  let next = null;
  
  try {
    while (noids.length < 250) {
      const url = new URL(`https://api.opensea.io/api/v2/collection/noidsofficial/nfts`);
      url.searchParams.append('limit', '50');
      if (next) url.searchParams.append('next', next);
      
      const response = await fetch(url.toString(), {
        headers: {
          'x-api-key': OPENSEA_API_KEY
        }
      });
      
      if (!response.ok) {
        throw new Error(`OpenSea API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Extract token IDs and add to our list
      for (const nft of data.nfts) {
        if (noids.length >= 250) break;
        const tokenId = parseInt(nft.identifier);
        noids.push(tokenId);
      }
      
      next = data.next;
      
      console.log(`  Fetched ${noids.length}/250 NOIDs...`);
      
      // If no more results, break
      if (!next || noids.length >= 250) break;
      
      // Rate limiting - wait 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`✓ Successfully fetched ${noids.length} NOIDs`);
    console.log(`  Top 10 NOIDs: ${noids.slice(0, 10).join(', ')}`);
    return noids;
    
  } catch (error) {
    console.error('Error fetching NOIDs from OpenSea:', error);
    throw error;
  }
}

// Step 2: Generate 730 unique pairings
function generateUniquePairings(noids, numDays = 730) {
  console.log('\nStep 2: Generating 730 unique pairings...');
  
  const pairings = [];
  const usedPairs = new Set();
  
  for (let day = 0; day < numDays; day++) {
    let noid1, noid2, pairKey;
    let attempts = 0;
    const maxAttempts = 1000;
    
    do {
      // Randomly select two different NOIDs
      noid1 = noids[Math.floor(Math.random() * noids.length)];
      noid2 = noids[Math.floor(Math.random() * noids.length)];
      
      // Ensure they're different
      while (noid2 === noid1) {
        noid2 = noids[Math.floor(Math.random() * noids.length)];
      }
      
      // Create a consistent pair key (sorted so order doesn't matter)
      pairKey = [noid1, noid2].sort((a, b) => a - b).join('-');
      
      attempts++;
      
      // If we've tried too many times, allow duplicates (shouldn't happen with 250 NOIDs)
      if (attempts >= maxAttempts) {
        console.warn(`  Warning: Had to allow duplicate pairing on day ${day + 1}`);
        break;
      }
      
    } while (usedPairs.has(pairKey));
    
    usedPairs.add(pairKey);
    pairings.push({ noid1, noid2 });
    
    if ((day + 1) % 100 === 0) {
      console.log(`  Generated ${day + 1}/730 pairings...`);
    }
  }
  
  console.log(`✓ Successfully generated ${pairings.length} unique pairings`);
  console.log(`  First 5 pairings: ${pairings.slice(0, 5).map(p => `${p.noid1} vs ${p.noid2}`).join(', ')}`);
  
  return pairings;
}

// Step 3: Populate database with battles
async function populateDailyBattles(pairings) {
  console.log('\nStep 3: Populating database with daily battles...');
  
  // Start from tomorrow (so today's existing battle isn't overwritten if it exists)
  const startDate = new Date();
  startDate.setUTCHours(0, 0, 0, 0);
  startDate.setUTCDate(startDate.getUTCDate() + 1); // Start from tomorrow
  
  const battles = [];
  
  for (let i = 0; i < pairings.length; i++) {
    const battleDate = new Date(startDate);
    battleDate.setUTCDate(startDate.getUTCDate() + i);
    
    const dateString = battleDate.toISOString().split('T')[0];
    
    battles.push({
      battle_date: dateString,
      noid1_id: pairings[i].noid1,
      noid2_id: pairings[i].noid2,
      noid1_votes: 0,
      noid2_votes: 0
    });
  }
  
  console.log(`  Preparing to insert ${battles.length} battles starting from ${battles[0].battle_date}...`);
  
  try {
    // Insert in batches of 100 to avoid timeout
    const batchSize = 100;
    for (let i = 0; i < battles.length; i += batchSize) {
      const batch = battles.slice(i, i + batchSize);
      
      const { data, error } = await supabase
        .from('daily_battles')
        .insert(batch);
      
      if (error) throw error;
      
      console.log(`  Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(battles.length / batchSize)} (${i + batch.length}/${battles.length} battles)`);
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`✓ Successfully populated database with ${battles.length} daily battles`);
    console.log(`  Date range: ${battles[0].battle_date} to ${battles[battles.length - 1].battle_date}`);
    
  } catch (error) {
    console.error('Error populating database:', error);
    throw error;
  }
}

// Main execution
async function main() {
  console.log('='.repeat(60));
  console.log('DAILY BATTLES GENERATOR - 2 YEARS OF PRE-GENERATED BATTLES');
  console.log('='.repeat(60));
  
  try {
    // Import fetch
    const fetchModule = await import('node-fetch');
    const fetch = fetchModule.default;
    
    // Step 1: Fetch top 250 NOIDs
    const top250Noids = await fetchTop250Noids(fetch);
    
    // Step 2: Generate pairings
    const pairings = generateUniquePairings(top250Noids, 730);
    
    // Step 3: Populate database
    await populateDailyBattles(pairings);
    
    console.log('\n' + '='.repeat(60));
    console.log('✓ ALL STEPS COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Update your App.jsx to remove random generation logic');
    console.log('2. The app should now just query for today\'s UTC date');
    console.log('3. Battles will automatically rotate at 00:00 UTC');
    
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('✗ ERROR OCCURRED');
    console.error('='.repeat(60));
    console.error(error);
    process.exit(1);
  }
}

// Run the script
main();
