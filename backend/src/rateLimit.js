/**
 * 메모리 기반 고정 창(fixed window) 레이트 리밋 미들웨어.
 * 단일 서버 프로세스 기준이라 별도 저장소 없이 Map 으로 센다. 창이 지난 항목은 주기적으로 정리한다.
 */
export function rateLimit({ windowMs, max, key = (req) => req.ip, message = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }) {
  const hits = new Map(); // key -> { count, resetAt }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, Math.max(windowMs, 10000));
  sweep.unref?.();

  const middleware = (req, res, next) => {
    if (!max) return next(); // max 0 = 끔
    const now = Date.now();
    const k = key(req);
    let e = hits.get(k);
    if (!e || e.resetAt <= now) {
      e = { count: 0, resetAt: now + windowMs };
      hits.set(k, e);
    }
    e.count += 1;
    if (e.count > max) {
      const retry = Math.ceil((e.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ error: `${message} (${retry}초 후)` });
    }
    return next();
  };
  middleware.reset = () => hits.clear();
  return middleware;
}
