// api/noid-image.js
// Vercel Serverless Function to fetch NOID images

export default async function handler(req, res) {
  const { tokenId } = req.query;

  if (!tokenId) {
    return res.status(400).json({ error: 'Token ID required' });
  }

  try {
    // Try multiple sources
    const sources = [
      // Reservoir API
      {
        url: `https://api.reservoir.tools/tokens/v7?tokens=0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902:${tokenId}`,
        parse: (data) => data.tokens?.[0]?.token?.image
      },
      // Alchemy NFT API (demo endpoint)
      {
        url: `https://eth-mainnet.g.alchemy.com/nft/v3/docs-demo/getNFTMetadata?contractAddress=0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902&tokenId=${tokenId}`,
        parse: (data) => data.image?.originalUrl || data.image?.cachedUrl
      },
      // Direct OpenSea metadata
      {
        url: `https://api.opensea.io/api/v1/asset/0xa9de7e79b35a7c2b4d586e1e1223ff70608cd902/${tokenId}`,
        parse: (data) => data.image_url
      }
    ];

    for (const source of sources) {
      try {
        const response = await fetch(source.url);
        if (response.ok) {
          const data = await response.json();
          const imageUrl = source.parse(data);
          if (imageUrl) {
            return res.status(200).json({ imageUrl });
          }
        }
      } catch (err) {
        console.error(`Source failed:`, err.message);
        continue;
      }
    }

    // Fallback to placeholder
    return res.status(200).json({ 
      imageUrl: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${tokenId}&size=512` 
    });

  } catch (error) {
    console.error('Error fetching NOID image:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch image',
      imageUrl: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${tokenId}&size=512`
    });
  }
}
