# CurioKids Data Map & Retention Register

> **DRAFT v0.1 — internal operational document.** Maps what CurioKids collects,
> why, where it lives, who it's shared with, and how long it's kept. Pairs with
> the Privacy Policy; hand this to counsel/DPO and use it to drive Data
> Processing Agreements. `⚖️` marks items needing legal review.
> Reflects locked decisions: U.S./COPPA, **bundled model default + BYO "Pro"
> option**, card-based verifiable parental consent, and the agreed retention
> policy.

**Last updated:** [DATE] · **Owner:** [DATA OWNER] · **Regime:** U.S. COPPA

---

## 1. Roles

| Role | Who |
|---|---|
| **Operator / Controller** | [COMPANY LEGAL NAME] (CurioKids) |
| **Account holder** | The parent/guardian (creates and controls everything) |
| **Data subject (child)** | The K–8 child; provides no info directly — the parent enters profile data, and conversation content is generated during supervised use |
| **Processors / sub-processors** | AI provider, text-to-speech provider, payment processor, hosting — see §4 |

Children never register, log in, or enter personal information themselves.

---

## 2. Data inventory

Legend — **Enc?**: encrypted at rest beyond disk encryption. **Child?**: is this a child's personal information under COPPA.

### 2a. Parent / account data
| Element | Source | Purpose | Enc? | Retention |
|---|---|---|---|---|
| Email | Parent | Login, account recovery, required notices | No (plaintext) ⚖️ | While active |
| Password | Parent | Auth | Yes — scrypt salted hash (never stored plain) | While active |
| Name (optional) | Parent | Personalization | No | While active |
| Plan / subscription status | System / Stripe | Billing, entitlements | No | While active |
| Session tokens | System | Keep parent logged in | HMAC-signed cookie; token row in DB | 30 days / logout |
| Billing details (card) | Parent → Stripe | Payment + **verifiable parental consent** | Held by Stripe; we store only metadata (last4, status) | Per Stripe |
| **BYO provider API key** (Pro mode only) | Parent | Route the family's AI through their own account | **Yes — AES-256-GCM** | Until removed / account deleted |

### 2b. Child data (COPPA-covered)
| Element | Source | Purpose | Child? | Retention |
|---|---|---|---|---|
| First name / nickname | Parent-entered | Personalize the guide | ✅ | While active |
| Grade | Parent-entered | Age-appropriate tuning + model routing | ✅ | While active |
| Interests | Parent-entered | Tailor topics | ✅ | While active |
| Per-child settings (oversight mode, session length, model tier, homeschool, blocked/priority topics) | Parent | Controls & personalization | ✅ (linked) | While active |
| **Conversation transcripts** (child + guide messages, topic tag, flag) | Generated in use | The learning experience; parent review; debriefs | ✅ | **Rolling 12 months**, then auto-purged |
| Quests / objectives / learning plans / focus sessions | Generated / parent import | Track projects & progress | ✅ | While active |
| Safety events (category + short snippet) | Safety system | Alert & protect the child; parent review | ✅ | **13 months** |
| Parent debriefs (AI-written summaries) | Generated | Give parents a plain-English summary | ✅ (derived) | While active |

### 2c. Collected automatically
| Element | Purpose | Notes |
|---|---|---|
| IP address | Security, rate-limiting | Minimized; not used for ad profiling ⚖️ |
| Basic error/operational logs | Reliability | Avoid logging message content / PII ⚖️ |

> **Data minimization posture:** no child last name, address, phone, email, photos, precise geolocation, or advertising identifiers are collected.

---

## 3. Data flows

### 3a. Chat (the core loop)
```
Child message
  → server SAFETY SCREEN (in): built-in categories + parent's custom blocks
      (hard-blocked content never leaves our server; logged as a safety event)
  → AI PROVIDER for a reply:
       • Bundled (default): [Anthropic Claude] — routed by grade
         (K–2 → Haiku, 3–8 → Sonnet) under our DPA, no training on data
       • Pro/BYO: the parent's OWN provider account, at their direction
  → server SAFETY SCREEN (out) on the reply
  → store transcript (12-mo window) + any safety events (13-mo)
```
⚖️ Execute a **DPA with the bundled AI vendor**; confirm in writing **no model
training on data** and limited/transient retention.

