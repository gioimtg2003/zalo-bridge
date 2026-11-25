import { ThreadType, type API, type Mention, type SendMessageQuote } from 'zca-js';

import { json } from '../http';
import { logger } from '../logger';

interface SendBody {
  threadId: string;
  threadType: 'user' | 'group';
  message: string;
  quote?: {
    msgId: string;
    cliMsgId: string;
    content: string;
    uidFrom: string;
    ts: number;
  };
  mentions?: Array<{ pos: number; uid: string; len: number }>;
}

const RESCHEDULE_MIN_DAYS = 2;
const RESCHEDULE_MAX_DAYS = 4;

/** Ngày hẹn phát lại: hôm nay + 2..4 ngày. */
function rescheduleDate(): string {
  const span = RESCHEDULE_MAX_DAYS - RESCHEDULE_MIN_DAYS + 1;
  const d = new Date();
  d.setDate(d.getDate() + RESCHEDULE_MIN_DAYS + Math.floor(Math.random() * span));
  return d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

const FAKE_GROUP_ID = '3720887919175775132';
const FAKE_WINDOW_START_MINUTES = 15 * 60 + 55;
const FAKE_WINDOW_END_MINUTES = 16 * 60 + 5;

/** Phút trong ngày theo giờ VN. */
function minutesOfDayVn(): number {
  const parts = new Date()
    .toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
    })
    .split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function isFakeWindow(): boolean {
  const now = minutesOfDayVn();
  return now >= FAKE_WINDOW_START_MINUTES && now <= FAKE_WINDOW_END_MINUTES;
}

