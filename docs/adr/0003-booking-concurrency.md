# ADR-0003: Booking concurrency, holds on approval with a room-type lock, and bed allocation guarded by an exclusion constraint

- Status: Proposed (Phase 0)
- Date: 2026-10-11

## Context
Students request a room type, not a bed. Staff approve and later assign a specific bed. The system must never over-approve a room type or double-allocate a bed, even under concurrent staff actions or application bugs.

## Decision
1. **Submission does not hold inventory.** Requests queue as `submitted`.
2. **Approval creates a room-type-level hold** (`reservations.held`). `approve_booking_request` takes `SELECT … FOR UPDATE` on the `room_types` row, which serialises approvals per room type. It then counts live reservations for the period against sellable beds, and inserts the reservation in the same transaction.
3. **Bed allocation** inserts into `bed_allocations` with
   `EXCLUDE USING gist (bed_id WITH =, stay WITH &&) WHERE (status IN ('assigned','occupied'))`.
   The RPC also locks the bed row for a friendly error, but **the constraint is the guarantee**.
4. Holds expire via an idempotent cron (`FOR UPDATE SKIP LOCKED`), with a grace period for in-flight payments.
5. A fixed lock order prevents deadlocks: request → room_type → bed (ordered by id) → reservation → invoice → payment.

## Alternatives considered
- *Hold at submission:* lets spam and indecision block capacity during admission rushes; rejected.
- *Counter table (`held_count`) updated by triggers:* faster but can drift; counting rows under a lock is cheap at hostel scale (tens to hundreds of rows).
- *SERIALIZABLE isolation everywhere:* works, but needs retry loops on every call; explicit locks are simpler to reason about.
- *Frontend availability checks only:* explicitly forbidden by the brief.

## Consequences
- Requires the `btree_gist` extension, which Supabase provides.
- The stay date range must be set on every allocation (copied from the booking period).
- Concurrency tests (parallel RPC calls) are part of Phase 3 and 4 acceptance.
