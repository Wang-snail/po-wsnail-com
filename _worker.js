const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

const PRODUCTS = {
  report_1: { product_type: "single", amount_cents: 2990, credits: 1, subscription_quota: 0, name: "单次报告" },
  report_5: { product_type: "pack", amount_cents: 9900, credits: 5, subscription_quota: 0, name: "5次报告包" },
  monthly: { product_type: "monthly", amount_cents: 10000, credits: 0, subscription_quota: 50, name: "月卡" }
};

const FREE_CREDITS_ON_REGISTER = 3;
const EMAIL_VERIFY_BONUS_CREDITS = 5;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const PBKDF2_ITERATIONS = 100000;

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: jsonHeaders });

    const url = new URL(request.url);

    try {
      if (request.method === "POST" && url.pathname === "/api/auth/register") return await handleRegister(request, env);
      if (request.method === "POST" && url.pathname === "/api/auth/login") return await handleLogin(request, env);
      if (request.method === "POST" && url.pathname === "/api/auth/resend-verification") return await handleResendVerification(request, env);
      if (request.method === "GET" && url.pathname === "/api/auth/verify-email") return await handleVerifyEmail(request, env);
      if (request.method === "GET" && ["/api/me", "/api/user/me"].includes(url.pathname)) return await handleMe(request, env);
      if (request.method === "POST" && url.pathname === "/api/reports/consume") return await handleConsumeReport(request, env);
      if (request.method === "POST" && url.pathname === "/api/pay/create") return await handlePayCreate(request, env, ctx);
      if (request.method === "POST" && url.pathname === "/api/pay/callback") return await handlePayCallback(request, env);
      if (request.method === "POST" && url.pathname === "/api/pay/bufpay/callback") return await handleBufPayCallback(request, env);
      if (request.method === "POST" && url.pathname === "/api/orders/manual-create") return await handleManualCreateOrder(request, env, ctx);
      if (request.method === "GET" && url.pathname === "/api/orders/status") return await handleOrderStatus(request, env);
      if (request.method === "GET" && url.pathname === "/api/admin/orders/approve") return await handleAdminReview(request, env, "approved");
      if (request.method === "GET" && url.pathname === "/api/admin/orders/reject") return await handleAdminReview(request, env, "rejected");
      if (request.method === "GET" && url.pathname === "/api/admin/po/summary") return await handleAdminSummary(request, env);
      if (request.method === "GET" && url.pathname === "/api/admin/po/users") return await handleAdminUsers(request, env);
      if (request.method === "GET" && url.pathname === "/api/admin/po/orders") return await handleAdminOrders(request, env);
      if (request.method === "GET" && url.pathname === "/api/admin/po/events") return await handleAdminEvents(request, env);

      if (request.method === "POST" && url.pathname === "/api/track") return await handleTrack(request, env, ctx);
      if (request.method === "GET" && url.pathname === "/api/stats") return await handleStats(url, env);
      if (request.method === "POST" && (url.pathname === "/chat" || url.pathname === "/api/chat")) {
        return jsonResponse({ success: false, error: "AI 功能暂未启用，当前版本使用纯代码分析。" }, 410);
      }
      if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) return jsonResponse({ status: "ok" });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message || "server_error" }, 500);
    }

    return await fetchAsset(request, env);
  }
};

async function fetchAsset(request, env) {
  return env.ASSETS.fetch(request);
}

async function handleRegister(request, env) {
  const db = await poDb(env);
  const body = await readJson(request);
  const email = normalizeEmail(body.email || body.account || body.username || "");
  const account = email;
  const password = String(body.password || "");
  if (!email) return jsonResponse({ success: false, error: "请输入有效邮箱" }, 400);
  if (password.length < 6) return jsonResponse({ success: false, error: "密码至少 6 位" }, 400);

  const existing = await db.prepare("SELECT id FROM po_users WHERE lower(account) = lower(?) OR lower(email) = lower(?)").bind(account, email).first();
  if (existing) return jsonResponse({ success: false, error: "邮箱已注册，请直接登录" }, 409);

  const now = nowIso();
  const passwordHash = await hashPassword(password);
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const userAgent = request.headers.get("User-Agent") || "";
  const tempUserUid = `TMP_${randomHex(8)}`;
  const verifyToken = randomToken();
  const verifyExpiresAt = secondsFromNow(24 * 60 * 60);
  let inserted;
  try {
    inserted = await db.prepare(`
      INSERT INTO po_users (email, account, password_hash, user_uid, free_credits, email_verify_token, email_verify_expires_at, last_login_at, last_login_ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(email, account, passwordHash, tempUserUid, FREE_CREDITS_ON_REGISTER, verifyToken, verifyExpiresAt, now, ip).run();
  } catch (error) {
    if (!/phone|NOT NULL|no such column/i.test(error.message || "")) throw error;
    inserted = await db.prepare(`
      INSERT INTO po_users (phone, email, account, password_hash, user_uid, free_credits, email_verify_token, email_verify_expires_at, last_login_at, last_login_ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(accountPhonePlaceholder(account), email, account, passwordHash, tempUserUid, FREE_CREDITS_ON_REGISTER, verifyToken, verifyExpiresAt, now, ip).run();
  }
  let userId = inserted?.meta?.last_row_id;
  if (!userId) {
    const created = await db.prepare("SELECT id FROM po_users WHERE lower(account) = lower(?)").bind(account).first();
    userId = created?.id;
  }
  if (!userId) throw new Error("user_create_failed");
  const userUid = generateUserUid(userId);
  await db.batch([
    db.prepare("UPDATE po_users SET user_uid = ? WHERE id = ?").bind(userUid, userId),
    db.prepare("INSERT INTO po_user_events (user_id, event, ip, user_agent) VALUES (?, 'register', ?, ?)").bind(userId, ip, userAgent),
    db.prepare("INSERT INTO po_user_events (user_id, event, ip, user_agent) VALUES (?, 'login', ?, ?)").bind(userId, ip, userAgent)
  ]);

  const token = randomToken();
  const expiresAt = secondsFromNow(SESSION_TTL_SECONDS);
  await db.prepare("INSERT INTO po_sessions (user_id, token, expires_at) VALUES (?, ?, ?)").bind(userId, token, expiresAt).run();
  const user = await db.prepare("SELECT * FROM po_users WHERE id = ?").bind(userId).first();
  const emailSent = await sendVerificationEmail(user, verifyToken, env).catch(error => {
    console.error("send verification failed", error);
    return false;
  });
  return jsonResponse({ success: true, token, user: publicUser(user), email_sent: emailSent });
}

async function handleLogin(request, env) {
  const db = await poDb(env);
  const body = await readJson(request);
  const account = normalizeEmail(body.email || body.account || body.username || body.phone || "") || normalizeAccount(body.account || body.username || body.phone || "");
  const password = String(body.password || "");
  if (!account || !password) return jsonResponse({ success: false, error: "请输入邮箱和密码" }, 400);

  const user = await db.prepare("SELECT * FROM po_users WHERE lower(account) = lower(?) OR lower(email) = lower(?)").bind(account, account).first();
  if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash))) {
    return jsonResponse({ success: false, error: "邮箱或密码错误" }, 400);
  }

  const token = randomToken();
  const now = nowIso();
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const userAgent = request.headers.get("User-Agent") || "";
  await db.batch([
    db.prepare("INSERT INTO po_sessions (user_id, token, expires_at) VALUES (?, ?, ?)").bind(user.id, token, secondsFromNow(SESSION_TTL_SECONDS)),
    db.prepare("UPDATE po_users SET last_login_at = ?, last_login_ip = ? WHERE id = ?").bind(now, ip, user.id),
    db.prepare("INSERT INTO po_user_events (user_id, event, ip, user_agent) VALUES (?, 'login', ?, ?)").bind(user.id, ip, userAgent)
  ]);
  const fresh = await db.prepare("SELECT * FROM po_users WHERE id = ?").bind(user.id).first();
  return jsonResponse({ success: true, token, user: publicUser(refreshSubscriptionRow(fresh)) });
}

