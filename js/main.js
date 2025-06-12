/**
 * MyTaskFlow メインJavaScript
 */

// DOM読み込み完了時に実行
document.addEventListener('DOMContentLoaded', function() {
    loadProjectData();
});

/**
 * プロジェクトデータを読み込み
 */
async function loadProjectData(projectId = 1) {
    const loadingElement = document.getElementById('loading');
    const errorElement = document.getElementById('error');
    const contentElement = document.getElementById('content');

    try {
        // ローディング表示
        loadingElement.style.display = 'block';
        errorElement.style.display = 'none';
        contentElement.innerHTML = '';

        // APIからデータ取得
        const response = await fetch(`api/tasks.php?project_id=${projectId}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'データの取得に失敗しました');
        }

        // ローディング非表示
        loadingElement.style.display = 'none';

        // データを表示
        displayProjectData(data);

    } catch (error) {
        console.error('データ読み込みエラー:', error);
        loadingElement.style.display = 'none';
        errorElement.style.display = 'block';
        errorElement.textContent = `エラー: ${error.message}`;
    }
}

/**
 * プロジェクトデータを表示
 */
function displayProjectData(data) {
    const { project, sections } = data;

    // ヘッダー更新
    document.getElementById('project-name').textContent = project.name;
    document.getElementById('project-description').textContent = project.description || 'プロジェクト管理システム';

    // コンテンツエリアにセクション表示
    const contentElement = document.getElementById('content');
    contentElement.innerHTML = '';

    sections.forEach(section => {
        const sectionElement = createSectionElement(section);
        contentElement.appendChild(sectionElement);
    });
}

/**
 * セクション要素を作成
 */
function createSectionElement(section) {
    const sectionDiv = document.createElement('div');
    sectionDiv.className = 'section';

    // セクションタイトル
    const titleDiv = document.createElement('div');
    titleDiv.className = 'section-title';
    titleDiv.textContent = `${section.icon} ${section.name}`;

    // タスクグリッド
    const gridDiv = document.createElement('div');
    gridDiv.className = 'task-grid';

    // タスクカード作成
    section.tasks.forEach(task => {
        const taskCard = createTaskCard(task);
        gridDiv.appendChild(taskCard);
    });

    sectionDiv.appendChild(titleDiv);
    sectionDiv.appendChild(gridDiv);

    return sectionDiv;
}

/**
 * タスクカードを作成
 */
function createTaskCard(task) {
    const cardDiv = document.createElement('div');
    cardDiv.className = `task-card ${task.priority}`;

    // タスクヘッダー
    const headerDiv = document.createElement('div');
    headerDiv.className = 'task-header';

    // タスクタイトル
    const titleH3 = document.createElement('h3');
    titleH3.className = 'task-title';

    const numberSpan = document.createElement('span');
    numberSpan.className = 'task-number';
    numberSpan.textContent = task.task_number || '';

    titleH3.appendChild(numberSpan);
    titleH3.appendChild(document.createTextNode(task.title));

    // タスクメタ情報
    const metaDiv = document.createElement('div');
    metaDiv.className = 'task-meta';

    // 優先度バッジ
    const prioritySpan = document.createElement('span');
    prioritySpan.className = `priority-badge ${task.priority}`;
    prioritySpan.textContent = getPriorityLabel(task.priority);

    // ステータスバッジ（完了時のみ表示）
    if (task.status === 'completed') {
        const statusSpan = document.createElement('span');
        statusSpan.className = 'status-completed';
        statusSpan.textContent = '実装済み';
        metaDiv.appendChild(statusSpan);
    } else {
        metaDiv.appendChild(prioritySpan);
    }

    // 担当者
    if (task.assignee) {
        const assigneeSpan = document.createElement('span');
        assigneeSpan.className = 'assignee';
        assigneeSpan.textContent = task.assignee;
        metaDiv.appendChild(assigneeSpan);
    }

    headerDiv.appendChild(titleH3);
    headerDiv.appendChild(metaDiv);

    // タスク説明
    const descriptionP = document.createElement('p');
    descriptionP.className = 'task-description';
    descriptionP.textContent = task.description || '';

    cardDiv.appendChild(headerDiv);
    cardDiv.appendChild(descriptionP);

    // 備考がある場合
    if (task.notes) {
        const notesDiv = document.createElement('div');
        notesDiv.className = 'task-notes';
        notesDiv.innerHTML = formatNotes(task.notes);
        cardDiv.appendChild(notesDiv);
    }

    // 参考リンクがある場合
    if (task.reference_url) {
        const linkDiv = document.createElement('div');
        linkDiv.className = 'task-notes';
        linkDiv.innerHTML = `<a href="${task.reference_url}" class="reference-link" target="_blank">参考スプレッドシート</a>`;
        cardDiv.appendChild(linkDiv);
    }

    return cardDiv;
}

/**
 * 優先度ラベル取得
 */
function getPriorityLabel(priority) {
    const labels = {
        'high': '！01',
        'medium': '！02',
        'low': '劣',
        'separate': '別'
    };
    return labels[priority] || priority;
}

/**
 * 備考テキストのフォーマット
 */
function formatNotes(notes) {
    if (!notes) return '';

    // 改行をHTMLの改行に変換
    let formatted = notes.replace(/\n/g, '<br>');

    // **太字**を<strong>タグに変換
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    return formatted;
}

/**
 * エラーハンドリング
 */
window.addEventListener('error', function(e) {
    console.error('JavaScript エラー:', e.error);
    const errorElement = document.getElementById('error');
    errorElement.style.display = 'block';
    errorElement.textContent = 'JavaScriptエラーが発生しました。コンソールを確認してください。';
});