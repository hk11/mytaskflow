<?php
/**
 * タスクAPI - JSONでタスクデータを返す
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
            getProjectData($db);
            break;
        case 'POST':
            createTask($db);
            break;
        case 'PUT':
            updateTask($db);
            break;
        case 'DELETE':
            deleteTask($db);
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
 * プロジェクトデータ取得（セクション・タスク含む）
 */
function getProjectData($db) {
    $project_id = $_GET['project_id'] ?? 1; // デフォルトはプロジェクトID=1

    try {
        // プロジェクト情報取得
        $project_sql = "SELECT * FROM projects WHERE id = :project_id";
        $project_stmt = $db->prepare($project_sql);
        $project_stmt->bindParam(':project_id', $project_id, PDO::PARAM_INT);
        $project_stmt->execute();
        $project = $project_stmt->fetch();

        if (!$project) {
            http_response_code(404);
            echo json_encode(['error' => 'プロジェクトが見つかりません']);
            return;
        }

        // セクション取得（表示順序でソート）
        $sections_sql = "
            SELECT s.*,
                   COUNT(t.id) as task_count
            FROM sections s
            LEFT JOIN tasks t ON s.id = t.section_id
            WHERE s.project_id = :project_id
            GROUP BY s.id
            ORDER BY s.display_order ASC
        ";
        $sections_stmt = $db->prepare($sections_sql);
        $sections_stmt->bindParam(':project_id', $project_id, PDO::PARAM_INT);
        $sections_stmt->execute();
        $sections = $sections_stmt->fetchAll();

        // 各セクションのタスク取得（リンク情報も含む）
        $tasks_sql = "
            SELECT t.*,
                   GROUP_CONCAT(
                       CONCAT(l.id, ':', l.name, ':', l.url)
                       ORDER BY l.display_order ASC
                       SEPARATOR '|'
                   ) as links_data
            FROM tasks t
            LEFT JOIN links l ON t.id = l.linkable_id AND l.linkable_type = 'task'
            WHERE t.section_id = :section_id
            GROUP BY t.id
            ORDER BY t.display_order ASC, t.task_number ASC
        ";
        $tasks_stmt = $db->prepare($tasks_sql);

        foreach ($sections as &$section) {
            $tasks_stmt->bindParam(':section_id', $section['id'], PDO::PARAM_INT);
            $tasks_stmt->execute();
            $tasks = $tasks_stmt->fetchAll();

            // リンクデータを配列に変換
            foreach ($tasks as &$task) {
                $task['links'] = [];
                if ($task['links_data']) {
                    $links_raw = explode('|', $task['links_data']);
                    foreach ($links_raw as $link_raw) {
                        list($id, $name, $url) = explode(':', $link_raw, 3);
                        $task['links'][] = [
                            'id' => $id,
                            'name' => $name,
                            'url' => $url
                        ];
                    }
                }
                unset($task['links_data']);
            }

            $section['tasks'] = $tasks;
        }

        // プロジェクトのリンクも取得
        $project_links_sql = "
            SELECT * FROM links
            WHERE linkable_type = 'project' AND linkable_id = :project_id
            ORDER BY display_order ASC
        ";
        $project_links_stmt = $db->prepare($project_links_sql);
        $project_links_stmt->bindParam(':project_id', $project_id, PDO::PARAM_INT);
        $project_links_stmt->execute();
        $project['links'] = $project_links_stmt->fetchAll();

        // レスポンス作成
        $response = [
            'success' => true,
            'project' => $project,
            'sections' => $sections
        ];

        echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'error' => 'データベースエラー',
            'message' => $e->getMessage()
        ]);
    }
}

/**
 * タスク作成
 */
