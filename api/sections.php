<?php
/**
 * セクション管理API
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
            getSections($db);
            break;
        case 'POST':
            createSection($db);
            break;
        case 'PUT':
            updateSection($db);
            break;
        case 'DELETE':
            deleteSection($db);
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
 * セクション一覧取得
 */
function getSections($db) {
    $project_id = $_GET['project_id'] ?? 1;

    try {
        $sql = "SELECT * FROM sections WHERE project_id = :project_id ORDER BY display_order ASC";
        $stmt = $db->prepare($sql);
        $stmt->bindValue(':project_id', $project_id, PDO::PARAM_INT);
        $stmt->execute();

        $sections = $stmt->fetchAll();

        echo json_encode([
            'success' => true,
            'sections' => $sections
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
 * セクション作成
 */
function createSection($db) {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input) {
        http_response_code(400);
        echo json_encode(['error' => '無効なJSONデータです']);
        return;
    }

    try {
        // 必須フィールドチェック
        $required_fields = ['name', 'project_id'];
        foreach ($required_fields as $field) {
            if (empty($input[$field])) {
                http_response_code(400);
                echo json_encode(['error' => "必須フィールド '{$field}' が不足しています"]);
                return;
            }
        }

        // 次の表示順序を取得
        $display_order_sql = "SELECT COALESCE(MAX(display_order), 0) + 1 as next_order FROM sections WHERE project_id = :project_id";
        $display_order_stmt = $db->prepare($display_order_sql);
        $display_order_stmt->bindValue(':project_id', $input['project_id'], PDO::PARAM_INT);
        $display_order_stmt->execute();
        $next_order = $display_order_stmt->fetch()['next_order'];

        // セクション挿入
        $sql = "INSERT INTO sections (project_id, name, icon, display_order) VALUES (:project_id, :name, :icon, :display_order)";
        $stmt = $db->prepare($sql);
        $stmt->bindValue(':project_id', $input['project_id'], PDO::PARAM_INT);
        $stmt->bindValue(':name', $input['name']);
        $stmt->bindValue(':icon', $input['icon'] ?? '📋');
        $stmt->bindValue(':display_order', $next_order, PDO::PARAM_INT);

        $stmt->execute();

        $section_id = $db->lastInsertId();

        echo json_encode([
            'success' => true,
            'message' => 'セクションが作成されました',
            'section_id' => $section_id
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
 * セクション更新
 */
function updateSection($db) {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input || empty($input['id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'セクションIDが必要です']);
        return;
    }

    try {
        // セクション存在確認
        $check_sql = "SELECT id FROM sections WHERE id = :id";
        $check_stmt = $db->prepare($check_sql);
        $check_stmt->bindValue(':id', $input['id'], PDO::PARAM_INT);
        $check_stmt->execute();

        if (!$check_stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'セクションが見つかりません']);
            return;
        }

        // 更新SQL構築
        $fields = [];
        $params = [':id' => $input['id']];

        $allowed_fields = ['name', 'icon'];

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

        $sql = "UPDATE sections SET " . implode(', ', $fields) . " WHERE id = :id";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        echo json_encode([
            'success' => true,
            'message' => 'セクションが更新されました'
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
 * セクション削除
 */
function deleteSection($db) {
    $section_id = $_GET['id'] ?? null;

    if (!$section_id) {
        http_response_code(400);
        echo json_encode(['error' => 'セクションIDが必要です']);
        return;
    }

    try {
        // セクション内のタスク数チェック
        $task_count_sql = "SELECT COUNT(*) as task_count FROM tasks WHERE section_id = :section_id";
        $task_count_stmt = $db->prepare($task_count_sql);
        $task_count_stmt->bindValue(':section_id', $section_id, PDO::PARAM_INT);
        $task_count_stmt->execute();
        $task_count = $task_count_stmt->fetch()['task_count'];

        if ($task_count > 0) {
            http_response_code(400);
            echo json_encode(['error' => 'タスクが存在するセクションは削除できません']);
            return;
        }

        // セクション削除
        $sql = "DELETE FROM sections WHERE id = :id";
        $stmt = $db->prepare($sql);
        $stmt->bindValue(':id', $section_id, PDO::PARAM_INT);
        $stmt->execute();

        if ($stmt->rowCount() === 0) {
            http_response_code(404);
            echo json_encode(['error' => 'セクションが見つかりません']);
            return;
        }

        echo json_encode([
            'success' => true,
            'message' => 'セクションが削除されました'
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