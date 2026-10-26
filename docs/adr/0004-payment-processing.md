# ADR-0004: Payment processing, per-tenant merchant accounts, server-side verification, a webhook inbox and reconciliation

- Status: Proposed (Phase 0). **Gateway choice is not approved** (D-6, D-8).
- Date: 2026-10-11

## Context
Mobile Money dominates in Ghana. Payment confirmation must never trust the browser. Hostels need money settled to their own accounts. Gateway approval (KYC) for each hostel is outside our control.

## Provider evaluation (information gathered 2026-10-11; **fees and settlement must be confirmed directly with each provider**)

| Criterion | Paystack | Hubtel |
|---|---|---|
| Ghana channels | MoMo (MTN, Telecel, AT), cards, bank | MoMo, cards, USSD-centric checkout; strong local presence |
| Integration style | Initialize transaction → redirect/popup → **verify API** (`GET /transaction/verify/:reference`) | Online Checkout API with `callbackUrl`, `returnUrl`, `clientReference` (≤ 32 chars) |
| Webhooks | Signed with HMAC-SHA512 of the body using the secret key (`x-paystack-signature`). Docs state webhooks are sent for **successful** transactions, so failures/abandonment need verify/timeout logic. | Callback on completion. Docs say a **Status Check API call is mandatory** if no callback arrives within 5 minutes. Signature mechanism to be confirmed in official docs. |
| Fees (unverified) | Third-party 2026 sources cite ~1.95% for local transactions; figures conflict | Not found in research; ask Hubtel |
| Settlement | Sources conflict (T+1 vs T+2); confirm | Confirm |
| Multi-merchant | Subaccounts/split payments exist (platform-as-merchant model) | Confirm |
| Developer experience | Mature public docs, test mode, SDK ecosystem | Docs available; credentials via Basic auth |

Sources: [Paystack: Verify Payments](https://paystack.com/docs/payments/verify-payments/), [Hookdeck: Paystack webhooks guide](https://hookdeck.com/webhooks/platforms/guide-to-paystack-webhooks-features-and-best-practices), [Hubtel: Checkout API reference](https://dev-docs.hubtel.com/frontend/tools-and-sdks/checkout/api-reference.html), [Hubtel: Checkout callback](https://businessdocs-developers.hubtel.com/reference/checkout-callback), [Hubtel: Redirect checkout](https://businessdocs-developers.hubtel.com/docs/redirect-checkout).

## Decision (proposed)
1. **Merchant model (D-8):** each hostel connects **its own** gateway merchant account. The platform stores that tenant's keys in Supabase Vault and never holds funds. This avoids the platform becoming a payment intermediary, which may need Bank of Ghana licensing (legal check pending). Platform fees are invoiced to hostels separately.
2. **Provider (D-6):** build a small `PaymentProvider` interface (`initialize`, `verify`, `parseWebhook`, `verifySignature`) and implement **Paystack first**. Hubtel can be added behind the same interface if a tenant requires it.
3. **Confirmation only from server verification:**
   1. The webhook's signature is verified over the raw body.
   2. The event is stored in the `private.payment_events` inbox (unique dedupe key).
   3. The **verify API** is called with the tenant's key.
   4. `apply_verified_payment` (idempotent, locked) is called.
4. **Reconciliation:** a 15-minute sweep of pending payments plus a nightly comparison with the provider's transaction list.
5. **Manual payments (Phase 5a)** use the same invoice/payment model with `method = cash|bank_transfer|momo_direct`, so launch does not depend on gateway approval.
6. The webhook URL contains a random per-tenant endpoint id (`/api/webhooks/paystack/{endpointId}`), so the handler knows which tenant's secret to verify with.

## Consequences
- Each hostel must complete gateway KYC; onboarding includes a "connect payments" step.
- Platform revenue collection (subscriptions/fees from hostels) is a separate, out-of-scope business process for v1.
- If the business later prefers platform-collected payments with splits, a new ADR and legal review are required.
