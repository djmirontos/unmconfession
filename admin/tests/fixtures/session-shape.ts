// Shapes of what Supabase Auth stores for a panel session after password + TOTP.
// "worst": a 254-character email, a Google-linked identity (long avatar URLs in user_metadata).
// "typical": an email-only moderator. Both: an aal2 token with two amr entries, ES256 signature,
// one verified TOTP factor.

export type Shape = 'worst' | 'typical';

const REF = 'hjvmdgannytjkrhghixuv';
const UUID = '0b6f3c2e-9a41-4f7d-8c55-2f1e7a9d3b10';
const LONG_EMAIL = `${'m'.repeat(64)}@${'d'.repeat(63)}.${'e'.repeat(63)}.${'f'.repeat(57)}.ph`; // 254 chars
const PICTURE = `https://lh3.googleusercontent.com/a/${'A'.repeat(90)}=s96-c`;
const NOW_S = 1_800_000_000;
const TS = '2026-10-27T08:00:00.000000Z';

export const AUTH_COOKIE = `sb-${REF}-auth-token`;

const b64url = (value: string) => Buffer.from(value).toString('base64url');

function parts(shape: Shape) {
  const email = shape === 'worst' ? LONG_EMAIL : 'mod.santos@unm.edu.ph';
  const emailMetadata = { email, email_verified: true, phone_verified: false, sub: UUID };
  const googleMetadata = {
    avatar_url: PICTURE,
    email,
    email_verified: true,
    full_name: 'Maria Clara Dela Cruz Santos',
    iss: 'https://accounts.google.com',
    name: 'Maria Clara Dela Cruz Santos',
    phone_verified: false,
    picture: PICTURE,
    provider_id: '112233445566778899001',
    sub: '112233445566778899001',
  };
  const providers = shape === 'worst' ? ['email', 'google'] : ['email'];
  return { email, providers, userMetadata: shape === 'worst' ? googleMetadata : emailMetadata, emailMetadata, googleMetadata };
}

export function accessToken(shape: Shape): string {
  const { email, providers, userMetadata } = parts(shape);
  const header = { alg: 'ES256', kid: UUID, typ: 'JWT' };
  const payload = {
    iss: `https://${REF}.supabase.co/auth/v1`,
    sub: UUID,
    aud: 'authenticated',
    exp: NOW_S + 3600,
    iat: NOW_S,
    email,
    phone: '',
    app_metadata: { provider: 'email', providers },
    user_metadata: userMetadata,
    role: 'authenticated',
    aal: 'aal2',
    amr: [
      { method: 'totp', timestamp: NOW_S },
      { method: 'password', timestamp: NOW_S - 60 },
    ],
    session_id: UUID,
    is_anonymous: false,
  };
  return `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}.${'s'.repeat(86)}`;
}

function user(shape: Shape) {
  const { email, providers, userMetadata, emailMetadata, googleMetadata } = parts(shape);
  const identity = (provider: string, data: object) => ({
    identity_id: UUID,
    id: UUID,
    user_id: UUID,
    identity_data: data,
    provider,
    last_sign_in_at: TS,
    created_at: TS,
    updated_at: TS,
    email,
  });
  return {
    id: UUID,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: TS,
    phone: '',
    confirmation_sent_at: TS,
    confirmed_at: TS,
    last_sign_in_at: TS,
    app_metadata: { provider: 'email', providers },
    user_metadata: userMetadata,
    identities: [
      identity('email', emailMetadata),
      ...(shape === 'worst' ? [identity('google', googleMetadata)] : []),
    ],
    created_at: TS,
    updated_at: TS,
    is_anonymous: false,
    factors: [
      {
        id: UUID,
        friendly_name: 'Moderation panel',
        factor_type: 'totp',
        status: 'verified',
        created_at: TS,
        updated_at: TS,
        last_challenged_at: TS,
      },
    ],
  };
}

/** The JSON auth-js writes to the auth cookie: with the user object ("user-and-tokens") or without ("tokens-only"). */
export function storedSession(shape: Shape, withUser: boolean): string {
  return JSON.stringify({
    access_token: accessToken(shape),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: NOW_S + 3600,
    refresh_token: 'v2xq7hk3m5pd',
    ...(withUser ? { user: user(shape) } : {}),
  });
}
