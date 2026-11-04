# SMART HELP CENTRE implementation register

## Purpose
The Help Centre is an account-linked guided marketplace assistant. It can guide users to existing marketplace routes, ask follow-up questions, search published listings in PostgreSQL, preserve conversations, enforce monthly message allowances, and escalate requests to the administrator support inbox.

## Frontend files
- `frontend/src/components/help/HelpCentreWidget.tsx`: fixed, non-draggable viewport launcher, guest preview entry point and glass panel.
- `frontend/src/components/help/HelpCentreWidget.css`: launcher fade, pulse, glass panel and reduced-motion styles.
- `frontend/src/components/help/HelpCentreChat.tsx`: signed-in chat, rotating animated guest scenarios, local-time greetings, response feedback and intent-correction controls, suggestions, listing cards, conversation history, usage display and support escalation form.
- `frontend/src/components/help/HelpCentreChat.css`: chat layout, message bubbles, result cards, typing animations, responsive layout and theme-aware styles.
- `frontend/src/services/helpCentre.ts`: typed client for Help Centre conversations, usage, chat and support cases.
- `frontend/src/pages/public/HelpCentrePage.tsx`: full Help Centre page with saved conversation history.
- `frontend/src/app/router.tsx`: maps `/help` to the interactive Help Centre.
- `frontend/src/layouts/MarketplaceLayout.tsx`: mounts the floating assistant throughout public and role workspace pages.
- `frontend/src/components/navigation/MobileBottomNav.tsx`: direct mobile Help Centre shortcut.
- `frontend/src/styles/marketplace-layout.css`: six-column mobile navigation layout.
- `frontend/src/AdminHelpCentre.tsx`: administrator support case inbox, thread review, case status and replies, plus BIGMAZ Intelligence performance summary.
- `frontend/src/AdminHelpCentre.css`: administrator inbox styling.
- `frontend/src/AdminApp.tsx`: adds the support inbox to administrator navigation and mounts the floating assistant.
- `frontend/src/AdminSettingsManagement.tsx`: administrator controls for assistant availability, included monthly messages, and proposed package size and price.

## Backend files
- `backend/src/setup-help-centre-tables.ts`: creates Help Centre and BIGMAZ Intelligence learning tables and inserts default private platform settings without overwriting existing values.
- `backend/src/setup-geographic-intelligence.ts`: safely adds nullable listing coordinates, geocoding status metadata, a server-side geocode cache, geographic indexes and centrally managed private geographic settings. Uses one PostgreSQL client for the entire setup transaction.
- `backend/src/geography/geocoding.ts`: server-side Nominatim adapter with persistent cache lookup, strict query validation, a serialized 1.1-second provider request interval, country restriction, result validation and OpenStreetMap attribution.
- `backend/src/routes/geography.ts`: explicit, non-autocomplete public geocoding endpoint with a per-IP request window and generic provider error handling.
- `backend/package.json`: provides `npm run setup:geography` for the geographic schema setup.
- `backend/src/intelligence/bigmazEngine.ts`: proprietary intent classifier, phrase and n-gram similarity, cue scoring, privacy-preserving feature hashing and bounded adaptive intent weights. It has no external AI API dependency.
- `backend/src/intelligence/geocoding.ts`: server-side Nominatim lookup with backend-only User-Agent configuration, Nigerian country restriction, provider request pacing, timeout, input validation, coordinate validation and PostgreSQL cache.
- `backend/src/routes/helpCentre.ts`: authenticated conversation APIs, server-enforced monthly quotas, BIGMAZ intent reasoning, published listing search, privacy-preserving learning signals, explicit intent-correction feedback, escalation, administrator inbox and intelligence metrics.
- `backend/src/server.ts`: mounts the Help Centre API at `/api/help-centre` and geographic lookup at `/api/geography`.
- `backend/package.json`: adds `npm run setup:help-centre`.

## Database tables
- `marketplace_help_conversations`: account-owned conversations and guided search context.
- `marketplace_help_messages`: user, assistant and administrator messages.
- `marketplace_help_usage`: per-user monthly message counts.
- `marketplace_help_support_cases`: requests escalated to administrators.
- `marketplace_ai_learning_events`: records intent, confidence, model version, hashed language features and response outcome without storing the original message text.
- `marketplace_ai_feedback`: stores user ratings and optional corrected intent labels.
- `marketplace_ai_training_examples`: stores curated examples, which only influence the classifier after approval.
- `marketplace_ai_intent_weights`: bounded online feature weights updated only when a user explicitly corrects the understood intent.
- `marketplace_geocode_cache`: server-side cache for normalized location lookups, coordinates, provider metadata and expiry. It does not expose coordinates through the public listing API.

