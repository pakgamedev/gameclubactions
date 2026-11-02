/**
 * One-shot helper to mint LinkedIn OAuth tokens for the weekly poster.
 *
 * Usage:
 *   LINKEDIN_CLIENT_ID=… LINKEDIN_CLIENT_SECRET=… \
 *     node scripts/linkedin-oauth-setup.js
 *
 * Then open the printed URL, approve as a Page admin, paste the ?code=…
 * Redirect URI must be exactly: http://localhost:8765/callback
 * (add that URI in the LinkedIn app Auth settings).
 *
 * Products / scopes needed on the app:
 *   - Community Management API (or Advertising API with org posting)
 *   - scope: w_organization_social  (and offline_access when LinkedIn grants it)
 */
const http = require('http');
const { URL } = require('url');

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:8765/callback';
const SCOPES = (
  process.env.LINKEDIN_SCOPES || 'w_organization_social offline_access'
).trim();
const PORT = Number(new URL(REDIRECT_URI).port || 8765);

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET');
  process.exit(1);
}

const authUrl =
  'https://www.linkedin.com/oauth/v2/authorization?' +
  new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state: 'pakgamedev-club',
  }).toString();

console.log('\n1. Ensure this Redirect URL is listed on your LinkedIn app:');
console.log('  ', REDIRECT_URI);
console.log('\n2. Open this URL while logged in as a Page admin:\n');
console.log(authUrl);
console.log('\n3. Waiting for callback on', REDIRECT_URI, '…\n');

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, REDIRECT_URI);
    if (u.pathname !== new URL(REDIRECT_URI).pathname) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const err = u.searchParams.get('error');
    if (err) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end(`OAuth error: ${err} ${u.searchParams.get('error_description') || ''}`);
      console.error('OAuth error', err, u.searchParams.get('error_description'));
      server.close();
      return;
    }
    const code = u.searchParams.get('code');
    if (!code) {
      res.writeHead(400);
      res.end('Missing code');
      return;
    }

    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });
    const text = await tokenRes.text();
    if (!tokenRes.ok) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(text);
      console.error('Token exchange failed:', text);
      server.close();
      return;
    }
    const data = JSON.parse(text);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<h1>LinkedIn tokens minted</h1><p>Copy the values printed in your terminal into GitHub Actions secrets, then close this tab.</p>'
    );

    console.log('\nAdd these GitHub Actions secrets:\n');
    console.log('LINKEDIN_CLIENT_ID=', CLIENT_ID);
    console.log('LINKEDIN_CLIENT_SECRET=', CLIENT_SECRET);
    console.log('LINKEDIN_ACCESS_TOKEN=', data.access_token);
    if (data.refresh_token) {
      console.log('LINKEDIN_REFRESH_TOKEN=', data.refresh_token);
    } else {
      console.log(
        '(no refresh_token returned; re-run this helper when the access token expires)'
      );
    }
    console.log(
      '\nAlso set LINKEDIN_ORGANIZATION_ID to your Page numeric id'
    );
    console.log('(LinkedIn Page Admin → URL …/company/NNNNNNN/admin/).\n');
    server.close();
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end(String(e));
    server.close();
  }
});

server.listen(PORT, '127.0.0.1');
