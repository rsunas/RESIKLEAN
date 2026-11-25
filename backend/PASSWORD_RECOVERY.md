# Gmail password recovery

Configure these variables in the backend host's secret/environment settings (or the ignored local backend `.env`). Never put them in mobile environment variables or commit real values.

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-resiklean-sender@gmail.com
SMTP_PASS=your-google-app-password
MAIL_FROM="ResiKlean Support <your-resiklean-sender@gmail.com>"
RESET_PASSWORD_URL=resiklean://reset-password
VERIFY_EMAIL_URL=resiklean://verify-email
```

Enable two-step verification on the sender's Google account and create an App Password. Use that App Password, not the ordinary account password. Some managed Google accounts restrict App Passwords; ask the account administrator if unavailable.

The dashboard sign-in page and the mobile app both provide a **Forgot password** path. The dashboard uses the copyable reset code included in the email; the app also accepts the custom-link token.

## Accounts created by an administrator

Every new Collector, Staff, or Admin account created in **Manage Accounts** receives a 24-hour email-verification link and copyable code. It cannot sign in or request a password reset until the email is verified. The dashboard account table shows the status and lets an administrator resend an invitation. The dashboard sign-in page and mobile sign-in screen both include **Verify an admin-created account** for entering the code or requesting a new email.

This requirement applies only to newly provisioned dashboard accounts. Existing accounts and residents using the public registration flow keep their existing access behavior.

Restart/redeploy the backend and distribute a mobile build/update containing the new screens. The existing `resiklean` app scheme is reused. Gmail may not make custom-scheme links clickable, so the email also includes a copyable reset code. Users can select **Forgot password → Already have a reset code?** and paste it. Expo Go does not register this app's native scheme; test deep links with an installed development/release build.

No database migration or account deletion is needed. Recovery adds optional fields to existing user documents. Only a successfully verified reset changes the password. The account's role, Google provider, and other profile data are preserved. A successful reset invalidates existing authenticated sessions for that account, and the user signs in with the new password.

`POST /api/auth/forgot-password` accepts `{ "email": "..." }`. It returns the same confirmation for unknown accounts, cooldowns, and SMTP failures. Missing email configuration returns a generic 503 for every address. Delivery errors are logged without addresses, codes, or credentials. Delivery runs asynchronously in the API process; a process restart during delivery can require a new request.

`POST /api/auth/reset-password` accepts `{ "token": "...", "password": "..." }`. Tokens contain 32 random bytes, are stored only as SHA-256 hashes, expire after 15 minutes, and are consumed atomically with the password update. Bcrypt hashes the new password with the existing cost of 12. Passwords require at least 6 non-padding characters and at most 72 UTF-8 bytes. The newest request replaces the previous token. It also increments the account session version, invalidating earlier JWTs. Email resend cooldown is 60 seconds and is enforced in MongoDB across instances. Each endpoint also allows 10 requests per IP per 15 minutes per server process. For multiple API instances, use a shared edge rate limiter. Configure Express proxy trust only for your actual hosting proxy; do not trust arbitrary forwarded IP headers.

## Verification

Run `npm test -- --runInBand tests/passwordRecovery.test.js tests/localAuthRegression.test.js tests/googleRegistration.test.js tests/authPasswordUpdate.test.js tests/profilePhotoUpdate.test.js` from `backend`.

Before releasing, use a test account to request an actual Gmail message, open the link on an installed app, and try the copy/paste fallback. Confirm the new password works, the old one fails, and the used code fails. Also try an expired code. Automated tests use mocked SMTP and database operations and do not send email or modify real accounts.

## Render Free: use Gmail API over HTTPS

Render Free blocks outbound SMTP on ports 25, 465, and 587. The Gmail SMTP setup above therefore needs a host that permits SMTP. For Render Free, deploy the Gmail API sender and set these variables in the backend service's Environment settings:

```env
MAIL_PROVIDER=gmail-api
GMAIL_SENDER=your-resiklean-sender@gmail.com
GMAIL_CLIENT_ID=your-sender-oauth-client-id
GMAIL_CLIENT_SECRET=your-sender-oauth-client-secret
GMAIL_REFRESH_TOKEN=your-sender-refresh-token
RESET_PASSWORD_URL=resiklean://reset-password
VERIFY_EMAIL_URL=resiklean://verify-email
```

`MAIL_FROM` is optional; if set, use the authorized sender address or its configured Gmail alias. SMTP credentials are not required with `MAIL_PROVIDER=gmail-api`. Password recovery and admin-account verification both use this sender. Resident Google login still uses its existing client IDs and scopes.

### Authorize the sender once

1. In Google Cloud, enable the Gmail API and configure the OAuth consent screen for a separate sender project/client. Keep the existing Google sign-in configuration unchanged.
2. Create a Web application OAuth client with `https://developers.google.com/oauthplayground` as an authorized redirect URI.
3. Open Google's OAuth Playground. In its settings, enable **Use your own OAuth credentials**, enter the sender client ID/secret, and select offline access.
4. Authorize only `https://www.googleapis.com/auth/gmail.send`, signing in as the sender Gmail account. Exchange the authorization code for tokens.
5. Save the refresh token, client ID, client secret, and sender address directly in Render's secret environment settings. Never paste them into chat, source files, logs, or mobile environment variables. Remove the Playground redirect URI after obtaining the token.
6. Save/redeploy the backend. Request a reset for an existing test account and confirm inbox delivery and successful reset. The implementation tests mock delivery; they do not prove live authorization or delivery.

An external OAuth project in Testing can issue refresh tokens that expire after seven days. Configure the appropriate production audience and meet Google's consent/verification requirements before relying on this for live recovery. Revoked/expired sender authorization requires a new refresh token.

References: [Render Free restrictions](https://render.com/docs/free), [Gmail sending API](https://developers.google.com/workspace/gmail/api/guides/sending), [Google OAuth Playground](https://developers.google.com/oauthplayground/), [OAuth token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).