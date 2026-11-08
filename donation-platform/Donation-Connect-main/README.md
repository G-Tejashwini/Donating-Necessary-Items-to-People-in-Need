# Donation Connect — Full-Stack Project

A role-based Donation Connect application based on the original `fed.html` prototype in the GitHub repository. This version includes a frontend, Node.js/Express backend, SQLite database, and three roles:

- **Admin:** create/manage donation drives, review recipient requests, view donations and platform statistics.
- **Donor:** register/sign in, contribute to active drives, and view donation history.
- **Recipient:** register/sign in, submit support requests, and track request status.

## Technology

- Frontend: HTML, Tailwind CSS CDN, vanilla JavaScript
- Backend: Node.js and Express
- Database: SQLite (`better-sqlite3`)
- Authentication: bcrypt password hashing and JSON Web Tokens

## Requirements

- Node.js 20 or newer
- npm

Check versions:

```bash
node -v
npm -v
```

## Run on Windows (VS Code terminal)

1. Extract `Donation_Connect_Full_Stack.zip`.
2. In VS Code, choose **File → Open Folder** and select the extracted `Donation_Connect_Full_Stack` folder.
3. Open **Terminal → New Terminal**.
4. Make a local environment file:

```cmd
copy .env.example .env
```

5. Install dependencies:

```cmd
npm install
```

6. Start the server:

```cmd
npm start
```

7. Open this address in Chrome:

```text
http://localhost:3000
```

Keep the terminal running while using the application.

For development with automatic server restart:

```cmd
npm run dev
```

## Demo login accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@donationconnect.test` | `Admin@123` |
| Donor | `donor@donationconnect.test` | `Donor@123` |
| Recipient | `recipient@donationconnect.test` | `Recipient@123` |

You can also create donor and recipient accounts from the Create account page. Admin registration is intentionally disabled; use the seeded admin account.

## Database

On first run, the app creates `data/donation-connect.db` and inserts demo accounts and sample donation drives. The database is stored locally. Delete this database file only if you want to reset the local demo data; it will be recreated at the next server start.

## Main API routes

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Sign in |
| POST | `/api/auth/register` | Public | Register donor/recipient |
| GET | `/api/drives` | Public | List drives |
| POST | `/api/drives` | Admin | Create a drive |
| PATCH | `/api/drives/:id/status` | Admin | Change drive status |
| POST | `/api/donations` | Donor | Record a donation |
| GET | `/api/donations/mine` | Donor | View own donations |
| POST | `/api/requests` | Recipient | Submit help request |
| GET | `/api/requests/mine` | Recipient | View own requests |
| GET | `/api/admin/overview` | Admin | Dashboard statistics |
| GET | `/api/admin/requests` | Admin | List all help requests |
| PATCH | `/api/admin/requests/:id` | Admin | Approve/reject a request |
| GET | `/api/admin/donations` | Admin | View all donations |

## Important notes

- This is an academic/demo application, not a production donation/payment service.
- Donations are recorded as demo contributions. No real payment gateway is connected.
- Before deployment, set a strong random `JWT_SECRET`, use HTTPS, add input/rate limiting and backups, and review privacy/security requirements.
- Tailwind and Google Fonts are loaded from CDNs, so the frontend needs an internet connection for those styles/fonts.
