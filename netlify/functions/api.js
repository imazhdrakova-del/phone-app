export default async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const SCRIPT_URL = process.env.APPS_SCRIPT_URL; // /exec
    const API_KEY = process.env.API_KEY;            // secret in Netlify

    if (!SCRIPT_URL) {
      return json({ ok: false, error: "Missing APPS_SCRIPT_URL" }, 500);
    }
    if (!API_KEY) {
      return json({ ok: false, error: "Missing API_KEY" }, 500);
    }

    // Пази се от не-JSON заявки
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return json({ ok: false, error: "Expected application/json" }, 400);
    }

    const incoming = await req.json();

    // Минимална валидация на shape-а
    if (!incoming || typeof incoming !== "object") {
      return json({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const body = { ...incoming, apiKey: API_KEY };

    // Optional: timeout (напр. 25s)
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 25_000);

    let upstream;
    try {
      upstream = await fetch(SCRIPT_URL, {
        method: "POST",
        // Apps Script често очаква text/plain; оставяме го така
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
    } finally {
      clearTimeout(t);
    }

    const text = await upstream.text();

    // Ако Apps Script върне не-JSON, не го “маскираме” като JSON.
    // Клиентът ти вече проверява content-type.
    const upstreamCT = upstream.headers.get("content-type") || "";
    const isJson = upstreamCT.includes("application/json");

    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type": isJson ? "application/json" : "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg =
      err?.name === "AbortError"
        ? "Upstream timeout"
        : (err?.message || String(err));

    return js
