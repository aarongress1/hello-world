# CurioKids Privacy Policy (Children's Privacy Notice)

> **DRAFT v0.1 — NOT YET IN EFFECT.** This is a working draft prepared for
> internal review and must be reviewed by a licensed attorney before use.
> Bracketed `[PLACEHOLDERS]` need real values. Search for `⚖️` to find items
> that specifically need legal review.

**Effective date:** [EFFECTIVE DATE]
**Last updated:** [DATE]

CurioKids ("**CurioKids**," "**we**," "**us**," or "**our**") provides a learning
companion for children in grades K–8. Because CurioKids is directed to children
under 13, we take children's privacy seriously and comply with the U.S.
**Children's Online Privacy Protection Act ("COPPA")**. This Privacy Policy
explains what information we collect, how we use it, when we share it, and the
choices and rights parents have.

**Plain-language summary (this summary is not a substitute for the full policy):**
- A **parent or legal guardian creates and controls the account.** Children do
  not create accounts or log in on their own.
- We collect the **minimum** needed: a child's **first name, grade, and
  interests** (all entered by the parent) and the **conversations** the child
  has with our learning guide.
- We get **verifiable parental consent before** collecting anything from a child.
- To generate responses, a child's messages are sent to an **AI provider** that
  acts as our service provider and **does not use the data to train its models**.
- Parents can **review, download, and delete** their child's information at any
  time.
- We **never sell** children's personal information and **do not show behavioral
  advertising** to children.

---

## 1. Who we are (operator contact information)

The operator collecting and maintaining personal information through CurioKids is:

- **[COMPANY LEGAL NAME]**
- Mailing address: **[STREET, CITY, STATE, ZIP]**
- Email: **[PRIVACY EMAIL, e.g. privacy@curiokids.com]**
- Phone: **[PHONE NUMBER]**

If you have questions about this policy or your child's information, contact us
using the details above. We are the only operator that collects personal
information from children through the Service. ⚖️ *(If any analytics, hosting, or
other vendor is later deemed a co-“operator,” it must be listed here.)*

## 2. Who controls the account

CurioKids accounts are created and controlled by a **parent or legal guardian**
("**parent**"). Each parent account may include one or more **child profiles**.

- Children **do not** register, log in, or enter their own information.
- All information about a child is **entered by the parent** or **generated
  while the child uses the guide** under the parent's account.

## 3. Information we collect

### 3a. From the parent (account holder)
- **Account details:** email address, password (stored only as a secure hash),
  and optional name.
- **Billing information:** processed by our payment processor (**[Stripe]**). We
  receive limited billing metadata (e.g., plan, last four digits, status); **we
  do not store full card numbers.**
- **"Pro / Transparency" (Bring-Your-Own-Key) mode, if the parent enables it:**
  the API key for the parent's own AI provider account, **encrypted at rest**
  (AES-256-GCM) and never shown to the child.

### 3b. From or about the child
- **Profile information (entered by the parent):** the child's **first name**
  (or nickname), **grade level**, and **interests**.
- **Learning conversations:** the messages the child sends to the CurioKids
  guide and the guide's responses.
- **Learning-plan and progress data:** objectives, focus-session activity, and
  completion status.
- **Safety events:** if the child's message or a response is flagged by our
  safety systems, we log the category and a short snippet for the parent's
  review.

We **do not** knowingly collect a child's last name, home address, phone number,
photographs, voice recordings, precise geolocation, or persistent advertising
identifiers. We **do not** require a child to disclose more information than is
reasonably necessary to use the Service.

### 3c. Collected automatically
- **Basic technical/operational data** needed to run the Service securely
  (e.g., session tokens, IP address for security and rate-limiting, error logs).
  We minimize this and do not use it to build advertising profiles. ⚖️ *(Confirm
  final analytics posture; recommended: no third-party analytics SDKs in child
  experiences.)*

## 4. How we use information

We use the information above to:
- Create and secure the parent's account and child profiles.
- Provide the learning experience and generate age-appropriate responses.
- Apply **safety screening** to inputs and outputs and alert the parent to
  flagged events.
- Produce **parent debriefs**, progress tracking, and homeschool records.
- Process **subscription payments** and provide customer support.
- Maintain security, prevent abuse, and comply with law.

We **do not** use children's personal information for behavioral advertising,
and we **do not** sell or rent it.

## 5. How we share information (disclosures to third parties)

