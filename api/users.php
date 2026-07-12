<?php
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/session.php';
require_once __DIR__ . '/../includes/ledger.php';

$user = requireAuth();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    // Any logged-in user can see the team list (no password data included).
    $rows = $pdo->query("SELECT id, name, username, email, role, active, created_at, last_login FROM users ORDER BY created_at ASC")->fetchAll();
    echo json_encode($rows);
    exit;
}

if ($method === 'POST') {
    verifyCsrfToken();
    requireAdmin(); // only admins can create/deactivate accounts
    $data = input();
    $op = $data['_op'] ?? 'create';

    if ($op === 'create') {
        $name = trim($data['name'] ?? '');
        $username = trim($data['username'] ?? '');
        $password = $data['password'] ?? '';
        if ($name === '' || $username === '' || strlen($password) < 8) {
            jsonError(400, 'Name, username, and an 8+ character password are required.');
        }
        $existing = $pdo->prepare("SELECT id FROM users WHERE username = ?");
        $existing->execute([$username]);
        if ($existing->fetch()) jsonError(409, 'That username is already taken.');

        $id = uid();
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $role = ($data['role'] ?? 'staff') === 'admin' ? 'admin' : 'staff';
        $stmt = $pdo->prepare(
            "INSERT INTO users (id,name,username,email,password_hash,role,active,created_at) VALUES (?,?,?,?,?,?,1,?)"
        );
        $stmt->execute([$id, $name, $username, $data['email'] ?? '', $hash, $role, (int) round(microtime(true)*1000)]);
        addLedgerBlock($pdo, 'system', "Team member added: {$name} ({$role})", ['username' => $username]);
        echo json_encode(['ok' => true, 'id' => $id]);
        exit;
    }

    if ($op === 'toggle_active') {
        $id = $data['id'] ?? '';
        if (!$id) jsonError(400, 'Missing user id.');
        if ($id === $user['id']) jsonError(400, "You can't deactivate your own account.");
        $existing = $pdo->prepare("SELECT name, active FROM users WHERE id = ?");
        $existing->execute([$id]);
        $target = $existing->fetch();
        if (!$target) jsonError(404, 'User not found.');
        $newActive = $target['active'] ? 0 : 1;
        $pdo->prepare("UPDATE users SET active = ? WHERE id = ?")->execute([$newActive, $id]);
        addLedgerBlock($pdo, 'system', ($newActive ? 'Team member reactivated: ' : 'Team member deactivated: ') . $target['name'], []);
        echo json_encode(['ok' => true]);
        exit;
    }

    jsonError(400, 'Unknown operation.');
}

jsonError(405, 'Method not allowed.');
