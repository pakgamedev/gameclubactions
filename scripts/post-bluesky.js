/**
 * Post weekly club announcement to Bluesky when secrets are present.
 * Env: BLUESKY_HANDLE, BLUESKY_APP_PASSWORD
 * Reads outreach/bluesky.json and attaches outreach/weekly-cover.png when present.
 */
const fs = require('fs');
const path = require('path');

const handle = process.env.BLUESKY_HANDLE;
const password = process.env.BLUESKY_APP_PASSWORD;

if (!handle || !password) {
  console.log('BLUESKY_HANDLE / BLUESKY_APP_PASSWORD not set; skipping Bluesky post');
  process.exit(0);
}

const root = path.join(__dirname, '..');
const payloadPath = path.join(root, 'outreach', 'bluesky.json');
const coverPath = path.join(root, 'outreach', 'weekly-cover.png');

if (!fs.existsSync(payloadPath)) {
  console.error('Missing outreach/bluesky.json');
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
const text = (payload.text || '').slice(0, 300);

async function createSession() {
  const sessionRes = await fetch(
    'https://bsky.social/xrpc/com.atproto.server.createSession',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: handle, password }),
    }
  );
  if (!sessionRes.ok) {
    throw new Error(`Bluesky session failed: ${sessionRes.status} ${await sessionRes.text()}`);
  }
  return sessionRes.json();
}

async function uploadCover(session) {
  if (!fs.existsSync(coverPath)) {
    console.log('No weekly-cover.png; posting text only');
    return null;
  }
  const bytes = fs.readFileSync(coverPath);
  const uploadRes = await fetch(
    'https://bsky.social/xrpc/com.atproto.repo.uploadBlob',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        Authorization: `Bearer ${session.accessJwt}`,
      },
      body: bytes,
    }
  );
  if (!uploadRes.ok) {
    throw new Error(`Bluesky blob upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }
  const { blob } = await uploadRes.json();
  return blob;
}

async function main() {
  const session = await createSession();
  const blob = await uploadCover(session);

  const facets = [];
  const url = payload.club_url || 'https://pakgamedev.com/club';
  const idx = text.indexOf(url);
  if (idx >= 0) {
    const before = text.slice(0, idx);
    const byteStart = Buffer.byteLength(before, 'utf8');
    const byteEnd = byteStart + Buffer.byteLength(url, 'utf8');
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
    });
  }

  const record = {
    $type: 'app.bsky.feed.post',
    text,
    facets: facets.length ? facets : undefined,
    createdAt: new Date().toISOString(),
  };

  if (blob) {
    record.embed = {
      $type: 'app.bsky.embed.images',
      images: [
        {
          alt: `Game Dev Club this week: ${payload.game_name || 'weekly game'}`,
          image: blob,
        },
      ],
    };
  }

  const postRes = await fetch(
    'https://bsky.social/xrpc/com.atproto.repo.createRecord',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessJwt}`,
      },
      body: JSON.stringify({
        repo: session.did,
        collection: 'app.bsky.feed.post',
        record,
      }),
    }
  );

  if (!postRes.ok) {
    throw new Error(`Bluesky post failed: ${postRes.status} ${await postRes.text()}`);
  }
  console.log('Bluesky post created' + (blob ? ' with cover image' : ''));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
