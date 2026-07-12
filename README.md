# Adinexis CRM — MySQL + PHP + Blockchain Ledger Edition

A full CRM — sales pipeline, clients, projects, support tickets — backed by a real MySQL database on your own hosting, with user accounts, login security, and a blockchain-style tamper-proof audit ledger. Built for shared/cPanel hosting (like Hostinger, GoDaddy) — no Node.js, no special server access required, just PHP + MySQL, which virtually all hosting plans include.

## Project structure
```
adinexis-crm/
├── index.html            # App shell (login screen + CRM UI)
├── css/style.css
├── js/app.js              # Frontend logic — talks to the PHP API below
├── assets/logo-icon.png
├── setup.php              # One-time wizard to create your first admin account
├── schema.sql              # Import this into MySQL first
├── .htaccess               # Locks down includes/, disables directory listing
├── includes/
│   ├── config.php           # ← EDIT THIS: your MySQL credentials
│   ├── db.php                # DB connection + shared helpers
│   ├── session.php           # Login sessions, CSRF protection, access guards
│   ├── ledger.php            # The SHA-256 hash-chain engine
│   └── .htaccess             # Blocks all direct web access to this folder
└── api/
    ├── auth.php              # Login / logout / session check
    ├── leads.php, clients.php, projects.php, tickets.php
    ├── ledger.php             # List blocks / verify chain integrity
    ├── users.php              # Team management (admin only)
    └── backup.php             # Download a full JSON export
```

## 1. Create the database

In cPanel → **MySQL Databases**:
1. Create a database (e.g. `adinexis_crm`) — cPanel will prefix it with your account name automatically.
2. Create a database user with a strong password, and add it to that database with **All Privileges**.
3. Note the final database name, username, and password — cPanel usually shows them as `youraccount_adinexis_crm` and `youraccount_crmuser`.

## 2. Import the schema

In cPanel → **phpMyAdmin**:
1. Select your new database on the left.
2. Click **Import**, choose `schema.sql` from this project, and run it.
3. You should see 7 new tables: `users`, `access_log`, `clients`, `leads`, `projects`, `tickets`, `ledger`.

## 3. Configure the app

Open `includes/config.php` and fill in the 4 values from Step 1:
```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'youraccount_adinexis_crm');
define('DB_USER', 'youraccount_crmuser');
define('DB_PASS', 'the-password-you-set');
```
Also change `APP_SECRET` to any random long string.

## 4. Upload to adinexis.com

Via cPanel **File Manager** or FTP, upload the entire `adinexis-crm` folder into a subfolder of `public_html`, e.g.:
```
public_html/crm/
```
So the live app will be at `https://adinexis.com/crm/`.

## 5. Create your admin account

Visit **`https://adinexis.com/crm/setup.php`** once. Fill in your name, a username, and a password (min. 8 characters) — this becomes your first admin account. The page **permanently locks itself** after the first account is created, so it can't be reused to create rogue accounts later. After setup succeeds, you can delete `setup.php` from the server entirely if you want (optional — it's self-locking either way).

## 6. Log in

Go to `https://adinexis.com/crm/` and sign in with the account you just created.

---

## Security features

- **Passwords** are hashed with bcrypt (`password_hash()`), never stored in plain text.
- **Sessions** use HTTP-only cookies (invisible to JavaScript) and regenerate on every login to prevent session fixation.
- **CSRF tokens** are required on every data-changing request — a session-bound token issued at login, checked against every write.
- **Login lockout** — 5 failed attempts on a username within 15 minutes blocks further attempts temporarily.
- **Access log** — every login, logout, and failed login is recorded with IP address, browser, and timestamp (`access_log` table).
- **All API endpoints require authentication** — none of `api/*.php` work without a valid session.
- **Team/role management** is admin-only — staff accounts can't create other accounts or deactivate anyone.
- **`includes/` is fully blocked from direct web access** via `.htaccess`, so your DB credentials can never be fetched directly even if someone guesses the URL.
- **SQL injection protection** — every query uses prepared statements (PDO), nothing is string-concatenated into SQL.

## The blockchain ledger

Every meaningful action — new lead, stage change, payment marked done, client/project/ticket created or deleted, login, logout, team changes — is written as a **block** in the `ledger` table. Each block stores a SHA-256 hash of its own data plus the previous block's hash, computed server-side in PHP (`hash('sha256', ...)`). This forms a real hash chain tied to *who* did *what* and *when* (every block records the acting user).

Open the **Ledger** section in the CRM and click **Verify Chain** — the server recomputes every hash from scratch and tells you immediately if any record was altered outside the app (e.g. someone editing the database directly), and exactly which block it happened at.

This is genuine tamper-evidence — the same core mechanism blockchains use — running entirely on your own MySQL database. It is not a public/decentralized blockchain (no wallet, no gas fees, no external network) — that would be a much bigger, costlier build. This gives you the audit-trail guarantee without that overhead.

## Team accounts

Once logged in as admin, go to **Team** to add staff accounts. Each gets their own username/password; every action they take in the CRM is attributed to them by name in the ledger and dashboard activity feed. Admins can deactivate accounts (e.g. when someone leaves) without deleting their historical records — deactivated users simply can't log in anymore.

## Backups

The **Export** button (top right) downloads a complete JSON snapshot of all your data, including the full ledger, any time. Restoring a backup isn't exposed in the UI on purpose — overwriting a live, ledger-verified database can invalidate the audit trail's continuity. If you ever need to roll back, do it manually via phpMyAdmin's import tool with a full understanding that the ledger's history will reflect the restore point, not live edits after it.

## Troubleshooting

- **"Database connection failed"** → double-check the 4 values in `includes/config.php` against exactly what cPanel shows under MySQL Databases.
- **Blank page / 500 error** → check your hosting's PHP version is 7.4+ (cPanel → MultiPHP Manager). Check the site's error log in cPanel for the specific PHP error.
- **Login works but nothing loads** → open your browser's dev tools (F12) → Network tab, reload, and see which `api/*.php` request is failing and what it returns.
- **`setup.php` says it's locked but you have no working login** → in phpMyAdmin, browse the `users` table; you can either reset a password hash manually (generate one with an online bcrypt tool set to cost 10, or ask me) or delete the row and revisit `setup.php` to create a fresh one.
