<?php
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/session.php';
require_once __DIR__ . '/../includes/ledger.php';

$user = requireAuth();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $rows = $pdo->query("SELECT * FROM leads ORDER BY created_at DESC")->fetchAll();
    echo json_encode($rows);
    exit;
}

if ($method === 'POST') {
    verifyCsrfToken();
    $data = input();
    $op = $data['_op'] ?? 'create';

    if ($op === 'create') {
        $name = trim($data['name'] ?? '');
        if ($name === '') jsonError(400, 'Contact name is required.');
        $id = uid();
        $now = (int) round(microtime(true) * 1000);
        $stage = $data['stage'] ?? 'new';
        $wonAt = ($stage === 'won') ? $now : null;

        $stmt = $pdo->prepare(
            "INSERT INTO leads (id,name,company,email,value,stage,payment_status,notes,won_at,created_by,created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)"
        );
        $stmt->execute([
            $id, $name, $data['company'] ?? '', $data['email'] ?? '', $data['value'] ?? 0,
            $stage, $data['paymentStatus'] ?? 'pending', $data['notes'] ?? '', $wonAt, $user['id'], $now,
        ]);

        addLedgerBlock($pdo, 'lead', 'New lead added: ' . $name, ['company' => $data['company'] ?: '—', 'stage' => $stage]);
        if (($data['paymentStatus'] ?? '') === 'done') {
            addLedgerBlock($pdo, 'payment', 'Payment marked done: ' . $name, ['value' => $data['value'] ?? 0]);
        }
        echo json_encode(['ok' => true, 'id' => $id]);
        exit;
    }

    if ($op === 'update') {
        $id = $data['id'] ?? '';
        $name = trim($data['name'] ?? '');
        if (!$id || $name === '') jsonError(400, 'Missing lead id or name.');

        $existing = $pdo->prepare("SELECT * FROM leads WHERE id = ?");
        $existing->execute([$id]);
        $old = $existing->fetch();
        if (!$old) jsonError(404, 'Lead not found.');

        $stage = $data['stage'] ?? $old['stage'];
        $wonAt = $old['won_at'];
        if ($stage === 'won' && !$wonAt) $wonAt = (int) round(microtime(true) * 1000);

        $stmt = $pdo->prepare(
            "UPDATE leads SET name=?,company=?,email=?,value=?,stage=?,payment_status=?,notes=?,won_at=? WHERE id=?"
        );
        $stmt->execute([
            $name, $data['company'] ?? '', $data['email'] ?? '', $data['value'] ?? 0,
            $stage, $data['paymentStatus'] ?? 'pending', $data['notes'] ?? '', $wonAt, $id,
        ]);

        $label = ($old['stage'] !== $stage && count($data) <= 3)
            ? "Stage changed: {$name} → {$stage}"
            : 'Lead updated: ' . $name;
        addLedgerBlock($pdo, 'lead', $label, ['stage' => $stage]);

        if (($data['paymentStatus'] ?? '') === 'done' && $old['payment_status'] !== 'done') {
            addLedgerBlock($pdo, 'payment', 'Payment marked done: ' . $name, ['value' => $data['value'] ?? 0]);
        }
        echo json_encode(['ok' => true]);
        exit;
    }

    if ($op === 'delete') {
        $id = $data['id'] ?? '';
        if (!$id) jsonError(400, 'Missing lead id.');
        $existing = $pdo->prepare("SELECT name FROM leads WHERE id = ?");
        $existing->execute([$id]);
        $old = $existing->fetch();
        $pdo->prepare("DELETE FROM leads WHERE id = ?")->execute([$id]);
        addLedgerBlock($pdo, 'system', 'Lead deleted: ' . ($old['name'] ?? $id), ['table' => 'leads']);
        echo json_encode(['ok' => true]);
        exit;
    }

    jsonError(400, 'Unknown operation.');
}

jsonError(405, 'Method not allowed.');
