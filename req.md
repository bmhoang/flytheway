# GitHub OAuth – Backend API Specification

This document describes the APIs the backend must implement for the MyNote web app to support **Sign in with GitHub**: (1) dynamic registration of OAuth app configs, (2) management and lookup of configs, and (3) a public token proxy that uses the stored config. The frontend is already implemented to use the **proxy** (see `src/githubAuth.ts`); configure `VITE_GITHUB_TOKEN_PROXY_URL` to the proxy URL when building.

---

## Overview

| # | Endpoint | Purpose | Auth |
|---|----------|---------|------|
| 1 | Token proxy | Exchange authorization code for token; backend looks up secret by `client_id` | None (public) |

---
## 4. Token proxy (public, no auth)

Exchanges an authorization code for a GitHub access token. The frontend sends `client_id` in the body; the backend verify `client_id` value with environment `CLIENT_ID`, then use environment `CLIENT_SECRET` and calls GitHub. **No admin or other auth required** so the SPA can complete login.

| Property | Value |
|----------|--------|
| **Method** | `POST` |
| **URL** | `/api/github-token` (frontend config: `VITE_GITHUB_TOKEN_PROXY_URL`) |
| **Auth** | None |
| **Content-Type** | `application/json` |

### Request body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | Yes | Authorization code from GitHub’s redirect (`?code=...`) |
| `code_verifier` | string | Yes | PKCE code verifier from the frontend |
| `redirect_uri` | string | Yes | Redirect URI used in the authorization request |
| `client_id` | string | Yes | GitHub OAuth App client ID; it must be matched with environment `CLIENT_ID` |

### Example request

```json
{
  "code": "abc123...",
  "code_verifier": "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
  "redirect_uri": "https://hiheo.github.io/callback",
  "client_id": "Ov23lixxxxxx"
}
```

### Backend behavior

1. **Checking** the app by `client_id` in the environment `CLIENT_ID`. If not match → **400** or **404** with a generic message (do not leak whether the client_id exists).
2. **Call GitHub:**  
   `POST https://github.com/login/oauth/access_token`  
   Headers: `Content-Type: application/json`, `Accept: application/json`  
   Body:
   ```json
   {
     "client_id": "<client_id from request>",
     "client_secret": "<from env CLIENT_SECRET>",
     "code": "<from request>",
     "redirect_uri": "<from request>",
     "code_verifier": "<from request>"
   }
   ```
4. **Return** GitHub’s response body as-is, with the same success/error status (e.g. 200 or 400), and **CORS headers** (see below).

### Response

- **200 OK** – GitHub returned a token. Body is GitHub’s JSON, e.g.:
  ```json
  {
    "access_token": "gho_xxxx",
    "token_type": "bearer",
    "scope": "repo,read:user,user:email",
    "expires_in": 28800
  }
  ```
- **400 Bad Request** – Validation failed, unknown `client_id`, or GitHub error. Body can be GitHub’s error JSON or your own (e.g. `{ "error": "invalid_client", "error_description": "..." }`). The frontend may show `error_description` to the user.
- **404 Not Found** – Optional for unknown `client_id`; prefer 400 with a generic message to avoid leaking existence of client_ids.

### CORS (required)

The SPA runs on another origin (e.g. `https://hiheo.github.io`). This endpoint **must** send:

- **Access-Control-Allow-Origin:** request’s `Origin` or `*`
- **Access-Control-Allow-Methods:** `POST`, `OPTIONS`
- **Access-Control-Allow-Headers:** `Content-Type`
- Respond to **OPTIONS** preflight with **204** and the same CORS headers.

### Security notes

- **No auth** – By design, so users can complete login. Protect by: (1) only looking up secrets for `client_id`s that exist in your store (from Register), and (2) optional `redirect_uri` validation.
- **Rate limiting** – Recommended (e.g. per IP or per `client_id`) to limit abuse and brute force.
- **Do not** return or log `client_secret` in proxy responses.

---

## Security summary

| Endpoint | Restriction | Recommendation |
|----------|-------------|----------------|
| 1. Proxy | Public | Look up secret by `client_id` only; optional `redirect_uri` check; rate limit. |

No endpoint should return or log `client_secret` to non-admin callers or in proxy responses.

---

## Frontend configuration

- **Proxy URL:** Set `VITE_GITHUB_TOKEN_PROXY_URL=https://<appdomain>/api/github-token` (or your proxy path) when building.
- **Client ID:** Set `VITE_GITHUB_CLIENT_ID` to the GitHub OAuth App client ID.
- **Redirect URI:** Set `VITE_GITHUB_REDIRECT_URI` to match the `redirect_url` stored for that app (e.g. `https://hiheo.github.io/callback`).

The frontend sends `client_id`, `code`, `code_verifier`, and `redirect_uri` in the proxy request; the backend supplies `client_secret` from the store.
