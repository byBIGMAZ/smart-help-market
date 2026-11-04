# SMART HELP CENTRE implementation register

## Purpose
The Help Centre is an account-linked guided marketplace assistant. It can guide users to existing marketplace routes, ask follow-up questions, search published listings in PostgreSQL, preserve conversations, enforce monthly message allowances, and escalate requests to the administrator support inbox.

## Frontend files
- `frontend/src/components/help/HelpCentreWidget.tsx`: fixed, draggable, viewport-aware floating launcher, guest preview entry point and glass panel.
- `frontend/src/components/help/HelpCentreWidget.css`: launcher fade, pulse, glass panel and reduced-motion styles.
- `frontend/src/components/help/HelpCentreChat.tsx`: signed-in chat, guest preview, typing state, suggestions, listing cards, conversation history, usage display and support escalation form.
- `frontend/src/components/help/HelpCentreChat.css`: chat layout, message bubbles, result cards, typing animations, responsive layout and theme-aware styles.
- `frontend/src/services/helpCentre.ts`: typed client for Help Centre conversations, usage, chat and support cases.
- `frontend/src/pages/public/HelpCentrePage.tsx`: full Help Centre page with saved conversation history.
- `frontend/src/app/router.tsx`: maps `/help` to the interactive Help Centre.
- `frontend/src/layouts/MarketplaceLayout.tsx`: mounts the floating assistant throughout public and role workspace pages.
- `frontend/src/components/navigation/MobileBottomNav.tsx`: direct mobile Help Centre shortcut.
- `frontend/src/styles/marketplace-layout.css`: six-column mobile navigation layout.
- `frontend/src/AdminHelpCentre.tsx`: administrator support case inbox, thread review, case status and replies.
- `frontend/src/AdminHelpCentre.css`: administrator inbox styling.
- `frontend/src/AdminApp.tsx`: adds the support inbox to administrator navigation and mounts the floating assistant.
- `frontend/src/AdminSettingsManagement.tsx`: administrator controls for assistant availability, included monthly messages, and proposed package size and price.

## Backend files
- `backend/src/setup-help-centre-tables.ts`: creates the four Help Centre tables and inserts default private platform settings without overwriting existing values.
- `backend/src/routes/helpCentre.ts`: authenticated conversation APIs, server-enforced monthly quotas, guided intent routing, published listing search, escalation, administrator inbox and replies.
- `backend/src/server.ts`: mounts the Help Centre API at `/api/help-centre`.
- `backend/package.json`: adds `npm run setup:help-centre`.

## Database tables
- `marketplace_help_conversations`: account-owned conversations and guided search context.
- `marketplace_help_messages`: user, assistant and administrator messages.
- `marketplace_help_usage`: per-user monthly message counts.
- `marketplace_help_support_cases`: requests escalated to administrators.

## Main API routes
- `GET /api/help-centre/public-config`: guest-safe assistant availability preview.
- `GET /api/help-centre/status`: signed-in user's monthly quota.
- `GET /api/help-centre/conversations`: conversation history.
- `GET /api/help-centre/conversations/:conversationId/messages`: owned conversation thread.
- `POST /api/help-centre/chat`: send a message and receive guided answer, route actions or published listing matches.
- `POST /api/help-centre/support-cases`: escalate a conversation to administrators.
- `GET /api/help-centre/admin/cases`: administrator support inbox.
- `GET /api/help-centre/admin/cases/:caseId/messages`: support conversation history.
- `PATCH /api/help-centre/admin/cases/:caseId`: update support case status.
- `POST /api/help-centre/admin/cases/:caseId/reply`: reply to the user.

## Platform settings
- `help.assistant.enabled`: assistant availability.
- `help.messages.free_limit`: included messages per user per calendar month.
- `help.messages.paid_enabled`: reserved and seeded false. Paid usage is not active until payment integration is connected.
- `help.messages.pack_size`: proposed paid message package quantity.
- `help.messages.pack_price_ngn`: proposed package price in NGN.

## Setup and verification
Run from the backend folder:
```bash
npm run setup:help-centre
npm run build
```
Then run the frontend production build from the frontend folder:
```bash
npm run build
```

## Current capability boundary
The current assistant uses a deterministic guided intent engine, contextual follow-up questions, navigation matching and live published-listing database search. It is not yet connected to a generative AI model provider. Paid message package values are configuration only; no payment is collected or simulated.