async function handleResendVerification(request, env) {
  const db = await poDb(env);
  const user = await requireUser(request, db);
  if (!user) return jsonResponse({ success: false, error: "请先登录" }, 401);
  if (user.email_verified_at) return jsonResponse({ success: true, message: "邮箱已验证", user: publicUser(user) });
  const token = randomToken();
  const expiresAt = secondsFromNow(24 * 60 * 60);
  await db.prepare("UPDATE po_users SET email_verify_token = ?, email_verify_expires_at = ? WHERE id = ?").bind(token, expiresAt, user.id).run();
  const fresh = await db.prepare("SELECT * FROM po_users WHERE id = ?").bind(user.id).first();
  const emailSent = await sendVerificationEmail(fresh, token, env).catch(error => {
    console.error("resend verification failed", error);
    return false;
  });
  return jsonResponse({
    success: true,
    email_sent: emailSent,
    message: emailSent
      ? "验证邮件已发送"
      : "邮件暂未发送成功，但账号密码登录和报告生成不受影响",
    user: publicUser(fresh)
  });
}

async function handleVerifyEmail(request, env) {
  const db = await poDb(env);
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  if (!token) return emailVerifyHtml("验证链接无效。", 400);
  const user = await db.prepare("SELECT * FROM po_users WHERE email_verify_token = ?").bind(token).first();
  if (!user) return emailVerifyHtml("验证链接不存在或已失效。", 404);
  if (user.email_verified_at && Number(user.email_bonus_claimed || 0)) {
    return emailVerifyHtml(`邮箱已验证。\n账号：${user.email || user.account}\n额外 ${EMAIL_VERIFY_BONUS_CREDITS} 次机会已到账。`);
  }
  if (user.email_verify_expires_at && Date.parse(user.email_verify_expires_at) < Date.now()) {
    return emailVerifyHtml("验证链接已过期，请登录后重新发送验证邮件。", 400);
  }
  const now = nowIso();
  const changes = [
    db.prepare("UPDATE po_users SET email_verified_at = ?, email_bonus_claimed = 1, email_verify_token = NULL, email_verify_expires_at = NULL, credits = credits + ? WHERE id = ?")
      .bind(now, EMAIL_VERIFY_BONUS_CREDITS, user.id),
    db.prepare("INSERT INTO po_credit_logs (user_id, source, change, reason) VALUES (?, 'email_verify_bonus', ?, 'email_verified_bonus')")
      .bind(user.id, EMAIL_VERIFY_BONUS_CREDITS),
    db.prepare("INSERT INTO po_user_events (user_id, event, ip, user_agent) VALUES (?, 'email_verified', ?, ?)")
      .bind(user.id, request.headers.get("CF-Connecting-IP") || "", request.headers.get("User-Agent") || "")
  ];
  await db.batch(changes);
  return emailVerifyHtml(`邮箱验证成功。\n账号：${user.email || user.account}\n已额外赠送 ${EMAIL_VERIFY_BONUS_CREDITS} 次市场分析机会。`);
}

async function handleMe(request, env) {
  const db = await poDb(env);
  const user = await requireUser(request, db);
  if (!user) return jsonResponse({ success: false, error: "请先登录" }, 401);
  const refreshed = await refreshSubscription(db, user.id);
  return jsonResponse({ success: true, user: publicUser(refreshed) });
}

async function handleConsumeReport(request, env) {
  const db = await poDb(env);
  const user = await requireUser(request, db);
  if (!user) return jsonResponse({ success: false, error: "请先登录" }, 401);
  const fresh = await refreshSubscription(db, user.id);
  let source = "";
  if (Number(fresh.free_credits) > 0) {
    await db.batch([
      db.prepare("UPDATE po_users SET free_credits = free_credits - 1 WHERE id = ?").bind(fresh.id),
      db.prepare("INSERT INTO po_credit_logs (user_id, source, change, reason) VALUES (?, 'free_credits', -1, 'generate_report')").bind(fresh.id)
    ]);
    source = "free_credits";
  } else if (subscriptionValid(fresh) && Number(fresh.subscription_quota) > 0) {
    await db.batch([
      db.prepare("UPDATE po_users SET subscription_quota = subscription_quota - 1 WHERE id = ?").bind(fresh.id),
      db.prepare("INSERT INTO po_credit_logs (user_id, source, change, reason) VALUES (?, 'subscription_quota', -1, 'generate_report')").bind(fresh.id)
    ]);
    source = "subscription_quota";
  } else if (Number(fresh.credits) > 0) {
    await db.batch([
      db.prepare("UPDATE po_users SET credits = credits - 1 WHERE id = ?").bind(fresh.id),
      db.prepare("INSERT INTO po_credit_logs (user_id, source, change, reason) VALUES (?, 'credits', -1, 'generate_report')").bind(fresh.id)
    ]);
    source = "credits";
  } else {
    return jsonResponse({ success: false, error: "需要购买", needPurchase: true }, 402);
  }
  const updated = await db.prepare("SELECT * FROM po_users WHERE id = ?").bind(fresh.id).first();
  return jsonResponse({ success: true, source, user: publicUser(updated) });
}

async function handleManualCreateOrder(request, env, ctx) {
  const db = await poDb(env);
  const user = await requireUser(request, db);
  if (!user) return jsonResponse({ success: false, error: "请先登录" }, 401);
  const body = await readJson(request);
  const productId = String(body.productId || body.product_id || "");
  const product = PRODUCTS[productId];
  if (!product) return jsonResponse({ success: false, error: "未知套餐" }, 400);

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "+00:00");
  const existing = await db.prepare(`
    SELECT * FROM po_orders
    WHERE user_id = ? AND product_id = ? AND status = 'pending_review'
      AND submitted_at >= ?
    ORDER BY id DESC LIMIT 1
  `).bind(user.id, productId, tenMinutesAgo).first();
  if (existing) return jsonResponse({ success: true, reused: true, message: "你已有待确认订单，请等待审核。", order: publicOrder(existing), user: publicUser(user) });

  const orderNo = `ORDER_${formatOrderTime(new Date())}_${randomHex(3).toUpperCase()}`;
  const submittedAt = nowIso();
  await db.prepare(`
    INSERT INTO po_orders
      (order_no, user_id, product_id, product_type, amount_cents, credits, subscription_quota, status, submitted_at, payment_provider)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, 'manual')
  `).bind(orderNo, user.id, productId, product.product_type, product.amount_cents, product.credits, product.subscription_quota, submittedAt).run();
  const order = await db.prepare("SELECT * FROM po_orders WHERE order_no = ?").bind(orderNo).first();
  ctx.waitUntil(notifyAdmin(order, user, env).catch(error => console.error("notify failed", error)));
  return jsonResponse({ success: true, reused: false, message: "已提交确认，正在审核中。", order: publicOrder(order), user: publicUser(user) });
}

