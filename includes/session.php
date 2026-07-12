<?php
require_once __DIR__ . '/db.php';

// ---- Secure session bootstrap ----
if (session_status() === PHP_SESSION_NONE) {
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $isHttps,   // cookie only sent over HTTPS once your site has SSL
        'httponly' => true,     // JavaScript cannot read the session cookie
        'samesite' => 'Lax',
    ]);
    session_start();
}

function currentUser(): ?array {
    if (empty($_SESSION['user_id'])) return null;
    return [
        'id' => $_SESSION['user_id'],
        'name' => $_SESSION['user_name'],
        'username' => $_SESSION['username'],
        'role' => $_SESSION['role'],
    ];
}

// Every API endpoint that touches CRM data calls this first.
function requireAuth(): array {
    $user = currentUser();
    if (!$user) {
        jsonError(401, 'Not authenticated. Please log in.');
    }
    return $user;
}

function requireAdmin(): array {
    $user = requireAuth();
    if ($user['role'] !== 'admin') {
        jsonError(403, 'This action requires an administrator account.');
    }
    return $user;
}

// ---- CSRF protection for state-changing requests ----
function issueCsrfToken(): string {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function verifyCsrfToken(): void {
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $expected = $_SESSION['csrf_token'] ?? '';
    if (empty($expected) || !hash_equals($expected, $sent)) {
        jsonError(403, 'Invalid or missing security token. Please refresh and try again.');
    }
}
