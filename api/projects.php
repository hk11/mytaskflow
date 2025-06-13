<?php
/**
 * プロジェクト管理API
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
            getProjects($db);
            break;
        case 'POST':
            createProject($db);
            break;
        case 'PUT':
            updateProject($db);
            break;
        case 'DELETE':
            deleteProject($db);
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
 * プロジェクト一覧取得
 */
function getProjects($db) {
    $search = $_GET['search'] ?? '';
    $status = $_GET['status'] ?? '';

    try {
        // プロジェクトと統計情報を取得
        $sql = "
            SELECT p.*,
                   COUNT(DISTINCT s.id) as section_count,
                   COUNT(DISTINCT t.id) as task_count,
                   COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_task_count
            FROM projects p
            LEFT JOIN sections s ON p.id = s.project_id
            LEFT JOIN tasks t ON s.id = t.section_id
            WHERE 1=1
        ";

        $params = [];

        // 検索条件
        if (!empty($search)) {
            $sql .= " AND (p.name LIKE :search OR p.description LIKE :search)";
            $params[':search'] = '%' . $search . '%';
        }

        // ステータス条件
        if (!empty($status)) {
            $sql .= " AND p.status = :status";
            $params[':status'] = $status;
        }

        $sql .= " GROUP BY p.id ORDER BY p.updated_at DESC";

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $projects = $stmt->fetchAll();

        // 進捗率を計算
        foreach ($projects as &$project) {
            if ($project['task_count'] > 0) {
                $project['progress'] = round(($project['completed_task_count'] / $project['task_count']) * 100);
            } else {
                $project['progress'] = 0;
            }
        }

        echo json_encode([
            'success' => true,
            'projects' => $projects
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
 * プロジェクト作成
 */
function createProject($db) {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input) {
        http_response_code(400);
        echo json_encode(['error' => '無効なJSONデータです']);
        return;
    }

    try {
        // 必須フィールドチェック
        if (empty($input['name'])) {
            http_response_code(400);
            echo json_encode(['error' => 'プロジェクト名は必須です']);
            return;
        }

        // ステータスの妥当性チェック
        $valid_statuses = ['active', 'completed', 'on_hold', 'archived'];
        $status = $input['status'] ?? 'active';
        if (!in_array($status, $valid_statuses)) {
            http_response_code(400);
            echo json_encode(['error' => '無効なステータスです']);
            return;
        }

        // プロジェクト挿入
        $sql = "INSERT INTO projects (name, description, status) VALUES (:name, :description, :status)";
        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':name' => $input['name'],
            ':description' => $input['description'] ?? '',
            ':status' => $status
        ]);

        $project_id = $db->lastInsertId();

        echo json_encode([
            'success' => true,
            'message' => 'プロジェクトが作成されました',
            'project_id' => $project_id
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
 * プロジェクト更新
 */
function updateProject($db) {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input || empty($input['id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'プロジェクトIDが必要です']);
        return;
    }

    try {
        // プロジェクト存在確認
        $check_sql = "SELECT id FROM projects WHERE id = :id";
        $check_stmt = $db->prepare($check_sql);
        $check_stmt->execute([':id' => $input['id']]);

        if (!$check_stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'プロジェクトが見つかりません']);
            return;
        }

        // 更新SQL構築
        $fields = [];
        $params = [':id' => $input['id']];

        $allowed_fields = ['name', 'description', 'status'];

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

        // ステータスの妥当性チェック
        if (isset($input['status'])) {
            $valid_statuses = ['active', 'completed', 'on_hold', 'archived'];
            if (!in_array($input['status'], $valid_statuses)) {
                http_response_code(400);
                echo json_encode(['error' => '無効なステータスです']);
                return;
            }
        }

        $sql = "UPDATE projects SET " . implode(', ', $fields) . " WHERE id = :id";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        echo json_encode([
            'success' => true,
            'message' => 'プロジェクトが更新されました'
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
 * プロジェクト削除
 */
function deleteProject($db) {
    $project_id = $_GET['id'] ?? null;

    if (!$project_id) {
        http_response_code(400);
        echo json_encode(['error' => 'プロジェクトIDが必要です']);
        return;
    }

    try {
        // プロジェクト存在確認
        $check_sql = "SELECT id FROM projects WHERE id = :id";
        $check_stmt = $db->prepare($check_sql);
        $check_stmt->execute([':id' => $project_id]);

        if (!$check_stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'プロジェクトが見つかりません']);
            return;
        }

        // セクション数チェック
        $section_count_sql = "SELECT COUNT(*) as section_count FROM sections WHERE project_id = :project_id";
        $section_count_stmt = $db->prepare($section_count_sql);
        $section_count_stmt->execute([':project_id' => $project_id]);
        $section_count = $section_count_stmt->fetch()['section_count'];

        if ($section_count > 0) {
            http_response_code(400);
            echo json_encode(['error' => 'セクションが存在するプロジェクトは削除できません。先にすべてのセクションを削除してください。']);
            return;
        }

        // プロジェクト削除
        $sql = "DELETE FROM projects WHERE id = :id";
        $stmt = $db->prepare($sql);
        $stmt->execute([':id' => $project_id]);

        echo json_encode([
            'success' => true,
            'message' => 'プロジェクトが削除されました'
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