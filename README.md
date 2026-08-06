# zalo-bridge HTTP API

Bun HTTP server on `BRIDGE_PORT` (default `2604`). Wraps a logged-in Zalo personal account
(zca-js) so other services can send into Zalo threads and receive inbound messages.

## Auth

Every request needs the shared secret header. Missing/wrong → `401 Unauthorized` (plain
text, not JSON). Unknown route → `404 Not found` (plain text).

```
x-dilim-zalo-bridge: $INTERNAL_SECRET
```

## Target = threadId + threadType

One addressing scheme for all send endpoints:

| Field        | Type                | Meaning                                                     |
| ------------ | ------------------- | ----------------------------------------------------------- |
| `threadId`   | string              | Group id for groups, Zalo user id (uid) for direct messages |
| `threadType` | `"user" \| "group"` | Which of the two the id is                                  |

Mapping from an inbound message (`normalizeZaloMessage`): group → `threadId = idTo`,
direct → `threadId = uidFrom`. Never reply to `idTo` on a direct message — that is the bot
itself.

---

## POST /send — text message

```jsonc
{
  "threadId": "group_777",
  "threadType": "group",
  "message": "Đơn 123 đã giao thành công.",

  // optional — @mention members. pos/len index into `message` (UTF-16 code units)
  "mentions": [{ "uid": "user_555", "pos": 0, "len": 8 }],

  // optional — reply to a specific message
  "quote": {
    "msgId": "msg_def456",
    "cliMsgId": "1722840001000",
    "content": "@DiLi tra cứu đơn 123",
    "uidFrom": "user_555",
    "ts": 1722840001000
  }
}
```

`200` → `{ "ok": true, "msgId": "msg_ghi789" }`

Errors — `400`: invalid json, missing `threadId|threadType|message`, bad `threadType`,
malformed `mentions`, incomplete `quote`. `500`: `{ ok:false, error }` when Zalo rejects.

`mentions` only render highlighted when the text at `pos..pos+len` is the mention token
(e.g. `@Nguyen Van A`). Wrong offsets send plain text, no error.

```bash
curl -X POST localhost:2604/send \
  -H "x-dilim-zalo-bridge: $INTERNAL_SECRET" \
  -H 'content-type: application/json' \
  -d '{"threadId":"group_777","threadType":"group","message":"xong rồi"}'
```

## POST /send-image — image(s) + optional caption

Same target fields, plus:

| Field                | Type                                       | Notes                                       |
| -------------------- | ------------------------------------------ | ------------------------------------------- |
| `imageUrl`           | string                                     | Single image, http(s) only                  |
| `filename`           | string                                     | Filename override for `imageUrl`            |
| `images[]`           | `{ url, filename?, width?, height? }`      | Multiple; max 10 images, 25MB each          |
| `caption`            | string                                     | Text sent with the images                   |
| `styles[]`           | `{ start, len, st, indentSize? }`          | `st` = zca-js `TextStyle` (bold, italic, …) |
| `urgency`            | `0` default \| `1` important \| `2` urgent |                                             |
| `ttl`                | number (ms)                                | Self-destruct timer                         |
| `mentions` / `quote` | same shape as `/send`                      |                                             |

Bridge fetches each URL itself (15s timeout) and uploads bytes to Zalo → URL must be
reachable from the bridge container. Presigned R2/S3 link works, `localhost` does not.

`200` → `{ "ok": true, "msgId": "msg_ghi789", "attachmentMsgIds": ["msg_jkl012"] }`

Errors — `400` validation, `502` image fetch/size failure, `500` Zalo send failed.

## POST /typing — typing indicator

```json
{ "threadId": "group_777", "threadType": "group" }
```

`200` → `{ "ok": true, "status": 0 }`

Errors — `400`: invalid json, missing `threadId|threadType`, bad `threadType`. `500` when
Zalo rejects.

Zalo expires the indicator after a few seconds and zca-js has no "stop typing" call, so a
caller that wants typing held across a long tool run must re-post every ~3–5s and simply
stop when the reply is sent.

The bridge also fires it itself in `src/main.ts`, right before calling the agent, on the
thread the inbound message came from — best-effort, failures swallowed:

