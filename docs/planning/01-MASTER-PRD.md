# NEXORA — Master Product Requirements Document

> **App name:** NEXORA
> **Tagline:** *Share Privately. Connect Deeply.*
> **Stage:** Pre-MVP, single backend service, mobile-first.
> **Last updated:** 2026-08-25
> **Source-of-truth for:** user journeys, screen inventory, feature scope, success metrics.
> **Companion docs:** `02-FRONTEND-ARCHITECTURE.md`, `03-BACKEND-ARCHITECTURE.md`, `04-DATABASE-SCHEMA.md`, `05-IMPLEMENTATION-ROADMAP.md`, `00-DESIGN-TOKENS-EXTRACTION.md`.

---

## 1. Product Summary

NEXORA is a privacy-first social app for **small-group, time-boxed discussions** hidden from public timelines. The signature mechanic is the **Hidden Discussion** post: the poster publishes a question and a countdown timer; until the timer ends, *only the poster and the invited group can see the responses*. When the timer hits zero, all responses are revealed to the broader audience in a **Results Reveal**.

The product intent (as expressed through the references):

- The feed is calm and intentional. The home screen shows **5 stories** and **1–2 posts at a time**, not infinite scroll.
- The "lockdown" of responses during a hidden discussion is the differentiator. It's the *why* of the app.
- Group creation is a deliberate, multi-step ritual: pick contacts → invite → accept/pending → set timer → next. There is no "instant group" button.
- Reporting and admin are first-class — a sign the team takes safety seriously enough to design for it on day one.

---

## 2. Personas & Roles

### 2.1 Roles (two only)

NEXORA has **exactly two roles** in MVP. We will not invent intermediate roles mid-build; if a third becomes necessary we will do a deliberate planning pass.

| Role | Description | Scope |
| --- | --- | --- |
| **User** | The end-user of the app. Creates content, views content, creates groups, accepts invites, comments, reacts, posts stories. Both creator and viewer. | All client-side features (screens 1–15, 17). |
| **Admin** | Internal trust & safety operator. Reviews reported content, takes moderation action. | Admin dashboard (screen 16) — web app, separate project. |

**Admin is NOT in MVP for app-facing surfaces.** No admin-facing screens, no admin actions on the mobile client, no admin UI in this repo. The role exists in the database (`users.isAdmin`) so future work has a clean place to land, but is unused in v1.

### 2.2 Personas (User role only)

#### 2.2.1 *Riya* — the poster (primary)

- 24, urban professional, India.
- Wants to ask a thoughtful question to a defined group (e.g. "I'm planning a sabbatical — thoughts?") without it appearing on her public Instagram.
- Cares about *who sees what*, and *when*.
- Pain today: WhatsApp groups are noisy and forever-visible; Twitter polls are public; Instagram close-friends lists leak.

#### 2.2.2 *Kabir* — the responder

- 27, friend-of-friend, joined a group via Riya's invitation.
- Wants to answer honestly, but not before he's sure others won't see it in a permanent public feed.
- Values the hidden-discussion countdown as a "safe space" affordance.

#### 2.2.3 *Sana* — the lurker

- 22, casual user, mostly scrolls home feed.
- Wants to see what other people are talking about after results reveal.
- Will occasionally join a group when a friend's post catches her eye.

#### 2.2.4 *Marcus* — the moderator (Admin role)

- Internal trust & safety operator.
- Reviews reported content, takes action (delete / warn / ban).
- Only role that touches the Admin Dashboard (screen 16).

---

## 3. Core User Journeys

### 3.1 First-time sign-up

```
Splash (1)
   └─ auto-advance 1.2 s
Login (2)
   └─ pick country, enter phone, Send OTP
   └─ (rate-limited: max 5 sends / 15 min)
Verify OTP
   └─ enter 6-digit code
   └─ success → user record created → JWT pair returned
   └─ (new user) → "Welcome — tell us your name" (future v2)
   └─ → Home — Groups (3)
```

### 3.2 Browse home (groups-first)

The home screen is **a list of groups the user is a member of**, with a recent-activity feed below it. **There are no stories.** The home is the launchpad into the discussions that matter to the user.

```
Home (3)
   ├─ Header: "Your groups" + small "+" button to create a new group + post
   ├─ List of groups (sorted by latest activity):
   │    └─ each row: group name, member avatars, last-post preview, time since last post
   ├─ Tap a group → opens the group detail (3a) with that group's posts only
   └─ Tap FAB / "+" → Create Post flow
```

### 3.3 Create a post (group is implicit)

The flow combines "create group" and "create post" — the user picks a reveal time, then picks the people, and the app creates both the group and the post together.

