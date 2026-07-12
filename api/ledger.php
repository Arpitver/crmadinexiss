<?php
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/session.php';
require_once __DIR__ . '/../includes/ledger.php';

requireAuth();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

if ($method === 'GET' && $action === 'list') {
    $rows = $pdo->query("SELECT * FROM ledger ORDER BY block_index ASC")->fetchAll();
    foreach ($rows as &$r) {
        $r['details'] = json_decode($r['details'], true) ?: new stdClass();
    }
    echo json_encode($rows);
    exit;
}

if ($method === 'GET' && $action === 'verify') {
    $rows = $pdo->query("SELECT * FROM ledger ORDER BY block_index ASC")->fetchAll();
    $brokenAt = null;
    $expectedPrev = str_repeat('0', 64);

    foreach ($rows as $r) {
        $detailsObj = json_decode($r['details'], true) ?: new stdClass();
        $recomputed = computeBlockHash((int)$r['block_index'], (int)$r['timestamp'], $r['type'], $r['action'], $r['actor'], $detailsObj, $expectedPrev);
        if ($r['prev_hash'] !== $expectedPrev || $r['hash'] !== $recomputed) {
            $brokenAt = (int)$r['block_index'];
            break;
        }
        $expectedPrev = $r['hash'];
    }

    echo json_encode(['ok' => $brokenAt === null, 'brokenAt' => $brokenAt, 'totalBlocks' => count($rows)]);
    exit;
}

jsonError(404, 'Unknown ledger action.');
