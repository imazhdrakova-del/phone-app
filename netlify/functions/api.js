export default async (req) => {
  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method Not Allowed" }, 405);
    }

    const SCRIPT_URL = process.env.APPS_SCRIPT_URL; // /exec
    const API_KEY = process.env.API_KEY;

    if (!SCRIPT_URL) return json({ ok: false, error: "Missing APPS_SCRIPT_URL" }, 500);
    if (!API_KEY) return json({ ok: false, error: "Missing API_KEY" }, 500);

    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return json({ ok: false, error: "Expected application/json" }, 400);
    }

    const incoming = await req.json();
    const body = { ...incoming, apiKey: API_KEY };

    const upstream = await fetch(SCRIPT_URL, {
      method: "POST",
      // GAS често работи най-стабилно с text/plain
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();

    // Опитваме да го парснем като JSON. Ако не стане – връщаме structured error.
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json(
        {
          ok: false,
          error: "Upstream returned non-JSON",
          upstreamStatus: upstream.status,
          upstreamBody: text?.slice(0, 2000) || "",
        },
        502
      );
    }

    // Връщаме каквото е върнал GAS, но гарантирано като JSON + no-store
    return new Response(JSON.stringify(parsed), {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return json({ ok: false, error: err?.message || String(err) }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