### 3b. Provider-side moderation (OpenAI only)
If the active provider is OpenAI, the child's input text is also sent to
OpenAI's moderation endpoint as an extra screen. (Not used when the provider is
Anthropic.)

### 3c. Voice
- **Curio speaking (TTS):** the guide's **reply text** is sent to **[OpenAI TTS]**
  to synthesize audio. The child's input is **not** sent for TTS. Falls back to
  the on-device browser voice when no TTS key is configured.
- **Child talking (STT):** ‼️ **Flag for review.** Speech-to-text uses the
  **browser's built-in speech recognition**. In Chrome this sends the child's
  **spoken audio to Google's speech service**. This is a third-party flow we do
  not control and must disclose (and ideally gate or replace with a
  vendor-contracted STT for a kids product). ⚖️

### 3d. Payments & consent
Card details go **directly to [Stripe]**; the card step also establishes
verifiable parental consent. **No child data** flows to Stripe.

### 3e. Hosting
All of the above persists in the application database on **[HOSTING PROVIDER]**
(disk-encrypted; app-level encryption for keys). Pilot uses local SQLite;
production → managed Postgres.

---

## 4. Processors / sub-processors register

| Processor | Data received | Purpose | Contract needed |
|---|---|---|---|
| **[Anthropic — Claude]** (bundled default) ⚖️ | Child messages + minimal profile context | Generate replies | **DPA + no-training/limited-retention terms** |
| **[OpenAI]** — moderation &/or TTS ⚖️ | Input text (moderation); reply text (TTS) | Safety screen; natural voice | DPA |
| **Browser speech service (e.g., Google via Chrome)** ‼️⚖️ | Child audio (when mic used) | Speech-to-text | Not contracted — disclose &/or replace |
| **Parent's own AI provider** (Pro/BYO) | Child messages | Replies, at parent's direction | Governed by parent's own terms |
| **[Stripe]** | Parent billing only | Payments + consent | DPA |
| **[HOSTING PROVIDER]** | All data at rest | Run the service | DPA |

---

## 5. Retention & deletion register

| Data | Retention | Deletion trigger |
|---|---|---|
| Transcripts | Rolling **12 months** | Auto-purge older; hard-delete on request |
| Child profile & settings | While account active | Parent deletes child / account |
| Safety events | **13 months** | Auto-purge; hard-delete with account |
| Learning plans / progress | While active | Parent deletes |
| Parent account & email | While active | Account deletion |
| Sessions/tokens | 30 days / logout | Expiry or logout |
| BYO key | Until removed | Parent disconnect / account deletion |
| Inactive accounts | Auto-delete child data after **24 months** inactivity | Inactivity job |
| **Parent-initiated delete / consent revocation** | **Hard-delete ≤ 30 days**, incl. next backup rotation; signal AI vendor to purge | In-app control or email request |

---

## 6. Parental rights (how each is served)
- **Review:** full transcripts + all profile data in the parent dashboard.
- **Export:** download the child's data. ⚖️ *(build the export endpoint)*
- **Delete:** in-app "delete child" / "delete account" → hard-delete per §5.
- **Revoke consent:** same as delete; collection stops.
- **Proof of consent:** record who consented, when, and by what method (card). ⚖️

---

## 7. Security measures
- TLS in transit; disk encryption at rest; **AES-256-GCM** for BYO keys;
  **scrypt** password hashes; HMAC-signed session cookies.
- Least-privilege access; no secrets in logs.
- Breach notification per applicable state law. ⚖️

---

## 8. Open items (⚖️ before launch)
1. **DPAs**: Anthropic (bundled), OpenAI (moderation/TTS), Stripe, hosting — with **no-training** confirmations in writing.
2. **Voice/STT**: decide — disclose the browser→Google audio flow, gate it, or replace with a contracted kids-safe STT. Highest-priority privacy item.
3. **Data-export & proof-of-consent** features to build.
4. **State overlays** (e.g., California CCPA/CPRA) even for a U.S. launch; breach-notification obligations.
5. **Analytics/telemetry** posture for child users (recommended: none in the child experience).
6. Confirm **email/IP** handling and log-redaction meet minimization goals.
