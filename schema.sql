-- Adinexis CRM — MySQL schema
-- Import this via phpMyAdmin (cPanel → phpMyAdmin → your database → Import)

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(255) DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'staff',   -- 'admin' or 'staff'
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  last_login BIGINT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Every login, logout, and failed login attempt — for security review.
CREATE TABLE IF NOT EXISTS access_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(20) NULL,
  username VARCHAR(100) NOT NULL,
  action VARCHAR(30) NOT NULL,        -- 'login', 'logout', 'failed_login'
  ip_address VARCHAR(64) NOT NULL,
  user_agent VARCHAR(255) DEFAULT '',
  created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS clients (
  id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) DEFAULT '',
  phone VARCHAR(50) DEFAULT '',
  address VARCHAR(255) DEFAULT '',
  notes TEXT,
  created_by VARCHAR(20) NULL,
  created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS leads (
  id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  company VARCHAR(255) DEFAULT '',
  email VARCHAR(255) DEFAULT '',
  value DECIMAL(14,2) DEFAULT 0,
  stage VARCHAR(30) DEFAULT 'new',
  payment_status VARCHAR(20) DEFAULT 'pending',
  notes TEXT,
  won_at BIGINT NULL,
  created_by VARCHAR(20) NULL,
  created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  client_id VARCHAR(20) NULL,
  status VARCHAR(30) DEFAULT 'Planning',
  deadline DATE NULL,
  progress INT DEFAULT 0,
  notes TEXT,
  created_by VARCHAR(20) NULL,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tickets (
  id VARCHAR(20) PRIMARY KEY,
  subject VARCHAR(255) NOT NULL,
  client_id VARCHAR(20) NULL,
  priority VARCHAR(20) DEFAULT 'Low',
  status VARCHAR(30) DEFAULT 'Open',
  description TEXT,
  created_by VARCHAR(20) NULL,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The blockchain-style hash chain. Each row is a "block": its hash covers its own
-- data plus the previous block's hash, so any edit outside the app is detectable.
-- Every block also records which logged-in user performed the action.
CREATE TABLE IF NOT EXISTS ledger (
  block_index INT PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  type VARCHAR(20) NOT NULL,
  action VARCHAR(500) NOT NULL,
  actor VARCHAR(100) DEFAULT 'system',
  details TEXT,
  prev_hash CHAR(64) NOT NULL,
  hash CHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
