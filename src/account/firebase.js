// GALACTIC RUSH V12 — sign-in with Firebase Authentication (email and password), through Firebase's documented REST
// API, straight from the browser to Google over HTTPS. Passwords go only to Firebase, which stores them hashed; the
// game never stores, logs or sends them anywhere else. What the game keeps is Firebase's session: a short-lived ID
// token (in memory) and the refresh token that renews it (kept in this browser so a reload stays signed in; removed on
// log-out). The Web API key and project id are public identifiers of the Firebase project, not secrets.
// Error messages are deliberately general where a specific one would reveal whether an email address has an account.
const timeoutSignal = ms => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined); // older browsers: no timeout rather than no request
const PROD = { id: 'https://identitytoolkit.googleapis.com/v1', token: 'https://securetoken.googleapis.com/v1' };
export const PASSWORD_RULE = { min: 8, max: 128 };
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@.]{2,}$/;

export function passwordProblem(pw, confirm) {
  if (typeof pw !== 'string' || pw.length < PASSWORD_RULE.min) return `Use at least ${PASSWORD_RULE.min} characters.`;
  if (pw.length > PASSWORD_RULE.max) return `Use at most ${PASSWORD_RULE.max} characters.`;
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use letters and at least one digit.';
  if (confirm !== undefined && confirm !== pw) return 'The two passwords do not match.';
  return null;
}
export const emailProblem = e => (typeof e === 'string' && EMAIL_RE.test(e.trim()) ? null : 'Enter a valid email address.');

// Firebase's error codes -> what the player is told (and whether trying again later could help)
const MESSAGES = {
  EMAIL_EXISTS: 'This email address cannot be used to register. If it is yours, log in or reset your password.',
  INVALID_LOGIN_CREDENTIALS: 'Email address or password is not correct.', EMAIL_NOT_FOUND: 'Email address or password is not correct.', INVALID_PASSWORD: 'Email address or password is not correct.',
  USER_DISABLED: 'This account is disabled.', TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts. Wait a few minutes and try again.',
  WEAK_PASSWORD: 'That password is too weak. Use a longer one.', PASSWORD_DOES_NOT_MEET_REQUIREMENTS: 'That password does not meet the requirements.',
  INVALID_EMAIL: 'Enter a valid email address.', MISSING_PASSWORD: 'Enter a password.', OPERATION_NOT_ALLOWED: 'Email sign-in is not enabled for this game yet.',
  TOKEN_EXPIRED: 'Your session ended (for example after a password change). Log in again.', INVALID_REFRESH_TOKEN: 'Your session ended. Log in again.', USER_NOT_FOUND: 'Your session ended. Log in again.',
  INVALID_ID_TOKEN: 'Your session ended. Log in again.', CREDENTIAL_TOO_OLD_LOGIN_AGAIN: 'Log in again to continue.',
};
export class AuthFail extends Error { constructor(code, message, { network = false, session = false } = {}) { super(message); this.code = code; this.network = network; this.session = session; } }
const SESSION_ENDED = new Set(['TOKEN_EXPIRED', 'INVALID_REFRESH_TOKEN', 'USER_NOT_FOUND', 'USER_DISABLED', 'INVALID_ID_TOKEN', 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN']);

export class FirebaseAuth {
  // emulator: 'http://127.0.0.1:9099' (Firebase Auth emulator, or the tests' stand-in): only honoured on local pages
  constructor({ apiKey, emulator = '', fetch = (...a) => globalThis.fetch(...a), timeoutMs = 15000 }) {
    this.apiKey = apiKey; this.fetch = fetch; this.timeoutMs = timeoutMs;
    this.base = emulator ? { id: `${emulator}/identitytoolkit.googleapis.com/v1`, token: `${emulator}/securetoken.googleapis.com/v1` } : PROD;
  }
  get configured() { return !!this.apiKey; }
  async call(url, body, form = false) {
    if (!this.apiKey) throw new AuthFail('NOT_CONFIGURED', 'Accounts are not set up for this copy of the game.');
    let res, j = null;
    try {
      res = await this.fetch(`${url}?key=${encodeURIComponent(this.apiKey)}`, { method: 'POST', headers: { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json' },
        body: form ? new URLSearchParams(body).toString() : JSON.stringify(body), signal: timeoutSignal(this.timeoutMs) });
      j = await res.json().catch(() => null);
    } catch (e) { throw new AuthFail('NETWORK', 'Cannot reach the sign-in service. Check your connection and try again.', { network: true }); }
    if (res.ok && j) return j;
    const raw = j && j.error && typeof j.error.message === 'string' ? j.error.message : `HTTP_${res.status}`, code = raw.split(/[\s:]/)[0];
    if (/API key not valid/i.test(raw) || code === 'API_KEY_INVALID') throw new AuthFail('API_KEY_INVALID', 'Accounts are not set up correctly for this copy of the game (API key).');
    if (res.status >= 500) throw new AuthFail('UNAVAILABLE', 'The sign-in service is not available right now. Try again shortly.', { network: true });
    throw new AuthFail(code, MESSAGES[code] || 'Sign-in failed. Try again.', { session: SESSION_ENDED.has(code) });
  }
  session(j) { return { uid: j.localId || j.user_id, email: j.email || null, idToken: j.idToken || j.id_token, refreshToken: j.refreshToken || j.refresh_token, expiresAt: Date.now() + (Number(j.expiresIn || j.expires_in) || 3600) * 1000 }; }
  async signUp(email, password) { return this.session(await this.call(`${this.base.id}/accounts:signUp`, { email: email.trim(), password, returnSecureToken: true })); }
  async signIn(email, password) { return this.session(await this.call(`${this.base.id}/accounts:signInWithPassword`, { email: email.trim(), password, returnSecureToken: true })); }
  async refresh(refreshToken) { const j = await this.call(`${this.base.token}/token`, { grant_type: 'refresh_token', refresh_token: refreshToken }, true); return { ...this.session(j), email: undefined }; }
  async lookup(idToken) { const j = await this.call(`${this.base.id}/accounts:lookup`, { idToken }); const u = (j.users || [])[0]; if (!u) throw new AuthFail('USER_NOT_FOUND', MESSAGES.USER_NOT_FOUND, { session: true }); return { uid: u.localId, email: u.email, emailVerified: !!u.emailVerified }; }
  // the email links lead back to the game when its address is one the Firebase project allows; otherwise to Firebase's page
  async sendVerification(idToken, continueUrl) {
    try { await this.call(`${this.base.id}/accounts:sendOobCode`, { requestType: 'VERIFY_EMAIL', idToken, ...(continueUrl ? { continueUrl } : {}) }); }
    catch (e) { if (continueUrl && /CONTINUE_URI|UNAUTHORIZED_DOMAIN|DOMAIN/.test(e.code)) return this.sendVerification(idToken, null); throw e; }
  }
  async sendReset(email, continueUrl) {
    try { await this.call(`${this.base.id}/accounts:sendOobCode`, { requestType: 'PASSWORD_RESET', email: email.trim(), ...(continueUrl ? { continueUrl } : {}) }); }
    catch (e) { if (continueUrl && /CONTINUE_URI|UNAUTHORIZED_DOMAIN|DOMAIN/.test(e.code)) return this.sendReset(email, null); if (e.code === 'EMAIL_NOT_FOUND') return; throw e; } // never reveal whether the address has an account
  }
}
