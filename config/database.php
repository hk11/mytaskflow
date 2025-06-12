<?php
/**
 * データベース接続設定
 */

class Database {
    private $host = 'localhost';
    private $db_name = 'mytaskflow';
    private $username = 'dbadmin';  // 適宜変更してください
    private $password = 'password';      // 適宜変更してください
    private $charset = 'utf8mb4';
    public $connection;

    /**
     * データベース接続
     * @return PDO|null
     */
    public function getConnection() {
        $this->connection = null;

        try {
            $dsn = "mysql:host=" . $this->host . ";dbname=" . $this->db_name . ";charset=" . $this->charset;
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ];

            $this->connection = new PDO($dsn, $this->username, $this->password, $options);

        } catch(PDOException $e) {
            error_log("データベース接続エラー: " . $e->getMessage());
        }

        return $this->connection;
    }

    /**
     * 設定値取得（環境変数対応）
     */
    public function __construct() {
        // 環境変数がある場合はそちらを優先
        $this->host = $_ENV['DB_HOST'] ?? $this->host;
        $this->db_name = $_ENV['DB_NAME'] ?? $this->db_name;
        $this->username = $_ENV['DB_USER'] ?? $this->username;
        $this->password = $_ENV['DB_PASS'] ?? $this->password;
    }
}