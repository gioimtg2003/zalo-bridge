import * as qrcodeTerminal from 'qrcode-terminal';
import { LoginQRCallbackEventType, Zalo, type API, type Credentials } from 'zca-js';
import { loadCredentials, saveCredentials } from './credential-store';

const CREDENTIALS_FILE = process.env['ZALO_SESSION_FILE'] ?? './data/zalo-session.json';
const USER_AGENT =
  process.env['ZALO_USER_AGENT'] ??
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Module-level state — single-instance service, in-memory is sufficient
let _api: API | null = null;
let pendingQR: Buffer | null = null;
let pendingQRExpiresAt = 0;
let loginInProgress = false;
let ownId: string | null = null;

export function getPendingQR(): Buffer | null {
  if (!pendingQR) return null;
  if (Date.now() > pendingQRExpiresAt) {
    pendingQR = null;
    return null;
  }
  return pendingQR;
}

export function getOwnId(): string | null {
  return ownId;
}

export function getLoginStatus(): {
  loggedIn: boolean;
  ownId: string | null;
  loginInProgress: boolean;
  qrAvailable: boolean;
} {
  return {
    loggedIn: _api !== null && ownId !== null,
    ownId,
    loginInProgress,
    qrAvailable: getPendingQR() !== null,
  };
}

/**
 * Flush current cookie to the credentials file.
 * Called during graceful shutdown to preserve the freshest session state.
 */
export async function flushSession(): Promise<void> {
  if (!_api) return;
  try {
    const jar = _api.getCookie() as unknown as { toJSON(): { cookies: Credentials['cookie'] } };
    const ctx = _api.getContext();
    const creds: Credentials = {
      cookie: jar.toJSON().cookies,
      imei: ctx.imei,
      userAgent: ctx.userAgent,
    };
    await saveCredentials(CREDENTIALS_FILE, creds);
    console.log('[zalo-bridge] final session flushed');
  } catch (err) {
    console.error('[zalo-bridge] flush session failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function loginWithQR(zalo: Zalo): Promise<API> {
  return new Promise<API>((resolve, reject) => {
    loginInProgress = true;
    let captured: Credentials | null = null;

    // 10 minutes per QR window — reset on each new QR so retries don't expire
    const QR_WINDOW_MS = 10 * 60 * 1000;
    let timeout = setTimeout(() => {
      loginInProgress = false;
      reject(new Error('[zalo-bridge] QR login timed out — no scan after 10 minutes'));
    }, QR_WINDOW_MS);

    zalo
      .loginQR({ userAgent: USER_AGENT }, (event) => {
        console.log('event:: ', event);
        switch (event.type) {
          case LoginQRCallbackEventType.QRCodeGenerated: {
            const raw = event.data.image.replace(/^data:image\/[^;]+;base64,/, '');
            pendingQR = Buffer.from(raw, 'base64');
            pendingQRExpiresAt = Date.now() + 90_000;
            qrcodeTerminal.generate(`http://zaloapp.com/qr/l?tk=${event.data.token}`, {
              small: true,
            });
            clearTimeout(timeout);
            timeout = setTimeout(() => {
              loginInProgress = false;
              reject(new Error('[zalo-bridge] QR login timed out — no scan after 10 minutes'));
            }, QR_WINDOW_MS);
            break;
          }
          case LoginQRCallbackEventType.QRCodeScanned: {
            console.log('[zalo-bridge] QR scanned — confirming login...');
            pendingQR = null;
            break;
          }
          case LoginQRCallbackEventType.QRCodeExpired: {
            console.log('[zalo-bridge] QR expired — retrying...');
            event.actions.retry();
            break;
          }
          case LoginQRCallbackEventType.QRCodeDeclined: {
            console.warn('[zalo-bridge] QR scan declined by user');
            break;
          }
          case LoginQRCallbackEventType.GotLoginInfo: {
            console.log('[zalo-bridge] login credentials received');
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
        loginInProgress = false;
        pendingQR = null;

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

        let fetchedOwnId = '';
        try {
          const info = await api.fetchAccountInfo();
          fetchedOwnId = info.profile.userId;
        } catch {
          console.warn('[zalo-bridge] could not fetch ownId after QR login');
        }

        ownId = fetchedOwnId || null;
        _api = api;

        await saveCredentials(CREDENTIALS_FILE, captured);
        console.log('[zalo-bridge] credentials saved after QR login');

        resolve(api);
      })
      .catch((err) => {
        clearTimeout(timeout);
        loginInProgress = false;
        reject(err);
      });
  });
}

export async function createZaloClient(): Promise<API> {
  const zalo = new Zalo();
  const saved = await loadCredentials(CREDENTIALS_FILE);

  if (saved) {
    try {
      console.log('[zalo-bridge] attempting login from saved credentials...');
      const api = await zalo.login(saved);

      let fetchedOwnId = '';
      try {
        const info = await api.fetchAccountInfo();
        fetchedOwnId = info.profile.userId;
      } catch {
        console.warn('[zalo-bridge] could not fetch ownId after credential login');
      }

      ownId = fetchedOwnId || null;
      _api = api;

      console.log('[zalo-bridge] credential login successful');
      return api;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isExpired = msg.includes('zpw_enk') || msg.toLowerCase().includes('login');
      console.warn(
        `[zalo-bridge] credential login failed${isExpired ? ' (cookie expired/rejected)' : ''} — falling back to QR`,
        { error: msg },
      );
    }
  }

  console.log('[zalo-bridge] waiting for QR scan...');
  return loginWithQR(zalo);
}
