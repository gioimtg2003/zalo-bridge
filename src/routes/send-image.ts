import {
  TextStyle,
  ThreadType,
  Urgency,
  type API,
  type AttachmentSource,
  type Mention,
  type SendMessageQuote,
  type Style,
} from 'zca-js';

import { json } from '../http';
import { logger } from '../logger';

interface ImageInput {
  url: string;
  filename?: string;
  width?: number;
  height?: number;
}

interface SendImageBody {
  threadId: string;
  threadType: 'user' | 'group';
  /** Single image (back-compat). Use `images` for multiple / per-image metadata. */
  imageUrl?: string;
  /** Filename override for `imageUrl` (back-compat). */
  filename?: string;
  images?: ImageInput[];
  caption?: string;
  styles?: Array<{ start: number; len: number; st: string; indentSize?: number }>;
  urgency?: number;
  ttl?: number;
  mentions?: Array<{ pos: number; uid: string; len: number }>;
  quote?: {
    msgId: string;
    cliMsgId: string;
    content: string;
    uidFrom: string;
    ts: number;
  };
}

const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25MB
const MAX_IMAGES = 10;
const FETCH_TIMEOUT_MS = 15_000;

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const VALID_TEXT_STYLES = new Set<string>(Object.values(TextStyle));
const VALID_URGENCIES = new Set<number>([Urgency.Default, Urgency.Important, Urgency.Urgent]);

function deriveFilename(url: string, contentType: string | null, override?: string): string {
  if (override && /\.[a-z0-9]+$/i.test(override)) return override;

  try {
    const pathname = new URL(url).pathname;
    const base = pathname.split('/').pop() ?? '';
    if (/\.[a-z0-9]+$/i.test(base)) return base;
  } catch {
    /* ignore */
  }

  const mime = (contentType ?? '').split(';')[0]?.trim().toLowerCase();
  const ext = (mime && EXT_BY_MIME[mime]) || 'png';
  return `image.${ext}`;
}

function parseImages(b: Partial<SendImageBody>): ImageInput[] | { error: string } {
  const images: ImageInput[] = [];

  if (Array.isArray(b.images)) {
    for (const img of b.images) {
      if (!img || typeof img.url !== 'string' || !img.url) {
        return { error: 'images[] entries must be {url:string, filename?, width?, height?}' };
      }
      if (
        (img.width !== undefined && (typeof img.width !== 'number' || img.width <= 0)) ||
        (img.height !== undefined && (typeof img.height !== 'number' || img.height <= 0))
      ) {
        return { error: 'images[].width/height must be positive numbers' };
      }
      images.push({ url: img.url, filename: img.filename, width: img.width, height: img.height });
    }
  }

  if (b.imageUrl) {
    images.push({ url: b.imageUrl, filename: b.filename });
  }

  if (images.length === 0) {
    return { error: 'missing images: provide imageUrl or images[]' };
  }
  if (images.length > MAX_IMAGES) {
    return { error: `too many images: max ${MAX_IMAGES}` };
  }
  for (const img of images) {
    if (!/^https?:\/\//i.test(img.url)) {
      return { error: `image url must be http(s): ${img.url}` };
    }
  }
  return images;
}

function parseStyles(input: SendImageBody['styles']): Style[] | { error: string } | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) return { error: 'styles must be an array' };

  for (const s of input) {
    if (
      !s ||
      typeof s.start !== 'number' ||
      typeof s.len !== 'number' ||
      typeof s.st !== 'string' ||
      !VALID_TEXT_STYLES.has(s.st)
    ) {
      return {
        error: `styles must be {start:number,len:number,st:TextStyle}; valid st: ${[...VALID_TEXT_STYLES].join(', ')}`,
      };
    }
  }
  return input as Style[];
}

function parseMentions(
  input: SendImageBody['mentions'],
): Mention[] | { error: string } | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input) || input.length === 0) return undefined;

  for (const m of input) {
    if (
      !m ||
      typeof m.pos !== 'number' ||
      typeof m.len !== 'number' ||
      typeof m.uid !== 'string' ||
      !m.uid
    ) {
      return { error: 'mentions must be {pos:number,len:number,uid:string}' };
    }
  }
  return input.map((m) => ({ pos: m.pos, len: m.len, uid: m.uid }));
}

