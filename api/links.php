<?php
/**
 * リンク管理API
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

require_once '../config/database.php';

try {
    $database = new Database();
    $db = $database->getConnection();

    if (!$db) {
        throw new Exception('データベース接続に失敗しました');
    }

    $method = $_SERVER['REQUEST_METHOD'];

    switch ($method) {
        case 'GET':
            getLinks($db);
            break;
        case 'POST':
            createLink($db);
            break;
        case 'PUT':
            updateLink($db);
            break;
        case 'DELETE':
            deleteLink($db);
            break;
        default:
            http_response_code(405);
            echo json_encode(['error' => 'メソッドが許可されていません']);
            break;
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

/**
 * リンク一覧取得
 */
function getLinks($db) {
    $linkable_type = $_GET['linkable_type'] ?? null;
    $linkable_id = $_GET['linkable_id'] ?? null;

    if (!$linkable_type || !$linkable_id) {
        http_response_code(400);
        echo json_encode(['error' => 'linkable_typeとlinkable_idが必要です']);
        return;
    }

    try {
        $sql = "SELECT * FROM links WHERE linkable_type = :linkable_type AND linkable_id = :linkable_id ORDER BY display_order ASC";
        $stmt = $db->prepare($sql);
        $stmt->bindParam(':linkable_type', $linkable_type);
        $stmt->bindParam(':linkable_id', $linkable_id, PDO::PARAM_INT);
        $stmt->execute();

        $links = $stmt->fetchAll();

        echo json_encode([
            'success' => true,
            'links' => $links
        ]);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'error' => 'データベースエラー',
            'message' => $e->getMessage()
        ]);
    }
}

/**
 * リンク作成
 */
function createLink($db) {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input) {
        http_response_code(400);
        echo json_encode(['error' => '無効なJSONデータです']);
        return;
    }

    try {
        // 必須フィールドチェック
        $required_fields = ['linkable_type', 'linkable_id', 'name', 'url'];
        foreach ($required_fields as $field) {
            if (empty($input[$field])) {
                http_response_code(400);
                echo json_encode(['error' => "必須フィールド '{$field}' が不足しています"]);
                return;
            }
        }

        // linkable_typeの妥当性チェック
        if (!in_array($input['linkable_type'], ['project', 'task'])) {
            http_response_code(400);
            echo json_encode(['error' => 'linkable_typeは project または task である必要があります']);
            return;
        }

        // 次の表示順序を取得
        $display_order_sql = "SELECT COALESCE(MAX(display_order), 0) + 1 as next_order FROM links WHERE linkable_type = :linkable_type AND linkable_id = :linkable_id";
        $display_order_stmt = $db->prepare($display_order_sql);
        $display_order_stmt->bindParam(':linkable_type', $input['linkable_type']);
        $display_order_stmt->bindParam(':linkable_id', $input['linkable_id'], PDO::PARAM_INT);
        $display_order_stmt->execute();
        $next_order = $display_order_stmt->fetch()['next_order'];

        // リンク挿入
        $sql = "INSERT INTO links (linkable_type, linkable_id, name, url, display_order) VALUES (:linkable_type, :linkable_id, :name, :url, :display_order)";
        $stmt = $db->prepare($sql);
        $stmt->bindParam(':linkable_type', $input['linkable_type']);
        $stmt->bindParam(':linkable_id', $input['linkable_id'], PDO::PARAM_INT);
        $stmt->bindParam(':name', $input['name']);
        $stmt->bindParam(':url', $input['url']);
        $stmt->bindParam(':display_order', $next_order, PDO::PARAM_INT);

        $stmt->execute();

        $link_id = $db->lastInsertId();

        echo json_encode([
            'success' => true,
            'message' => 'リンクが作成されました',
            'link_id' => $link_id
        ]);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'error' => 'データベースエラー',
            'message' => $e->getMessage()
        ]);
    }
}

/**
 * リンク更新
 */
function updateLink($db) {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input || empty($input['id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'リンクIDが必要です']);
        return;
    }

    try {
        // リンク存在確認
        $check_sql = "SELECT id FROM links WHERE id = :id";
        $check_stmt = $db->prepare($check_sql);
        $check_stmt->bindParam(':id', $input['id'], PDO::PARAM_INT);
        $check_stmt->execute();

        if (!$check_stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'リンクが見つかりません']);
            return;
        }

        // 更新SQL構築
        $fields = [];
        $params = [':id' => $input['id']];

        $allowed_fields = ['name', 'url'];

        foreach ($allowed_fields as $field) {
            if (isset($input[$field])) {
                $fields[] = "{$field} = :{$field}";
                $params[":{$field}"] = $input[$field];
            }
        }

        if (empty($fields)) {
            http_response_code(400);
            echo json_encode(['error' => '更新するフィールドがありません']);
            return;
        }

        $sql = "UPDATE links SET " . implode(', ', $fields) . " WHERE id = :id";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        echo json_encode([
            'success' => true,
            'message' => 'リンクが更新されました'
        ]);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'error' => 'データベースエラー',
            'message' => $e->getMessage()
        ]);
    }
}

/**
 * リンク削除
 */
function deleteLink($db) {
    $link_id = $_GET['id'] ?? null;

    if (!$link_id) {
        http_response_code(400);
        echo json_encode(['error' => 'リンクIDが必要です']);
        return;
    }

    try {
        // リンク存在確認
        $check_sql = "SELECT id FROM links WHERE id = :id";
        $check_stmt = $db->prepare($check_sql);
        $check_stmt->bindParam(':id', $link_id, PDO::PARAM_INT);
        $check_stmt->execute();

        if (!$check_stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'リンクが見つかりません']);
            return;
        }

        // リンク削除
        $sql = "DELETE FROM links WHERE id = :id";
        $stmt = $db->prepare($sql);
        $stmt->bindParam(':id', $link_id, PDO::PARAM_INT);
        $stmt->execute();

        echo json_encode([
            'success' => true,
            'message' => 'リンクが削除されました'
        ]);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'error' => 'データベースエラー',
            'message' => $e->getMessage()
        ]);
    }
}
?>