function createTask($db) {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input) {
        http_response_code(400);
        echo json_encode(['error' => '無効なJSONデータです']);
        return;
    }

    try {
        // 必須フィールドチェック
        $required_fields = ['title', 'section_id'];
        foreach ($required_fields as $field) {
            if (empty($input[$field])) {
                http_response_code(400);
                echo json_encode(['error' => "必須フィールド '{$field}' が不足しています"]);
                return;
            }
        }

        // 次のタスク番号を取得
        $task_number_sql = "SELECT COALESCE(MAX(task_number), 0) + 1 as next_number FROM tasks WHERE section_id IN (SELECT id FROM sections WHERE project_id = (SELECT project_id FROM sections WHERE id = :section_id))";
        $task_number_stmt = $db->prepare($task_number_sql);
        $task_number_stmt->bindParam(':section_id', $input['section_id'], PDO::PARAM_INT);
        $task_number_stmt->execute();
        $next_number = $task_number_stmt->fetch()['next_number'];

        // 次の表示順序を取得
        $display_order_sql = "SELECT COALESCE(MAX(display_order), 0) + 1 as next_order FROM tasks WHERE section_id = :section_id";
        $display_order_stmt = $db->prepare($display_order_sql);
        $display_order_stmt->bindParam(':section_id', $input['section_id'], PDO::PARAM_INT);
        $display_order_stmt->execute();
        $next_order = $display_order_stmt->fetch()['next_order'];

        // タスク挿入
        $sql = "INSERT INTO tasks (task_number, title, description, notes, assignee, priority, status, section_id, display_order)
                VALUES (:task_number, :title, :description, :notes, :assignee, :priority, :status, :section_id, :display_order)";

        $stmt = $db->prepare($sql);
        $stmt->bindParam(':task_number', $next_number, PDO::PARAM_INT);
        $stmt->bindParam(':title', $input['title']);
        $stmt->bindParam(':description', $input['description'] ?? '');
        $stmt->bindParam(':notes', $input['notes'] ?? '');
        $stmt->bindParam(':assignee', $input['assignee'] ?? '');
        $stmt->bindParam(':priority', $input['priority'] ?? 'medium');
        $stmt->bindParam(':status', $input['status'] ?? 'pending');
        $stmt->bindParam(':section_id', $input['section_id'], PDO::PARAM_INT);
        $stmt->bindParam(':display_order', $next_order, PDO::PARAM_INT);

        $stmt->execute();

        $task_id = $db->lastInsertId();

        echo json_encode([
            'success' => true,
            'message' => 'タスクが作成されました',
            'task_id' => $task_id
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
 * タスク更新
 */
function updateTask($db) {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input || empty($input['id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'タスクIDが必要です']);
        return;
    }

    try {
        // タスク存在確認
        $check_sql = "SELECT id FROM tasks WHERE id = :id";
        $check_stmt = $db->prepare($check_sql);
        $check_stmt->bindParam(':id', $input['id'], PDO::PARAM_INT);
        $check_stmt->execute();

        if (!$check_stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'タスクが見つかりません']);
            return;
        }

        // 更新SQL構築
        $fields = [];
        $params = [':id' => $input['id']];

        $allowed_fields = ['title', 'description', 'notes', 'assignee', 'priority', 'status'];

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

        $sql = "UPDATE tasks SET " . implode(', ', $fields) . " WHERE id = :id";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        echo json_encode([
            'success' => true,
            'message' => 'タスクが更新されました'
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
 * タスク削除
 */
function deleteTask($db) {
    $task_id = $_GET['id'] ?? null;

    if (!$task_id) {
        http_response_code(400);
        echo json_encode(['error' => 'タスクIDが必要です']);
        return;
    }

    try {
        // タスク存在確認
        $check_sql = "SELECT id FROM tasks WHERE id = :id";
        $check_stmt = $db->prepare($check_sql);
        $check_stmt->bindParam(':id', $task_id, PDO::PARAM_INT);
        $check_stmt->execute();

        if (!$check_stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'タスクが見つかりません']);
            return;
        }

        // タスク削除
        $sql = "DELETE FROM tasks WHERE id = :id";
        $stmt = $db->prepare($sql);
        $stmt->bindParam(':id', $task_id, PDO::PARAM_INT);
        $stmt->execute();

        echo json_encode([
            'success' => true,
            'message' => 'タスクが削除されました'
        ]);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'error' => 'データベースエラー',
            'message' => $e->getMessage()
        ]);
    }
}
function getPriorityLabel($priority) {
    $labels = [
        'high' => '！01',
        'medium' => '！02',
        'low' => '劣',
        'separate' => '別'
    ];
    return $labels[$priority] ?? $priority;
}

/**
 * ステータスの日本語表示名取得
 */
function getStatusLabel($status) {
    $labels = [
        'pending' => '未着手',
        'in_progress' => '進行中',
        'completed' => '完了',
        'on_hold' => '保留'
    ];
    return $labels[$status] ?? $status;
}