<?php
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/session.php';
require_once __DIR__ . '/../includes/ledger.php';

$user = requireAuth();
$method = $_SERVER['REQUEST_METHOD'];

function clientNameForTicket(PDO $pdo, $clientId): string {
    if (!$clientId) return '—';
    $stmt = $pdo->prepare("SELECT name FROM clients WHERE id = ?");
    $stmt->execute([$clientId]);
    $row = $stmt->fetch();
    return $row ? $row['name'] : '—';
}

if ($method === 'GET') {
    $rows = $pdo->query("SELECT * FROM tickets ORDER BY created_at DESC")->fetchAll();
    echo json_encode($rows);
    exit;
}

if ($method === 'POST') {
    verifyCsrfToken();
    $data = input();
    $op = $data['_op'] ?? 'create';

    if ($op === 'create') {
        $subject = trim($data['subject'] ?? '');
        $clientId = $data['clientId'] ?? '';
        if ($subject === '' || !$clientId) jsonError(400, 'Subject and client are required.');
        $id = uid();
        $now = (int) round(microtime(true) * 1000);
        $stmt = $pdo->prepare(
            "INSERT INTO tickets (id,subject,client_id,priority,status,description,created_by,created_at)
             VALUES (?,?,?,?,?,?,?,?)"
        );
        $stmt->execute([$id, $subject, $clientId, $data['priority'] ?? 'Low', $data['status'] ?? 'Open', $data['description'] ?? '', $user['id'], $now]);
        addLedgerBlock($pdo, 'ticket', 'New ticket opened: ' . $subject, ['client' => clientNameForTicket($pdo, $clientId), 'priority' => $data['priority'] ?? 'Low']);
        echo json_encode(['ok' => true, 'id' => $id]);
        exit;
    }

    if ($op === 'update') {
        $id = $data['id'] ?? '';
        $subject = trim($data['subject'] ?? '');
        $clientId = $data['clientId'] ?? '';
        if (!$id || $subject === '' || !$clientId) jsonError(400, 'Missing ticket id, subject, or client.');
        $stmt = $pdo->prepare("UPDATE tickets SET subject=?,client_id=?,priority=?,status=?,description=? WHERE id=?");
        $stmt->execute([$subject, $clientId, $data['priority'] ?? 'Low', $data['status'] ?? 'Open', $data['description'] ?? '', $id]);
        addLedgerBlock($pdo, 'ticket', 'Ticket updated: ' . $subject, ['client' => clientNameForTicket($pdo, $clientId), 'status' => $data['status'] ?? 'Open']);
        echo json_encode(['ok' => true]);
        exit;
    }

    if ($op === 'delete') {
        $id = $data['id'] ?? '';
        if (!$id) jsonError(400, 'Missing ticket id.');
        $existing = $pdo->prepare("SELECT subject FROM tickets WHERE id = ?");
        $existing->execute([$id]);
        $old = $existing->fetch();
        $pdo->prepare("DELETE FROM tickets WHERE id = ?")->execute([$id]);
        addLedgerBlock($pdo, 'system', 'Ticket deleted: ' . ($old['subject'] ?? $id), ['table' => 'tickets']);
        echo json_encode(['ok' => true]);
        exit;
    }

    jsonError(400, 'Unknown operation.');
}

jsonError(405, 'Method not allowed.');
