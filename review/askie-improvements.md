# Ways to improve Curio vs. Askie

*Review-log item 5. Grounded in Askie's real App Store review corpus (1★/2★ pulled from
Apple's public customer-reviews RSS, which surfaces negatives the store web page hides).
Sources at the bottom. Prepared 2026-07-18.*

## Who Askie is (the competitor)

**"AI for Kids・Askie"** by ASKIE KIDS AI LIMITED (UK) — a voice-first AI *companion* for ages
4–15, "the safe ChatGPT alternative for kids," powered by Google Gemini. App Store US **4.7★
across 288 ratings**, NAPPA 2026 winner. So it's well-regarded — the negatives are a minority,
but they **cluster tightly and are almost all execution failures, not concept failures.**

Core features: voice chat, AI art/image generation, **camera show-and-tell** (point at a drawing/
Lego/book word → it identifies + discusses — a repeatedly-cited retention driver), bedtime stories +
story journal, **long-term per-child memory**, PIN-protected parent area, full transcripts + weekly
summaries + real-time alerts. Pricing: thin free tier (voice-only, weekly cap) → Premium **$9.99/mo**
→ Max **$29.99/mo**, plus $24.99–$39.99 "boosts."

## The headline: we already beat Askie's top complaints by design

Askie's most damaging reviews are about things Curio's architecture **already avoids**:

| Askie complaint (verbatim) | Curio today |
|---|---|
| "loses my kids' permissions asking **them** to pay" (antr09, 1★) | ✅ Payment/plan is **parent-only**; the kid UI never shows a paywall. Exit is PIN-gated. |
| Paid, then locked out — "**No option to resend**" verification email (Tallybugs, 1★) | ✅ We don't gate on email verification at all — signup is instant. No lockout trap. |
| Mid-chat popup "make a pic **which I DO NOT**" (Confused cupcake, 4★) | ✅ No intrusive mode-switch/upsell interrupts in the session. |
| "not the best if you're **just want to learn**" (Stashman901, 2★) | ✅ Structured **homeschool lesson plans + objectives + progress** — our core lane. |

So the strategy the research points to: **compete on reliability, learning depth, and fair
monetization — and match (don't attack) Askie's safety/transparency bar.** Askie has *zero* safety/
content complaints; its safety execution is solid. Don't wage safety FUD.

## Prioritized improvements

### Quick wins — mostly "keep doing / small adds"
1. **Add an in-app usage/session meter** *(defuses Askie's #1 complaint, "money grab / $30–40 a
   month").* We already run time-boxed focus sessions; surface remaining allowance clearly so
   nothing feels like a hidden cap. *(Not yet built.)*
2. **Keep auth fast and never dead-end a child.** Already true — protect it. If we ever add email
   verification, ship a **Resend** button + code fallback from day one (this exact miss is Askie's
   harshest 1★s).
3. **Low-friction landing done right.** Our new `/` sign-in screen matches the clean "try free / small
   sign-in link" pattern the reviewer called "Askie style" — and ours actually works reliably.
   ✅ Shipped this update (item 4).

### Medium efforts
4. **Meet-or-beat the parent transparency dashboard.** Askie's most-*praised* feature: full transcript
   + artwork review + real-time alerts + weekly summaries. We have transcripts, debriefs, and safety
   events → **parity is close.** Gaps to close: searchable transcripts, and configurable push/email
   **alerts** (we have no email/push yet).
5. **Right-size pricing vs the $9.99 / $29.99 anchors.** ⚠️ **Strategic tension flag:** Askie's single
   biggest complaint is paywall aggression + a thin free tier — and we just moved to **no free tier,
   $7.99 entry** (your call, also COPPA-driven). That's defensible, but the mitigation against the same
   backlash is a **genuinely generous 14-day trial** (already on Plus) and honest, visible limits.
   Worth a deliberate decision, not an accident.

### Larger efforts — differentiation
6. **Lead with structured learning (our wedge).** Askie is a companion; reviewers note it's light on
   actual *learning*. Our homeschool lesson-plan + skills-progression + printable-record path is the
   thing Askie doesn't have. This update elevated it ("🏠 Homeschool plans"). Push it as the core
   positioning, not an "optional" panel.
7. **Own the multimodal retention drivers Askie proved out.** Validated in Askie's *positive* reviews as
   what makes kids return daily — and currently **gaps for us**:
   - **Camera show-and-tell** (point at a drawing / Lego / book word to sound out).
   - **Long-term per-child memory** across sessions (we only carry ~20 recent messages per quest).
   - Optional: bedtime stories + journal, AI art. Weigh against our "anti-screen-time, go-make-it-real"
     ethos — adopt selectively, not wholesale.
8. **Brand on reliability + honesty.** Askie's failures are execution (auth, lockouts, monetization).
   A K-8 tutor that's demonstrably reliable to log into, never paywalls a child, and is upfront about
   limits wins the exact parents Askie frustrates — without out-featuring them.

## Sources
- App Store listing (US): https://apps.apple.com/us/app/ai-for-kids-askie/id6749299565
- Apple customer-reviews RSS (negatives, US p1/p2, UK p1):
  https://itunes.apple.com/us/rss/customerreviews/page=1/id=6749299565/sortBy=mostRecent/json ·
  https://itunes.apple.com/us/rss/customerreviews/page=2/id=6749299565/sortBy=mostRecent/json ·
  https://itunes.apple.com/gb/rss/customerreviews/page=1/id=6749299565/sortBy=mostRecent/json
- Askie site + FAQ (features, onboarding CTA, pricing): https://kidsai.app/ · https://kidsai.app/faq
- Google Play (pricing/desc; reviews not scrapable): https://play.google.com/store/apps/details?id=com.askie.app
- AppAdvice coverage: https://appadvice.com/post/askie-is-an-ai-assistant-built-specifically-for-kids/782671

*Coverage caveat: Google Play reviews were not scrapable and Trustpilot was blocked — Play-specific
sentiment is a blind spot. App Store negatives above are verbatim.*
