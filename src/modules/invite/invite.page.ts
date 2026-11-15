import { Router } from 'express';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';

/**
 * Invite links (<INVITE_BASE_URL>/<code>, e.g. https://valor-api.nodeteam.site/i/6JVQ4QVE).
 * On Android with VALOR installed, the link opens the app on Sign up (App Links, verified by
 * /.well-known/assetlinks.json). Anywhere else this small page explains the invite.
 */
const router = Router();

router.get('/.well-known/assetlinks.json', (_req, res) => {
  const fingerprints = env.ANDROID_CERT_SHA256.split(',').map((f) => f.trim()).filter(Boolean);
  res.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: env.ANDROID_APP_ID, sha256_cert_fingerprints: fingerprints },
    },
  ]);
});

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

router.get('/i/:code', async (req, res) => {
  const code = String(req.params.code).trim().toUpperCase().slice(0, 20);
  const inviter = await prisma.user.findFirst({
    where: { referralCode: code, status: { notIn: ['BANNED', 'DELETED'] } },
    select: { username: true },
  });
  // Opens the app on Android if installed (intent URL); the page itself is the fallback.
  const intent = `intent://${req.get('host')}/i/${encodeURIComponent(code)}#Intent;scheme=https;package=${env.ANDROID_APP_ID};end`;
  const title = inviter ? `${escape(inviter.username)} invited you to VALOR` : 'Join VALOR';
  const body = inviter
    ? 'Share your best plays, battle anonymously 1v1 and let the community vote.'
    : 'This invite link isn’t valid, but you can still create your account.';
  res
    .status(inviter ? 200 : 404)
    .type('html')
    .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="robots" content="noindex">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(120% 80% at 30% 0%,#2a1650 0%,#090811 60%);color:#F7F3FF;font-family:Inter,system-ui,sans-serif}
main{max-width:360px;padding:32px 24px;text-align:center}h1{font-size:26px;line-height:32px;margin:0 0 12px}p{color:#C3BBD0;font-size:15px;line-height:22px;margin:0 0 28px}
a{display:block;padding:14px;border-radius:12px;background:linear-gradient(180deg,#874DE3,#4F278A);color:#fff;font-weight:600;text-decoration:none}small{display:block;margin-top:16px;color:#A39AAC}</style></head>
<body><main><h1>${title}</h1><p>${body}</p><a href="${escape(intent)}">Open VALOR</a>${inviter ? `<small>Invite code ${escape(code)}</small>` : ''}</main></body></html>`);
});

export default router;