## Geographic listing fields
- `marketplace_listings.location_latitude` and `location_longitude`: nullable coordinates, allowing existing listings to remain valid until a trusted location is resolved.
- `location_geocode_status`: `pending`, `verified`, `manual` or `failed`.
- `location_geocode_provider` and `location_geocoded_at`: provenance and timestamp for a resolved location.
- A partial index supports geographic queries over published listings with coordinates.

## Geographic API route
- `GET /api/geography/geocode?q=Auchi%2C%20Edo%20State`: explicit location lookup. Returns up to the configured candidate limit, marks cache hits, and includes OpenStreetMap attribution. The route is disabled unless `geo.enabled` is true and a valid server environment variable is configured. It is not an autocomplete endpoint.

## Main API routes
- `GET /api/help-centre/public-config`: guest-safe assistant availability preview.
- `GET /api/help-centre/status`: signed-in user's monthly quota.
- `GET /api/help-centre/conversations`: conversation history.
- `GET /api/help-centre/conversations/:conversationId/messages`: owned conversation thread.
- `POST /api/help-centre/chat`: send a message and receive a BIGMAZ intent-classified answer, route actions or published listing matches.
- `POST /api/help-centre/location/resolve`: authenticated geographic lookup. Requires `geo.enabled=true` and a backend `GEOCODING_USER_AGENT` environment variable. Returns a verified provider result or an explicit disabled, not-configured, not-found or unavailable response.
- `POST /api/help-centre/feedback`: rate a response and optionally correct the assistant's understood intent.
- `GET /api/help-centre/admin/intelligence/summary`: administrator metrics for interactions, feedback and reviewed learning examples.
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
- `geo.enabled`: geographic lookup is disabled by default until a provider is configured and tested.
- `geo.provider`: provider identifier, default `nominatim`.
- `geo.country_code`: default country restriction, `ng`.
- `geo.cache_ttl_hours`: successful lookup cache lifetime, default 720 hours.
- `geo.max_results`: candidate limit, default 5.
- `geo.store_listing_coordinates`: controls whether approved listing workflows may store verified coordinates.

The public OpenStreetMap Nominatim endpoint is only a low-volume pilot option. It must be explicitly enabled, requires `BIGMAZ_GEO_USER_AGENT` with a genuine application identifier and contact, is limited to at most one provider request per second across the application, requires visible `© OpenStreetMap contributors` attribution, prohibits autocomplete and bulk geocoding, and may be withdrawn. The current in-process pacing is suitable only for a single backend instance. Before scaling horizontally or relying on it commercially, switch to a contracted provider or a self-hosted geocoder and use shared rate limiting.

## Geocoding provider configuration
- The current provider adapter supports Nominatim only.
- Set `GEOCODING_USER_AGENT` as a backend Codespaces/production environment secret. Use an identifiable application name and a valid contact URL or email in accordance with the provider usage policy.
- Keep `geo.enabled=false` until the User-Agent is configured and the service has been tested. Enable it only through the private administrator platform settings.
- Provider calls are paced to at least 1.1 seconds apart within one backend process. The provider's usage policy must be reviewed before production or multi-instance deployment; this in-process pacing is not a distributed rate limiter.
- Successful lookups are cached server-side. No provider credential or API key is exposed to the browser.

## Setup and verification
Run from the backend folder:
```bash
npm run setup:help-centre
npm run setup:geography
npm run build
```
Then run the frontend production build from the frontend folder:
```bash
npm run build
```

## Current BIGMAZ Intelligence capability boundary
The first proprietary engine version is a hybrid lexical/statistical intent classifier. It uses token and n-gram similarity, semantic cue scoring, curated examples and bounded online feature-weight updates from explicit user intent corrections. It does not call an external generative AI API and is not yet a general-purpose language model. It does not yet train neural language-model weights or perform open-ended reasoning at the level of a large foundation model.

The Help Centre still uses the existing contextual workflow for published property/product/service listing search. The geographic database foundation is now in place, but live geocoding provider integration, road-distance routing, live neighbourhood-discussion retrieval, full roommate-profile matching, interactive escrow animations and model-training evaluation/rollback remain later implementation phases. Geographic lookup is disabled by default. Provider credentials must be held in backend environment secrets, never in public platform settings or frontend code. The escrow answer is explicitly educational and does not claim that live escrow is operational. Guest scenarios are labelled as previews and do not pretend to run live searches. User corrections are stored as hashed feature signals and bounded weights; they do not store raw message text in the learning-event table. A negative rating alone does not retrain the classifier.

Paid message package values are configuration only; no payment is collected or simulated. Database setup and production builds must be run in Codespaces and their output checked before treating this implementation as verified.
