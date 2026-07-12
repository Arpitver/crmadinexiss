<?php
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/session.php';
require_once __DIR__ . '/../includes/ledger.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

function logAccess(PDO $pdo, ?string $userId, string $username, string $action): void {
    $stmt = $pdo->prepare(
        "INSERT INTO access_log (user_id, username, action, ip_address, user_agent, created_at)
         VALUES (?,?,?,?,?,?)"
    );
    $stmt->execute([
        $userId, $username, $action, clientIp(),
        substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255),
        (int) round(microtime(true) * 1000),
    ]);
}

// ---- GET ?action=check — is there a valid session? ----
if ($method === 'GET' && $action === 'check') {
    $user = currentUser();
    echo json_encode([
        'authenticated' => (bool)$user,
        'user' => $user,
        'csrfToken' => $user ? issueCsrfToken() : null,
    ]);
    exit;
}

// ---- POST ?action=login ----
if ($method === 'POST' && $action === 'login') {
    $data = input();
    $username = trim($data['username'] ?? '');
    $password = $data['password'] ?? '';

    if ($username === '' || $password === '') {
        jsonError(400, 'Username and password are required.');
    }

    // Lockout: 5 failed attempts for this username within 15 minutes.
    $windowStart = (int) round((microtime(true) - 15 * 60) * 1000);
    $countStmt = $pdo->prepare(
        "SELECT COUNT(*) AS c FROM access_log
         WHERE username = ? AND action = 'failed_login' AND created_at > ?"
    );
    $countStmt->execute([$username, $windowStart]);
    if ((int)$countStmt->fetch()['c'] >= 5) {
        jsonError(429, 'Too many failed attempts. Please wait 15 minutes and try again.');
    }

    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ? LIMIT 1");
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || !$user['active'] || !password_verify($password, $user['password_hash'])) {
        logAccess($pdo, $user['id'] ?? null, $username, 'failed_login');
        jsonError(401, 'Invalid username or password.');
    }

    // Prevent session fixation.
    session_regenerate_id(true);
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['user_name'] = $user['name'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['role'] = $user['role'];

    $pdo->prepare("UPDATE users SET last_login = ? WHERE id = ?")
        ->execute([(int) round(microtime(true) * 1000), $user['id']]);

    logAccess($pdo, $user['id'], $user['username'], 'login');
    addLedgerBlock($pdo, 'auth', $user['name'] . ' logged in', ['role' => $user['role']], $user['username']);

    echo json_encode([
        'ok' => true,
        'user' => ['id'=>$user['id'],'name'=>$user['name'],'username'=>$user['username'],'role'=>$user['role']],
        'csrfToken' => issueCsrfToken(),
    ]);
    exit;
}

// ---- POST ?action=logout ----
if ($method === 'POST' && $action === 'logout') {
    $user = currentUser();
    if ($user) {
        logAccess($pdo, $user['id'], $user['username'], 'logout');
        addLedgerBlock($pdo, 'auth', $user['name'] . ' logged out', [], $user['username']);
    }
    $_SESSION = [];
    session_destroy();
    echo json_encode(['ok' => true]);
    exit;
}

jsonError(404, 'Unknown auth action.');
