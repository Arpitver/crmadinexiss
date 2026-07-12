<?php
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/session.php';
require_once __DIR__ . '/../includes/ledger.php';

$user = requireAuth();
$method = $_SERVER['REQUEST_METHOD'];

function clientNameFor(PDO $pdo, $clientId): string {
    if (!$clientId) return '—';
    $stmt = $pdo->prepare("SELECT name FROM clients WHERE id = ?");
    $stmt->execute([$clientId]);
    $row = $stmt->fetch();
    return $row ? $row['name'] : '—';
}

if ($method === 'GET') {
    $rows = $pdo->query("SELECT * FROM projects ORDER BY created_at DESC")->fetchAll();
    echo json_encode($rows);
    exit;
}

if ($method === 'POST') {
    verifyCsrfToken();
    $data = input();
    $op = $data['_op'] ?? 'create';

    if ($op === 'create') {
        $name = trim($data['name'] ?? '');
        $clientId = $data['clientId'] ?? '';
        if ($name === '' || !$clientId) jsonError(400, 'Project name and client are required.');
        $id = uid();
        $now = (int) round(microtime(true) * 1000);
        $stmt = $pdo->prepare(
            "INSERT INTO projects (id,name,client_id,status,deadline,progress,notes,created_by,created_at)
             VALUES (?,?,?,?,?,?,?,?,?)"
        );
        $stmt->execute([
            $id, $name, $clientId, $data['status'] ?? 'Planning',
            $data['deadline'] ?: null, $data['progress'] ?? 0, $data['notes'] ?? '', $user['id'], $now,
        ]);
        addLedgerBlock($pdo, 'project', 'New project added: ' . $name, ['client' => clientNameFor($pdo, $clientId), 'status' => $data['status'] ?? 'Planning']);
        echo json_encode(['ok' => true, 'id' => $id]);
        exit;
    }

    if ($op === 'update') {
        $id = $data['id'] ?? '';
        $name = trim($data['name'] ?? '');
        $clientId = $data['clientId'] ?? '';
        if (!$id || $name === '' || !$clientId) jsonError(400, 'Missing project id, name, or client.');
        $stmt = $pdo->prepare("UPDATE projects SET name=?,client_id=?,status=?,deadline=?,progress=?,notes=? WHERE id=?");
        $stmt->execute([$name, $clientId, $data['status'] ?? 'Planning', $data['deadline'] ?: null, $data['progress'] ?? 0, $data['notes'] ?? '', $id]);
        addLedgerBlock($pdo, 'project', 'Project updated: ' . $name, ['client' => clientNameFor($pdo, $clientId), 'status' => $data['status'] ?? 'Planning']);
        echo json_encode(['ok' => true]);
        exit;
    }

    if ($op === 'delete') {
        $id = $data['id'] ?? '';
        if (!$id) jsonError(400, 'Missing project id.');
        $existing = $pdo->prepare("SELECT name FROM projects WHERE id = ?");
        $existing->execute([$id]);
        $old = $existing->fetch();
        $pdo->prepare("DELETE FROM projects WHERE id = ?")->execute([$id]);
        addLedgerBlock($pdo, 'system', 'Project deleted: ' . ($old['name'] ?? $id), ['table' => 'projects']);
        echo json_encode(['ok' => true]);
        exit;
    }

    jsonError(400, 'Unknown operation.');
}

jsonError(405, 'Method not allowed.');
