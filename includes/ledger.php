<?php
// SHA-256 hash-chain ledger. Every block hashes its own data plus the previous
// block's hash — the same core idea a blockchain uses to make history tamper-evident.

function computeBlockHash($index, $timestamp, $type, $action, $actor, $details, $prevHash): string {
    $payload = json_encode([
        'index' => (int)$index,
        'timestamp' => (int)$timestamp,
        'type' => $type,
        'action' => $action,
        'actor' => $actor,
        'details' => $details,
        'prevHash' => $prevHash,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    return hash('sha256', $payload);
}

function addLedgerBlock(PDO $pdo, string $type, string $action, $details = null, ?string $actor = null): array {
    if ($actor === null) {
        $user = currentUser();
        $actor = $user ? $user['username'] : 'system';
    }
    $prevRow = $pdo->query("SELECT block_index, hash FROM ledger ORDER BY block_index DESC LIMIT 1")->fetch();
    $prevHash = $prevRow ? $prevRow['hash'] : str_repeat('0', 64);
    $index = $prevRow ? ((int)$prevRow['block_index'] + 1) : 0;
    $timestamp = (int) round(microtime(true) * 1000);
    $detailsObj = $details ?: new stdClass();

    $hash = computeBlockHash($index, $timestamp, $type, $action, $actor, $detailsObj, $prevHash);

    $stmt = $pdo->prepare(
        "INSERT INTO ledger (block_index, timestamp, type, action, actor, details, prev_hash, hash)
         VALUES (?,?,?,?,?,?,?,?)"
    );
    $stmt->execute([$index, $timestamp, $type, $action, $actor, json_encode($detailsObj), $prevHash, $hash]);

    return [
        'index' => $index, 'timestamp' => $timestamp, 'type' => $type, 'action' => $action,
        'actor' => $actor, 'details' => $detailsObj, 'prevHash' => $prevHash, 'hash' => $hash,
    ];
}
