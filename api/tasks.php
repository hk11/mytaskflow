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
        case 'PATCH':
            moveTask($db);
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
 * タスク移動（ドラッグ&ドロップ用）
 */
function moveTask($db) {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input || empty($input['task_id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'タスクIDが必要です']);
        return;
    }

    try {
        $db->beginTransaction();

        $task_id = $input['task_id'];
        $new_section_id = $input['new_section_id'] ?? null;
        $new_position = $input['new_position'] ?? null;

        // 現在のタスク情報を取得
        $current_task_sql = "SELECT section_id, display_order FROM tasks WHERE id = :task_id";
        $current_task_stmt = $db->prepare($current_task_sql);
        $current_task_stmt->bindParam(':task_id', $task_id, PDO::PARAM_INT);
        $current_task_stmt->execute();
        $current_task = $current_task_stmt->fetch();

        if (!$current_task) {
            throw new Exception('タスクが見つかりません');
        }

        $old_section_id = $current_task['section_id'];
        $old_position = $current_task['display_order'];

        // セクションが変更される場合
        if ($new_section_id && $new_section_id != $old_section_id) {
            // 元のセクションで後続タスクの順序を詰める
            $update_old_sql = "UPDATE tasks SET display_order = display_order - 1 WHERE section_id = :section_id AND display_order > :old_position";
            $update_old_stmt = $db->prepare($update_old_sql);
            $update_old_stmt->bindParam(':section_id', $old_section_id, PDO::PARAM_INT);
            $update_old_stmt->bindParam(':old_position', $old_position, PDO::PARAM_INT);
            $update_old_stmt->execute();

            // 新しいセクションでの位置を決定
            if ($new_position === null) {
                // 末尾に追加
                $max_position_sql = "SELECT COALESCE(MAX(display_order), 0) + 1 as next_position FROM tasks WHERE section_id = :section_id";
                $max_position_stmt = $db->prepare($max_position_sql);
                $max_position_stmt->bindParam(':section_id', $new_section_id, PDO::PARAM_INT);
                $max_position_stmt->execute();
                $new_position = $max_position_stmt->fetch()['next_position'];
            } else {
                // 指定位置に挿入（後続を後ろにずらす）
                $update_new_sql = "UPDATE tasks SET display_order = display_order + 1 WHERE section_id = :section_id AND display_order >= :new_position";
                $update_new_stmt = $db->prepare($update_new_sql);
                $update_new_stmt->bindParam(':section_id', $new_section_id, PDO::PARAM_INT);
                $update_new_stmt->bindParam(':new_position', $new_position, PDO::PARAM_INT);
                $update_new_stmt->execute();
            }

            // タスクを新しいセクション・位置に移動
            $move_task_sql = "UPDATE tasks SET section_id = :new_section_id, display_order = :new_position WHERE id = :task_id";
            $move_task_stmt = $db->prepare($move_task_sql);
            $move_task_stmt->bindParam(':new_section_id', $new_section_id, PDO::PARAM_INT);
            $move_task_stmt->bindParam(':new_position', $new_position, PDO::PARAM_INT);
            $move_task_stmt->bindParam(':task_id', $task_id, PDO::PARAM_INT);
            $move_task_stmt->execute();

        } elseif ($new_position !== null && $new_position != $old_position) {
            // 同一セクション内での順序変更
            if ($new_position < $old_position) {
                // 前方に移動：間のタスクを後ろにずらす
                $update_sql = "UPDATE tasks SET display_order = display_order + 1 WHERE section_id = :section_id AND display_order >= :new_position AND display_order < :old_position";
            } else {
                // 後方に移動：間のタスクを前にずらす
                $update_sql = "UPDATE tasks SET display_order = display_order - 1 WHERE section_id = :section_id AND display_order > :old_position AND display_order <= :new_position";
            }

            $update_stmt = $db->prepare($update_sql);
            $update_stmt->bindParam(':section_id', $old_section_id, PDO::PARAM_INT);
            $update_stmt->bindParam(':new_position', $new_position, PDO::PARAM_INT);
            $update_stmt->bindParam(':old_position', $old_position, PDO::PARAM_INT);
            $update_stmt->execute();

            // タスクを新しい位置に移動
            $move_task_sql = "UPDATE tasks SET display_order = :new_position WHERE id = :task_id";
            $move_task_stmt = $db->prepare($move_task_sql);
            $move_task_stmt->bindParam(':new_position', $new_position, PDO::PARAM_INT);
            $move_task_stmt->bindParam(':task_id', $task_id, PDO::PARAM_INT);
            $move_task_stmt->execute();
        }

        $db->commit();

        echo json_encode([
            'success' => true,
            'message' => 'タスクが移動されました'
        ]);

    } catch (Exception $e) {
        $db->rollback();
        http_response_code(500);
        echo json_encode([
            'error' => 'タスク移動エラー',
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
        $sql = "INSERT INTO tasks (task_number, title, description, notes, assignee, priority, status, start_date, end_date, actual_start_date, progress, section_id, display_order)
                VALUES (:task_number, :title, :description, :notes, :assignee, :priority, :status, :start_date, :end_date, :actual_start_date, :progress, :section_id, :display_order)";

        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':task_number' => $next_number,
            ':title' => $input['title'],
            ':description' => $input['description'] ?? '',
            ':notes' => $input['notes'] ?? '',
            ':assignee' => $input['assignee'] ?? '',
            ':priority' => $input['priority'] ?? 'medium',
            ':status' => $input['status'] ?? 'pending',
            ':start_date' => !empty($input['start_date']) ? $input['start_date'] : null,
            ':end_date' => !empty($input['end_date']) ? $input['end_date'] : null,
            ':actual_start_date' => !empty($input['actual_start_date']) ? $input['actual_start_date'] : null,
            ':progress' => isset($input['progress']) ? (int)$input['progress'] : 0,
            ':section_id' => $input['section_id'],
            ':display_order' => $next_order
        ]);

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
        $check_stmt->execute([':id' => $input['id']]);

        if (!$check_stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'タスクが見つかりません']);
            return;
        }

        // 全フィールドを更新（シンプル方式）
        $sql = "UPDATE tasks SET
                title = :title,
                description = :description,
                notes = :notes,
                assignee = :assignee,
                priority = :priority,
                status = :status,
                start_date = :start_date,
                end_date = :end_date,
                actual_start_date = :actual_start_date,
                progress = :progress
                WHERE id = :id";

        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':id' => $input['id'],
            ':title' => $input['title'] ?? '',
            ':description' => $input['description'] ?? '',
            ':notes' => $input['notes'] ?? '',
            ':assignee' => $input['assignee'] ?? '',
            ':priority' => $input['priority'] ?? 'medium',
            ':status' => $input['status'] ?? 'pending',
            ':start_date' => !empty($input['start_date']) ? $input['start_date'] : null,
            ':end_date' => !empty($input['end_date']) ? $input['end_date'] : null,
            ':actual_start_date' => !empty($input['actual_start_date']) ? $input['actual_start_date'] : null,
            ':progress' => isset($input['progress']) ? (int)$input['progress'] : 0
        ]);

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
?>