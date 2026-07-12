# CurioKids — Legal & Compliance (Pillar 1)

Working drafts of the legal foundation for CurioKids. **All drafts are v0.1 and
require review by a licensed attorney before use.** These are designed to get you
~90% of the way and make the lawyer's job (and bill) smaller.

## Decisions locked so far
| # | Decision | Choice |
|---|---|---|
| Market | Launch region | **U.S. only** → design to **COPPA** (add EU/UK later as an add-on) |
| Model | How the model is provided | **Hybrid** — bundled model is the default; **BYO-key** offered as an optional "Pro / Transparency" mode |
| AI vendor | Primary processor (bundled mode) | **Anthropic (Claude)** — finalize DPA in backend pillar |
| D2 | Verifiable parental consent | **Credit/debit-card–based VPC**, delivered as a **card-required free trial** |
| D3 | Data retention & deletion | Transcripts **12-mo rolling**; profile while active; safety logs **13 mo**; parent delete **hard-delete ≤30 days**; inactive accounts **24 mo** |

## Documents
| File | Status | Purpose |
|---|---|---|
| `PRIVACY_POLICY.md` | Draft v0.1 | COPPA children's privacy notice |
| `PARENTAL_CONSENT_NOTICE.md` | Draft v0.1 | Direct notice shown before the consent step |
| `TERMS_OF_SERVICE.md` | Draft v0.1 | Parent-facing terms / EULA |
| `DATA_MAP.md` | Draft v0.1 | Data inventory, flows, sub-processors, retention register |

## Placeholders to fill (business facts)
Provide these and I'll drop them into every document:
- `[COMPANY LEGAL NAME]` and entity type (LLC, C-corp, etc.)
- `[STATE]` of formation / principal place of business
- `[MAILING ADDRESS]`, `[PHONE NUMBER]`
- `[PRIVACY EMAIL]` (e.g. privacy@curiokids.com) and `[SUPPORT EMAIL]`
- Final `[AI VENDOR]` (default: Anthropic/Claude) and `[PAYMENT PROCESSOR]` (default: Stripe)
- `[HOSTING PROVIDER]`
- Product domain (for `[PRIVACY POLICY URL]`)

## `⚖️` = needs a lawyer's eyes
Search the docs for `⚖️`. The big ones:
1. **DPA + no-training / limited-retention API terms** with the AI vendor (in writing).
2. Confirm the **card-based VPC** implementation satisfies the FTC method.
3. **State overlays** even for a U.S. launch (e.g., California CCPA/CPRA, state
   age-appropriate-design laws) and **breach-notification** rules.
4. Final **analytics/telemetry** posture for child users (recommend: none in the
   child experience).

## Remaining in Pillar 1
1. **Terms of Service / EULA** (next)
2. **Data map & retention policy** (internal operational doc)
3. **App changes** — build the consent flow + "download/delete my child's data"
   controls (implementation happens in the Product/Backend pillars)
