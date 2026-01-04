export default async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const SCRIPT_URL = process.env.APPS_SCRIPT_URL; // /exec
    const API_KEY = process.env.API_KEY;            // ✅ secret in Netlify

    if (!SCRIPT_URL) {
      return new Response(JSON.stringify({ ok: false, error: "Missing APPS_SCRIPT_URL" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "Missing API_KEY" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const incoming = await req.json();

    const body = {
      ...incoming,
      apiKey: API_KEY
    };

    const upstream = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();

    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
