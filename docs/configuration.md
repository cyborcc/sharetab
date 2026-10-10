# Configuration

Everything is set through environment variables. Copy `.env.example` to `.env` (or fill in the Unraid template) and adjust. Back to the [README](../README.md).

## Required

| Variable          | Description                                                      |
| ----------------- | ---------------------------------------------------------------- |
| `NEXTAUTH_SECRET` | Session encryption key. Generate with `openssl rand -base64 32`. |
| `AUTH_SECRET`     | Auth.js secret. Generate the same way.                           |

## AI Receipt Scanning

| Variable                 | Description                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AI_PROVIDER_PRIORITY`   | Comma-separated provider priority list (for example `openai-codex,meridian,openai`). Splitbon checks providers in order, uses the first available one, and falls through to the next provider if extraction fails. |
| `OPENAI_API_KEY`         | Required when `openai` is included in `AI_PROVIDER_PRIORITY`.                                                                                                                                                      |
| `OPENAI_MODEL`           | OpenAI model for receipt scanning. Defaults to `gpt-4o`.                                                                                                                                                           |
| `OPENAI_CODEX_MODEL`     | Model for ChatGPT OAuth / Codex backend receipt scanning. Defaults to `gpt-5.5`.                                                                                                                                   |
| `ANTHROPIC_API_KEY`      | Required when `claude` is included in `AI_PROVIDER_PRIORITY`.                                                                                                                                                      |
| `ANTHROPIC_MODEL`        | Claude model for receipt scanning (claude and meridian providers). Defaults to `claude-sonnet-5`.                                                                                                                  |
| `ANTHROPIC_HEALTH_MODEL` | Model for health-check probes (auth verification). Defaults to `claude-haiku-4-5-20251001`.                                                                                                                        |
| `MERIDIAN_PORT`          | Port for the embedded Meridian proxy. Defaults to `3457`.                                                                                                                                                          |
| `OLLAMA_BASE_URL`        | Ollama server URL. Defaults to `http://localhost:11434`.                                                                                                                                                           |
| `OLLAMA_MODEL`           | Ollama model name. Defaults to `llava`.                                                                                                                                                                            |

The defaults above are what Splitbon uses when a variable is unset. The Unraid template's `OLLAMA_BASE_URL` is a placeholder (`http://192.168.1.x:11434`) to replace with your Ollama host. With Docker Compose, the values in `docker/.env` win for the variables `docker-compose.yml` passes to the container (a variable exported in your shell wins over `.env`; others in `.env`, such as `DATABASE_URL`, are ignored); the fallbacks in `docker-compose.yml` apply only to variables left unset or empty. `UPLOAD_DIR` is the exception: the Compose file fixes it at `/app/uploads`.

**Using `ollama` in Docker:** `localhost` inside the container is the container itself, so set `OLLAMA_BASE_URL` to the address of the machine running Ollama.

The `openai-codex` provider uses ChatGPT OAuth via the Codex backend instead of an API key. Auth data lives in `/app/chatgpt`, so if that path is on a persistent volume the login survives restarts and image updates.

After the container is running, open the Splitbon admin dashboard and complete the ChatGPT OAuth flow there:

1. Sign in as the admin user and open `/admin`.
2. In the ChatGPT OAuth section, start the login flow.
3. Authorize with ChatGPT in your browser.
4. When the flow redirects to `http://localhost:1455/auth/callback`, copy the full URL from the browser address bar and paste it back into Splitbon.

If you use your own Docker or Unraid template, mount a persistent path to `/app/chatgpt` when `openai-codex` is in `AI_PROVIDER_PRIORITY`.

The `meridian` provider uses a Claude Max/Pro subscription via an embedded proxy -- no API key needed. Claude login data lives in `/app/claude`, so if that path is on a persistent volume the login survives restarts and image updates.

After the container is running, open the Splitbon admin dashboard and complete the Meridian login flow there:

