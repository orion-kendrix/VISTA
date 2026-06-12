// netlify/functions/_utils/linkedinClient.js
// ALL LinkedIn API traffic lives here. Uses the modern OpenID Connect scopes
// and the versioned /rest API (LinkedIn-Version header) for publishing.
//
// Required LinkedIn app products: "Sign In with LinkedIn using OpenID
// Connect" + "Share on LinkedIn" (gives w_member_social). Both need to be
// added to the app in the LinkedIn Developer Portal — see HANDOFF_2 runbook.

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
const API = 'https://api.linkedin.com';

const SCOPES = 'openid profile w_member_social';

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var is not set`);
  return v;
}

function liHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    // Pinned per env so a LinkedIn version sunset is a config change, not a code change.
    'LinkedIn-Version': process.env.LINKEDIN_VERSION || '202506',
    'X-Restli-Protocol-Version': '2.0.0',
  };
}

export function buildAuthUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env('LINKEDIN_CLIENT_ID'),
    redirect_uri: env('LINKEDIN_REDIRECT_URI'),
    scope: SCOPES,
    state,
  });
  return `${AUTH_URL}?${params}`;
}

/** Authorization code → { access_token, expires_in } */
export async function exchangeCode(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: env('LINKEDIN_CLIENT_ID'),
    client_secret: env('LINKEDIN_CLIENT_SECRET'),
    redirect_uri: env('LINKEDIN_REDIRECT_URI'),
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`LinkedIn token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** OIDC userinfo → { sub, name, ... } — sub is the member id we persist. */
export async function getUserInfo(accessToken) {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`LinkedIn userinfo failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Publish a post (optionally with one image) on the member's feed.
 * Returns LinkedIn's post id for post_queue.linkedin_post_id.
 */
export async function publishPost({ accessToken, personUrn, text, imageUrl }) {
  const body = {
    author: personUrn,
    commentary: text,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  if (imageUrl) {
    try {
      body.content = { media: { id: await uploadImage(accessToken, personUrn, imageUrl) } };
    } catch (err) {
      // A broken image shouldn't kill the whole publish — the text still has
      // value. Logged loudly; scheduler result will show published w/o image.
      console.error('[linkedinClient] image upload failed, posting text-only:', err);
    }
  }

  const res = await fetch(`${API}/rest/posts`, {
    method: 'POST',
    headers: liHeaders(accessToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`LinkedIn publish failed: ${res.status} ${await res.text()}`);
  }
  return res.headers.get('x-restli-id') || 'published';
}

/** initializeUpload → PUT binary → returns urn:li:image:… */
async function uploadImage(accessToken, personUrn, imageUrl) {
  const init = await fetch(`${API}/rest/images?action=initializeUpload`, {
    method: 'POST',
    headers: liHeaders(accessToken),
    body: JSON.stringify({ initializeUploadRequest: { owner: personUrn } }),
  });
  if (!init.ok) {
    throw new Error(`initializeUpload failed: ${init.status} ${await init.text()}`);
  }
  const { value } = await init.json(); // { uploadUrl, image }

  const src = await fetch(imageUrl);
  if (!src.ok) throw new Error(`Could not fetch stored image: ${src.status}`);
  const buf = Buffer.from(await src.arrayBuffer());

  const put = await fetch(value.uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: buf,
  });
  if (!put.ok) {
    throw new Error(`image PUT failed: ${put.status} ${await put.text()}`);
  }
  return value.image;
}
