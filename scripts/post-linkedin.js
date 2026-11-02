/**
 * Post weekly club cover + caption to a LinkedIn Organization Page.
 *
 * Env (skip quietly if missing access path):
 *   LINKEDIN_ORGANIZATION_ID  numeric Page id, or urn:li:organization:…
 *   LINKEDIN_ACCESS_TOKEN     short-lived token with w_organization_social
 * Optional refresh (preferred for Actions):
 *   LINKEDIN_REFRESH_TOKEN
 *   LINKEDIN_CLIENT_ID
 *   LINKEDIN_CLIENT_SECRET
 *
 * Reads outreach/linkedin.json (fallback: reddit-auto-post/post.json body)
 * and attaches outreach/weekly-cover.png when present.
 */
const fs = require('fs');
const path = require('path');

const LINKEDIN_VERSION = process.env.LINKEDIN_API_VERSION || '202511';
const root = path.join(__dirname, '..');
const coverPath = path.join(root, 'outreach', 'weekly-cover.png');
const linkedinPayloadPath = path.join(root, 'outreach', 'linkedin.json');
const redditPayloadPath = path.join(root, 'reddit-auto-post', 'post.json');

function orgUrn() {
  const raw = (process.env.LINKEDIN_ORGANIZATION_ID || '').trim();
  if (!raw) return null;
  if (raw.startsWith('urn:li:organization:')) return raw;
  return `urn:li:organization:${raw}`;
}

function apiHeaders(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'LinkedIn-Version': LINKEDIN_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
    ...extra,
  };
}

async function refreshAccessToken() {
  const refresh = process.env.LINKEDIN_REFRESH_TOKEN;
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!refresh || !clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refresh,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(
      `LinkedIn token refresh failed: ${res.status} ${await res.text()}`
    );
  }
  const data = await res.json();
  if (!data.access_token) {
    throw new Error('LinkedIn token refresh returned no access_token');
  }
  console.log('LinkedIn access token refreshed');
  return data.access_token;
}

async function resolveAccessToken() {
  let token = (process.env.LINKEDIN_ACCESS_TOKEN || '').trim();
  if (process.env.LINKEDIN_REFRESH_TOKEN) {
    try {
      const refreshed = await refreshAccessToken();
      if (refreshed) token = refreshed;
    } catch (err) {
      if (!token) throw err;
      console.warn(
        'LinkedIn refresh failed; falling back to LINKEDIN_ACCESS_TOKEN:',
        err.message
      );
    }
  }
  return token || null;
}

function loadPayload() {
  if (fs.existsSync(linkedinPayloadPath)) {
    return JSON.parse(fs.readFileSync(linkedinPayloadPath, 'utf8'));
  }
  if (fs.existsSync(redditPayloadPath)) {
    const reddit = JSON.parse(fs.readFileSync(redditPayloadPath, 'utf8'));
    return {
      text: reddit.body || '',
      cover_image: reddit.cover_image || '',
      game_name: reddit.game_name || '',
      club_url: reddit.club_url || '',
    };
  }
  return null;
}

async function initializeImageUpload(token, owner) {
  const res = await fetch(
    'https://api.linkedin.com/rest/images?action=initializeUpload',
    {
      method: 'POST',
      headers: apiHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        initializeUploadRequest: { owner },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(
      `LinkedIn initializeUpload failed: ${res.status} ${await res.text()}`
    );
  }
  const data = await res.json();
  const value = data.value || data;
  if (!value.uploadUrl || !value.image) {
    throw new Error(
      `LinkedIn initializeUpload missing uploadUrl/image: ${JSON.stringify(data)}`
    );
  }
  return value;
}

async function uploadImageBytes(uploadUrl, bytes) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    body: bytes,
  });
  if (!res.ok) {
    throw new Error(
      `LinkedIn image PUT failed: ${res.status} ${await res.text()}`
    );
  }
}

async function createImagePost(token, owner, imageUrn, commentary, altText) {
  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: apiHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      author: owner,
      commentary,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content: {
        media: {
          id: imageUrn,
          altText: altText.slice(0, 120),
        },
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `LinkedIn create post failed: ${res.status} ${await res.text()}`
    );
  }
  // Rest.li often returns the new post id in x-restli-id / location
  const postId =
    res.headers.get('x-restli-id') ||
    res.headers.get('location') ||
    '(created)';
  return postId;
}

async function main() {
  const owner = orgUrn();
  if (!owner) {
    console.log('LINKEDIN_ORGANIZATION_ID not set; skipping LinkedIn post');
    process.exit(0);
  }

  const token = await resolveAccessToken();
  if (!token) {
    console.log(
      'LINKEDIN_ACCESS_TOKEN / refresh secrets not set; skipping LinkedIn post'
    );
    process.exit(0);
  }

  const payload = loadPayload();
  if (!payload || !(payload.text || '').trim()) {
    console.error('Missing outreach/linkedin.json (or reddit-auto-post/post.json body)');
    process.exit(1);
  }

  const commentary = String(payload.text).slice(0, 3000);
  const alt = `Game Dev Club this week: ${payload.game_name || 'weekly game'}`;

  if (!fs.existsSync(coverPath)) {
    throw new Error('Missing outreach/weekly-cover.png (required for LinkedIn image post)');
  }

  const bytes = fs.readFileSync(coverPath);
  console.log(`Uploading LinkedIn cover (${bytes.length} bytes) as ${owner}`);
  const { uploadUrl, image } = await initializeImageUpload(token, owner);
  await uploadImageBytes(uploadUrl, bytes);
  const postId = await createImagePost(token, owner, image, commentary, alt);
  console.log('LinkedIn post created:', postId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
