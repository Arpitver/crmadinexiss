<?php
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/session.php';
require_once __DIR__ . '/../includes/ledger.php';

$user = requireAuth();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $out = [
        'leads' => $pdo->query("SELECT * FROM leads")->fetchAll(),
        'clients' => $pdo->query("SELECT * FROM clients")->fetchAll(),
        'projects' => $pdo->query("SELECT * FROM projects")->fetchAll(),
        'tickets' => $pdo->query("SELECT * FROM tickets")->fetchAll(),
        'ledger' => $pdo->query("SELECT * FROM ledger ORDER BY block_index ASC")->fetchAll(),
        'exportedAt' => date('c'),
    ];
    header('Content-Disposition: attachment; filename="adinexis-crm-backup-' . date('Y-m-d') . '.json"');
    echo json_encode($out, JSON_PRETTY_PRINT);
    exit;
}

jsonError(405, 'Use GET to export. Import is intentionally not exposed here — restoring a backup ' .
    'over a live, ledger-verified database can silently invalidate the audit trail. ' .
    'Restore manually via phpMyAdmin if you truly need to roll back.');
