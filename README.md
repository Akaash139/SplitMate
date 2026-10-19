# SplitMate
<img width="1254" height="1254" alt="Teal SplitMate Group Logo" src="https://github.com/user-attachments/assets/3659c75d-3e8e-482f-8e41-94aceee18057" />


> **Shared cost. Zero confusion.**

SplitMate is a modern, mobile-first progressive web application designed to simplify shared expenses, roommate ledgers, travel budgets, and group finances. It replaces chaotic spreadsheets and awkward money conversations with deterministic math, minimal payment transfers, and a clean interface.

Built with a **Node.js / Express / MongoDB** backend and a **React 19 / Vite** frontend, SplitMate includes equal, exact, and percentage splitting engines, an automated debt simplification graph algorithm, real-time analytics, shareable group invite links, CSV reporting, and full Progressive Web App (PWA) support.

---

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Folder Structure](#project-folder-structure)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
  - [1. Backend Setup](#1-backend-setup)
  - [2. Frontend Setup](#2-frontend-setup)
- [Environment Configuration](#environment-configuration)
  - [Backend Variables (`server/.env`)](#backend-variables-serverenv)
  - [Frontend Variables (`client/.env.local`)](#frontend-variables-clientenvlocal)
- [Development Commands](#development-commands)
- [Build, Lint, and Test Commands](#build-lint-and-test-commands)
- [Progressive Web App (PWA) & Launcher Icons](#progressive-web-app-pwa--launcher-icons)
- [API Architecture & Endpoints](#api-architecture--endpoints)
- [Mathematical Precision & Core Algorithms](#mathematical-precision--core-algorithms)
- [Security & Concurrency Protections](#security--concurrency-protections)
- [Deployment Guidance](#deployment-guidance)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### 1. Flexible Expense Splitting Engine
- **Equal Splits:** Splits bills equally among participants while handling odd paise remainders deterministically so the sum of participant shares always matches the total expense.
- **Exact Splits:** Allows custom amounts per person with real-time validation to ensure exact balance matching.
- **Percentage Splits:** Distributes costs by percentage using the **Largest Remainder Method** (Hare-Niemeyer method) to prevent floating-point discrepancies.
- **Integer Paise Arithmetic:** All monetary amounts are computed and stored internally in minor units (paise / cents) to completely eliminate IEEE 754 floating-point rounding errors.

### 2. Smart Debt Simplification (Min-Cash-Flow)
- Graph-based debt simplification algorithm condenses multi-party debt cycles into the minimum possible number of direct settlements.
- Prevents cross-group balance netting to protect ledger integrity between different circles of friends.
- One-click "Settle Up" workflows with remaining balance calculations and over-settlement protections.

### 3. Group Collaboration & Shareable Invites
- Create groups for trips, roommates, dining, events, or shared projects.
- Public, shareable invitation links (`/join/:inviteCode`) with safe previews that keep member emails private.
- Group management controls: activate, deactivate, or regenerate invite codes anytime.
- Role-based permissions protecting group settings and records.

### 4. Financial Analytics & Data Export
- Visual spending breakdowns across categories (Food, Travel, Utilities, Entertainment, Housing, Other).
- Monthly spending trend charts and member contribution distributions.
- RFC 4180-compliant CSV exports for expenses and settlements with built-in spreadsheet formula injection protection.

### 5. Mobile-First Progressive Web App (PWA)
- Responsive 4-item bottom navigation bar on mobile screens (< 768px) and sidebar navigation on desktop screens.
- Installable standalone experience on Android, iOS, and desktop browsers with custom launcher icons.
- Maskable safe-zone icon design preventing Android launcher icon cropping.
- Offline app shell caching with service worker (`sw.js`).
- System-aware light/dark theme with zero Flash of Unstyled Content (FOUC).
- Accessibility and `prefers-reduced-motion` compliance across entrance animations.

---

## Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend Framework** | React 19 (`react: ^19.2.8`, `react-dom: ^19.2.8`) |
| **Build Tool & Dev Server** | Vite (`^8.3.0`) with `@vitejs/plugin-react` (`^6.1.1`) |
| **Client Routing** | React Router (`^7.18.4`) |
| **Icons & UI** | Lucide React (`^1.57.0`), Vanilla CSS design system |
| **Backend Runtime** | Node.js (CommonJS, Node 20+ / 22+ recommended) |
| **API Framework** | Express 5 (`^5.3.0`) |
| **Database & ODM** | MongoDB with Mongoose (`^9.11.2`) |
| **Authentication** | JSON Web Tokens (`jsonwebtoken: ^9.0.3`), `bcryptjs` (`^3.0.3`), Google Identity Services (`google-auth-library: ^11.3.1`) |
| **Linting & Code Quality** | ESLint 10 (`eslint: ^10.10.0`), `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` |
| **Automated Testing** | Native Node.js Test Runner (`node --test`) across client and server |

---

## Project Folder Structure

```text
expense-splitter-mobile/
├── client/                               # Frontend Single-Page Application (Vite + React 19)
│   ├── public/                           # Static assets, PWA manifest, and icons
│   │   ├── apple-touch-icon.png          # iOS home screen icon (180x180)
│   │   ├── favicon.svg                   # Browser tab icon
│   │   ├── icon-192x192.png              # Android launcher icon (192x192, any)
│   │   ├── icon-512x512.png              # High-res PWA icon (512x512, any)
│   │   ├── icon-maskable-192x192.png     # Android adaptive icon (192x192, 72% safe zone)
│   │   ├── icon-maskable-512x512.png     # Android adaptive icon (512x512, 72% safe zone)
│   │   ├── manifest.json                 # Web App Manifest
│   │   ├── manifest.webmanifest          # Standard Web App Manifest
│   │   ├── splitmate-logo.svg            # SplitMate brand asset
│   │   └── sw.js                         # Service worker for offline shell caching
│   ├── src/
│   │   ├── components/                   # Reusable UI components
│   │   │   ├── expenses/                 # Expense modals, items, and filters
│   │   │   ├── home/                     # Public landing page components & phone mockup
│   │   │   └── layout/                   # Navbar, Sidebar, MobileNav, and Layout wrappers
│   │   ├── constants/                    # Categories, color tokens, and app constants
│   │   ├── context/                      # React context providers (AuthContext, ThemeContext)
│   │   ├── hooks/                        # Custom hooks (e.g. useReducedMotion)
│   │   ├── pages/                        # Route pages
│   │   │   ├── analytics/                # Spending graphs & category charts
│   │   │   ├── auth/                     # Login & Register views
│   │   │   ├── dashboard/                # Activity feed & summary metrics
│   │   │   ├── expenses/                 # Global expenses list & filters
│   │   │   ├── friends/                  # Peer ledger breakdown
│   │   │   ├── groups/                   # Groups list, GroupDetails, & JoinGroup
│   │   │   ├── settings/                 # Account profile, theme, and PWA settings
│   │   │   ├── settlements/              # Suggested settlements & payment history
│   │   │   └── Home.jsx                  # Public marketing & product showcase page
│   │   ├── services/                     # API client and client-side utilities
│   │   ├── styles/                       # Modular CSS stylesheets
│   │   ├── App.jsx                       # Client route definitions
│   │   ├── index.css                     # Global design tokens, animations, and CSS variables
│   │   └── main.jsx                      # App root mount and PWA registration
│   ├── .env.example                      # Client environment template
│   ├── index.html                        # HTML shell with Google Sign-In and theme script
│   ├── package.json                      # Frontend scripts and dependencies
│   └── vite.config.js                    # Vite configuration with `/api` dev proxy
├── server/                               # Backend REST API Server (Node.js + Express 5)
│   ├── src/
│   │   ├── middleware/                   # Express middleware
│   │   │   ├── authMiddleware.js         # JWT authentication & req.user injection
│   │   │   ├── errorHandler.js           # Centralized JSON error response handler
│   │   │   └── groupMiddleware.js        # Group membership & admin permission guards
│   │   ├── models/                       # Mongoose data schemas
│   │   │   ├── Expense.js                # Expense records with split allocations
│   │   │   ├── Group.js                  # Group schema, member roles, and invite codes
│   │   │   ├── Settlement.js             # Recorded payments & settlement versions
│   │   │   └── User.js                   # User profiles & password hashing
│   │   ├── routes/                       # Express router modules
│   │   │   ├── analyticsRoutes.js        # Category & monthly spending aggregations
│   │   │   ├── authRoutes.js             # Register, login, Google OAuth, and profile
│   │   │   ├── expenseRoutes.js          # Expense CRUD & group CSV export
│   │   │   └── groupRoutes.js            # Groups, balances, invitations, and settlements
│   │   ├── tests/                        # Backend unit & integration test suites
│   │   ├── utils/                        # Core algorithms and calculation engines
│   │   │   ├── analyticsEngine.js        # Aggregation logic for categories and months
│   │   │   ├── balanceEngine.js          # Net balance ledger & min-cash-flow simplifier
│   │   │   ├── csvEngine.js              # RFC 4180 CSV generation & formula sanitization
│   │   │   └── expenseSplits.js          # Equal, exact, and percentage split calculations
│   │   └── server.js                     # Express app setup, MongoDB connection, and boot
│   ├── .env.example                      # Backend environment template
│   └── package.json                      # Backend scripts and dependencies
└── README.md                             # Project documentation
```

---

## Prerequisites

Before running SplitMate locally, make sure you have the following installed:

- **Node.js**: Version `20.x` or `22.x` (LTS recommended for native `node --test` runner support).
- **npm**: Version `10.x` or later.
- **MongoDB**: A running local MongoDB instance or a cloud cluster on [MongoDB Atlas](https://www.mongodb.com/atlas).
- **Google Cloud Console Credentials** *(Optional)*: Required only if testing Google Sign-In locally.

---

## Installation & Setup

Clone the repository to your local machine:

```bash
git clone https://github.com/Akaash139/SplitMate.git
cd SplitMate
```

### 1. Backend Setup

1. Navigate to the `server` directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your local environment file:
   ```bash
   copy .env.example .env     # On Windows PowerShell / Command Prompt
   # or
   cp .env.example .env       # On macOS / Linux
   ```
4. Open `server/.env` and configure your database URI, port, and JWT secret (see [Environment Configuration](#environment-configuration)).

### 2. Frontend Setup

1. From the project root, navigate to the `client` directory:
   ```bash
   cd ../client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your local environment file (optional for local proxy):
   ```bash
   copy .env.example .env.local     # On Windows
   # or
   cp .env.example .env.local       # On macOS / Linux
   ```

---

## Environment Configuration

### Backend Variables (`server/.env`)

These settings configure database connectivity, authentication security, and CORS origins:

| Variable | Description | Example / Default | Required |
| :--- | :--- | :--- | :--- |
| `PORT` | Port number for the Express server | `5000` | No (defaults to `5000`) |
| `MONGODB_URI` | MongoDB connection string (Atlas or local) | `mongodb://localhost:27017/expense_splitter` | **Yes** |
| `JWT_SECRET` | Secret key used to sign and verify JSON Web Tokens | `your_super_secret_jwt_key_here_min_32_chars` | **Yes** |
| `CLIENT_URL` | Allowed frontend origin for CORS | `http://localhost:5173` | No (defaults to `http://localhost:5173`) |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Web Client ID from Google Cloud | `your-id.apps.googleusercontent.com` | No (only if Google SSO is enabled) |

> [!CAUTION]
> Never commit `server/.env` or any production secret keys to version control. The `.gitignore` file is pre-configured to ignore all `.env` files.

### Frontend Variables (`client/.env.local`)

These settings configure client network routing and third-party authentication:

| Variable | Description | Example / Default | Required |
| :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Absolute URL to the backend API | Leave empty in development to use Vite's dev proxy | No |
| `VITE_GOOGLE_CLIENT_ID`| Google OAuth 2.0 Client ID for Google Sign-In | `your-id.apps.googleusercontent.com` | No (only if Google SSO is enabled) |

---

## Development Commands

For local development, run the backend and frontend dev servers simultaneously in separate terminals:

### Terminal 1: Backend Server

```bash
cd server
npm run dev
```
- Starts the Express server using `nodemon` on `http://localhost:5000`.
- Automatically reloads whenever backend source files change.
- Connects to MongoDB Atlas using Google/Cloudflare public DNS fallbacks (`8.8.8.8`, `1.1.1.1`) to ensure reliable SRV record resolution across all local network environments.

### Terminal 2: Frontend Client

```bash
cd client
npm run dev
```
- Starts Vite dev server with Hot Module Replacement (HMR) on `http://localhost:5173`.
- Any requests starting with `/api` are automatically proxied to `http://localhost:5000`.

---

## Build, Lint, and Test Commands

SplitMate includes automated test suites covering both the frontend client utilities and backend API routes.

### Client Checks (`client/`)

```bash
# Run production build
cd client
npm run build

# Run code linter
npm run lint

# Run frontend automated unit tests (216 tests)
npm test

# Preview production build locally
npm run preview
```

### Server Checks (`server/`)

```bash
# Run backend test suite (207 tests)
cd server
npm test

# Start production server
npm start
```

---

## Progressive Web App (PWA) & Launcher Icons

SplitMate meets full Progressive Web App installability criteria across Android, iOS, Windows, and macOS:

### 1. PWA Manifest & App Shell
- Manifest configurations are provided via [manifest.webmanifest](file:///d:/expense-splitter-mobile/client/public/manifest.webmanifest) and [manifest.json](file:///d:/expense-splitter-mobile/client/public/manifest.json).
- Theme color is set to `#0D9488` (Deep Teal), and background color is set to `#EFFBED` to match the brand palette.
- Display mode is `standalone` with `portrait-primary` orientation.

### 2. Crisp Launcher Icons & Safe Zones
To prevent the common Android issue where icons appear cropped or as a blank white square, SplitMate provides both standard and adaptive maskable icons:
- `icon-192x192.png` & `icon-512x512.png`: Standard square launcher icons (`purpose: "any"`).
- `icon-maskable-192x192.png` & `icon-maskable-512x512.png`: Adaptive icons designed within the W3C 72% inner safe zone (`purpose: "maskable"`), ensuring the SplitMate logo remains fully visible inside circular, rounded, or squircle device masks.
- `apple-touch-icon.png`: 180×180 iOS home screen icon.

### 3. Service Worker Caching
- [sw.js](file:///d:/expense-splitter-mobile/client/public/sw.js) registers the `splitmate-static-v2` cache.
- Implements a **stale-while-revalidate** strategy for static application assets and a **network-first with cache fallback** for page navigation, ensuring fast loads and reliable offline shell rendering.

---

## API Architecture & Endpoints

All backend endpoints are versioned under `/api/v1`. Protected endpoints require an `Authorization: Bearer <jwt-token>` header.

### Authentication (`/api/v1/auth`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `POST` | `/api/v1/auth/register` | Register new account with email, password, and name | No |
| `POST` | `/api/v1/auth/login` | Authenticate existing user with email and password | No |
| `POST` | `/api/v1/auth/google` | Sign in or register using Google OAuth credential | No |
| `GET` | `/api/v1/auth/me` | Fetch authenticated user's current profile | Yes |
| `PUT` | `/api/v1/auth/profile` | Update profile details (display name) | Yes |
| `PUT` | `/api/v1/auth/password` | Change account password | Yes |

### Groups (`/api/v1/groups`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/api/v1/groups` | List all groups the user belongs to with calculated balances | Yes |
| `POST` | `/api/v1/groups` | Create a new group (name, category, members) | Yes |
| `GET` | `/api/v1/groups/:id` | Get group details, member list, and active invite code | Yes (Member) |
| `PUT` | `/api/v1/groups/:id` | Update group name, description, or category | Yes (Admin/Creator) |
| `DELETE` | `/api/v1/groups/:id` | Delete group and associated records | Yes (Creator) |
| `GET` | `/api/v1/groups/invite/:code` | Public preview of group invitation (name, count) | No |
| `POST` | `/api/v1/groups/join/:code` | Join group using shareable invite code | Yes |
| `POST` | `/api/v1/groups/:id/invite/regenerate` | Invalidate current invite code and generate a new one | Yes (Admin/Creator) |
| `POST` | `/api/v1/groups/:id/invite/toggle` | Toggle public invite link on or off | Yes (Admin/Creator) |

### Expenses (`/api/v1/groups/:groupId/expenses`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/api/v1/groups/:groupId/expenses` | List group expenses with pagination, search, and category filters | Yes (Member) |
| `POST` | `/api/v1/groups/:groupId/expenses` | Record a new expense with equal, exact, or percentage split | Yes (Member) |
| `GET` | `/api/v1/groups/:groupId/expenses/:expenseId` | Get detailed expense information | Yes (Member) |
| `PUT` | `/api/v1/groups/:groupId/expenses/:expenseId` | Edit an existing expense | Yes (Member) |
| `DELETE` | `/api/v1/groups/:groupId/expenses/:expenseId` | Delete an expense and adjust ledger balances | Yes (Member) |
| `GET` | `/api/v1/groups/:groupId/expenses/export/csv` | Download RFC 4180 CSV export of group expenses | Yes (Member) |
| `GET` | `/api/v1/groups/expenses/export/csv` | Download CSV export of all user expenses across all groups | Yes |

### Balances & Settlements (`/api/v1/groups/:groupId/...`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/api/v1/groups/:groupId/balances` | Get computed net balances for all group members | Yes (Member) |
| `GET` | `/api/v1/groups/:groupId/settlement-suggestions` | Get simplified settlement transfers (min-cash-flow) | Yes (Member) |
| `GET` | `/api/v1/groups/:groupId/settlements` | List recorded settlement payments history | Yes (Member) |
| `POST` | `/api/v1/groups/:groupId/settlements` | Record a settlement payment with idempotency key | Yes (Member) |
| `GET` | `/api/v1/groups/:groupId/settlements/export/csv`| Export group settlements to CSV | Yes (Member) |

### Analytics (`/api/v1/groups/...`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/api/v1/groups/analytics` | Overall spending metrics across all groups | Yes |
| `GET` | `/api/v1/groups/analytics/categories` | Overall category breakdown across all groups | Yes |
| `GET` | `/api/v1/groups/:groupId/analytics` | Group spending metrics and member totals | Yes (Member) |
| `GET` | `/api/v1/groups/:groupId/analytics/categories` | Group category breakdown | Yes (Member) |
| `GET` | `/api/v1/groups/:groupId/analytics/monthly` | Group monthly spending trends | Yes (Member) |

---

## Mathematical Precision & Core Algorithms

### 1. Integer Paise Representation
To ensure 100% mathematical determinism, currency values are converted from rupee strings to integer paise via `Math.round(amount * 100)`. All balance equations, debts, allocations, and checks run strictly in integer arithmetic before being formatted back to decimal strings for display.

### 2. Largest Remainder Percentage Splitting
When an expense is split by percentage (e.g. 33.33%, 33.33%, 33.34%), rounding each share can cause the total allocated paise to differ from the total expense. SplitMate resolves this using the **Largest Remainder Method**:
1. Compute the floor share for each participant: $\lfloor \text{amount} \times (\text{percent} / 100) \rfloor$.
2. Calculate each participant's fractional remainder.
3. Distribute any remaining 1-paise units one by one to participants with the largest remainders.

### 3. Min-Cash-Flow Debt Simplification
When $N$ people exchange expenses in a group, a web of directed debts forms. SplitMate calculates each member's net balance:

$$\text{Net Balance}_i = \sum \text{Paid By}_i - \sum \text{Owed By}_i$$

The algorithm partitions members into **Creditors** ($\text{Net} > 0$) and **Debtors** ($\text{Net} < 0$), then greedily pairs the largest debtor with the largest creditor:
- Settles $\min(|\text{Debtor Balance}|, |\text{Creditor Balance}|)$.
- Updates both balances and repeats until all balances reach 0.
- Reduces $O(N^2)$ debt relationships down to at most $N - 1$ simple payments.

---

## Security & Concurrency Protections

- **Password Security:** User passwords are encrypted using `bcryptjs` with a cost factor of 10. Passwords are never returned in API payloads.
- **Access Control:** The `requireGroupMember` middleware verifies that the requesting user's ID exists in the group's active member array before permitting access to expenses, settlements, balances, or analytics.
- **Optimistic Concurrency Control (OCC):** The `Group` model tracks a `settlementVersion` counter. Settlement payments increment this version atomically, preventing concurrent race conditions from recording duplicate settlements or over-settling debts.
- **Idempotency Protection:** Clients can pass an `idempotencyKey` when recording settlements. If a network retry occurs with the same key, the server safely returns the existing settlement instead of creating a second charge.
- **Formula Injection Mitigation:** When generating CSV exports, any text field starting with `= `, `+ `, `- `, or `@ ` is automatically prefixed with a single quote (`'`), preventing malicious formula execution when opened in Microsoft Excel or Google Sheets.

---

## Deployment Guidance

### Frontend Deployment (Vercel / Netlify / Cloudflare Pages)
1. Set the root or build directory to `client`.
2. Configure the build command:
   ```bash
   npm run build
   ```
3. Set the output directory:
   ```text
   dist
   ```
4. Set the environment variable:
   - `VITE_API_BASE_URL`: The production URL of your backend server (e.g. `https://api.yourdomain.com`).
5. Ensure single-page application routing rewrite rules are configured:
   - **Vercel:** Create a `vercel.json` with a rewrite rule from `/(.*)` to `/index.html`.
   - **Netlify:** Create a `_redirects` file with `/*  /index.html  200`.

### Backend Deployment (Render / Railway / Fly.io / VPS)
1. Set the root directory to `server`.
2. Configure the start command:
   ```bash
   npm start
   ```
3. Set production environment variables in your hosting provider's dashboard:
   - `PORT`: Usually provided by the platform (e.g. `5000`, `8080`, or `10000`).
   - `NODE_ENV`: `production`
   - `MONGODB_URI`: Production MongoDB Atlas connection URI.
   - `JWT_SECRET`: A secure, cryptographically random secret (32+ characters).
   - `CLIENT_URL`: The production frontend domain (e.g. `https://splitmate.yourdomain.com`).
4. Ensure your MongoDB Atlas Network Access IP Access List includes the IP addresses of your backend deployment server.

---

## Contributing

Contributions, bug reports, and suggestions are welcome!

1. Fork the repository.
2. Create a descriptive feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Ensure all tests and lint checks pass before committing:
   ```bash
   # In client/
   npm run lint
   npm test
   npm run build

   # In server/
   npm test
   ```
4. Commit your changes following standard conventional commit guidelines:
   ```bash
   git commit -m "feat: add feature description"
   ```
5. Push to your branch and open a Pull Request.

---

## License

This project is licensed under the [ISC License](https://opensource.org/licenses/ISC) as specified in `server/package.json`.
The client application package is configured for private use.