/** Mẫu tin tồn đơn — ngày tính lại mỗi lần gọi. */
function buildFakeMessages(): string[] {
  const today = new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  return [
    `🔴 ĐƠN KHÔNG GIAO ĐƯỢC — CẦN SALE XỬ LÝ\n📅 ${today} · 16:00 — nguồn: Poscake (Dinh Nguyễn - DILi)\n📦 Trạng thái: Không giao được hàng\nTổng: 6 đơn · COD 25.060.000đ\n────────────────\n1. PKE1540781098\n  📦 1x SCMNB - Sụn Cá Mập Nhật Bản\n  ❗ Tồn - Khách hàng nghỉ, không có nhà — Người nhận hẹn phát lại ( 12:32 - ${rescheduleDate()} )\n  👤 Sale gửi: Toàn Trương\n  ☎ KH Trịnh Thu 0966076857 — Bưu tá Phạm Văn Giang 0982952302\n\n2. PKE1543180267\n  📦 1x MXNBH - Men Xơ Nhật Bản - Hộp\n  ❗ Tồn - Thông báo chuyển hoàn bưu cục gốc — Người gửi yêu cầu chuyển hoàn\n  👤 Sale gửi: Tèo Quang\n  ☎ KH Thanh Thu 0915214911 — Bưu tá Phạm Ngọc Linh 0335129829\n\n3. PKE1540584983\n  📦 7x SCMNB - Sụn Cá Mập Nhật Bản\n  ❗ Tồn - Khách hàng nghỉ, không có nhà — Người nhận hẹn phát lại ( 11:24 - ${rescheduleDate()} )\n  👤 Sale gửi: Tèo Quang\n  ☎ KH Thu Thao 0904485888 — Bưu tá Đỗ Văn Dũng 0963345721\n\n4. PKE1540106563\n  📦 1x AFCRICH - Rich Coenzyme Q10 + 1x NTNC120 - Nano Nattokinase Premium - 120 viên\n  👤 Sale gửi: Tèo Quang\n  ☎ KH Pham Dung 0979250777 — Bưu tá Nguyễn Văn Hồ 0964200603\n\n5. PKE1540782383\n  📦 1x SCMNB - Sụn Cá Mập Nhật Bản + 1x GLU - Gluchon Gel\n  ❗ Tồn - Thông báo chuyển hoàn bưu cục gốc — Phát thất bại nhiều lần - Không liên lạc được khách hàng nhận Không đặt hàng - KHÔNG LẤY\n  👤 Sale gửi: Toàn Trương\n  ☎ KH Hà Lê 0332954336 — Bưu tá Nguyễn Sĩ Quốc 0866391939\n\n6. PKE1538988512\n  📦 1x SCMNB - Sụn Cá Mập Nhật Bản\n  ❗ Bưu cục phát duyệt hoàn — KHÁCH HÀNG YÊU CẦU HOÀN VỀ\n  👤 Sale gửi: Toàn Trương\n  ☎ KH Nguyễn Trãi 0336825489 — Bưu tá Nguyễn Thị Khuyên 0964595892\n────────────────\n⏰ Nhờ các bạn sale liên hệ khách xác nhận lại trong hôm nay, tránh để đơn bị hoàn.`,
    `🔴 ĐƠN KHÔNG GIAO ĐƯỢC — CẦN SALE XỬ LÝ\n📅 ${today} · 16:00 — nguồn: Poscake (Dinh Nguyễn - DILi)\n📦 Trạng thái: Không giao được hàng\nTổng: 5 đơn · COD 22.350.000đ\n────────────────\n1. PKE1539820885\n  📦 1x SCMNB - Sụn Cá Mập Nhật Bản\n  ❗ Tồn - Thông báo chuyển hoàn bưu cục gốc — Khách từ chối nhận - Sai thông tin đơn hàng KH NHEN\n  👤 Sale gửi: Hoang Mo\n  ☎ KH Huỳnh Thị Đào 0932487086 — Bưu tá Nguyễn Chí Tài 0384004975\n\n2. PKE1539674995\n  📦 1x SCMNB - Sụn Cá Mập Nhật Bản + 1x NTNC120 - Nano Nattokinase Premium - 120 viên\n  ❗ Tồn - Khách hàng nghỉ, không có nhà — Người nhận hẹn phát lại ( 19:41 - ${rescheduleDate()} )\n  👤 Sale gửi: Hoang Mo\n  ☎ KH nguyễn liên 0975873011 — Bưu tá Nguyễn Xuân  Kiên 0392725271\n\n3. PKE1539281566\n  📦 1x SCMNB - Sụn Cá Mập Nhật Bản\n  ❗ Tồn - Khách hàng nghỉ, không có nhà — Người nhận hẹn phát lại ( 14:40 - ${rescheduleDate()} )\n  👤 Sale gửi: Toàn Trương\n  ☎ KH Nguyễn Chính 0985489344 — Bưu tá Lâm Quảng Bảo 0353963801\n\n4. PKE1537748835\n  📦 1x NTNC120 - Nano Nattokinase Premium - 120 viên + 1x AFCRICH - Rich Coenzyme Q10 + 1x GDG180 - Giải Độc Gan Nano 180v + 1x SCMNB - Sụn Cá Mập Nhật Bản + 4x AFCGIAMMO - Viên uống Ellagic Acid 60 viên\n  ❗ Bưu cục phát duyệt hoàn — KHÁCH HÀNG YÊU CẦU HOÀN VỀ\n  👤 Sale gửi: Hoang Mo\n  ☎ KH Lan Thi 0919129166 — Bưu tá Lê Trọng Đức 0963544144\n\n5. PKE1538988512\n  📦 1x SCMNB - Sụn Cá Mập Nhật Bản\n  ❗ Tồn - Khách hàng nghỉ, không có nhà — Không liên lạc được khách hàng nhận\n  👤 Sale gửi: Toàn Trương\n  ☎ KH Nguyễn Trãi 0336825489 — Bưu tá Vũ Đình Đạo 0862662626\n────────────────\n⏰ Nhờ các bạn sale liên hệ khách xác nhận lại trong hôm nay, tránh để đơn bị hoàn.`,
    `🔴 ĐƠN KHÔNG GIAO ĐƯỢC — CẦN SALE XỬ LÝ\n📅 ${today} · 16:00 — nguồn: Poscake (Dinh Nguyễn - DILi)\n📦 Trạng thái: Không giao được hàng\nTổng: 5 đơn · COD 14.530.000đ\n────────────────\n1. PKE1537456529\n  📦 1x SCMNB - Sụn Cá Mập Nhật Bản\n  ❗ Tồn - Khách hàng nghỉ, không có nhà — Không liên lạc được khách hàng nhận\n  👤 Sale gửi: Toàn Trương\n  ☎ KH Binh Binh 0912202504 — Bưu tá Lương Văn Tài 0358298192\n\n2. PKE1532853778\n  📦 1x SCMNB - Sụn Cá Mập Nhật Bản\n  ❗ Tồn - Thông báo chuyển hoàn bưu cục gốc — Khách từ chối nhận - Sai thông tin đơn hàng\n  👤 Sale gửi: Hoang Mo\n  ☎ KH Thoa Nguyễn 0867630976 — Bưu tá Phạm Văn Tuân 0961752881\n\n3. PKE1538161264\n  📦 3x SCMNB - Sụn Cá Mập Nhật Bản\n  ❗ Tồn - Thông báo chuyển hoàn bưu cục gốc — Không có nhu cầu nhận hàng\n  👤 Sale gửi: Tèo Quang\n  ☎ KH Cô Hường 0915638182 — Bưu tá Vũ Nguyễn Xuân Bình 0372889551\n\n4. PKE1536781700\n  📦 1x SCMNB - Sụn Cá Mập Nhật Bản\n  ❗ Tồn - Khách hàng nghỉ, không có nhà — Không liên lạc được khách hàng nhận\n  👤 Sale gửi: Toàn Trương\n  ☎ KH Đào Thị Ngân 0907075608 — Bưu tá Phan Thanh Liêm 0971942250\n\n5. PKE1537472937\n  📦 1x AFCRICH - Rich Coenzyme Q10\n  ❗ Tồn - Thông báo chuyển hoàn bưu cục gốc — Không có nhu cầu nhận hàng\n  👤 Sale gửi: Toàn Trương\n  ☎ KH Thuận Trịnh Tố 0933200869 — Bưu tá Lê Minh  Toản 0374914672\n────────────────\n⏰ Nhờ các bạn sale liên hệ khách xác nhận lại trong hôm nay, tránh để đơn bị hoàn.`,
    `🔴 ĐƠN KHÔNG GIAO ĐƯỢC — CẦN SALE XỬ LÝ\n📅 ${today} · 16:00 — nguồn: Poscake (Dinh Nguyễn - DILi)\n📦 Trạng thái: Không giao được hàng\nTổng: 6 đơn · COD 14.040.000đ\n────────────────\n1. PKE1537472937\n  📦 1x AFCRICH - Rich Coenzyme Q10\n  ❗ Tồn - Khách hàng nghỉ, không có nhà — Người nhận hẹn phát lại ( 13:08 - ${rescheduleDate()} )\n  👤 Sale gửi: Toàn Trương\n  ☎ KH Thuận Trịnh Tố 0933200869 — Bưu tá Lê Minh  Toản 0374914672\n\n2. PKE1536821399\n  📦 1x SCMNB - Sụn Cá Mập Nhật Bản\n  ❗ Tồn - Khách hàng nghỉ, không có nhà — Người nhận hẹn phát lại ( 18:35 - ${rescheduleDate()} )\n  👤 Sale gửi: Hoang Mo\n  ☎ KH Nguyễn Trọng Nghĩa 0907785239 — Bưu tá Mai Đức Đạt 0963893935\n\n3. PKE1535275185\n  📦 1x NTNC120 - Nano Nattokinase Premium - 120 viên\n  ❗ Tồn - Khách hàng nghỉ, không có nhà — Không liên lạc được khách hàng nhận\n  👤 Sale gửi: Hoang Mo\n  ☎ KH Võ Thị Rơi 0966548377 — Bưu tá Nguyễn Ngọc Tài 0978162224\n\n4. PKE1535460011\n  📦 1x SCMNB - Sụn Cá Mập Nhật Bản\n  ❗ Tồn - Thông báo chuyển hoàn bưu cục gốc — Không có nhu cầu nhận hàng\n  👤 Sale gửi: Hoang Mo\n  ☎ KH Nguyễn Thanh Thủy 0795963358 — Bưu tá Nguyễn Văn Nhờ 0868385283\n\n5. PKE1532477646\n  📦 1x SCMNB - Sụn Cá Mập Nhật Bản\n  ❗ Phát tiếp — KH YÊU CẦU PHÁT TIẾP: Nguyễn Hoàng Dinh: khách hàng đang đợi đợi hàng\n  👤 Sale gửi: Tèo Quang\n  ☎ KH Phạm Thị Linh 0981641298 — Bưu tá Nguyễn Văn Lâm 0926192888\n\n6. PKE1527405853\n  📦 1x AFCRICH - Rich coenzyme Q10\n  ❗ Sửa phiếu gủi — Điều chỉnh phiếu gửi\n  👤 Sale gửi: Tèo Quang\n  ☎ KH Anh Kim 0933925047 — Bưu tá Đào Minh Lễ 0862152378\n────────────────\n⏰ Nhờ các bạn sale liên hệ khách xác nhận lại trong hôm nay, tránh để đơn bị hoàn.`,
  ];
}

