import crypto from "node:crypto";

/**
 * Web Push without dependencies: VAPID (RFC 8292) authorisation and aes128gcm payload
 * encryption (RFC 8291), built on Node's crypto. Works with every browser push service
 * (Apple, Google/FCM, Mozilla, Microsoft).
 */

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushResult = { ok: boolean; status: number; gone: boolean };

const b64u = (b: Buffer) => b.toString("base64url");
const unb64u = (s: string) => Buffer.from(s, "base64url");
const hmac = (key: Buffer, data: Buffer) => crypto.createHmac("sha256", key).update(data).digest();

export const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null;

function vapidKey(): crypto.KeyObject {
  const pub = unb64u(process.env.VAPID_PUBLIC_KEY!);
  return crypto.createPrivateKey({
    key: { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: process.env.VAPID_PRIVATE_KEY! },
    format: "jwk",
  });
}

/** VAPID JWT for one push service origin, valid for 12 hours. */
function vapidAuth(endpoint: string): string {
  const aud = new URL(endpoint).origin;
  const head = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(Buffer.from(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: process.env.VAPID_SUBJECT || "https://strixagents.com" })));
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key: vapidKey(), dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${process.env.VAPID_PUBLIC_KEY}`;
}

/** RFC 8291 aes128gcm: one record, encrypted for the subscriber's p256dh key and auth secret. */
export function encryptPayload(sub: PushSub, payload: Buffer, salt = crypto.randomBytes(16), ephemeral?: crypto.ECDH): Buffer {
  const uaPublic = unb64u(sub.keys.p256dh);
  const authSecret = unb64u(sub.keys.auth);
  if (!ephemeral) {
    ephemeral = crypto.createECDH("prime256v1");
    ephemeral.generateKeys();
  }
  const asPublic = ephemeral.getPublicKey();
  const ecdh = ephemeral.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, ecdh);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

export type Note = { title: string; body: string; url?: string; tag?: string };

/** Send one notification. `gone` means the subscription no longer exists and should be deleted. */
export async function sendPush(sub: PushSub, note: Note, ttlSeconds = 6 * 3600): Promise<PushResult> {
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidAuth(sub.endpoint),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttlSeconds),
      Urgency: "high",
    },
    body: new Uint8Array(encryptPayload(sub, Buffer.from(JSON.stringify(note)))),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res) return { ok: false, status: 0, gone: false };
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}