We share information only with service providers that process it **on our behalf**
under contract, and only as needed to run the Service:

| Provider | Purpose | Children's data involved |
|---|---|---|
| **AI provider — [Anthropic, PBC (Claude)]** ⚖️ | Generates the guide's responses | The child's messages + minimal profile context are sent to generate replies. Under our agreement, the provider acts as our service provider and **does not use the data to train its models** and retains it only transiently. ⚖️ *(Confirm zero-retention / no-training API terms and execute a DPA.)* |
| **Payment processor — [Stripe]** | Billing & parental-consent verification | Parent billing info only; **no child data.** |
| **Hosting / infrastructure — [PROVIDER]** | Runs the Service | Encrypted data at rest as part of operating the Service. |

**"Pro / Transparency" (BYO-Key) mode:** If a parent chooses to connect their own
AI provider account, the child's messages are transmitted to **that provider,
under the parent's own account and the provider's terms**, at the parent's
direction. In that mode, the parent controls the provider relationship; we
facilitate the connection and continue to apply our safety screening.

We may also disclose information if required by law, to protect someone's safety,
or in connection with a business transfer (with notice as required by law). ⚖️

## 6. Verifiable parental consent

Before we collect personal information from a child, we obtain **verifiable
parental consent**. We use a **credit/debit-card–based method** (an FTC-recognized
method): the parent completes a card verification during signup, which also
establishes the parent's subscription or free trial. We provide **direct notice**
to the parent describing what we collect and why before consent is given (see the
separate *Parental Consent Notice*).

If we cannot obtain consent within a reasonable time, we delete the parent's and
child's information collected for the purpose of seeking consent. ⚖️ *(Confirm the
card-based flow with counsel; some implementations pair the card with a nominal
verifiable transaction.)*

## 7. Parental rights and choices

At any time, a parent may:
- **Review** the personal information we have collected from their child
  (including full conversation transcripts) in the parent dashboard.
- **Download** their child's information.
- **Delete** a child profile or the entire account, which **hard-deletes** the
  child's information (see Retention below).
- **Refuse further collection** by revoking consent — we then stop collecting and
  delete the child's information.

To exercise these rights, use the in-app controls or contact us at **[PRIVACY
EMAIL]**. We will honor verified requests promptly.

## 8. Data retention and deletion

We keep children's personal information only as long as reasonably necessary:
- **Conversation transcripts:** retained on a **rolling 12-month window**;
  older transcripts are automatically purged.
- **Child profile** (first name, grade, interests): retained while the account is
  active.
- **Safety-event logs:** retained for **13 months**, minimized to category and a
  short snippet, for child-safety and legal purposes.
- **Parent-initiated deletion / consent revocation:** child data is
  **hard-deleted within 30 days**, including from backups on the next rotation
  cycle, and we signal the AI provider to delete any transiently stored data.
- **Inactive accounts:** if an account is inactive for **24 months**, we delete
  the associated children's personal information.

## 9. Data security

We protect information with industry-standard measures, including **encryption in
transit (TLS)** and **encryption at rest** for sensitive fields (including any
BYO-key). Passwords are stored only as salted hashes. Access is limited to
personnel who need it. No system is perfectly secure, but we work to protect
your family's information and will notify you and regulators of a breach as
required by law. ⚖️

## 10. No behavioral advertising to children

We do not allow third-party behavioral advertising in children's experiences and
do not use children's personal information to target ads. ⚖️ *(Keep true; avoid
ad SDKs entirely in the child experience.)*

## 11. Changes to this policy

If we make material changes to how we handle children's personal information, we
will provide **new direct notice to parents and obtain new consent** where
required by COPPA, and update the "Last updated" date above.

## 12. Contact us

**[COMPANY LEGAL NAME]** · **[PRIVACY EMAIL]** · **[MAILING ADDRESS]** ·
**[PHONE]**

---

⚖️ **Legal-review checklist (remove before publishing):**
- Confirm operator entity, address, and all co-operators.
- Execute a **Data Processing Agreement** with the AI provider; confirm
  **no-training / zero- or limited-retention** API terms in writing.
- Confirm the **card-based VPC** implementation satisfies the FTC method chosen.
- Confirm state-law overlays (e.g., **CCPA/CPRA** for California, and any state
  "age-appropriate design" statutes) even for a U.S.-only launch.
- Confirm **breach-notification** obligations for your states of operation.
- Decide and document the final **analytics/telemetry** posture for child users.