```
Home (3) → tap FAB → Create Post (4)
   └─ Type caption → tap Next
   └─ → Set Result Timer (8) → 30 m / 1 h / 3 h / custom
   └─ → Group Invitation (6) → name the group, multi-pick contacts
   └─ → if a group with these exact members exists: Group Exists dialog (7) → "Reuse group" / "Cancel"
   └─ → Publish: post is created AND added to a group (new or existing); invitees get notified
   └─ → back to Home with the new group visible
```

A post **always** belongs to a group. There is no public posting in MVP. This is the product differentiator — NEXORA is not Instagram, it's a private-discussion platform.

### 3.4 Hidden Discussion lifecycle

```
Post is published → timer starts
   └─ only the group's members + author can see the post AND its responses
   └─ responders submit via Hidden Discussion sheet (9)
   └─ non-members do NOT see the post in their feed
   └─ after timer ends → Responses are revealed (11) to the group only
   └─ no public post-reveal phase — the conversation stays in the group
Countdown Timer (10) shows in-app for everyone with access
Timer hits 0
   └─ responses are unhidden → Results Reveal (11) is the new view for group members
   └─ notifications fan out: "Results are available in <GroupName>"
```

### 3.5 Reporting

```
Any post / comment / user
   └─ long-press → "Report" → Report Content (13)
   └─ pick reason (Spam / Harassment / Violence / False Information)
   └─ submit → backend creates Report record → admin queue
   └─ author not notified directly; admin reviews in dashboard (16)
```

### 3.6 Profile & settings

```
Bottom nav → Profile (15)
   └─ see Posts / Active Groups / Connections stats
   └─ Edit Profile (v2)
   └─ Settings (17): Dark Mode (v2), Push, Group Invites, Results Available, Change Password (v2), 2FA (v2), Logout
```

---

## 4. Screen Inventory (from references)

| # | Screen | Route (proposed) | Notes |
| --- | --- | --- | --- |
| 1 | Splash | `/` (auth) | Logo + tagline + auto-advance. **Always shown** — every cold launch, not just first install. |
| 2 | Login | `/(auth)/login` | Country picker + phone + Send OTP. **No Email tab** — the reference shows it, we don't ship it. Email sign-in is v2. |
| – | Verify OTP | `/(auth)/verify-otp` | Not in references but required by flow |
| 3 | Home — Groups | `/(app)/home` | **Groups-first.** Header + list of groups (sorted by latest activity) + recent activity feed. **No stories.** |
| 3a | Group Detail | `/(app)/group/[id]` | Tapping a group on Home opens this. Shows that group's posts, members, settings. The group's "feed" is a vertical list of posts (active + revealed). |
| 4 | Create Post | `/(app)/create` | Modal sheet. Caption first, then timer, then group. Image/Video/Audio/PDF attachment optional (screen 4 in the references). |
| 6 | Group Invitation | `/(app)/create/invites` | Pick contacts + name the group. The name is REQUIRED. |
| 7 | Group Exists | `/(app)/create/group-exists` | Modal — "A group with these members already exists" → "Reuse group" / "Cancel" |
| 8 | Set Result Timer | `/(app)/create/timer` | 30m / 1h / 3h / custom |
| 9 | Hidden Discussion | `/(app)/post/[id]` | Locked responses sheet — see `06-hidden-discussion-detail.png` for the precise layout (dark gradient, "Other responses are hidden" footer, attachment row, send button). |
| 10 | Countdown Timer | `/(app)/post/[id]/countdown` | Full-screen timer |
| 11 | Results Reveal | `/(app)/post/[id]/results` | After timer ends. Comments + reactions + likes all live here in v1. |
| 12 | Media Viewer | `/(app)/media/[id]` | Full-screen image / video |
| 13 | Report Content | `/(app)/report` | Reason picker |
| 14 | Notifications | `/(app)/notifications` | All / Invites / Updates / Reports tabs |
| 15 | Profile | `/(app)/profile/[userId?]` | Stats + Edit Profile |
| 16 | Admin Dashboard | (web-only) | **Out of mobile repo entirely.** Separate React SPA. Admin role is reserved in DB but unused in MVP. |
| 17 | Settings | `/(app)/settings` | Toggles, logout |

**Removed from v1 (vs. earlier inventory):**
- ~~3a Create Story~~ — no stories in our app
- ~~3b Story Viewer~~ — no stories in our app
- ~~5 Select Contacts~~ — folded into screen 6 (contacts picker lives inside the group invitation step)

---

## 5. Functional Scope

### 5.1 In-scope (MVP)