async function handlePayCreate(request, env, ctx) {
  const db = await poDb(env);
  const user = await requireUser(request, db);
  if (!user) return jsonResponse({ success: false, error: "请先登录" }, 401);
  const body = await readJson(request);
  const productId = String(body.productId || body.product_id || "");
  const product = PRODUCTS[productId];
  if (!product) return jsonResponse({ success: false, error: "未知套餐" }, 400);
  const provider = preferredPaymentProvider(env);
  if (provider === "bufpay") return await createBufPayOrder(request, env, ctx, db, user, productId, product);
  if (provider !== "payjs") return await createManualFallbackOrder(request, env, ctx, db, user, productId, product);

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "+00:00");
  const existing = await db.prepare(`
    SELECT * FROM po_orders
    WHERE user_id = ? AND product_id = ? AND status = 'pending' AND paid = 0
      AND created_at >= ? AND payjs_order_id IS NOT NULL
    ORDER BY id DESC LIMIT 1
  `).bind(user.id, productId, tenMinutesAgo).first();
  if (existing?.payment_qrcode || existing?.pay_url) {
    return jsonResponse({ success: true, reused: true, order: publicOrder(existing), payment: publicPayment(existing), user: publicUser(user) });
  }

  const orderNo = `PAY_${formatOrderTime(new Date())}_${randomHex(3).toUpperCase()}`;
  const createdAt = nowIso();
  await db.prepare(`
    INSERT INTO po_orders
      (order_no, user_id, product_id, product_type, amount_cents, credits, subscription_quota, status, paid, submitted_at, payment_provider)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, 'payjs')
  `).bind(orderNo, user.id, productId, product.product_type, product.amount_cents, product.credits, product.subscription_quota, createdAt).run();

  const base = (env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
  const payload = {
    mchid: String(env.PAYJS_MCHID),
    total_fee: String(product.amount_cents),
    out_trade_no: orderNo,
    body: product.name,
    notify_url: `${base}/api/pay/callback`,
    attach: JSON.stringify({ user_id: user.id, product_id: productId }).slice(0, 127)
  };
  payload.sign = payjsSign(payload, env.PAYJS_KEY);

  const payResponse = await fetch("https://payjs.cn/api/native", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(payload).toString()
  });
  const payData = await payResponse.json().catch(async () => ({ return_msg: await payResponse.text().catch(() => "") }));
  if (!payResponse.ok || String(payData.return_code) !== "1") {
    await db.prepare("UPDATE po_orders SET status = 'failed', processed_at = ? WHERE order_no = ?").bind(nowIso(), orderNo).run();
    return jsonResponse({ success: false, error: payData.return_msg || payData.msg || "PayJS 创建订单失败" }, 502);
  }

  const payjsOrderId = String(payData.payjs_order_id || payData.transaction_id || "");
  const qrcode = String(payData.qrcode || payData.code_url || payData.qr_code || "");
  const payUrl = String(payData.pay_url || payData.code_url || payData.qrcode || "");
  await db.prepare(`
    UPDATE po_orders
    SET payjs_order_id = ?, payment_qrcode = ?, pay_url = ?, transaction_id = ?
    WHERE order_no = ?
  `).bind(payjsOrderId, qrcode, payUrl, payjsOrderId, orderNo).run();
  const order = await db.prepare("SELECT * FROM po_orders WHERE order_no = ?").bind(orderNo).first();
  return jsonResponse({ success: true, reused: false, order: publicOrder(order), payment: publicPayment(order), user: publicUser(user) });
}

async function createBufPayOrder(request, env, ctx, db, user, productId, product) {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "+00:00");
  const existing = await db.prepare(`
    SELECT * FROM po_orders
    WHERE user_id = ? AND product_id = ? AND status = 'pending' AND paid = 0
      AND created_at >= ? AND payment_provider = 'bufpay'
    ORDER BY id DESC LIMIT 1
  `).bind(user.id, productId, tenMinutesAgo).first();
  if (existing?.payment_qrcode || existing?.pay_url) {
    return jsonResponse({ success: true, reused: true, order: publicOrder(existing), payment: publicPayment(existing), user: publicUser(user) });
  }

  const orderNo = `BUF_${formatOrderTime(new Date())}_${randomHex(3).toUpperCase()}`;
  const createdAt = nowIso();
  await db.prepare(`
    INSERT INTO po_orders
      (order_no, user_id, product_id, product_type, amount_cents, credits, subscription_quota, status, paid, submitted_at, payment_provider)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, 'bufpay')
  `).bind(orderNo, user.id, productId, product.product_type, product.amount_cents, product.credits, product.subscription_quota, createdAt).run();

  const base = (env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
  const feedbackUrl = "";
  const payload = {
    name: product.name,
    pay_type: String(env.BUFPAY_PAY_TYPE || "wechat").toLowerCase() === "alipay" ? "alipay" : "wechat",
    price: formatYuan(product.amount_cents),
    order_id: orderNo,
    order_uid: String(user.user_uid || generateUserUid(user.id)),
    notify_url: `${base}/api/pay/bufpay/callback`,
    return_url: `${base}/orders?orderNo=${encodeURIComponent(orderNo)}`,
    feedback_url: feedbackUrl
  };
  payload.sign = bufpayCreateSign(payload, env.BUFPAY_SECRET || "");

  const endpoint = `${bufpayBaseUrl(env)}/api/pay/${encodeURIComponent(String(env.BUFPAY_AID || ""))}`;
  try {
    const payResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(payload).toString()
    });
    const payText = await payResponse.text();
    const payData = parseMaybeJson(payText);
    if (!payResponse.ok || !bufpaySuccess(payData)) {
      await db.prepare("UPDATE po_orders SET status = 'failed', processed_at = ? WHERE order_no = ?").bind(nowIso(), orderNo).run();
      console.error("bufpay create failed", payResponse.status, String(payText || "").slice(0, 500));
      return await createManualFallbackOrder(request, env, ctx, db, user, productId, product);
    }

    const payInfo = extractBufpayPayment(payData);
    if (!payInfo.qrcode && !payInfo.payUrl) {
      await db.prepare("UPDATE po_orders SET status = 'failed', processed_at = ? WHERE order_no = ?").bind(nowIso(), orderNo).run();
      console.error("bufpay create missing payment payload", String(payText || "").slice(0, 500));
      return await createManualFallbackOrder(request, env, ctx, db, user, productId, product);
    }
    await db.prepare(`
      UPDATE po_orders
      SET provider_order_id = ?, payment_qrcode = ?, pay_url = ?, transaction_id = ?
      WHERE order_no = ?
    `).bind(payInfo.providerOrderId, payInfo.qrcode, payInfo.payUrl, payInfo.providerOrderId, orderNo).run();
    const order = await db.prepare("SELECT * FROM po_orders WHERE order_no = ?").bind(orderNo).first();
    return jsonResponse({ success: true, reused: false, order: publicOrder(order), payment: publicPayment(order), user: publicUser(user) });
  } catch (error) {
    await db.prepare("UPDATE po_orders SET status = 'failed', processed_at = ? WHERE order_no = ?").bind(nowIso(), orderNo).run();
    console.error("bufpay create exception", error);
    return await createManualFallbackOrder(request, env, ctx, db, user, productId, product);
  }
}

async function createManualFallbackOrder(request, env, ctx, db, user, productId, product) {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "+00:00");
  const existing = await db.prepare(`
    SELECT * FROM po_orders
    WHERE user_id = ? AND product_id = ? AND status = 'pending_review'
      AND submitted_at >= ?
    ORDER BY id DESC LIMIT 1
  `).bind(user.id, productId, tenMinutesAgo).first();
  if (existing) {
    const payment = publicPayment(existing);
    return jsonResponse({
      success: true,
      reused: true,
      fallback: "manual_review",
      message: "当前自动支付通道暂未配置，已复用待核对订单。",
      order: publicOrder(existing),
      payment,
      user: publicUser(user)
    });
  }

  const orderNo = `MANUAL_${formatOrderTime(new Date())}_${randomHex(3).toUpperCase()}`;
  const submittedAt = nowIso();
  const base = new URL(request.url).origin;
  const qrPath = `/public/payment/${productId}.jpg`;
  await db.prepare(`
    INSERT INTO po_orders
      (order_no, user_id, product_id, product_type, amount_cents, credits, subscription_quota, status, paid, payment_qrcode, pay_url, submitted_at, payment_provider)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_review', 0, ?, ?, ?, 'manual')
  `).bind(orderNo, user.id, productId, product.product_type, product.amount_cents, product.credits, product.subscription_quota, qrPath, `${base}${qrPath}`, submittedAt).run();
  const order = await db.prepare("SELECT * FROM po_orders WHERE order_no = ?").bind(orderNo).first();
  ctx.waitUntil(notifyAdmin(order, user, env).catch(error => console.error("notify failed", error)));
  return jsonResponse({
    success: true,
    reused: false,
    fallback: "manual_review",
    message: "自动支付通道暂未配置，已创建待人工核对订单。付款后管理员确认到账即可开通。",
    order: publicOrder(order),
    payment: publicPayment(order),
    user: publicUser(user)
  });
}

