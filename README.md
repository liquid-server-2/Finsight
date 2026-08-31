# FinSight

> **FinSight is a full-stack personal finance analytics platform that transforms raw bank statements into structured transactions, spending insights, and financial risk signals.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-Render-blue?style=for-the-badge&logo=render)](https://finsight-frontend-ymn9.onrender.com)
[![GitHub Repository](https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github)](https://github.com/liquid-server-2/Finsight)

---

## Live Deployment

* **Web Application**: [https://finsight-frontend-ymn9.onrender.com](https://finsight-frontend-ymn9.onrender.com)
* **Backend API**: [https://finsight-backend-tlsn.onrender.com](https://finsight-backend-tlsn.onrender.com)
* **Interactive API Documentation**: [https://finsight-backend-tlsn.onrender.com/docs](https://finsight-backend-tlsn.onrender.com/docs)

---

## Project Overview

Personal finance data is frequently trapped in non-standardized bank statements (such as multi-header Excel files or varying CSV formats) or opaque budgeting apps that require continuous manual data entry.

FinSight provides an end-to-end, automated, and privacy-first solution. The complete workflow spans:

1. **User Registration & Authentication**: Secure user onboarding with PBKDF2-SHA256 password hashing and HTTP-only session management.
2. **Account Management**: Create and track multiple checking, savings, credit, or investment accounts with distinct currencies.
3. **Statement Ingestion**: Upload standard CSV statements or native HDFC Bank `.xls` statement files.
4. **Automated Categorization**: Normalizes merchant narrations and deterministically classifies expenses using regex heuristics and user-defined merchant rules.
5. **Interactive Dashboard**: Real-time KPI summaries, monthly income vs. spending metrics, and recent transaction feeds.
6. **Cash Flow Insights**: Category spending distribution, discretionary expense ratios, and historical cash flow trajectories.
7. **Risk & Anomaly Engine**: Statistical anomaly detection evaluating spending spikes, outlier debits, persistent cash flow deficits, category concentration, and a 0–100 Stability Index.

---

## Key Features

* **Session-Based Authentication**: Secure cookie-based JWT authentication (`SameSite=None; Secure; HttpOnly`) with cross-user data isolation.
* **Multi-Account Architecture**: Create and isolate multiple accounts (Checking, Savings, Credit, Investment) under a single authenticated user.
* **Dual Statement Ingestion**:
  * Standard UTF-8 CSV ingestion with automatic column validation.
  * Native HDFC Bank Excel 97–2004 (`.xls` / BIFF8) statement parsing.
* **Smart Categorization & Merchant Normalization**:
  * Built-in rule-based categorizer covering 10 expense categories (`Food & Dining`, `Shopping`, `Housing`, `Utilities`, `Transportation`, `Healthcare`, `Entertainment`, `Travel`, `Financial`, `Income`, `Transfer`).
  * User-specific custom merchant rule overrides persisted in PostgreSQL.
* **Transaction Management**: Search, filter by category/type, paginate records, and update transaction categories with instant metric recalculation.
* **Analytics & Cash Flow Trends**: Aggregates monthly income, spending, net cash flow, and category breakdowns.
* **Deterministic Risk & Anomaly Engine**: Evidence-based statistical pattern detection producing explainable risk signals and a composite Stability Score.
* **Persistent PostgreSQL Storage**: ACID-compliant data persistence managed via SQLAlchemy 2.0 ORM.

---

## Architecture

FinSight follows a decoupled client-server architecture with strict separation of concerns and stateless backend API execution.

```mermaid
graph TD
    subgraph Client ["Frontend (React 19 / TypeScript / Vite)"]
        UI["React SPA (App.tsx)"]
        Pages["Pages (Dashboard, Transactions, Accounts, Insights, Risk)"]
        AuthUI["Auth Pages (Login, Register)"]
        UI --> Pages
        UI --> AuthUI
    end

    subgraph API ["Backend (FastAPI / Python 3.11+)"]
        CORSMW["CORS Middleware (Cross-Origin Allowed)"]
        AuthModule["Auth Module (JWT & Cookie Verification)"]
        
        subgraph Services ["Core Engine & Processing"]
            HDFCParser["HDFC .xls Parser (xlrd)"]
            Categorizer["Categorization Engine & Rules"]
            Analytics["Analytics & Aggregation Engine"]
            RiskEngine["Deterministic Risk Engine"]
        end
        
        CORSMW --> AuthModule
        AuthModule --> HDFCParser
        AuthModule --> Categorizer
        AuthModule --> Analytics
        AuthModule --> RiskEngine
    end

    subgraph Data ["Data Tier"]
        ORM["SQLAlchemy 2.0 ORM"]
        DB[(PostgreSQL Database / Supabase)]
        Services --> ORM
        ORM --> DB
    end

    Client -- "HTTPS / credentials: 'include'" --> CORSMW
```

---

## HDFC Bank `.xls` Ingestion Pipeline

FinSight includes a specialized parser ([`Backend/app/hdfc_xls_parser.py`](file:///C:/Users/lvo/OneDrive/Desktop/Finsight/Backend/app/hdfc_xls_parser.py)) designed specifically for HDFC Bank's legacy Excel 97–2004 (`.xls` / BIFF8) statement exports:

1. **Header Row Discovery**: Dynamically scans the workbook rows to locate the transaction table header (identifying column anchors like `Date`, `Narration`, `Withdrawal Amt.`, `Deposit Amt.`, `Closing Balance`).
2. **Metadata & Noise Filtering**: Automatically ignores non-transaction sections, such as account holder details, branch metadata, opening balance rows, and trailing summary statements.
3. **Date Normalization**: Handles both raw Excel numeric date serials (`xldate_as_tuple`) and formatted string dates (`DD/MM/YY`, `DD/MM/YYYY`, `YYYY-MM-DD`), converting them to timezone-aware UTC `datetime` objects.
4. **Monetary Precision**: Normalizes debits (represented as negative amounts) and credits (positive amounts) using Python `Decimal` objects to prevent floating-point rounding errors.
5. **Categorization & Persistence**: Normalizes merchant names and streams parsed records through the categorization pipeline and database in a single atomic transaction.

---

## Deterministic Financial Risk Engine

The Risk Engine ([`Backend/app/risk.py`](file:///C:/Users/lvo/OneDrive/Desktop/Finsight/Backend/app/risk.py)) evaluates account transactions using deterministic mathematical and heuristic rules without relying on external LLM services or arbitrary score generation:

### Implemented Signals & Formulas

1. **Unusual Transaction Outlier (`UNUSUAL_TRANSACTION`)**:
   * *Requirement*: $\ge 5$ debit transactions.
   * *Threshold*: Outlier cut-off $T = \max(Q3 + 1.5 \times IQR, 3.0 \times \text{Median})$.
   * *Trigger*: Flagged if $|amount| \ge T$ and $|amount| \ge 2.5 \times \text{Median}$.
   * *Severity*: `HIGH` if $|amount| \ge 5.0 \times \text{Median}$, else `MODERATE`.
2. **Monthly Spending Spike (`SPENDING_SPIKE`)**:
   * *Requirement*: $\ge 2$ completed monthly periods.
   * *Trigger*: Current month spending exceeds the historical monthly average by $\ge 25\%$ with a minimum nominal increase of $500.00$.
   * *Severity*: `HIGH` if increase $\ge 50\%$, else `MODERATE`.
3. **Persistent Cash Flow Deficit (`CASH_FLOW_RISK`)**:
   * *Trigger*: Evaluates consecutive calendar months with negative net cash flow ($Income - Spending < 0$).
   * *Severity*: `HIGH` if consecutive deficit $\ge 3$ months; `MODERATE` if deficit $= 2$ months; `LOW` for isolated single-month deficit.
4. **Category Concentration (`CATEGORY_CONCENTRATION`)**:
   * *Trigger*: A single non-transfer expense category represents $\ge 50\%$ of total account expenditure across $\ge 3$ transactions.
   * *Severity*: `MODERATE` if $\ge 70\%$, else `LOW`.
5. **Discretionary Spending Exposure (`DISCRETIONARY_SPENDING`)**:
   * *Taxonomy*: Aggregates spending across `Shopping`, `Entertainment`, `Food & Dining`, and `Travel`.
   * *Trigger*: Discretionary ratio $R_{\text{disc}} \ge 50\%$ of total spending.
   * *Severity*: `MODERATE` if $\ge 70\%$, else `LOW`.
6. **Recurring Payment Creep (`RECURRING_PAYMENT_CREEP`)**:
   * *Requirement*: Verified recurring debit series (`is_recurring=True`).
   * *Trigger*: Latest recurring charge from the same merchant is $> 15\%$ higher than the prior historical charge.
7. **Cash Flow Trajectory Trend (`CASH_FLOW_TREND`)**:
   * *Requirement*: $\ge 3$ completed monthly periods.
   * *Trigger*: Strictly declining monthly net cash flows across the last 3 consecutive months.

### Composite Stability Index (0–100)

The Stability Index is calculated deterministically from detected signal severities:

$$\text{Stability Score} = \max\left(0, \min\left(100, 100 - (N_{\text{HIGH}} \times 25 + N_{\text{MODERATE}} \times 10 + N_{\text{LOW}} \times 5)\right)\right)$$

* **Overall Account Status**: Evaluated as `HIGH`, `MODERATE`, `LOW`, or `INSUFFICIENT_DATA` (when transaction history is empty).
* **Transparent Diagnostics**: The API response includes diagnostic strings detailing which signals are currently inactive due to insufficient historical data.

---

## Tech Stack

### Backend
* **Runtime & Framework**: Python 3.11+, [FastAPI](https://fastapi.tiangolo.com/) `0.141.1`, [Starlette](https://www.starlette.io/)
* **Database & ORM**: PostgreSQL, [SQLAlchemy](https://www.sqlalchemy.org/) `2.0.52`, [psycopg2-binary](https://www.psycopg.org/) `2.9.12`
* **Validation & Schemas**: [Pydantic](https://docs.pydantic.dev/) `v2.13.4`
* **File Parsing**: [xlrd](https://github.com/python-excel/xlrd) `2.0.1` (Excel BIFF8 parser), [python-multipart](https://github.com/Kludex/python-multipart)
* **Configuration & Server**: [python-dotenv](https://github.com/theskumar/python-dotenv), [Uvicorn](https://www.uvicorn.org/)

### Frontend
* **UI Framework**: [React](https://react.dev/) `19.2.8`, [React DOM](https://react.dev/) `19.2.8`
* **Language & Tooling**: [TypeScript](https://www.typescriptlang.org/) `~6.0.2`, [Vite](https://vitejs.dev/) `8.2.2`, [ESLint](https://eslint.org/) `10.9.0`
* **Styling**: Pure CSS with responsive modular design tokens

---

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register a new user and issue session cookie |
| `POST` | `/api/auth/login` | Authenticate user and issue session cookie |
| `POST` | `/api/auth/logout` | Invalidate and clear session cookie |
| `GET` | `/api/auth/me` | Fetch authenticated user profile |
| `GET` | `/api/accounts` | List all accounts belonging to the authenticated user |
| `POST` | `/api/accounts` | Create a new financial account |
| `GET` | `/api/accounts/{id}/summary` | Retrieve account balance and summary KPI metrics |
| `GET` | `/api/accounts/{id}/transactions` | Retrieve paginated transactions with category filtering |
| `PATCH` | `/api/accounts/{id}/transactions/{tx_id}/category` | Manually update a transaction's assigned category |
| `POST` | `/api/accounts/{id}/transactions/import-csv` | Upload and ingest a UTF-8 CSV bank statement |
| `POST` | `/api/accounts/{id}/transactions/import-hdfc-xls` | Upload and ingest an HDFC Bank `.xls` statement |
| `GET` | `/api/accounts/{id}/analytics` | Compute category breakdowns and monthly trends |
| `GET` | `/api/accounts/{id}/risk` | Execute the deterministic Financial Risk & Anomaly Engine |
| `GET` | `/api/merchant-rules` | List user-defined merchant categorization rules |
| `POST` | `/api/merchant-rules` | Create or update a custom merchant categorization rule |

---

## Database Schema

```mermaid
erDiagram
    users ||--o{ accounts : "owns"
    users ||--o{ merchant_rules : "defines"
    accounts ||--o{ transactions : "contains"
    merchants ||--o{ transactions : "assigned to"
    merchants ||--o{ merchant_rules : "configured for"

    users {
        int id PK
        string email UK
        string password_hash
        datetime created_at
    }

    accounts {
        int id PK
        int user_id FK
        string name
        string account_type
        string institution
        string currency
        datetime created_at
    }

    merchants {
        int id PK
        string name
        string normalized_name UK
        datetime created_at
    }

    merchant_rules {
        int id PK
        int user_id FK
        int merchant_id FK
        string category
        datetime created_at
        datetime updated_at
    }

    transactions {
        int id PK
        int account_id FK
        int merchant_id FK
        numeric amount
        string currency
        datetime transaction_date
        string description
        string category
        string transaction_type
        boolean is_recurring
        datetime created_at
    }
```

---

## Project Structure

```text
Finsight/
├── .gitignore                     # Repository ignore rules (secrets, venv, statements)
├── README.md                      # Project documentation
├── transactions.csv               # Synthetic demo transaction dataset
│
├── Backend/
│   ├── .env.example               # Template environment configuration
│   ├── requirements.txt           # Python backend dependencies
│   ├── app/
│   │   ├── main.py                # FastAPI application, CORS, and route handlers
│   │   ├── database.py            # SQLAlchemy engine, DeclarativeBase, SessionLocal
│   │   ├── auth.py                # JWT creation/verification, password hashing, cookies
│   │   ├── analytics.py           # Financial metric calculation & category aggregations
│   │   ├── risk.py                # Deterministic Risk & Anomaly Engine
│   │   ├── categorizer.py         # Keyword matching & merchant rule engine
│   │   ├── hdfc_xls_parser.py     # HDFC Bank Excel 97-2004 statement parser
│   │   ├── init_db.py             # Schema initialization utility
│   │   ├── models/                # SQLAlchemy database models (User, Account, Transaction, Merchant, Rule)
│   │   └── schemas/               # Pydantic validation and response schemas
│   └── tests/                     # Unit, security API, and regression test suites
│
└── Frontend/
    ├── package.json               # Frontend dependencies and build scripts
    ├── vite.config.ts             # Vite build configuration
    ├── tsconfig.json              # TypeScript compiler configuration
    ├── eslint.config.js           # ESLint configuration
    ├── index.html                 # Single page application entrypoint
    ├── public/                    # Static SVG icons and favicon
    └── src/
        ├── App.tsx                # App shell, state management, and view routing
        ├── App.css                # FinSight design system & responsive styling
        ├── types.ts               # TypeScript domain interfaces & types
        ├── components/            # Sidebar, CreateAccountModal, CsvImportModal
        ├── pages/                 # Dashboard, Transactions, Accounts, Insights, Risk, Auth
        └── utils/                 # Monetary and date formatting utilities
```

---

## Local Development Setup

### Prerequisites

* **Python 3.11+**
* **Node.js 18+** and **npm**
* **PostgreSQL** (running locally or via a cloud instance)

---

### Backend Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/liquid-server-2/Finsight.git
   cd Finsight/Backend
   ```

2. **Create and activate a virtual environment**:
   ```bash
   # Windows (PowerShell)
   python -m venv venv
   .\venv\Scripts\Activate.ps1

   # macOS / Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to specify your database connection:
   ```env
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/finsight_db
   SECRET_KEY=your-secure-secret-key-change-in-production
   ```

5. **Initialize database tables**:
   ```bash
   python -m app.init_db
   ```

6. **Start the FastAPI backend server**:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   API is accessible at `http://127.0.0.1:8000` (Docs at `http://127.0.0.1:8000/docs`).

---

### Frontend Setup

1. **Navigate to Frontend directory**:
   ```bash
   cd ../Frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the Vite development server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---

## Testing & Quality Assurance

### Backend Automated Test Suite

Run the full unit, security API, and regression test suite (20 tests):
```bash
cd Backend
python -m unittest discover tests
```

* **Test Coverage Highlights**:
  * Unit tests for all 7 risk engine signals and Decimal monetary precision.
  * Security tests verifying `401 Unauthorized` for unauthenticated requests and `403 Forbidden` for cross-user account access attempts.
  * Regression tests verifying the end-to-end user lifecycle (registration, account creation, transaction categorization, and analytics).

### Frontend Code Quality

Run ESLint and production build verification:
```bash
cd Frontend
npm run lint
npm run build
```

---

## Security & Privacy

* **Zero Third-Party AI Data Transmission**: All categorization, analytics, and risk evaluations run locally in-engine. Financial transaction records are never shared with external LLMs or third-party analytical services.
* **Credential Protection**: Passwords are encrypted using PBKDF2-SHA256 with 600,000 iterations and unique cryptographic salts.
* **Access Control**: Every endpoint strictly scopes database queries to `current_user.id`, preventing horizontal privilege escalation.
* **Git Safety**: Real bank statement formats (`*.xls`, `*.xlsx`, `*.pdf`) and `.env` files are strictly excluded from version control via `.gitignore`.

---

## Demo Data

A synthetic statement file is provided in the repository root for testing:
* [`transactions.csv`](file:///C:/Users/lvo/OneDrive/Desktop/Finsight/transactions.csv) — Contains 5 synthetic sample transactions.

> [!NOTE]
> Do not commit or upload real personal or business bank statements to public repositories.

---

## Current Scope & Limitations

* **Supported Formats**: Ingestion is currently optimized for standard CSV files and HDFC Bank `.xls` statement exports.
* **Single-User Ownership**: Financial accounts are owned by individual authenticated users (shared multi-user accounts are not currently modeled).

---

## Planned Future Enhancements

* **Additional Bank Parsers**: Native ingestion modules for ICICI, State Bank of India, and Axis Bank statements.
* **Budgeting Engine**: Monthly category spending limits, pacing alerts, and threshold tracking.
* **Savings Goal Tracker**: Target progress visualization, velocity calculations, and projected completion dates.
* **Export Engine**: Export curated transaction summaries and risk diagnostic reports as PDF / CSV.

---

## License

This project is open source and available under the [MIT License](LICENSE).