1. Sign in as the admin user and open `/admin`.
2. In the Meridian auth section, start the login flow.
3. Authorize with Claude in your browser.
4. Copy the full callback URL from the browser address bar and paste it back into Splitbon.

The bundled Docker Compose setup persists `/app/claude` automatically. If you use your own Docker or Unraid template, mount a persistent path to `/app/claude`.

## Extra scan models

| Variable                 | Description                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_MODELS`          | Comma-separated models of the default OpenAI-compatible endpoint (`OPENAI_BASE_URL`) offered in the scan dialog; `OPENAI_MODEL` is the default                 |
| `SWISSCOM_MYAI_API_KEY`  | Enables Swisscom myAI as a choice (OpenAI-compatible, vision model required)                                                                                   |
| `SWISSCOM_MYAI_BASE_URL` | Default `https://code.myai.swisscom.ch/v1`                                                                                                                     |
| `SWISSCOM_MODELS`        | Comma-separated Swisscom models, default `qwen3.5-397b-a17b`                                                                                                   |
| `CHATGPT_MODELS`         | Models for the ChatGPT subscription choice (needs `openai-codex` in `AI_PROVIDER_PRIORITY` and the login in the admin dashboard); default `OPENAI_CODEX_MODEL` |

## AI Provider Performance

Benchmarked on a set of receipt photos (grocery, coffee shop, restaurant) in April 2026, before the current model defaults (`gpt-5.5` for Codex, `claude-sonnet-5` for Claude). Results represent typical single-receipt extraction. The Meridian row is from #215, which measured the current default, `claude-sonnet-5`.

| Provider                         | Speed        | Item Accuracy                  | Cost                                | Notes                                                                 |
| -------------------------------- | ------------ | ------------------------------ | ----------------------------------- | --------------------------------------------------------------------- |
| **OpenAI Codex** (ChatGPT OAuth) | ~6 s (April) | 5/5 items                      | Free (uses ChatGPT subscription)    | **Recommended.** Best balance of speed and accuracy.                  |
| **Meridian** (Claude OAuth)      | 7–10 s       | Every total right (3 receipts) | Free (uses Claude Max subscription) | With `claude-sonnet-5`; the April run with an older model took ~16 s. |
| **OpenAI** (API key)             | ~4 s         | 5/5 items                      | Pay-per-token                       | Fastest, but requires an API key and costs money.                     |
| **Ollama** (local LLM)           | Varies       | Varies                         | Free, fully local                   | Depends on model and hardware. Requires a running Ollama server.      |

**Recommendation:** Use `openai-codex` as your primary provider. It delivers the same accuracy as API-key providers at no additional cost (it piggybacks on your existing ChatGPT Plus/Pro subscription). Set your priority to:

```
AI_PROVIDER_PRIORITY="openai-codex"
```

If you also have a Claude Max subscription, you can add `meridian` as a fallback:

```
AI_PROVIDER_PRIORITY="openai-codex,meridian"
```

## OAuth (optional)

| Variable               | Description                  |
| ---------------------- | ---------------------------- |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID.      |
| `GOOGLE_CLIENT_SECRET` | Corresponding client secret. |

Setting both registers Google as a sign-in provider, but the login page has no Google button yet, so people can't choose it there. The provider still accepts sign-ins sent to it directly, so it can still create accounts (see [Security notes](#oidc-security-notes)).

## OIDC / Single Sign-On (optional)

Sign in through your own identity provider (IdP): Authentik, Authelia, Keycloak, Pocket ID, or another OpenID Connect provider that supports confidential clients (client ID + secret) and a UserInfo endpoint. OIDC is enabled when the issuer, client ID, and client secret are all set; the login page then shows a **Sign in with &lt;name&gt;** button.

