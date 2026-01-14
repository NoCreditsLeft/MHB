# NOID Image Scraper - Setup Instructions

This will scrape all 5,555 NOID image URLs and store them in your Supabase database.

## Step 1: Add Database Table

1. Go to Supabase → SQL Editor
2. Open the file `add-noid-images-table.sql`
3. Copy all the SQL
4. Paste into SQL Editor
5. Click **Run**
6. Should see "Success. No rows returned"

## Step 2: Install Dependencies

In your project folder, run:

```bash
npm install @supabase/supabase-js
```

## Step 3: Run the Scraper

```bash
node scrape-noids.js
```

## What Happens:

- Fetches all 5,555 NOIDs in batches of 50
- 2 second delay between batches (avoids rate limits)
- Saves image URLs to `noid_images` table
- Takes about **~4 hours** to complete (be patient!)
- You can stop/restart - it uses `upsert` so won't duplicate

## Monitor Progress:

You'll see output like:
```
📥 Fetching batch: NOID #1 - #50
✅ Saved 50 images to database
📊 Progress: 0.9% (50 saved, 0 failed)
⏳ Waiting 2000ms before next batch...
```

## Check Results:

While it's running, you can check Supabase:
- Table Editor → noid_images
- Watch the rows populate!

## After It Completes:

1. Deploy your updated App.jsx:
   - GitHub Desktop → Commit → Push
2. Vercel auto-deploys in ~2 minutes
3. Visit https://noids-battle.vercel.app
4. **Real NOID images!** 🎉

## Troubleshooting:

**"Cannot find module '@supabase/supabase-js'"**
- Run `npm install @supabase/supabase-js`

**Rate limit errors**
- Increase `DELAY_MS` in scrape-noids.js (try 5000)

**Scraper stops**
- Just run it again, it'll skip already-saved NOIDs

## Alternative: Run in Background

To run overnight without keeping terminal open:

**Mac/Linux:**
```bash
nohup node scrape-noids.js > scrape.log 2>&1 &
```

**Windows:**
```bash
start /B node scrape-noids.js > scrape.log
```

Check progress: `tail -f scrape.log` (Mac/Linux) or open scrape.log in notepad
