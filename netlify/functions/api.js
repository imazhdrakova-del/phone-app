export default async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method Not Allowed" }, 405);
    }

    const SCRIPT_URL = process.env.APPS_SCRIPT_URL;
    const API_KEY = process.env.API_KEY;

    if (!SCRIPT_URL) return json({ ok: false, error: "Missing APPS_SCRIPT_URL" }, 500);
    if (!API_KEY) return json({ ok: false, error: "Missing API_KEY" }, 500);

    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return json({ ok: false, error: "Expected application/json" }, 400);
    }

    const incoming = await req.json();
    const action = incoming?.action;
    const payload = incoming?.payload || {};

    // Cache only for getStateLite
    const cacheKey = action === "getStateLite" ? "getStateLite" : null;

    if (cacheKey) {
      const cached = memGet_(cacheKey);
      if (cached) {
        return new Response(cached.body, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=60",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    const body = { action, payload, apiKey: API_KEY };

    // Timeout for GAS (18 seconds)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18_000);

    let upstream;
    try {
      upstream = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await upstream.text();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json(
        {
          ok: false,
          error: "Upstream returned non-JSON",
          upstreamStatus: upstream.status,
          upstreamBody: (text || "").slice(0, 2000),
        },
        502
      );
    }

    const isOk = !!parsed?.ok;

    // Invalidate cache on successful mutations
    const MUTATIONS = ['addPatient', 'addPackage', 'addConsultation', 'deletePackage'];
    if (MUTATIONS.includes(action) && isOk) {
      __MEM.delete('getStateLite');
    }

    // Cache successful getStateLite
    if (cacheKey && isOk) {
      const respBody = JSON.stringify(parsed);
      memSet_(cacheKey, respBody, 30000); // 30 seconds
      return new Response(respBody, {
        status: upstream.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=60",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Everything else: no-store
    return new Response(JSON.stringify(parsed), {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    const isAbort = err?.name === "AbortError";
    return json(
      { ok: false, error: isAbort ? "Upstream timeout" : (err?.message || String(err)) },
      isAbort ? 504 : 500
    );
  }
};

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      ...headers,
    },
  });
}

const __MEM = globalThis.__MEM || (globalThis.__MEM = new Map());

function memGet_(key) {
  const it = __MEM.get(key);
  if (!it) return null;
  if (Date.now() > it.expires) {
    __MEM.delete(key);
    return null;
  }
  return it;
}

function memSet_(key, body, ttlMs) {
  __MEM.set(key, { body, expires: Date.now() + ttlMs });
}