```ts
api.sendTypingEvent(conversationId, isGroup ? ThreadType.Group : ThreadType.User);
```

---

## Notifications (fixed groups from env)

| Route                 | Body                                                                  | Target groups                                  |
| --------------------- | --------------------------------------------------------------------- | ---------------------------------------------- |
| `POST /noti-canceled`  | `{ tracking_code, dealer_id, cancel_reason, cancelled_at, message? }` | `GROUP_CANCELED_ORDER` (csv) — `500` if unset  |
| `POST /noti-delivered` | `{ tracking_code, dealer_id, delivered_at, message? }`                | `GROUP_DELIVERED_ORDER` (csv) — `{ok,sent:0}` if unset |
| `POST /noti-broadcast` | `{ message, groupIds?: string[] }`                                    | `groupIds` else `BROADCAST_GROUP_IDS` (csv)    |

`message` overrides the built-in Vietnamese template (LLM-generated text is sent as-is).
Broadcast returns `{ ok, sent }`; no target groups → `400`.

## Lookup

| Route                          | Response                                                             |
| ------------------------------ | -------------------------------------------------------------------- |
| `GET /find-user?phone=09...`   | `{ ok, user }`; `404 user not found` (ZaloApiError 216); `400` no phone |
| `GET /groups`                  | `{ ok, groups:[{id,name}] }` — batches of 50 + 300ms sleep (rate limit) |
| `GET /group-info?groupId=a,b`  | `{ ok, info }` (gridInfoMap)                                          |
| `GET /group-members?memberId=a,b` | `{ ok, profiles }`                                                 |

## Group management

| Route                        | Body                          | Response                  |
| ---------------------------- | ----------------------------- | ------------------------- |
| `POST /groups`               | `{ name?, members: string[] }` | `{ ok, group }`          |
| `POST /group/add-members`    | `{ groupId, members[] }`      | `{ ok, errorMembers }`    |
| `POST /group/remove-members` | `{ groupId, members[] }`      | `{ ok, errorMembers }`    |
| `POST /group/rename`         | `{ groupId, name }`           | `{ ok, status }`          |
| `POST /group/change-owner`   | `{ groupId, memberId }`       | `{ ok }`                  |
| `POST /group/leave`          | `{ groupId, silent? }`        | `{ ok }`                  |
| `POST /group/disperse`       | `{ groupId }`                 | `{ ok }` — owner only, dissolves the group |

## Health / login

| Route         | Response                                                         |
| ------------- | ---------------------------------------------------------------- |
| `GET /health` | `{ ok, uptime, loginStatus }`                                    |
| `GET /status` | `{ loggedIn, ownId, loginInProgress, qrAvailable }`               |
| `GET /qr`     | `image/png` QR to scan; `404 { ok:false, error:"no QR pending" }` |

## Env

| Var                     | Purpose                                    |
| ----------------------- | ------------------------------------------ |
| `INTERNAL_SECRET`       | Auth header value + secret sent to agent-ops |
| `BRIDGE_PORT`           | HTTP port, default `2604`                  |
| `GROUP_CANCELED_ORDER`  | csv group ids for `/noti-canceled`         |
| `GROUP_DELIVERED_ORDER` | csv group ids for `/noti-delivered`        |
| `BROADCAST_GROUP_IDS`   | csv default targets for `/noti-broadcast`  |

## Inbound direction

Zalo listener → `normalizeZaloMessage` → dedup → `askAgent` POSTs
`{ sessionId, message, metadata }` to `/channels/zalo/webhook` on dilim-agent-ops. Group
messages are dropped unless the bot is @mentioned. Agent replies come back in through
`POST /send`.

`normalizeZaloMessage(raw)` returns exactly:

```ts
{ msgId, uidFrom, idTo, msgType, content, mentions: TMention[], ts }
```

`isGroup` / `conversationId` / the mention gate are derived in `main.ts` from
`getOwnId()`.

Listener resilience: `closed` → exponential backoff restart (5s → 60s cap, 5 attempts,
then `process.exit(1)` for the container to restart).
