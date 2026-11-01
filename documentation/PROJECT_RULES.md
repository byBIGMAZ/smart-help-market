
# SMART HELP MARKET BY BIGMAZ
## Project Rules and Engineering Standards

### 1. Product Scope

SMART HELP MARKET BY BIGMAZ is a Nigerian marketplace for:
- Residential and commercial property rentals and sales
- Land listings
- Physical products
- Professional and domestic services
- Landlords, sellers, service providers and agents
- Future property management and roommate-matching features

### 2. Mobile-First Requirement

Every interface must support mobile phones, tablets and desktop computers.

- Design for small screens first.
- Prevent unintended horizontal scrolling.
- Use readable typography and touch-friendly controls.
- Make forms usable on mobile devices.
- Test navigation, listings, dashboards and administrative pages at different screen sizes.
- Do not treat mobile support as a final-stage enhancement.

### 3. Configuration, Not Scattered Hardcoding

Business-facing settings must be managed through an authorized configuration system.

Examples:
- Platform name, logo and theme
- Marketplace categories and supported locations
- Listing fees and subscription plans
- Commission rates and inspection charges
- Verification requirements
- Media upload limits and watermark settings
- Notification templates
- Session timeout policies
- Supported rental terms and payment schedules

Avoid duplicating business rules across the frontend and backend.

The frontend may use safe defaults for initial development, but production business settings must come from validated configuration. Critical configuration must be enforced by the backend.

### 4. Security

- Authenticate users before protected actions.
- Enforce permissions on every protected backend operation.
- Never rely on hidden buttons or frontend checks as security controls.
- Validate and authorize requests on the server.
- Protect exact property addresses and coordinates.
- Store private credentials and payment secrets outside frontend source code.
- Never commit real passwords, tokens or production secrets.
- Record important administrative and security-sensitive changes.
- Protect against unauthorized access through direct URLs and API requests.

Security-critical controls cannot be disabled through ordinary administrative settings.

### 5. Data Integrity

- Give important records stable identifiers.
- Validate input before saving.
- Track listing and transaction status changes.
- Preserve rental, sale and transaction history.
- Prevent duplicate payment processing.
- Keep financial records auditable.
- Use database constraints and transactions where appropriate.
- Maintain appropriate backups and recovery procedures.

### 6. Property and Unit Management

A parent property may contain multiple independently rentable or saleable units.

Each unit must have its own:
- Identifier
- Description
- Price and charges
- Availability
- Relevant media
- Listing and rental history

Protect the parent property's exact location. Public visibility must be determined by availability and authorization rules.

### 7. Financial Integrity

Distinguish between:
- Customer payments
- Refund obligations
- Protected transaction funds
- Platform revenue
- Payment processing fees
- Agent and service-provider earnings
- Operating expenses

Customer funds are not platform revenue simply because the platform processes them.

Receipts must only be issued after verified payment confirmation and reconciliation.

Protected-payment or escrow-like services must use a legally and technically suitable arrangement. A normal payment gateway must not be misrepresented as escrow.

### 8. Testing Requirements

Test:
- Production builds
- Mobile and desktop layouts
- Form validation
- Authentication and authorization
- Access to private records
- Listing availability
- Configuration validation
- Payment and refund state transitions
- Duplicate requests and webhook handling
- Financial calculations

Do not describe a feature as complete until its expected behavior has been tested.

### 9. Development Workflow

1. Inspect existing files before editing.
2. Make small, focused changes.
3. Explain which files are being changed.
4. Provide complete replacement code when requested.
5. Run the relevant tests and production build.
6. Fix errors before continuing.
7. Keep documentation synchronized with implementation.
8. Commit working milestones to version control.

### 10. Portability

- Keep source code and project documentation in the repository.
- Document dependencies and setup instructions.
- Use database migrations.
- Never commit secrets or private customer data.
- Ensure the project can be checked out and continued on another computer.

### 11. Current Status

- React and TypeScript frontend created.
- Vite development server working.
- Initial responsive demonstration homepage implemented.
- Backend, database and automated tests are not yet implemented.
- Production authentication, real listings, payment processing and administrative configuration are not yet implemented.