| Variable                   | Default               | Description                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OIDC_ISSUER`              | —                     | Issuer URL. Must match the `issuer` field of `<issuer>/.well-known/openid-configuration`, including any trailing slash on a path (Authentik: `https://auth.example.com/application/o/<slug>/`).                                                                                                                                                                    |
| `OIDC_CLIENT_ID`           | —                     | Client ID of the application you created at the IdP.                                                                                                                                                                                                                                                                                                               |
| `OIDC_CLIENT_SECRET`       | —                     | Client secret (confidential client).                                                                                                                                                                                                                                                                                                                               |
| `OIDC_DISPLAY_NAME`        | `SSO`                 | Button label: "Sign in with &lt;name&gt;".                                                                                                                                                                                                                                                                                                                         |
| `OIDC_AUTO_REGISTER`       | `true`                | Create a Splitbon account the first time a new IdP user signs in. When `false`, SSO only works for IdP identities already linked to a Splitbon account (or, with `OIDC_ALLOW_EMAIL_LINKING=true`, matching an existing account's email).                                                                                                                           |
| `OIDC_ALLOW_EMAIL_LINKING` | `false`               | Link a first-time IdP sign-in to an existing Splitbon account with the same email (case-insensitive), unless that account is already linked to an IdP identity. Refused while anyone can sign up with a password (password login on and Registration Mode set to _Open_), and when the IdP marks the email unverified. See [Security notes](#oidc-security-notes). |
| `OIDC_TOKEN_AUTH_METHOD`   | `client_secret_basic` | How the client secret is sent to the token endpoint: `client_secret_basic` or `client_secret_post`. Must match the client's setting at the IdP.                                                                                                                                                                                                                    |
| `DISABLE_PASSWORD_LOGIN`   | `false`               | Hide the email/password form and close registration. Ignored (with a warning in the log) unless OIDC or magic link sign-in is configured. With SSO only, link existing accounts first (see _Moving existing users to SSO_) or their owners, the admin included, can't sign in.                                                                                     |

`OIDC_AUTO_REGISTER` is independent of the admin **Registration** setting, which only governs the email/password sign-up form: with SSO, your IdP decides who may sign in. If your IdP allows public self-enrollment, set `OIDC_AUTO_REGISTER=false` or restrict the application at the IdP.

**Setup**

1. At your IdP, create an OpenID Connect application (Authentik: _OAuth2/OpenID Provider_, client type _Confidential_) with the scopes `openid`, `email`, and `profile`.
2. Set its redirect URI to `<NEXTAUTH_URL>/api/auth/callback/oidc`, e.g. `https://splitbon.example.com/api/auth/callback/oidc`.
3. Set `NEXTAUTH_URL` to the URL people use to reach Splitbon (it defaults to `http://localhost:3000`), then `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET`, and restart Splitbon. Behind a reverse proxy, also set `AUTH_TRUST_HOST=true`.

**Moving existing users to SSO**

1. Make sure each person's email at the IdP matches their Splitbon email (case doesn't matter) and that the IdP doesn't mark it unverified: Splitbon won't link an account when the IdP sends `email_verified: false`. Authentik's default email scope mapping always sends `false`; if you trust the addresses stored in Authentik, give the provider a custom email scope mapping that returns `"email_verified": True` instead.
2. In the admin dashboard, set Registration Mode to _Closed_ (linking is refused while anyone can sign up with a password; _Invite Only_ is accepted too, but anyone holding an unused invite code could still register someone else's address, so revoke unused invites first). Then check that each Splitbon account whose email matches an IdP user really belongs to that person: linking hands the account to the IdP user, and its existing password keeps working.
3. Set `OIDC_ALLOW_EMAIL_LINKING=true` and have everyone sign in once with the SSO button; this links their IdP identity to their existing account.
4. Turn `OIDC_ALLOW_EMAIL_LINKING` back off, and optionally set `DISABLE_PASSWORD_LOGIN=true`.

**Troubleshooting:** "Sign-in failed" after clicking the SSO button or returning from the IdP usually means an issuer mismatch (check the trailing slash), `invalid_client` (switch `OIDC_TOKEN_AUTH_METHOD`), or an IdP client that doesn't allow the authorization code grant (the log shows `OAuthCallbackError`, and Authentik logs `Invalid grant_type for provider`; enable the _authorization_code_ grant type on the provider). Landing back on the login page with no message means Splitbon couldn't map the IdP's profile (the log shows `OAuthProfileParseError`). In both cases the container log shows the exact Auth.js error.

"An account with this email already exists…" means a Splitbon account has that email but the IdP identity isn't linked to it. The `reason` in the `auth.oidc_denied` log line says why:

- `linking_disabled`: `OIDC_ALLOW_EMAIL_LINKING` is off; link as in _Moving existing users to SSO_.
- `email_unverified`: the IdP sent `email_verified: false` for this user; see step 1 above.
- `password_registration_open`: linking is on but Registration Mode is _Open_; close it (step 2 above).
- `already_linked`: the account is linked to a different IdP identity. If the IdP user was recreated, confirm at the IdP that the old identity (the row's `providerAccountId`) no longer exists before deleting that account's `provider = 'oidc'` row in the `Account` table, then link again.
- `ambiguous_email`: several Splitbon accounts share the email in different letter cases; delete the extra account (see [Accounts whose emails differ only in letter case](upgrading.md#email-case-uniqueness)).
- `placeholder`: the email belongs to a placeholder or deleted user, which can't be signed in to.

<a id="oidc-security-notes"></a>**Security notes**

- Only enable `OIDC_ALLOW_EMAIL_LINKING` if your IdP doesn't let users set arbitrary, unverified email addresses (for example by editing their own email in the IdP's profile page); otherwise someone could claim another person's email at the IdP and take over their Splitbon account. Splitbon refuses to link when the IdP marks the email unverified, but many IdPs don't send `email_verified` at all, so that check alone doesn't make linking safe. Keep it on only while migrating.
- Admin rights still come from `ADMIN_EMAIL`, so whoever the IdP lets sign in with that address is the admin. On a new instance, sign in as the admin before anyone else can: once the admin account exists and is linked, another IdP identity with that address is refused. SSO accounts are created with a lowercase email; keep `ADMIN_EMAIL` lowercase.
- If someone is already signed in, starting an SSO sign-in for a different or not-yet-linked identity is refused; they must sign out first. This stops an IdP account from being attached to whoever last used a shared device.
- Accounts are linked to the IdP's user ID (`sub`). If you switch to a different IdP, delete the old links first (rows with `provider = 'oidc'` in the `Account` table), or a new IdP user whose ID happens to match an old one would sign in to that old account; then link everyone again as in _Moving existing users to SSO_.
- Signing out of Splitbon doesn't sign you out of the IdP.
- Magic link sign-in (when `EMAIL_SERVER_HOST` is set) creates an account for any email address, regardless of `OIDC_AUTO_REGISTER` or the Registration setting.
- Google sign-in (when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set) likewise creates an account for any Google user who reaches it, regardless of the Registration setting, even though the login page has no Google button.

## Magic Link Auth (optional)

| Variable                | Description                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `EMAIL_SERVER_HOST`     | SMTP host (e.g. `smtp.gmail.com`). Used for magic link sign-in and OAuth auth expiry alerts (Meridian / ChatGPT OAuth). |
| `EMAIL_SERVER_PORT`     | SMTP port. Use `465` for implicit TLS, `587` for STARTTLS.                                                              |
| `EMAIL_SERVER_USER`     | SMTP username / email address.                                                                                          |
| `EMAIL_SERVER_PASSWORD` | SMTP password or app password.                                                                                          |
| `EMAIL_FROM`            | From address for sent emails.                                                                                           |

## Admin

| Variable      | Description                                                                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_EMAIL` | Email of the admin user. Grants access to `/admin` dashboard for managing users, groups, storage, and system settings, and receives OAuth auth expiry alerts when email is configured. |

## Other

| Variable                | Default                 | Description                                                                                                                                                                          |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXTAUTH_URL`          | `http://localhost:3000` | Public URL of your instance. Split and personal links are copied from the browser's address bar, not built from this setting, so open Splitbon at its public URL before sharing one. |
| `AUTH_TRUST_HOST`       | `false`                 | Set to `true` when running on a local network or behind a reverse proxy.                                                                                                             |
| `DB_USER`               | `sharetab`              | PostgreSQL username (Docker bundled DB).                                                                                                                                             |
| `DB_PASSWORD`           | `sharetab`              | PostgreSQL password (Docker bundled DB).                                                                                                                                             |
| `DB_NAME`               | `sharetab`              | PostgreSQL database name (Docker bundled DB).                                                                                                                                        |
| `UPLOAD_DIR`            | `./uploads`             | Directory for receipt image uploads. The Docker image uses `/app/uploads`, and the Compose file fixes it there.                                                                      |
| `MAX_UPLOAD_SIZE_MB`    | `10`                    | Maximum upload file size.                                                                                                                                                            |
| `DISABLE_GUEST_UPLOADS` | `false`                 | Lock guest receipt uploads and AI scans off; overrides the admin toggle.                                                                                                             |
| `LOG_LEVEL`             | `info`                  | Logging verbosity: `debug`, `info`, `warn`, or `error`.                                                                                                                              |

## Rate Limiting

| Variable                    | Default | Description                                                                                            |
| --------------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `AUTH_RATE_LIMIT_MAX`       | `5`     | Max login attempts per email address per 15 minutes.                                                   |
| `AUTH_IP_RATE_LIMIT_MAX`    | `30`    | Max login attempts per client IP per 15 minutes.                                                       |
| `REGISTER_RATE_LIMIT_MAX`   | `10`    | Max registration attempts per client IP per hour.                                                      |
| `GUEST_RATE_LIMIT_MAX`      | `10`    | Per client IP per hour, applied separately to guest receipt uploads, guest splits, and claim sessions. |
| `GUEST_UPLOAD_GLOBAL_LIMIT` | `100`   | Max guest receipt uploads per hour across all guests combined.                                         |
| `GUEST_AI_GLOBAL_LIMIT`     | `100`   | Max guest AI receipt scans per hour across all guests combined.                                        |

The client IP comes from the `cf-connecting-ip`, `x-real-ip`, or `x-forwarded-for` header, in that order. When a request has none of them, Next.js fills in `x-forwarded-for` with the address of whatever connected to Splitbon. So for per-IP limits to work in production:

- Reach Splitbon only through a reverse proxy; don't expose its port directly.
- Have the proxy set the client's address itself, overwriting or removing all three headers; never pass client-supplied values through.
- Two common mistakes leave the IP under the client's control: setting only `x-forwarded-for` (a client-sent `x-real-ip` wins over it), and appending to `x-forwarded-for` as nginx's `$proxy_add_x_forwarded_for` does (Splitbon reads the first entry, which the client wrote). Setting `x-real-ip` from the connection and removing any client-sent `cf-connecting-ip` avoids both.
- Trust `cf-connecting-ip` only if Splitbon can be reached through Cloudflare alone.

A proxy that forwards no client address makes every user share the proxy's IP, so the per-IP limits apply to everyone combined: 30 sign-in attempts (successful or not) in 15 minutes block password login for everyone, and registrations and guest uploads are capped the same way. The per-email and global limits apply either way.

Guest receipts and claim sessions also have fixed limits that no variable changes. Per share link, per minute: 200 joins (10 per person); 300 each of item-claim saves, item splits, name edits, and person removals (30 of each per person); 3000 reads; and 120 rejoin lookups. Per guest receipt, per hour: 3 AI scans and 10 item lookups; per client IP, 20 guest AI scans per hour. A split's creator can change its Venmo handle 10 times per minute. Counters are kept in memory and reset when Splitbon restarts.