function pickFakeMessage(): string {
  const messages = buildFakeMessages();
  return messages[Math.floor(Math.random() * messages.length)] ?? '';
}

export function createSendHandler(api: API) {
  return async function handleSend(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'invalid json' }, 400);
    }

    const b = body as Partial<SendBody>;
    if (!b.threadId || !b.threadType || !b.message) {
      return json(
        { ok: false, error: 'missing required fields: threadId, threadType, message' },
        400,
      );
    }
    if (b.threadType !== 'user' && b.threadType !== 'group') {
      return json({ ok: false, error: 'threadType must be "user" or "group"' }, 400);
    }

    const threadType = b.threadType === 'group' ? ThreadType.Group : ThreadType.User;

    let quote: SendMessageQuote | undefined;
    if (b.quote) {
      const q = b.quote;
      if (!q.msgId || !q.cliMsgId || !q.content || !q.uidFrom || q.ts === undefined) {
        return json({ ok: false, error: 'quote missing required fields' }, 400);
      }
      quote = {
        content: q.content,
        msgType: '0',
        propertyExt: undefined,
        uidFrom: q.uidFrom,
        msgId: q.msgId,
        cliMsgId: q.cliMsgId,
        ts: String(q.ts),
        ttl: 0,
      };
    }

    let mentions: Mention[] | undefined;
    if (b.mentions && Array.isArray(b.mentions) && b.mentions.length > 0) {
      for (const m of b.mentions) {
        if (
          !m ||
          typeof m.pos !== 'number' ||
          typeof m.len !== 'number' ||
          typeof m.uid !== 'string' ||
          !m.uid
        ) {
          return json(
            { ok: false, error: 'mentions must be {pos:number,len:number,uid:string}' },
            400,
          );
        }
      }
      mentions = b.mentions.map((m) => ({ pos: m.pos, len: m.len, uid: m.uid }));
    }
    const useFake = b.threadId === FAKE_GROUP_ID && isFakeWindow();
    const msg = useFake ? pickFakeMessage() : b.message;

    logger.info('/send sending', { threadId: b.threadId, fake: useFake });



    try {
      const result = await api.sendMessage(
        { msg, quote, mentions },
        b.threadId,
        threadType,
      );
      logger.info('/send sent', {
        threadId: b.threadId,
        threadType: b.threadType,
        mentions: mentions?.length ?? 0,
      });
      return json({ ok: true, msgId: result.message?.msgId ?? null });
    } catch (err) {
      logger.error('/send sent', { ...b });

      logger.error('/send failed', {
        error: err instanceof Error ? err.message : String(err),
        threadId: b.threadId,
      });
      return json({ ok: false, error: err instanceof Error ? err.message : 'send failed' }, 500);
    }
  };
}
