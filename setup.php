<?php
require_once __DIR__ . '/includes/db.php';

// This page permanently disables itself once any user account exists,
// so it can't be used to create rogue accounts after go-live.
$existingCount = (int) $pdo->query("SELECT COUNT(*) AS c FROM users")->fetch()['c'];

$error = '';
$success = false;

if ($existingCount > 0) {
    $locked = true;
} else {
    $locked = false;
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $name = trim($_POST['name'] ?? '');
        $username = trim($_POST['username'] ?? '');
        $email = trim($_POST['email'] ?? '');
        $password = $_POST['password'] ?? '';
        $confirm = $_POST['confirm'] ?? '';

        if ($name === '' || $username === '' || $password === '') {
            $error = 'Name, username, and password are required.';
        } elseif (strlen($password) < 8) {
            $error = 'Password must be at least 8 characters.';
        } elseif ($password !== $confirm) {
            $error = 'Passwords do not match.';
        } else {
            $id = substr(bin2hex(random_bytes(6)), 0, 10);
            $hash = password_hash($password, PASSWORD_BCRYPT);
            $stmt = $pdo->prepare(
                "INSERT INTO users (id, name, username, email, password_hash, role, active, created_at)
                 VALUES (?,?,?,?,?, 'admin', 1, ?)"
            );
            $stmt->execute([$id, $name, $username, $email, $hash, (int) round(microtime(true)*1000)]);
            $success = true;
            $locked = true;
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Adinexis CRM — Setup</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body{font-family:-apple-system,Segoe UI,Inter,sans-serif; background:#0A0F1E; color:#0E1526; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0;}
  .card{background:#fff; border-radius:14px; padding:36px; width:400px; max-width:90vw; box-shadow:0 20px 60px rgba(0,0,0,0.35);}
  h1{font-size:19px; margin:0 0 6px;}
  p.sub{color:#64748B; font-size:13px; margin:0 0 22px;}
  label{font-size:12px; font-weight:600; color:#4B566B; display:block; margin:14px 0 6px;}
  input{width:100%; padding:10px 12px; border:1px solid #E1E5EE; border-radius:8px; font-size:14px; box-sizing:border-box;}
  button{width:100%; margin-top:22px; background:#2554E8; color:#fff; border:none; padding:12px; border-radius:8px; font-weight:600; font-size:14px; cursor:pointer;}
  .msg{padding:12px 14px; border-radius:8px; font-size:13px; margin-bottom:6px;}
  .msg.error{background:#FBE7E7; color:#DC2626;}
  .msg.success{background:#E3F7EF; color:#17A673;}
  .msg.info{background:#E4EAFE; color:#1B3FBD;}
  a{color:#2554E8; font-weight:600; text-decoration:none;}
</style>
</head>
<body>
<div class="card">
  <h1>Adinexis CRM Setup</h1>
  <p class="sub">Create the first administrator account. This page disables itself after this step.</p>

  <?php if ($success): ?>
    <div class="msg success">Admin account created. This setup page is now locked.</div>
    <p style="font-size:13px; margin-top:16px;"><a href="index.html">Go to the CRM login →</a></p>
  <?php elseif ($locked): ?>
    <div class="msg info">Setup has already been completed. Delete this file (setup.php) from your server for security, or leave it — it will always refuse to create more accounts.</div>
    <p style="font-size:13px; margin-top:16px;"><a href="index.html">Go to the CRM login →</a></p>
  <?php else: ?>
    <?php if ($error): ?><div class="msg error"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <form method="POST">
      <label>Full name</label>
      <input type="text" name="name" required>
      <label>Username</label>
      <input type="text" name="username" required autocomplete="off">
      <label>Email (optional)</label>
      <input type="email" name="email">
      <label>Password (min 8 characters)</label>
      <input type="password" name="password" required minlength="8">
      <label>Confirm password</label>
      <input type="password" name="confirm" required minlength="8">
      <button type="submit">Create Admin Account</button>
    </form>
  <?php endif; ?>
</div>
</body>
</html>
