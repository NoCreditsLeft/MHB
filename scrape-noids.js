// scrape-noids.js
// Run this ONCE to populate your database with all NOID image URLs

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jvmddbqxhfaicyctmmvt.supabase.co';
const supabaseKey = 'sb_publishable_Gn7WXHUlJkrcKNwS38pD-g_DEDG3WB1';
const supabase = createClient(supabaseUrl, supabaseKey);

const TOTAL_NOIDS = 5555;
const BATCH_SIZE = 50; // Process 50 at a time
const DELAY_MS = 2000; // 2 second delay between batches to avoid rate limits

// Sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchNoidImage(tokenId) {
  try {
    // Try OpenSea API first
    const response = await fetch(
      `https://api.opensea.io/api/v2/chain/ethereum/contract/0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902/nfts/${tokenId}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.nft?.image_url) {
        return data.nft.image_url;
      }
    }

    // Fallback: try Alchemy public endpoint
    const alchemyResponse = await fetch(
      `https://eth-mainnet.g.alchemy.com/nft/v3/docs-demo/getNFTMetadata?contractAddress=0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902&tokenId=${tokenId}`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (alchemyResponse.ok) {
      const alchemyData = await alchemyResponse.json();
      if (alchemyData.image?.originalUrl) {
        return alchemyData.image.originalUrl;
      }
      if (alchemyData.image?.cachedUrl) {
        return alchemyData.image.cachedUrl;
      }
    }

    console.log(`⚠️  No image found for NOID #${tokenId}`);
    return null;

  } catch (error) {
    console.error(`❌ Error fetching NOID #${tokenId}:`, error.message);
    return null;
  }
}

async function saveToDatabase(noidData) {
  try {
    const { error } = await supabase
      .from('noid_images')
      .upsert(noidData, { onConflict: 'token_id' });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Database error:', error);
    return false;
  }
}

async function scrapeAllNoids() {
  console.log('🚀 Starting NOID image scraper...');
  console.log(`📦 Total NOIDs to fetch: ${TOTAL_NOIDS}`);
  console.log(`⏱️  Batch size: ${BATCH_SIZE}, Delay: ${DELAY_MS}ms\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 1; i <= TOTAL_NOIDS; i += BATCH_SIZE) {
    const batchEnd = Math.min(i + BATCH_SIZE - 1, TOTAL_NOIDS);
    console.log(`\n📥 Fetching batch: NOID #${i} - #${batchEnd}`);

    const promises = [];
    for (let tokenId = i; tokenId <= batchEnd; tokenId++) {
      promises.push(
        fetchNoidImage(tokenId).then(imageUrl => ({
          token_id: tokenId,
          image_url: imageUrl
        }))
      );
    }

    const results = await Promise.all(promises);
    
    // Filter out null results
    const validResults = results.filter(r => r.image_url !== null);
    
    if (validResults.length > 0) {
      const saved = await saveToDatabase(validResults);
      if (saved) {
        successCount += validResults.length;
        console.log(`✅ Saved ${validResults.length} images to database`);
      }
    }
    
    failCount += results.length - validResults.length;

    // Progress
    const progress = ((batchEnd / TOTAL_NOIDS) * 100).toFixed(1);
    console.log(`📊 Progress: ${progress}% (${successCount} saved, ${failCount} failed)`);

    // Delay before next batch
    if (batchEnd < TOTAL_NOIDS) {
      console.log(`⏳ Waiting ${DELAY_MS}ms before next batch...`);
      await sleep(DELAY_MS);
    }
  }

  console.log('\n\n🎉 Scraping complete!');
  console.log(`✅ Successfully saved: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`\n💾 Images stored in 'noid_images' table`);
}

// Run the scraper
scrapeAllNoids().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
