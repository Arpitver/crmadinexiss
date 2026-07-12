<?php
// ============================================================
//  DATABASE CONFIG — edit these 4 lines with your cPanel/Hostinger
//  MySQL credentials (cPanel → MySQL Databases).
//  Typical cPanel format: DB name & user are prefixed with your
//  cPanel username, e.g. "adinexis_crm" / "adinexis_cmruser".
// ============================================================
define('DB_HOST', 'localhost');
define('DB_NAME', 'yourcpaneluser_adinexiscrm');
define('DB_USER', 'yourcpaneluser_dbuser');
define('DB_PASS', 'your-database-password');

// A random secret used to strengthen session security.
// Change this to any long random string before going live.
define('APP_SECRET', 'change-this-to-a-long-random-string-before-launch');
