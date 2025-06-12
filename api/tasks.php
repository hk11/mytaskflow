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

        // 各セクションのタスク取得
        $tasks_sql = "
            SELECT * FROM tasks
            WHERE section_id = :section_id
            ORDER BY display_order ASC, task_number ASC
        ";
        $tasks_stmt = $db->prepare($tasks_sql);

        foreach ($sections as &$section) {
            $tasks_stmt->bindParam(':section_id', $section['id'], PDO::PARAM_INT);
            $tasks_stmt->execute();
            $section['tasks'] = $tasks_stmt->fetchAll();
        }

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
 * 優先度の日本語表示名取得
 */
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