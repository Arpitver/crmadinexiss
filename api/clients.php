<?php
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/session.php';
require_once __DIR__ . '/../includes/ledger.php';

$user = requireAuth();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $rows = $pdo->query("SELECT * FROM clients ORDER BY created_at DESC")->fetchAll();
    echo json_encode($rows);
    exit;
}

if ($method === 'POST') {
    verifyCsrfToken();
    $data = input();
    $op = $data['_op'] ?? 'create';

    if ($op === 'create') {
        $name = trim($data['name'] ?? '');
        if ($name === '') jsonError(400, 'Client name is required.');
        $id = uid();
        $now = (int) round(microtime(true) * 1000);
        $stmt = $pdo->prepare(
            "INSERT INTO clients (id,name,email,phone,address,notes,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)"
        );
        $stmt->execute([$id, $name, $data['email'] ?? '', $data['phone'] ?? '', $data['address'] ?? '', $data['notes'] ?? '', $user['id'], $now]);
        addLedgerBlock($pdo, 'client', 'New client added: ' . $name, ['email' => $data['email'] ?: '—']);
        echo json_encode(['ok' => true, 'id' => $id]);
        exit;
    }

    if ($op === 'update') {
        $id = $data['id'] ?? '';
        $name = trim($data['name'] ?? '');
        if (!$id || $name === '') jsonError(400, 'Missing client id or name.');
        $stmt = $pdo->prepare("UPDATE clients SET name=?,email=?,phone=?,address=?,notes=? WHERE id=?");
        $stmt->execute([$name, $data['email'] ?? '', $data['phone'] ?? '', $data['address'] ?? '', $data['notes'] ?? '', $id]);
        addLedgerBlock($pdo, 'client', 'Client updated: ' . $name, ['email' => $data['email'] ?: '—']);
        echo json_encode(['ok' => true]);
        exit;
    }

    if ($op === 'delete') {
        $id = $data['id'] ?? '';
        if (!$id) jsonError(400, 'Missing client id.');
        $existing = $pdo->prepare("SELECT name FROM clients WHERE id = ?");
        $existing->execute([$id]);
        $old = $existing->fetch();
        $pdo->prepare("DELETE FROM clients WHERE id = ?")->execute([$id]);
        addLedgerBlock($pdo, 'system', 'Client deleted: ' . ($old['name'] ?? $id), ['table' => 'clients']);
        echo json_encode(['ok' => true]);
        exit;
    }

    jsonError(400, 'Unknown operation.');
}

jsonError(405, 'Method not allowed.');
