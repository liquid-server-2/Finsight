# FinSight — Financial Intelligence & Risk Anomaly Engine

FinSight is a modern, privacy-first personal and business financial management platform. It combines automated bank statement parsing, rule-based categorization, cash flow intelligence, and a deterministic financial risk and anomaly engine.

---

## Key Features

* **Financial Overview & Dashboard**: Real-time monitoring of net cash flow, income, spending, and category distribution.
* **Deterministic Risk & Anomaly Engine**: Explainable, evidence-based statistical pattern detection (unusual transaction spikes, month-over-month spending surges, persistent cash flow deficits, discretionary exposure, and multi-month trajectories) with a 0–100 Stability Index score.
* **Bank Statement Import**: Native support for standard UTF-8 CSV statements and HDFC Bank `.xls` statement formats.
* **Smart Categorization & Merchant Rules**: Automated transaction categorizer with user-defined merchant overrides.
* **Multi-Account Architecture**: Manage and switch between multiple checking, savings, and investment accounts.
* **Session-Based Authentication**: Secure cookie-based JWT authentication with PBKDF2-SHA256 password hashing and cross-user data isolation.

---

## Tech Stack

* **Backend**:
  * [FastAPI](https://fastapi.tiangolo.com/) (Async web framework)
  * [PostgreSQL](https://www.postgresql.org/) / [SQLAlchemy 2.0](https://www.sqlalchemy.org/) (ORM & database access)
  * [Pydantic v2](https://docs.pydantic.dev/) (Data validation and response schemas)
  * [xlrd](https://github.com/python-excel/xlrd) (Excel `.xls` statement parser)
* **Frontend**:
  * [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
  * [Vite](https://vitejs.dev/) (Build tool and dev server)
  * Vanilla CSS with custom design tokens

---

## Project Structure

```text
Finsight/
├── .gitignore
├── README.md
├── transactions.csv             # Sample demo transaction dataset
│
├── Backend/
│   ├── .env.example             # Environment template
│   ├── requirements.txt         # Python dependencies
│   ├── app/
│   │   ├── main.py              # FastAPI application & endpoints
│   │   ├── database.py          # SQLAlchemy engine & session setup
│   │   ├── auth.py              # JWT authentication & password hashing
│   │   ├── analytics.py         # Financial analytics calculation
│   │   ├── risk.py              # Deterministic Risk & Anomaly Engine
│   │   ├── categorizer.py       # Rule-based auto-categorization
│   │   ├── hdfc_xls_parser.py   # HDFC Bank statement XLS parser
│   │   ├── models/              # SQLAlchemy database models
│   │   └── schemas/             # Pydantic request/response schemas
│   └── tests/                   # Unit, API, and regression test suites
│
└── Frontend/
    ├── package.json
    ├── vite.config.ts
    ├── src/
    │   ├── App.tsx              # App shell & routing
    │   ├── types.ts             # Domain type definitions
    │   ├── components/          # Sidebar, Modals
    │   ├── pages/               # Dashboard, Transactions, Accounts, Insights, Risk
    │   └── utils/               # Formatting utilities
    └── public/                  # Static assets
```

---

## Getting Started

### Prerequisites

* Python 3.11+
* Node.js 18+ and npm
* PostgreSQL (or compatible SQL database)

---

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd Backend
   ```

2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to configure your `DATABASE_URL` and `SECRET_KEY`.

5. Initialize the database schema:
   ```bash
   python -m app.init_db
   ```

6. Start the API server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   API documentation will be available at `http://127.0.0.1:8000/docs`.

---

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd Frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```
   The application will be accessible at `http://localhost:5173`.

---

## Running Tests

### Backend Tests

Run all unit, API, and regression tests:
```bash
cd Backend
python -m unittest discover tests
```

### Frontend Checks

Run ESLint and production build verification:
```bash
cd Frontend
npm run lint
npm run build
```

---

## Security & Privacy

* All financial analytics, categorization, and risk scoring are executed **deterministically in-engine** without transmitting financial records to third-party AI/LLM providers.
* Passwords are salted and hashed using PBKDF2-SHA256 with 600,000 iterations.
* All endpoints enforce account ownership verification to prevent cross-user data access.

---

## License

This project is licensed under the MIT License.