- **Platform:** Mobile only — iOS and Android via Expo SDK 54. No web client, no PWA.
- **Backend hosting:** AWS. Pricing is out of scope per user; docs assume managed Postgres 16 + managed Redis 7 + S3 for media.
- **Roles:** User and Admin. User is end-user; Admin is reserved in DB but **not** used in v1.
- Phone OTP authentication with international numbers
- JWT-based auth (access + refresh), refresh token in `expo-secure-store`, cold-start bootstrap (closing the app doesn't log you out)
- **Groups-first home:** home is the list of groups the user belongs to, with a recent-activity feed. **No stories.**
- **Create flow = timer + group + invitees:** user types a caption, picks a reveal time, names a group, picks contacts. The post is published to a group (new or existing). The group is implicit — there is no public posting.
- Post creation with image / video / audio / pdf attachments (S3 multipart, 25 MB cap)
- Hidden-discussion countdown mechanism (per-group, per-post)
- Results Reveal after timer ends — **comments, reactions, likes all live here in v1.**
- Notifications (in-app; push is v2)
- Reporting with 4 reasons
- Profile screen with stats
- Settings screen (toggles only; dark mode v2)
- **Admin dashboard: out of mobile repo.** Separate web project for v1.5+ (not blocking the mobile MVP).

### 5.2 Out-of-scope (explicit non-goals for MVP)

- **Stories** (creation or viewing) — not in our app
- Web client for end users
- Admin-facing screens on mobile
- Public posting (everything is group-only)
- Reels / short-form video
- DMs (1:1 chat)
- Hashtags / search ranking algorithm
- Live streaming
- Email sign-in
- Payments / premium tiers
- In-app ads

### 5.3 v2 candidates (parking lot)

- Dark mode
- Push notifications (FCM / APNs)
- Story *creation*
- Email sign-in
- Edit profile (name, avatar, bio)
- Two-factor authentication
- Account deletion flow
- Web client for end users (separate from admin)
- Saved / bookmarked posts

---

## 6. Success Metrics (the targets that decide if MVP ships)

| Metric | Target at 90 days post-launch |
| --- | --- |
| DAU / MAU ratio | ≥ 25 % |
| Median sessions / user / week | ≥ 4 |
| Hidden-discussion completion rate (timer ends with ≥ 1 response) | ≥ 60 % |
| Mean time from "Send OTP" to "Home Feed" first paint | ≤ 4 s on 4G |
| Crash-free sessions | ≥ 99.5 % |
| Report-to-action median time | ≤ 24 h |
| OTP delivery success rate | ≥ 98 % (when Twilio is live; n/a for mock) |

---

## 7. Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Twilio signup friction in India (DLT, templates) | Default to mock provider for dev; document the Twilio switch in env, gate prod switch behind manual review. |
| Hidden-discussion privacy leak (responses visible to wrong people) | Server is the only source of truth — never trust client to filter responses. Every response GET checks `userId ∈ post.allowedGroup`. |
| Race condition: two OTPs requested in quick succession | Per-phone rate limit (3 / 10 min) AND global per-IP limit. |
| Group with zero accepted invites → group never forms | Backend rejects publish if invite acceptance < 1 (with override for solo posts). |
| Expired OTP reuse | OTP key deleted on success; TTL on failure; verify endpoint also rate-limited. |
| Large media uploads slow | Direct-to-S3 (or equivalent) pre-signed URLs; backend only stores the URL, not the bytes. Out of scope for MVP — we use a single multipart endpoint with size cap. |
| Admin abuse of ban action | Ban action writes to an audit log; reversibility window of 7 days. |

---

## 8. The "why this matters" — one paragraph

Most social apps optimise for *more* posting and *more* time-on-screen. NEXORA deliberately throttles that. The hidden-discussion mechanic forces a small, considered group; the timer forces a deadline; the reveal turns the conversation into a public artefact only when it's actually interesting. The product is calm because the experience is calm. The code we write should reflect that: explicit types, explicit boundaries, no clever-but-hidden behaviour. **Quiet codebases ship quiet products.**

---

## 9. Reference images (where each screen lives)

All references stored in `D:/secret-reveal/docs/images/`:

| File | Use |
| --- | --- |
| `01-all-screens-overview.png` | All 17 screens at a glance; the canonical reference |
| `02-home-feed-detail.png` | Home Feed at higher zoom — story ring spacing, post card metrics row, FAB placement |
| `03-create-post-screen.png` | Create Post: option grid, attached media preview, preview row at bottom |
| `04-create-post-duplicate.png` | Same screen, second copy (kept for diff / annotation) |
| `05-create-post-clean.png` | Same screen, clean copy — **use this as the primary reference** for screen 4 |

When implementing a screen, the front-end doc (02) will point back to these files explicitly.