function parseQuote(
  input: SendImageBody['quote'],
): SendMessageQuote | { error: string } | undefined {
  if (input === undefined) return undefined;
  if (!input.msgId || !input.cliMsgId || !input.content || !input.uidFrom || input.ts === undefined) {
    return { error: 'quote missing required fields: msgId, cliMsgId, content, uidFrom, ts' };
  }
  return {
    content: input.content,
    msgType: '0',
    propertyExt: undefined,
    uidFrom: input.uidFrom,
    msgId: input.msgId,
    cliMsgId: input.cliMsgId,
    ts: String(input.ts),
    ttl: 0,
  };
}

async function fetchImage(url: string): Promise<{ buf: Buffer; contentType: string | null }> {
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`fetch image failed: ${res.status} ${res.statusText} (${url})`);
    }
    const contentType = res.headers.get('content-type');
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`image exceeds ${MAX_IMAGE_BYTES} bytes (${url})`);
    }
    if (ab.byteLength === 0) {
      throw new Error(`image is empty (${url})`);
    }
    return { buf: Buffer.from(ab), contentType };
  } finally {
    clearTimeout(abortTimer);
  }
}

async function buildAttachment(img: ImageInput): Promise<AttachmentSource> {
  const { buf, contentType } = await fetchImage(img.url);
  const filename = deriveFilename(img.url, contentType, img.filename) as `${string}.${string}`;
  return {
    data: buf,
    filename,
    metadata: {
      totalSize: buf.byteLength,
      width: img.width,
      height: img.height,
    },
  };
}

export function createSendImageHandler(api: API) {
  return async function handleSendImage(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'invalid json' }, 400);
    }

    const b = body as Partial<SendImageBody>;
    if (!b.threadId || !b.threadType) {
      return json({ ok: false, error: 'missing required fields: threadId, threadType' }, 400);
    }
    if (b.threadType !== 'user' && b.threadType !== 'group') {
      return json({ ok: false, error: 'threadType must be "user" or "group"' }, 400);
    }

    const images = parseImages(b);
    if ('error' in images) return json({ ok: false, error: images.error }, 400);

    const styles = parseStyles(b.styles);
    if (styles && 'error' in styles) return json({ ok: false, error: styles.error }, 400);

    const mentions = parseMentions(b.mentions);
    if (mentions && 'error' in mentions) return json({ ok: false, error: mentions.error }, 400);

    const quote = parseQuote(b.quote);
    if (quote && 'error' in quote) return json({ ok: false, error: quote.error }, 400);

    if (b.urgency !== undefined && !VALID_URGENCIES.has(b.urgency)) {
      return json({ ok: false, error: 'urgency must be 0 (default), 1 (important), 2 (urgent)' }, 400);
    }
    if (b.ttl !== undefined && (typeof b.ttl !== 'number' || b.ttl < 0)) {
      return json({ ok: false, error: 'ttl must be a non-negative number (milliseconds)' }, 400);
    }

    const threadType = b.threadType === 'group' ? ThreadType.Group : ThreadType.User;

    let attachments: AttachmentSource[];
    try {
      attachments = await Promise.all(images.map(buildAttachment));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('/send-image fetch failed', { error: msg });
      return json({ ok: false, error: msg }, 502);
    }

    try {
      const result = await api.sendMessage(
        {
          msg: b.caption ?? '',
          attachments,
          styles,
          urgency: b.urgency as Urgency | undefined,
          ttl: b.ttl,
          mentions,
          quote,
        },
        b.threadId,
        threadType,
      );
      logger.info('/send-image sent', {
        threadId: b.threadId,
        threadType: b.threadType,
        images: attachments.length,
        bytes: attachments.reduce((sum, a) => sum + (typeof a === 'string' ? 0 : a.data.byteLength), 0),
      });
      return json({
        ok: true,
        msgId: result.message?.msgId ?? null,
        attachmentMsgIds: result.attachment?.map((a) => a.msgId) ?? [],
      });
    } catch (err) {
      logger.error('/send-image send failed', {
        error: err instanceof Error ? err.message : String(err),
        threadId: b.threadId,
      });
      return json({ ok: false, error: err instanceof Error ? err.message : 'send failed' }, 500);
    }
  };
}
