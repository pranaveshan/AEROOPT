# LinkedIn launch post — AeroOpt

I built AeroOpt: an aviation operations platform that treats scheduling as a constraint problem instead of a spreadsheet.

**The problem**

An aircraft is not simply "available". It is available only if maintenance allows it, if it carries the right capability set, if the payload fits and if nobody else has it booked. A crew is not simply "on duty" — qualifications, certification expiry, rest and duty limits decide that. And a task cannot be flown until the task it depends on is finished.

Most of that reasoning lives in planners' heads and in spreadsheets, which is exactly where it becomes hard to explain after the fact.

**What AeroOpt does**

It keeps the operational record — aircraft, crew, maintenance, tasks — and validates every assignment on the server against those constraints. When a task cannot be placed, it says which constraint blocked it rather than leaving a gap.

- Constraint-checked scheduling: 24-hour timeline per airframe, assignment with an explanation, versioned committed schedule.
- A decision engine that scores candidate plans against operator-weighted objectives (assigned share, preservation, utilisation, violations) across four task orderings, then stores the proposal with per-task reasoning.
- Human approval in the loop: optimisation writes a proposal; an operations manager commits it. Nothing becomes operational automatically.
- Six roles enforced in the API, not in the UI, with audit events for operational writes and security events for authentication.
- A register that stays connected: maintenance restriction on an aircraft immediately affects what can be scheduled on it.

**The stack**

React 19 + Vite on the front end. Hono on a Cloudflare Worker for the API. Cloudflare D1 (SQLite) with an idempotent, versioned schema. Pure TypeScript domain engines shared by the Worker and the test suite. PBKDF2-SHA256 passwords with hashed session tokens, server-side RBAC, same-origin enforcement on writes.

**What was actually hard**

The interesting part was not the UI. It was making the engine honest: dependency-aware ordering, turnaround gaps, duty limits per UTC day, crew gaps, and a scoring function that can tell you *why* a plan won. Then making the deployed thing match local: Workers cap PBKDF2 at 100,000 iterations, which only surfaced once the database bootstrap ran in production. That is the class of bug you find by deploying and testing the real URL.

**Try it**

Live demo (synthetic data, clearly labelled — not operational): https://site-6b4858e07ae54a00be427ec8cfa46142.freebuff.page
Source: github.com/PranavEshan/AeroOpt
Demo accounts and architecture notes are in the README.

I am not claiming this is certified aviation software. It is a working operations platform built end to end — schema, engine, API, approvals, audit trail and interface — and the parts that are missing (MFA, mail delivery, real feeds) are documented as missing rather than hidden.

#aviation #softwareengineering #react #typescript #cloudflare #optimization #buildinpublic
