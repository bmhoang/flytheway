const https = require("https");

function setCors(req, res) {
  // For OAuth token exchange, wildcard is typically fine; keep it simple.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function badRequest(res, error_description = "Bad Request") {
  return res.status(400).json({ error: "invalid_request", error_description });
}

function httpsJson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const u = new URL(url);

    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode || 500, text: data }));
      }
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

module.exports = async (req, res) => {
  try {
    setCors(req, res);

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "method_not_allowed" });
    }

    const { code, code_verifier, redirect_uri, client_id } = req.body ?? {};
    if (!code || !code_verifier || !redirect_uri || !client_id) {
      return badRequest(res, "Missing required fields.");
    }

    const envClientId = process.env.CLIENT_ID;
    const envClientSecret = process.env.CLIENT_SECRET;
    if (!envClientId || !envClientSecret) {
      return res.status(500).json({ error: "server_misconfigured" });
    }

    if (client_id !== envClientId) {
      return badRequest(res, "Invalid client.");
    }

    const ghBody = {
      client_id,
      client_secret: envClientSecret,
      code,
      redirect_uri,
      code_verifier,
    };

    let ghStatus;
    let ghText;

    if (typeof fetch === "function") {
      const ghRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(ghBody),
      });
      ghStatus = ghRes.status;
      ghText = await ghRes.text();
    } else {
      const r = await httpsJson("https://github.com/login/oauth/access_token", ghBody);
      ghStatus = r.status;
      ghText = r.text;
    }

    let ghJson = null;
    try {
      ghJson = ghText ? JSON.parse(ghText) : null;
    } catch {
      ghJson = null;
    }

    res.status(ghStatus);
    if (ghJson && typeof ghJson === "object") return res.json(ghJson);
    res.setHeader("Content-Type", "application/json");
    return res.send(ghText || "{}");
  } catch {
    // If anything unexpected happens, return a safe JSON error (avoid runtime reset).
    try {
      setCors(req, res);
    } catch {
      // ignore
    }
    return res.status(500).json({ error: "internal_error" });
  }
};