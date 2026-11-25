import * as qrcodeTerminal from 'qrcode-terminal';
import { LoginQRCallbackEventType, Zalo, type API, type Credentials } from 'zca-js';
import { loadCredentials, saveCredentials } from './credential-store';

const LEGACY_SESSION_FILE = process.env['ZALO_SESSION_FILE'] ?? './data/zalo-session.json';
const SESSION_DIR = process.env['ZALO_SESSION_DIR'] ?? './data';
const USER_AGENT =
  process.env['ZALO_USER_AGENT'] ??
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const configuredAccounts = (process.env['ZALO_ACCOUNTS'] ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

/** Accounts this process logs in to. First one is the fallback for unrouted requests. */
export const ACCOUNT_IDS: string[] = configuredAccounts.length > 0 ? configuredAccounts : ['agent'];
export const DEFAULT_ACCOUNT_ID: string = ACCOUNT_IDS[0] as string;

function sessionFile(accountId: string): string {
  // ponytail: single-account deployments keep the historical path so existing sessions survive
  if (configuredAccounts.length === 0) return LEGACY_SESSION_FILE;

  if (accountId === 'agents') return LEGACY_SESSION_FILE;
  return `${SESSION_DIR}/zalo-session-${accountId}.json`;
}

interface AccountState {
  api: API | null;
  ownId: string | null;
  pendingQR: Buffer | null;
  pendingQRExpiresAt: number;
  loginInProgress: boolean;
}

const states = new Map<string, AccountState>();

function stateOf(accountId: string): AccountState {
  let state = states.get(accountId);
  if (!state) {
    state = {
      api: null,
      ownId: null,
      pendingQR: null,
      pendingQRExpiresAt: 0,
      loginInProgress: false,
    };
    states.set(accountId, state);
  }
  return state;
}

export function isKnownAccount(accountId: string): boolean {
  return ACCOUNT_IDS.includes(accountId);
}

export function getPendingQR(accountId: string = DEFAULT_ACCOUNT_ID): Buffer | null {
  const state = stateOf(accountId);
  if (!state.pendingQR) return null;
  if (Date.now() > state.pendingQRExpiresAt) {
    state.pendingQR = null;
    return null;
  }
  return state.pendingQR;
}

export function getOwnId(accountId: string = DEFAULT_ACCOUNT_ID): string | null {
  return stateOf(accountId).ownId;
}

export interface LoginStatus {
  accountId: string;
  loggedIn: boolean;
  ownId: string | null;
  loginInProgress: boolean;
  qrAvailable: boolean;
}

export function getLoginStatus(accountId: string = DEFAULT_ACCOUNT_ID): LoginStatus {
  const state = stateOf(accountId);
  return {
    accountId,
    loggedIn: state.api !== null && state.ownId !== null,
    ownId: state.ownId,
    loginInProgress: state.loginInProgress,
    qrAvailable: getPendingQR(accountId) !== null,
  };
}

export function getAllLoginStatus(): LoginStatus[] {
  return ACCOUNT_IDS.map((id) => getLoginStatus(id));
}

/**
 * Flush an account's current cookie to its credentials file.
 * Called during graceful shutdown to preserve the freshest session state.
 */
export async function flushSession(accountId: string = DEFAULT_ACCOUNT_ID): Promise<void> {
  const state = stateOf(accountId);
  if (!state.api) return;
  try {
    const jar = state.api.getCookie() as unknown as {
      toJSON(): { cookies: Credentials['cookie'] };
    };
    const ctx = state.api.getContext();
    const creds: Credentials = {
      cookie: jar.toJSON().cookies,
      imei: ctx.imei,
      userAgent: ctx.userAgent,
    };
    await saveCredentials(sessionFile(accountId), creds);
    console.log(`[zalo-bridge][${accountId}] final session flushed`);
  } catch (err) {
    console.error(`[zalo-bridge][${accountId}] flush session failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function flushAllSessions(): Promise<void> {
  await Promise.all([...states.keys()].map((id) => flushSession(id)));
}

async function loginWithQR(zalo: Zalo, accountId: string): Promise<API> {
  const state = stateOf(accountId);

  return new Promise<API>((resolve, reject) => {
    state.loginInProgress = true;
    let captured: Credentials | null = null;

    // 10 minutes per QR window — reset on each new QR so retries don't expire
    const QR_WINDOW_MS = 10 * 60 * 1000;
    let timeout = setTimeout(() => {
      state.loginInProgress = false;
      reject(new Error(`[zalo-bridge][${accountId}] QR login timed out — no scan after 10 minutes`));
    }, QR_WINDOW_MS);

    zalo
      .loginQR({ userAgent: USER_AGENT }, (event) => {
        switch (event.type) {
          case LoginQRCallbackEventType.QRCodeGenerated: {
            const raw = event.data.image.replace(/^data:image\/[^;]+;base64,/, '');
            state.pendingQR = Buffer.from(raw, 'base64');
            state.pendingQRExpiresAt = Date.now() + 90_000;
            console.log(`[zalo-bridge][${accountId}] scan this QR to log in`);
            qrcodeTerminal.generate(`http://zaloapp.com/qr/l?tk=${event.data.token}`, {
              small: true,
            });
            clearTimeout(timeout);
            timeout = setTimeout(() => {
              state.loginInProgress = false;
              reject(
                new Error(`[zalo-bridge][${accountId}] QR login timed out — no scan after 10 minutes`),
              );
            }, QR_WINDOW_MS);
            break;
          }
          case LoginQRCallbackEventType.QRCodeScanned: {
            console.log(`[zalo-bridge][${accountId}] QR scanned — confirming login...`);
            state.pendingQR = null;
            break;
          }
          case LoginQRCallbackEventType.QRCodeExpired: {
            console.log(`[zalo-bridge][${accountId}] QR expired — retrying...`);
            event.actions.retry();
            break;
          }
          case LoginQRCallbackEventType.QRCodeDeclined: {
            console.warn(`[zalo-bridge][${accountId}] QR scan declined by user`);
            break;
          }
          case LoginQRCallbackEventType.GotLoginInfo: {
            console.log(`[zalo-bridge][${accountId}] login credentials received`);
            captured = {
              imei: event.data.imei,
              cookie: event.data.cookie,
              userAgent: event.data.userAgent,
            };
            break;
          }
        }
      })
      .then(async (api) => {
        clearTimeout(timeout);
        state.loginInProgress = false;
        state.pendingQR = null;

        // Fallback credential extraction (openzca client.ts line 291-304)
        if (!captured) {
          const ctx = api.getContext();
          const jar = api.getCookie() as unknown as {
            toJSON(): { cookies: Credentials['cookie'] };
          };
          captured = {
            imei: ctx.imei,
            cookie: jar.toJSON().cookies,
            userAgent: ctx.userAgent,
          };
        }

        state.ownId = await fetchOwnId(api, accountId);
        state.api = api;

        await saveCredentials(sessionFile(accountId), captured);
        console.log(`[zalo-bridge][${accountId}] credentials saved after QR login`);

        resolve(api);
      })
      .catch((err) => {
        clearTimeout(timeout);
        state.loginInProgress = false;
        reject(err);
      });
  });
}

