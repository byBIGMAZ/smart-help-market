# Listing Drafts Code Register

## Purpose

This phase connects Listing Studio draft saving to the authenticated marketplace account. It does not submit listings for review or publish them.

## Database

- Migration: `backend/src/migrate-listing-details.ts`
- Command: `npm run setup:listing-drafts` from `backend/`
- Adds `marketplace_listings.listing_details` as JSONB with an object-only constraint and a 256 KB limit.
- Existing listing records are preserved and receive an empty JSON object by default.

## Backend

- Route: `backend/src/routes/ownerListings.ts`
- Mounted at `/api/listings` in `backend/src/server.ts`.
- `GET /api/listings/owner` retrieves only the authenticated user's listings, including unpublished drafts, with structured details and image galleries.
- `POST /api/listings/owner` creates an owner-linked draft.
- `PATCH /api/listings/owner/:listingId` updates only an existing draft owned by the authenticated user.
- Both endpoints require a valid session, an active account, an active marketplace category, and an authorised account type or matching explicitly assigned workspace role.
- Property drafts are restricted to landlord and agent account types/roles, product drafts to seller account types/roles, and service drafts to service-provider account types/roles. The development demo account uses its explicit workspace-role assignments because it has no single account_type.
- `backend/src/repair-marketplace-demo-account-roles.ts` and `npm run repair:demo-account-roles` safely repair workspace-role assignments for the existing `demo@smarthelpmarket.ng` account without creating a replacement account or granting administrative roles.
- All new records are created with status `draft`, `is_demo = false`, and the authenticated `owner_user_id`.
- SQL uses bound parameters. Listing create/update and audit logging run in a database transaction.
- Draft updates cannot change a published, pending-review, rejected, suspended, or demonstration listing.

## Structured details

The JSONB payload stores a versioned object containing the listing kind, form values, and property unit details. Temporary browser object URLs, selected image files, and recorded video object URLs are deliberately excluded. Property units remain inside one listing record to avoid creating duplicate public listings.

## Frontend

- Service: `frontend/src/services/ownerListingDrafts.ts`
- Editor: `frontend/src/pages/owner/ListingEditorPage.tsx`
- The editor keeps its existing local-storage recovery copy.
- When a category is selected and the user is signed in with an eligible account, Save Draft creates or updates the server-side draft.
- If the user is signed out or server synchronisation fails, the local recovery copy remains available and the interface reports the sync issue.
- Media upload and listing submission are separate later phases.

## Not yet implemented

- Server-side profile verification and provider approval.
- Submission to moderation and publishing.
- Uploading selected media from Listing Studio.
- Editing an existing server draft by loading its saved details into the editor.
- Live geocoding and coordinate assignment for listing creation.