async function handlePayCallback(request, env) {
  const db = await poDb(env);
  const params = await readPayjsCallback(request);
  if (!verifyPayjsSign(params, env.PAYJS_KEY || "")) {
    return new Response("sign error", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (String(params.return_code || "") !== "1") {
    return new Response("success", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const orderNo = String(params.out_trade_no || "");
  const totalFee = Number(params.total_fee || 0);
  const payjsOrderId = String(params.payjs_order_id || params.transaction_id || "");
  const order = await db.prepare("SELECT * FROM po_orders WHERE order_no = ?").bind(orderNo).first();
  if (!order) return new Response("order not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (Number(order.amount_cents || 0) !== totalFee) {
    await db.prepare("UPDATE po_orders SET status = 'failed', processed_at = ? WHERE order_no = ?").bind(nowIso(), orderNo).run();
    return new Response("amount error", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (Number(order.paid || 0) === 1 || ["paid", "approved"].includes(order.status)) {
    return new Response("success", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const paidAt = nowIso();
  const claimed = await db.prepare(`
    UPDATE po_orders
    SET status = 'processing', transaction_id = COALESCE(NULLIF(?, ''), transaction_id),
        payjs_order_id = COALESCE(NULLIF(?, ''), payjs_order_id)
    WHERE order_no = ? AND paid = 0 AND status NOT IN ('paid', 'approved', 'processing')
  `).bind(payjsOrderId, payjsOrderId, orderNo).run();
  if (Number(claimed?.meta?.changes || 0) > 0) {
    try {
      await db.batch([
        ...orderBenefitStatements(db, order, "payjs_paid"),
        db.prepare("UPDATE po_orders SET status = 'paid', paid = 1, paid_at = ?, processed_at = ? WHERE order_no = ?")
          .bind(paidAt, paidAt, orderNo)
      ]);
      await db.prepare("INSERT INTO po_user_events (user_id, event, ip, user_agent) VALUES (?, 'payjs_paid', ?, ?)")
        .bind(order.user_id, request.headers.get("CF-Connecting-IP") || "", request.headers.get("User-Agent") || "").run();
    } catch (error) {
      await db.prepare("UPDATE po_orders SET status = 'failed', processed_at = ? WHERE order_no = ? AND status = 'processing'")
        .bind(nowIso(), orderNo).run();
      throw error;
    }
  } else {
    const current = await db.prepare("SELECT status, paid FROM po_orders WHERE order_no = ?").bind(orderNo).first();
    if (!(Number(current?.paid || 0) === 1 || ["paid", "approved"].includes(current?.status))) {
      return new Response("processing", { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  }
  return new Response("success", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

async function handleBufPayCallback(request, env) {
  const db = await poDb(env);
  const params = await readPayjsCallback(request);
  if (!verifyBufpaySign(params, env.BUFPAY_SECRET || "")) {
    return new Response("sign error", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const orderNo = String(params.order_id || "");
  const providerOrderId = String(params.aoid || "");
  const order = await db.prepare("SELECT * FROM po_orders WHERE order_no = ?").bind(orderNo).first();
  if (!order) return new Response("order not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if ((order.payment_provider && order.payment_provider !== "bufpay") || (!order.payment_provider && !orderNo.startsWith("BUF_"))) {
    return new Response("provider error", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const expectedCents = Number(order.amount_cents || 0);
  const priceCents = yuanToCents(params.price);
  const paidCents = yuanToCents(params.pay_price || params.price);
  if (priceCents !== expectedCents || paidCents < expectedCents) {
    await db.prepare("UPDATE po_orders SET status = 'failed', processed_at = ? WHERE order_no = ?").bind(nowIso(), orderNo).run();
    return new Response("amount error", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  if (Number(order.paid || 0) === 1 || ["paid", "approved"].includes(order.status)) {
    return new Response("ok", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const paidAt = nowIso();
  const claimed = await db.prepare(`
    UPDATE po_orders
    SET status = 'processing',
        transaction_id = COALESCE(NULLIF(?, ''), transaction_id),
        provider_order_id = COALESCE(NULLIF(?, ''), provider_order_id),
        payment_provider = COALESCE(payment_provider, 'bufpay')
    WHERE order_no = ? AND paid = 0 AND status NOT IN ('paid', 'approved', 'processing')
  `).bind(providerOrderId, providerOrderId, orderNo).run();
  if (Number(claimed?.meta?.changes || 0) > 0) {
    try {
      await db.batch([
        ...orderBenefitStatements(db, order, "bufpay_paid"),
        db.prepare("UPDATE po_orders SET status = 'paid', paid = 1, paid_at = ?, processed_at = ? WHERE order_no = ?")
          .bind(paidAt, paidAt, orderNo)
      ]);
      await db.prepare("INSERT INTO po_user_events (user_id, event, ip, user_agent) VALUES (?, 'bufpay_paid', ?, ?)")
        .bind(order.user_id, request.headers.get("CF-Connecting-IP") || "", request.headers.get("User-Agent") || "").run();
    } catch (error) {
      await db.prepare("UPDATE po_orders SET status = 'failed', processed_at = ? WHERE order_no = ? AND status = 'processing'")
        .bind(nowIso(), orderNo).run();
      throw error;
    }
  } else {
    const current = await db.prepare("SELECT status, paid FROM po_orders WHERE order_no = ?").bind(orderNo).first();
    if (!(Number(current?.paid || 0) === 1 || ["paid", "approved"].includes(current?.status))) {
      return new Response("processing", { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  }
  return new Response("ok", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

async function handleOrderStatus(request, env) {
  const db = await poDb(env);
  const user = await requireUser(request, db);
  if (!user) return jsonResponse({ success: false, error: "请先登录" }, 401);
  const url = new URL(request.url);
  const orderNo = url.searchParams.get("orderNo") || url.searchParams.get("order_no") || "";
  const order = await db.prepare("SELECT * FROM po_orders WHERE order_no = ? AND user_id = ?").bind(orderNo, user.id).first();
  if (!order) return jsonResponse({ success: false, error: "订单不存在" }, 404);
  const refreshed = await refreshSubscription(db, user.id);
  return jsonResponse({ success: true, order: publicOrder(order), payment: publicPayment(order), user: publicUser(refreshed) });
}

async function handleAdminReview(request, env, action) {
  const db = await poDb(env);
  const url = new URL(request.url);
  if (!validAdmin(request, env)) return adminHtml("管理员令牌无效。", 403);
  const orderNo = url.searchParams.get("orderNo") || "";
  const order = await db.prepare("SELECT * FROM po_orders WHERE order_no = ?").bind(orderNo).first();
  if (!order) return adminHtml("订单不存在。", 404);
  const user = await db.prepare("SELECT * FROM po_users WHERE id = ?").bind(order.user_id).first();

  if (action === "rejected") {
    if (order.status === "rejected") return adminHtml(`订单已拒绝，不重复处理。\n订单号：${orderNo}`);
    if (["approved", "paid"].includes(order.status)) return adminHtml("订单已开通，不能拒绝。", 400);
    if (!["pending_review", "pending", "processing"].includes(order.status)) return adminHtml(`当前订单状态为 ${order.status}，不能拒绝。`, 400);
    await db.prepare("UPDATE po_orders SET status = 'rejected', reviewed_at = ?, processed_at = ? WHERE order_no = ?").bind(nowIso(), nowIso(), orderNo).run();
    return adminHtml(`订单已拒绝：${orderNo}\n未增加用户权益。`);
  }

  if (["approved", "paid"].includes(order.status)) return adminHtml(`订单已开通，不重复处理。\n订单号：${orderNo}\n用户：${userDisplay(user)}`);
  if (order.status === "rejected") return adminHtml("订单已拒绝，不能开通。", 400);
  if (!["pending_review", "pending", "processing"].includes(order.status)) return adminHtml(`当前订单状态为 ${order.status}，不能人工确认。`, 400);

  await applyOrderBenefit(db, order, "manual_approved");
  await db.prepare("UPDATE po_orders SET status = 'approved', reviewed_at = ?, processed_at = ? WHERE order_no = ?").bind(nowIso(), nowIso(), orderNo).run();
  const updated = await db.prepare("SELECT * FROM po_users WHERE id = ?").bind(order.user_id).first();
  return adminHtml(`订单已确认开通：${orderNo}\n用户：${userDisplay(user)}\n已增加权益：${orderBenefitText(order)}\n当前权益：免费次数 ${updated.free_credits}，付费次数 ${updated.credits}，月卡剩余 ${updated.subscription_quota}`);
}

async function handleAdminSummary(request, env) {
  const db = await poDb(env);
  if (!validAdmin(request, env)) return jsonResponse({ success: false, error: "管理员令牌无效" }, 403);
  const users = await db.prepare("SELECT COUNT(*) AS total FROM po_users").first();
  const pending = await db.prepare("SELECT COUNT(*) AS total FROM po_orders WHERE status IN ('pending_review', 'pending', 'processing')").first();
  const approved = await db.prepare("SELECT COUNT(*) AS total FROM po_orders WHERE status IN ('approved', 'paid')").first();
  const revenue = await db.prepare("SELECT SUM(amount_cents) AS total FROM po_orders WHERE status IN ('approved', 'paid')").first();
  return jsonResponse({ success: true, data: { users: users.total || 0, pendingOrders: pending.total || 0, approvedOrders: approved.total || 0, revenueCents: revenue.total || 0 } });
}

async function handleAdminUsers(request, env) {
  const db = await poDb(env);
  if (!validAdmin(request, env)) return jsonResponse({ success: false, error: "管理员令牌无效" }, 403);
  const rows = await db.prepare(`
    SELECT id, user_uid, account, email, email_verified_at, email_bonus_claimed, credits, free_credits, subscription_type, subscription_expire_at,
           subscription_quota, last_login_at, last_login_ip, created_at
    FROM po_users
    ORDER BY id DESC
    LIMIT 200
  `).all();
  return jsonResponse({ success: true, data: rows.results || [] });
}

async function handleAdminOrders(request, env) {
  const db = await poDb(env);
  if (!validAdmin(request, env)) return jsonResponse({ success: false, error: "管理员令牌无效" }, 403);
  const rows = await db.prepare(`
    SELECT o.*, u.account, u.user_uid
    FROM po_orders o
    JOIN po_users u ON u.id = o.user_id
    ORDER BY o.id DESC
    LIMIT 200
  `).all();
  return jsonResponse({ success: true, data: (rows.results || []).map(publicAdminOrder) });
}

async function handleAdminEvents(request, env) {
  const db = await poDb(env);
  if (!validAdmin(request, env)) return jsonResponse({ success: false, error: "管理员令牌无效" }, 403);
  const rows = await db.prepare(`
    SELECT e.id, e.event, e.ip, e.user_agent, e.created_at, u.account, u.user_uid
    FROM po_user_events e
    JOIN po_users u ON u.id = e.user_id
    ORDER BY e.id DESC
    LIMIT 200
  `).all();
  return jsonResponse({ success: true, data: rows.results || [] });
}

async function applyOrderBenefit(db, order, reason) {
  const statements = orderBenefitStatements(db, order, reason);
  if (statements.length) await db.batch(statements);
}

function orderBenefitStatements(db, order, reason) {
  if (["single", "pack"].includes(order.product_type)) {
    return [
      db.prepare("UPDATE po_users SET credits = credits + ? WHERE id = ?").bind(order.credits, order.user_id),
      db.prepare("INSERT INTO po_credit_logs (user_id, source, change, reason, order_no) VALUES (?, 'credits', ?, ?, ?)").bind(order.user_id, order.credits, reason, order.order_no)
    ];
  }
  if (order.product_type === "monthly") {
    const expireAt = secondsFromNow(30 * 24 * 60 * 60);
    return [
      db.prepare("UPDATE po_users SET subscription_type = 'monthly', subscription_expire_at = ?, subscription_quota = 50 WHERE id = ?").bind(expireAt, order.user_id),
      db.prepare("INSERT INTO po_credit_logs (user_id, source, change, reason, order_no) VALUES (?, 'subscription_quota', 50, ?, ?)").bind(order.user_id, reason, order.order_no)
    ];
  }
  return [];
}

async function requireUser(request, db) {
  const auth = request.headers.get("Authorization") || "";
  let token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) token = new URL(request.url).searchParams.get("token") || "";
  if (!token) return null;
  const row = await db.prepare(`
    SELECT u.*
    FROM po_sessions s
    JOIN po_users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `).bind(token, nowIso()).first();
  return row || null;
}

async function poDb(env) {
  const db = env.PO_DB || env.po_chat_logs || env.ANALYTICS_DB;
  if (!db) throw new Error("po_db_not_bound");
  await ensurePoSchema(db);
  return db;
}

async function ensurePoSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS po_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_uid TEXT UNIQUE,
      phone TEXT,
      email TEXT,
      account TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      credits INTEGER NOT NULL DEFAULT 0,
      free_credits INTEGER NOT NULL DEFAULT 3,
      email_verified_at TEXT,
      email_verify_token TEXT,
      email_verify_expires_at TEXT,
      email_bonus_claimed INTEGER NOT NULL DEFAULT 0,
      subscription_type TEXT,
      subscription_expire_at TEXT,
      subscription_quota INTEGER NOT NULL DEFAULT 0,
      last_login_at TEXT,
      last_login_ip TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS po_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS po_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      product_type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      credits INTEGER NOT NULL DEFAULT 0,
      subscription_quota INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      paid INTEGER NOT NULL DEFAULT 0,
      transaction_id TEXT,
      payment_provider TEXT,
      provider_order_id TEXT,
      payjs_order_id TEXT,
      payment_qrcode TEXT,
      pay_url TEXT,
      paid_at TEXT,
      submitted_at TEXT,
      reviewed_at TEXT,
      processed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS po_credit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      change INTEGER NOT NULL,
      reason TEXT NOT NULL,
      order_no TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS po_user_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      event TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_po_sessions_token ON po_sessions(token)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_po_orders_user ON po_orders(user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_po_events_user ON po_user_events(user_id)")
  ]);
  await ensurePoColumns(db);
}

async function ensurePoColumns(db) {
  const columns = [
    ["po_users", "email", "TEXT"],
    ["po_users", "email_verified_at", "TEXT"],
    ["po_users", "email_verify_token", "TEXT"],
    ["po_users", "email_verify_expires_at", "TEXT"],
    ["po_users", "email_bonus_claimed", "INTEGER NOT NULL DEFAULT 0"],
    ["po_orders", "paid", "INTEGER NOT NULL DEFAULT 0"],
    ["po_orders", "payjs_order_id", "TEXT"],
    ["po_orders", "payment_provider", "TEXT"],
    ["po_orders", "provider_order_id", "TEXT"],
    ["po_orders", "payment_qrcode", "TEXT"],
    ["po_orders", "pay_url", "TEXT"]
  ];
  for (const [table, column, type] of columns) {
    try {
      await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
    } catch (error) {
      if (!/duplicate column|already exists/i.test(error.message || "")) console.warn("schema alter skipped", table, column, error.message);
    }
  }
}

async function refreshSubscription(db, userId) {
  const user = await db.prepare("SELECT * FROM po_users WHERE id = ?").bind(userId).first();
  if (user?.subscription_type && !subscriptionValid(user)) {
    await db.prepare("UPDATE po_users SET subscription_type = NULL, subscription_expire_at = NULL, subscription_quota = 0 WHERE id = ?").bind(userId).run();
    return db.prepare("SELECT * FROM po_users WHERE id = ?").bind(userId).first();
  }
  return user;
}

function refreshSubscriptionRow(user) {
  if (!subscriptionValid(user)) return { ...user, subscription_type: null, subscription_expire_at: null, subscription_quota: 0 };
  return user;
}

function subscriptionValid(user) {
  return user?.subscription_type === "monthly" && user.subscription_expire_at && Date.parse(user.subscription_expire_at) > Date.now();
}

function publicUser(user) {
  const valid = subscriptionValid(user);
  return {
    id: user.id,
    user_uid: user.user_uid || generateUserUid(user.id),
    account: user.account,
    email: user.email || user.account || "",
    email_verified: Boolean(user.email_verified_at),
    email_verified_at: user.email_verified_at || "",
    email_bonus_claimed: Boolean(Number(user.email_bonus_claimed || 0)),
    phone: user.phone || "",
    credits: Number(user.credits || 0),
    free_credits: Number(user.free_credits || 0),
    subscription_type: valid ? user.subscription_type : null,
    subscription_expire_at: valid ? user.subscription_expire_at : null,
    subscription_quota: valid ? Number(user.subscription_quota || 0) : 0
  };
}

function publicOrder(order) {
  const product = PRODUCTS[order.product_id] || {};
  return {
    order_no: order.order_no,
    product_id: order.product_id,
    product_name: product.name || order.product_id,
    product_type: order.product_type,
    amount_cents: Number(order.amount_cents || 0),
    amount_yuan: Number(order.amount_cents || 0) / 100,
    credits: Number(order.credits || 0),
    subscription_quota: Number(order.subscription_quota || 0),
    status: order.status,
    paid: Boolean(Number(order.paid || 0)) || ["paid", "approved"].includes(order.status),
    payment_provider: order.payment_provider || paymentProviderFromOrder(order),
    provider_order_id: order.provider_order_id || "",
    payjs_order_id: order.payjs_order_id || "",
    payment_qrcode: order.payment_qrcode || "",
    pay_url: order.pay_url || "",
    paid_at: order.paid_at,
    submitted_at: order.submitted_at,
    reviewed_at: order.reviewed_at,
    created_at: order.created_at
  };
}

function publicAdminOrder(order) {
  return { ...publicOrder(order), account: order.account, user_uid: order.user_uid };
}

function publicPayment(order) {
  const payjsOrderId = order.payjs_order_id || "";
  const provider = order.payment_provider || paymentProviderFromOrder(order);
  return {
    order_no: order.order_no,
    provider,
    qrcode: order.payment_qrcode || "",
    pay_url: order.pay_url || order.payment_qrcode || "",
    payjs_order_id: payjsOrderId,
    provider_order_id: order.provider_order_id || "",
    manual_review: provider === "manual" || (!payjsOrderId && order.status === "pending_review"),
    amount_cents: Number(order.amount_cents || 0),
    amount_yuan: Number(order.amount_cents || 0) / 100
  };
}

function paymentProviderFromOrder(order) {
  if (order.payjs_order_id) return "payjs";
  if (order.provider_order_id) return "bufpay";
  if (order.status === "pending_review") return "manual";
  return "";
}

function validAdmin(request, env) {
  const token = env.ADMIN_APPROVE_TOKEN || "";
  if (!token) return false;
  const url = new URL(request.url);
  const auth = request.headers.get("Authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : (url.searchParams.get("adminToken") || "");
  return provided === token;
}

async function notifyAdmin(order, user, env) {
  const token = env.DISCORD_BOT_TOKEN || "";
  const channelId = env.DISCORD_CHANNEL_ID || "";
  const adminToken = env.ADMIN_APPROVE_TOKEN || "";
  const base = (env.NEXT_PUBLIC_SITE_URL || "https://po.wsnail.com").replace(/\/$/, "");
  const product = PRODUCTS[order.product_id] || {};
  const message = [
    "新订单待确认",
    "",
    `订单号：${order.order_no}`,
    `用户：${userDisplay(user)}`,
    `套餐：${product.name || order.product_id}`,
    `金额：¥${Number(order.amount_cents || 0) / 100}`,
    `提交时间：${formatLocalTime(order.submitted_at)}`,
    "",
    "请根据收款记录中的金额和时间核对。",
    "",
    `确认开通：${base}/api/admin/orders/approve?orderNo=${encodeURIComponent(order.order_no)}&adminToken=${encodeURIComponent(adminToken)}`,
    `拒绝：${base}/api/admin/orders/reject?orderNo=${encodeURIComponent(order.order_no)}&adminToken=${encodeURIComponent(adminToken)}`
  ].join("\n");

  if (!token || !channelId) {
    console.log("[admin notify]", message);
    return;
  }
  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: message })
  });
}

async function sendVerificationEmail(user, token, env) {
  const email = normalizeEmail(user.email || user.account || "");
  if (!email || !token) return false;
  const base = (env.NEXT_PUBLIC_SITE_URL || "https://po.wsnail.com").replace(/\/$/, "");
  const verifyUrl = `${base}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const subject = "验证你的邮箱，领取 5 次市场分析机会";
  const text = [
    "你好，",
    "",
    "请点击下面的链接验证邮箱：",
    verifyUrl,
    "",
    `验证成功后，你的账号会额外获得 ${EMAIL_VERIFY_BONUS_CREDITS} 次市场分析机会。`,
    "",
    "如果不是你本人操作，可以忽略这封邮件。"
  ].join("\n");
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;line-height:1.7;color:#172033;">
      <h2>验证邮箱，领取 ${EMAIL_VERIFY_BONUS_CREDITS} 次市场分析机会</h2>
      <p>点击下面按钮完成邮箱验证：</p>
      <p><a href="${escapeHtml(verifyUrl)}" style="display:inline-block;background:#1463ff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">验证邮箱</a></p>
      <p>如果按钮无法打开，请复制以下链接到浏览器：</p>
      <p>${escapeHtml(verifyUrl)}</p>
    </div>
  `;

  if (env.RESEND_API_KEY) {
    const from = normalizeEmailFrom(env.EMAIL_FROM);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from, to: email, subject, text, html })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("resend failed", response.status, detail.slice(0, 300));
      return false;
    }
    return true;
  }

  if (env.EMAIL_WEBHOOK_URL) {
    const response = await fetch(env.EMAIL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: email, subject, text, html, verifyUrl })
    });
    return response.ok;
  }

  console.log("[email verification]", email, verifyUrl);
  return false;
}

function normalizeEmailFrom(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/<([^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)>/) || raw.match(/([^<>\s]+@[^<>\s]+\.[^<>\s]+)/);
  const email = normalizeEmail(match ? match[1] : "");
  const fromEmail = email || "noreply@wsnail.com";
  return `PO Opportunity <${fromEmail}>`;
}

function userDisplay(user) {
  return `${user.account || "-"}（${user.user_uid || generateUserUid(user.id)}）`;
}

function orderBenefitText(order) {
  if (["single", "pack"].includes(order.product_type)) return `${order.credits}次报告`;
  if (order.product_type === "monthly") return "月卡 50 次，30 天有效";
  return "未知权益";
}

function adminHtml(message, status = 200) {
  const escaped = escapeHtml(message);
  return new Response(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>订单审核结果</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,"Microsoft YaHei",sans-serif;background:#f5f7fb;color:#243447;line-height:1.7;padding:32px}main{max-width:760px;margin:0 auto;background:#fff;border:1px solid #d9e2ec;border-radius:8px;padding:24px}h1{margin:0 0 12px;color:#0f172a;font-size:24px}pre{white-space:pre-wrap;background:#eef4fb;border-radius:8px;padding:16px}</style></head><body><main><h1>订单审核结果</h1><pre>${escaped}</pre></main></body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

function emailVerifyHtml(message, status = 200) {
  const escaped = escapeHtml(message);
  return new Response(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>邮箱验证</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,"Microsoft YaHei",sans-serif;background:#f5f7fb;color:#243447;line-height:1.7;padding:32px}main{max-width:720px;margin:0 auto;background:#fff;border:1px solid #d9e2ec;border-radius:10px;padding:24px}h1{margin:0 0 12px;color:#0f172a;font-size:24px}pre{white-space:pre-wrap;background:#eef4fb;border-radius:8px;padding:16px}a{color:#1463ff}</style></head><body><main><h1>邮箱验证</h1><pre>${escaped}</pre><p><a href="/">返回首页</a></p></main></body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

async function handleTrack(request, env, ctx) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 4096) return jsonResponse({ ok: false, error: "payload_too_large" }, 413);

    const body = await request.json();
    const event = {
      eventName: clean(body.eventName || body.event || "", 64),
      path: cleanPath(body.path || ""),
      referrer: clean(body.referrer || "", 180),
      source: clean(body.source || "", 80),
      medium: clean(body.medium || "", 80),
      campaign: clean(body.campaign || "", 120),
      sessionId: clean(body.sessionId || "", 80),
      metadata: cleanMetadata(body.metadata)
    };

    if (!event.eventName) return jsonResponse({ ok: false, error: "missing_event" }, 400);

    const db = analyticsDb(env);
    if (db) {
      const write = db.prepare(`
        INSERT INTO analytics_events
          (event_name, path, referrer, source, medium, campaign, session_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        event.eventName,
        event.path,
        event.referrer,
        event.source,
        event.medium,
        event.campaign,
        event.sessionId,
        JSON.stringify(event.metadata)
      ).run();
      ctx.waitUntil(write.catch(() => {}));
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: "bad_request" }, 400);
  }
}

async function handleStats(url, env) {
  const db = analyticsDb(env);
  if (!db) return jsonResponse({ ok: false, error: "analytics_db_not_bound" }, 503);

  const days = Math.min(Math.max(Number(url.searchParams.get("days") || 14), 1), 90);
  const since = `-${days} days`;

  try {
    const totals = await db.prepare(`
      SELECT
        COUNT(*) AS events,
        SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS page_views,
        COUNT(DISTINCT session_id) AS sessions,
        SUM(CASE WHEN event_name = 'upload_success' THEN 1 ELSE 0 END) AS uploads,
        SUM(CASE WHEN event_name = 'report_generated' THEN 1 ELSE 0 END) AS reports,
        SUM(CASE WHEN event_name = 'help_start_click' THEN 1 ELSE 0 END) AS help_cta_clicks
      FROM analytics_events
      WHERE created_at >= datetime('now', ?)
    `).bind(since).first();

    const events = await db.prepare(`
      SELECT event_name AS name, COUNT(*) AS count
      FROM analytics_events
      WHERE created_at >= datetime('now', ?)
      GROUP BY event_name
      ORDER BY count DESC
      LIMIT 20
    `).bind(since).all();

    const pages = await db.prepare(`
      SELECT path, COUNT(*) AS views
      FROM analytics_events
      WHERE created_at >= datetime('now', ?) AND event_name = 'page_view'
      GROUP BY path
      ORDER BY views DESC
      LIMIT 20
    `).bind(since).all();

    const sources = await db.prepare(`
      SELECT
        CASE
          WHEN source != '' THEN source
          WHEN referrer != '' THEN referrer
          ELSE 'direct'
        END AS source,
        COUNT(*) AS visits
      FROM analytics_events
      WHERE created_at >= datetime('now', ?) AND event_name = 'page_view'
      GROUP BY source
      ORDER BY visits DESC
      LIMIT 20
    `).bind(since).all();

    const daily = await db.prepare(`
      SELECT date(created_at) AS day, event_name AS name, COUNT(*) AS count
      FROM analytics_events
      WHERE created_at >= datetime('now', ?)
      GROUP BY day, event_name
      ORDER BY day ASC
    `).bind(since).all();

    return jsonResponse({
      ok: true,
      days,
      totals: {
        events: Number(totals?.events || 0),
        pageViews: Number(totals?.page_views || 0),
        sessions: Number(totals?.sessions || 0),
        uploads: Number(totals?.uploads || 0),
        reports: Number(totals?.reports || 0),
        helpCtaClicks: Number(totals?.help_cta_clicks || 0)
      },
      events: events.results || [],
      pages: pages.results || [],
      sources: sources.results || [],
      daily: daily.results || []
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: "stats_query_failed" }, 500);
  }
}

function analyticsDb(env) {
  return env.ANALYTICS_DB || env.po_chat_logs || null;
}

function preferredPaymentProvider(env) {
  const configured = String(env.PAY_PROVIDER || "").trim().toLowerCase();
  if (configured === "bufpay") return bufpayConfigured(env) ? "bufpay" : "manual";
  if (configured === "payjs") return payjsConfigured(env) ? "payjs" : "manual";
  if (bufpayConfigured(env)) return "bufpay";
  if (payjsConfigured(env)) return "payjs";
  return "manual";
}

function bufpayConfigured(env) {
  return Boolean(env.BUFPAY_AID && env.BUFPAY_SECRET);
}

function payjsConfigured(env) {
  return Boolean(env.PAYJS_MCHID && env.PAYJS_KEY);
}

function bufpayBaseUrl(env) {
  return String(env.BUFPAY_BASE_URL || "https://bufpay.com").replace(/\/$/, "");
}

function formatYuan(amountCents) {
  return (Number(amountCents || 0) / 100).toFixed(2);
}

function yuanToCents(value) {
  const normalized = String(value || "").replace(/[^\d.]/g, "");
  if (!normalized) return 0;
  return Math.round(Number(normalized) * 100);
}

function parseMaybeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function bufpaySuccess(data) {
  if (!data || data.error || data.message === "error") return false;
  if (data.errmsg && !/success|ok/i.test(String(data.errmsg))) return false;
  const code = data.code ?? data.status ?? data.return_code ?? data.errcode;
  if (code === undefined || code === null || code === "") return Boolean(data.data || data.pay_url || data.url || data.qrcode || data.qr_img || data.jump_url);
  const normalized = String(code).toLowerCase();
  return ["0", "1", "200", "success", "ok", "true"].includes(normalized);
}

function extractBufpayPayment(data) {
  const source = data?.data && typeof data.data === "object" ? data.data : data || {};
  const providerOrderId = String(source.aoid || source.bufpay_order_id || source.order_id || source.id || "");
  const qrcode = normalizePaymentImage(source.qr_img || source.qrcode || source.qr_code || source.qrCode || source.code_url || source.payment_qrcode || "");
  const payUrl = String(source.jump_url || source.pay_url || source.url || source.payment_url || source.cashier_url || source.code_url || "");
  return { providerOrderId, qrcode, payUrl };
}

function normalizePaymentImage(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(data:image\/|https?:\/\/|\/)/i.test(raw)) return raw;
  if (/^[A-Za-z0-9+/=\s]+$/.test(raw) && raw.length > 128) return `data:image/jpeg;base64,${raw.replace(/\s+/g, "")}`;
  return raw;
}

async function readJson(request) {
  const size = Number(request.headers.get("content-length") || 0);
  if (size > 1024 * 1024) throw new Error("请求体过大");
  return request.json();
}

async function readPayjsCallback(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return await request.json();
  const text = await request.text();
  const params = {};
  for (const [key, value] of new URLSearchParams(text)) params[key] = value;
  return params;
}

function payjsSign(params, key) {
  const source = Object.keys(params)
    .filter(name => name !== "sign" && params[name] !== undefined && params[name] !== null && String(params[name]) !== "")
    .sort()
    .map(name => `${name}=${params[name]}`)
    .join("&");
  return md5(`${source}&key=${key}`).toUpperCase();
}

function verifyPayjsSign(params, key) {
  if (!key || !params?.sign) return false;
  return timingSafeEqual(payjsSign(params, key), String(params.sign || "").toUpperCase());
}

function bufpayCreateSign(params, secret) {
  return md5([
    params.name,
    params.pay_type,
    params.price,
    params.order_id,
    params.order_uid,
    params.notify_url,
    params.return_url,
    params.feedback_url || "",
    secret
  ].map(value => String(value ?? "")).join(""));
}

function bufpayCallbackSign(params, secret) {
  return md5([
    params.aoid,
    params.order_id,
    params.order_uid,
    params.price,
    params.pay_price,
    secret
  ].map(value => String(value ?? "")).join(""));
}

function verifyBufpaySign(params, secret) {
  if (!secret || !params?.sign) return false;
  return timingSafeEqual(bufpayCallbackSign(params, secret).toLowerCase(), String(params.sign || "").toLowerCase());
}

async function hashPassword(password) {
  const salt = randomHex(16);
  const iterations = PBKDF2_ITERATIONS;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(salt), iterations }, key, 256);
  return `pbkdf2_sha256$${iterations}$${salt}$${bytesToHex(new Uint8Array(bits))}`;
}

async function verifyPassword(password, stored) {
  try {
    const [scheme, iterations, salt, digest] = String(stored).split("$");
    if (scheme !== "pbkdf2_sha256") return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(salt), iterations: Number(iterations) }, key, 256);
    return timingSafeEqual(bytesToHex(new Uint8Array(bits)), digest);
  } catch {
    return false;
  }
}

function normalizeAccount(value) {
  const account = String(value || "").trim().split("").filter(ch => /[a-zA-Z0-9_-]/.test(ch)).join("");
  return account.length >= 3 && account.length <= 32 ? account : "";
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 180 ? email : "";
}

function accountPhonePlaceholder(account) {
  return `account:${String(account || "").toLowerCase()}`;
}

function randomToken() {
  return `${randomHex(24)}${Date.now().toString(36)}`;
}

function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return bytesToHex(arr);
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes) {
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function md5(input) {
  function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
  function cmn(q, a, b, x, s, t) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
  function md5cycle(state, block) {
    let [a, b, c, d] = state;
    a = ff(a, b, c, d, block[0], 7, -680876936); d = ff(d, a, b, c, block[1], 12, -389564586);
    c = ff(c, d, a, b, block[2], 17, 606105819); b = ff(b, c, d, a, block[3], 22, -1044525330);
    a = ff(a, b, c, d, block[4], 7, -176418897); d = ff(d, a, b, c, block[5], 12, 1200080426);
    c = ff(c, d, a, b, block[6], 17, -1473231341); b = ff(b, c, d, a, block[7], 22, -45705983);
    a = ff(a, b, c, d, block[8], 7, 1770035416); d = ff(d, a, b, c, block[9], 12, -1958414417);
    c = ff(c, d, a, b, block[10], 17, -42063); b = ff(b, c, d, a, block[11], 22, -1990404162);
    a = ff(a, b, c, d, block[12], 7, 1804603682); d = ff(d, a, b, c, block[13], 12, -40341101);
    c = ff(c, d, a, b, block[14], 17, -1502002290); b = ff(b, c, d, a, block[15], 22, 1236535329);
    a = gg(a, b, c, d, block[1], 5, -165796510); d = gg(d, a, b, c, block[6], 9, -1069501632);
    c = gg(c, d, a, b, block[11], 14, 643717713); b = gg(b, c, d, a, block[0], 20, -373897302);
    a = gg(a, b, c, d, block[5], 5, -701558691); d = gg(d, a, b, c, block[10], 9, 38016083);
    c = gg(c, d, a, b, block[15], 14, -660478335); b = gg(b, c, d, a, block[4], 20, -405537848);
    a = gg(a, b, c, d, block[9], 5, 568446438); d = gg(d, a, b, c, block[14], 9, -1019803690);
    c = gg(c, d, a, b, block[3], 14, -187363961); b = gg(b, c, d, a, block[8], 20, 1163531501);
    a = gg(a, b, c, d, block[13], 5, -1444681467); d = gg(d, a, b, c, block[2], 9, -51403784);
    c = gg(c, d, a, b, block[7], 14, 1735328473); b = gg(b, c, d, a, block[12], 20, -1926607734);
    a = hh(a, b, c, d, block[5], 4, -378558); d = hh(d, a, b, c, block[8], 11, -2022574463);
    c = hh(c, d, a, b, block[11], 16, 1839030562); b = hh(b, c, d, a, block[14], 23, -35309556);
    a = hh(a, b, c, d, block[1], 4, -1530992060); d = hh(d, a, b, c, block[4], 11, 1272893353);
    c = hh(c, d, a, b, block[7], 16, -155497632); b = hh(b, c, d, a, block[10], 23, -1094730640);
    a = hh(a, b, c, d, block[13], 4, 681279174); d = hh(d, a, b, c, block[0], 11, -358537222);
    c = hh(c, d, a, b, block[3], 16, -722521979); b = hh(b, c, d, a, block[6], 23, 76029189);
    a = hh(a, b, c, d, block[9], 4, -640364487); d = hh(d, a, b, c, block[12], 11, -421815835);
    c = hh(c, d, a, b, block[15], 16, 530742520); b = hh(b, c, d, a, block[2], 23, -995338651);
    a = ii(a, b, c, d, block[0], 6, -198630844); d = ii(d, a, b, c, block[7], 10, 1126891415);
    c = ii(c, d, a, b, block[14], 15, -1416354905); b = ii(b, c, d, a, block[5], 21, -57434055);
    a = ii(a, b, c, d, block[12], 6, 1700485571); d = ii(d, a, b, c, block[3], 10, -1894986606);
    c = ii(c, d, a, b, block[10], 15, -1051523); b = ii(b, c, d, a, block[1], 21, -2054922799);
    a = ii(a, b, c, d, block[8], 6, 1873313359); d = ii(d, a, b, c, block[15], 10, -30611744);
    c = ii(c, d, a, b, block[6], 15, -1560198380); b = ii(b, c, d, a, block[13], 21, 1309151649);
    a = ii(a, b, c, d, block[4], 6, -145523070); d = ii(d, a, b, c, block[11], 10, -1120210379);
    c = ii(c, d, a, b, block[2], 15, 718787259); b = ii(b, c, d, a, block[9], 21, -343485551);
    state[0] = add32(a, state[0]); state[1] = add32(b, state[1]); state[2] = add32(c, state[2]); state[3] = add32(d, state[3]);
  }
  const bytes = Array.from(new TextEncoder().encode(String(input)));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 0; i < 8; i += 1) bytes.push(i < 4 ? (bitLen >>> (8 * i)) & 0xff : 0);
  const state = [1732584193, -271733879, -1732584194, 271733878];
  for (let i = 0; i < bytes.length; i += 64) {
    const block = [];
    for (let j = 0; j < 64; j += 4) block.push(bytes[i + j] | (bytes[i + j + 1] << 8) | (bytes[i + j + 2] << 16) | (bytes[i + j + 3] << 24));
    md5cycle(state, block);
  }
  return state.map(n => {
    let out = "";
    for (let i = 0; i < 4; i += 1) out += ((n >>> (8 * i)) & 0xff).toString(16).padStart(2, "0");
    return out;
  }).join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function generateUserUid(id) {
  return `U${String(id).padStart(6, "0")}`;
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

function secondsFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

function formatOrderTime(date) {
  const p = n => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`;
}

function formatLocalTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]));
}

function clean(value, maxLength) {
  return String(value || "").replace(/[^\p{L}\p{N}\s._~:/?#\[\]@!$&'()*+,;=%|-]/gu, "").slice(0, maxLength);
}

function cleanPath(value) {
  const raw = clean(value, 200);
  return raw.startsWith("/") ? raw : "/" + raw.replace(/^https?:\/\/[^/]+/i, "");
}

function cleanMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = {};
  Object.entries(value).slice(0, 12).forEach(([key, item]) => {
    const safeKey = clean(key, 40);
    if (!safeKey) return;
    if (typeof item === "number" || typeof item === "boolean") allowed[safeKey] = item;
    else if (Array.isArray(item)) allowed[safeKey] = item.slice(0, 10).map(entry => clean(entry, 40));
    else allowed[safeKey] = clean(item, 120);
  });
  return allowed;
}