async function fetchOwnId(api: API, accountId: string): Promise<string | null> {
  try {
    const info = await api.fetchAccountInfo();
    return info.profile.userId || null;
  } catch {
    console.warn(`[zalo-bridge][${accountId}] could not fetch ownId`);
    return null;
  }
}

/**
 * Log in one account. Each account gets its own `Zalo` instance and its own
 * credentials file — required for simultaneous multi-account operation.
 */
export async function createZaloClient(accountId: string = DEFAULT_ACCOUNT_ID): Promise<API> {
  const state = stateOf(accountId);
  const zalo = new Zalo();
  const credentialsPath = sessionFile(accountId);
  const saved = await loadCredentials(credentialsPath);

  if (saved) {
    try {
      console.log(`[zalo-bridge][${accountId}] attempting login from saved credentials...`);
      const api = await zalo.login(saved);

      state.ownId = await fetchOwnId(api, accountId);
      state.api = api;

      console.log(`[zalo-bridge][${accountId}] credential login successful`);
      return api;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isExpired = msg.includes('zpw_enk') || msg.toLowerCase().includes('login');
      console.warn(
        `[zalo-bridge][${accountId}] credential login failed${isExpired ? ' (cookie expired/rejected)' : ''} — falling back to QR`,
        { error: msg },
      );
    }
  }

  console.log(`[zalo-bridge][${accountId}] waiting for QR scan...`);
  return loginWithQR(zalo, accountId);
}
