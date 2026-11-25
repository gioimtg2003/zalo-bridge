import { GroupMessage, type Message, type TMention } from 'zca-js';

export interface NormalizedMessage {
  msgId: string;
  uidFrom: string;
  idTo: string;
  msgType: string;
  senderName: string;
  content: string;
  mentions: TMention[];
  ts: string;
  /** attachment link — image extensions land here */
  imageUrl?: string;
  /** attachment link — voice notes / audio extensions land here (.aac from zdn.vn) */
  audioUrl?: string;
  /** attachment link — everything else lands here */
  fileUrl?: string;
  /** Zalo needs it (with msgId) to reply to this message via `/send` `quote` */
  cliMsgId: string;
}

const ATTACHMENT_MARKER = '[Tệp đính kèm]';
const IMAGE_ATTACHMENT_MARKER = '[Ảnh đính kèm]';
const VOICE_ATTACHMENT_MARKER = '[Tin nhắn thoại]';
const IMAGE_HREF_RE = /\.(jpe?g|png|gif|webp|bmp|heic|heif|tiff?|svg)(?:[?#]|$)/i;
const AUDIO_HREF_RE = /\.(aac|m4a|mp3|wav|ogg|opus|amr|3gp)(?:[?#]|$)/i;

type AttachmentKind = 'imageUrl' | 'audioUrl' | 'fileUrl';

function classifyHref(href: string): AttachmentKind {
  if (IMAGE_HREF_RE.test(href)) return 'imageUrl';
  if (AUDIO_HREF_RE.test(href)) return 'audioUrl';
  return 'fileUrl';
}

const MARKER_BY_KIND: Record<AttachmentKind, string> = {
  imageUrl: IMAGE_ATTACHMENT_MARKER,
  audioUrl: VOICE_ATTACHMENT_MARKER,
  fileUrl: ATTACHMENT_MARKER,
};

/**
 * Non-text messages (chat.photo, chat.file, ...) carry an object content.
 * Keep the caption and flag the attachment so the agent knows a file came
 * along — the file itself is not read.
 */
function readContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content == null || typeof content !== 'object') return '';

  const { title, description, href } = content as { title?: string; description?: string, href?: string };
  const caption = (title ?? description ?? '').trim();
  const marker = MARKER_BY_KIND[classifyHref(href ?? '')];
  // ponytail: link inlined in the text too — agents that only read `content` lose it otherwise
  return [caption, marker, href].filter(Boolean).join(' ');
}

function readHref(content: unknown): string {
  if (content == null || typeof content !== 'object') return '';
  return (content as { href?: string }).href ?? '';
}

export function normalizeZaloMessage(raw: Message): NormalizedMessage {
  const data = raw.data;
  const href = readHref(data.content);
  return {
    ...(href ? { [classifyHref(href)]: href } : {}),
    msgId: data.msgId,
    cliMsgId: data.cliMsgId,
    uidFrom: data.uidFrom,
    senderName: data?.dName,
    idTo: data.idTo,
    msgType: data.msgType,
    content: readContent(data.content),
    mentions: raw instanceof GroupMessage ? (raw.data.mentions ?? []) : [],
    ts: data.ts,
  };
}
