# Project roles and workflow

## Admin
1. Sign in with the demo admin account.
2. View platform statistics and donation records.
3. Create a donation drive and set its target amount.
4. Pause, reactivate or complete a drive.
5. Approve or reject recipient support requests and optionally add an admin note.

## Donor
1. Register as a donor or use the demo donor account.
2. Select an active donation drive.
3. Enter a demo contribution amount and optional message.
4. View contribution history and updated drive totals.

## Recipient
1. Register as a recipient or use the demo recipient account.
2. Submit a support request with category, description and number of people.
3. Track pending, approved or rejected status.
4. Read any note added by the administrator.

## High-level architecture

Browser (HTML/CSS/JavaScript) → Express REST API → SQLite database

Authentication uses a signed JWT. Passwords are hashed with bcrypt. Role middleware restricts admin, donor and recipient endpoints.
