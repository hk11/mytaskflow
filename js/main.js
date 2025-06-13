/**
 * MyTaskFlow メインJavaScript
 */

// グローバル変数
let currentProjectData = null;
let currentProjectId = null;
let autoScrollInterval = null;
let isDragging = false;
let isEventInitialized = false;

// ガントチャート関連
let currentGanttPeriod = 'week'; // デフォルトを週表示に設定
let ganttStartDate = new Date();
let ganttEndDate = new Date();
let ganttDates = [];

// DOM読み込み完了時に実行
document.addEventListener('DOMContentLoaded', function() {
    // URLパラメータからプロジェクトIDを取得
    currentProjectId = getProjectIdFromUrl();

    if (!currentProjectId) {
        showError('プロジェクトIDが指定されていません');
        return;
    }

    loadProjectData(currentProjectId);

    // イベントリスナーは1回だけ初期化
    if (!isEventInitialized) {
        initializeModalEvents();
        isEventInitialized = true;
    }
});

/**
 * URLパラメータからプロジェクトIDを取得
 */
function getProjectIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('project_id');
    return projectId ? parseInt(projectId) : null;
}

/**
 * モーダル関連のイベント初期化
 */
function initializeModalEvents() {
    const modal = document.getElementById('taskModal');
    const closeBtn = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelBtn');
    const taskForm = document.getElementById('taskForm');

    // タスクモーダル
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    taskForm.addEventListener('submit', handleFormSubmit);

    // セクションモーダル
    const sectionModal = document.getElementById('sectionModal');
    const closeSectionBtn = document.getElementById('closeSectionModal');
    const cancelSectionBtn = document.getElementById('cancelSectionBtn');
    const sectionForm = document.getElementById('sectionForm');
    const addSectionBtn = document.getElementById('addSectionBtn');

    closeSectionBtn.addEventListener('click', closeSectionModal);
    cancelSectionBtn.addEventListener('click', closeSectionModal);
    addSectionBtn.addEventListener('click', openAddSectionModal);
    sectionForm.addEventListener('submit', handleSectionFormSubmit);

    // モーダル外クリックで閉じる
    window.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
        if (e.target === sectionModal) {
            closeSectionModal();
        }
    });

    // リンク追加ボタン
    document.getElementById('addLinkBtn').addEventListener('click', addLinkItem);

    // 自動スクロール用のマウス移動イベント
    document.addEventListener('dragover', handleAutoScroll);

    // 表示切り替えボタン
    document.getElementById('cardViewBtn').addEventListener('click', () => switchView('card'));
    document.getElementById('listViewBtn').addEventListener('click', () => switchView('list'));
    document.getElementById('ganttViewBtn').addEventListener('click', () => switchView('gantt'));

    // 進捗バーのイベント
    const progressRange = document.getElementById('taskProgress');
    const progressValue = document.querySelector('.progress-value');

    progressRange.addEventListener('input', function(e) {
        progressValue.textContent = e.target.value + '%';
    });

    // ガントチャート制御
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('period-btn')) {
            switchGanttPeriod(e.target.dataset.period);
        }
        if (e.target.classList.contains('today-btn')) {
            scrollToToday();
        }
    });
}

/**
 * プロジェクトデータを読み込み
 */
async function loadProjectData(projectId) {
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

        // グローバル変数に保存
        currentProjectData = data;

        // データ読み込み完了後に表示モードを復元
        restoreViewMode();

    } catch (error) {
        console.error('データ読み込みエラー:', error);
        loadingElement.style.display = 'none';
        showError(`エラー: ${error.message}`);
    }
}

/**
 * エラー表示
 */
function showError(message) {
    const errorElement = document.getElementById('error');
    errorElement.style.display = 'block';
    errorElement.textContent = message;

    // プロジェクト一覧に戻るボタンを追加
    const backBtn = document.createElement('button');
    backBtn.textContent = 'プロジェクト一覧に戻る';
    backBtn.style.marginTop = '10px';
    backBtn.style.padding = '8px 16px';
    backBtn.style.backgroundColor = 'white';
    backBtn.style.color = 'var(--accent-red)';
    backBtn.style.border = '1px solid white';
    backBtn.style.borderRadius = '4px';
    backBtn.style.cursor = 'pointer';
    backBtn.onclick = () => window.location.href = 'index.html';

    errorElement.innerHTML = '';
    errorElement.appendChild(document.createTextNode(message));
    errorElement.appendChild(document.createElement('br'));
    errorElement.appendChild(backBtn);
}

/**
 * プロジェクトデータを表示
 */
function displayProjectData(data) {
    const { project, sections } = data;

    // ヘッダー更新
    document.getElementById('project-name').textContent = project.name;
    document.getElementById('project-description').textContent = project.description || 'プロジェクト管理システム';

    // ページタイトルも更新
    document.title = `${project.name} - MyTaskFlow`;

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
    sectionDiv.dataset.sectionId = section.id;

    // セクションタイトル
    const titleDiv = document.createElement('div');
    titleDiv.className = 'section-title section-header';

    const titleText = document.createElement('span');
    titleText.textContent = `${section.icon} ${section.name}`;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'section-actions';

    const addButton = document.createElement('button');
    addButton.className = 'add-task-btn';
    addButton.textContent = '+ タスク追加';
    addButton.addEventListener('click', () => openAddTaskModal(section.id));

    const deleteButton = document.createElement('button');
    deleteButton.className = 'btn-delete-section';
    deleteButton.textContent = '削除';
    deleteButton.addEventListener('click', () => deleteSection(section.id));

    actionsDiv.appendChild(addButton);
    if (section.task_count == 0) { // タスクがない場合のみ削除ボタン表示
        actionsDiv.appendChild(deleteButton);
    }

    titleDiv.appendChild(titleText);
    titleDiv.appendChild(actionsDiv);

    // タスクグリッド（ドロップゾーン対応）
    const gridDiv = document.createElement('div');
    gridDiv.className = 'task-grid drop-zone';
    gridDiv.dataset.sectionId = section.id;

    // ドロップイベント設定
    setupDropZone(gridDiv);

    // タスクカード作成
    section.tasks.forEach((task, index) => {
        const taskCard = createTaskCard(task, index);
        gridDiv.appendChild(taskCard);
    });

    sectionDiv.appendChild(titleDiv);
    sectionDiv.appendChild(gridDiv);

    return sectionDiv;
}

/**
 * タスクカードを作成
 */
function createTaskCard(task, index) {
    const cardDiv = document.createElement('div');
    cardDiv.className = `task-card ${task.priority}`;
    cardDiv.draggable = true;
    cardDiv.dataset.taskId = task.id;
    cardDiv.dataset.sectionId = task.section_id;
    cardDiv.dataset.position = index;

    // ドラッグイベント設定
    setupDragEvents(cardDiv);

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

    // 優先度バッジ（常に表示）
    const prioritySpan = document.createElement('span');
    prioritySpan.className = `priority-badge ${task.priority}`;
    prioritySpan.textContent = getPriorityLabel(task.priority);
    metaDiv.appendChild(prioritySpan);

    // ステータスバッジ（常に表示）
    const statusSpan = document.createElement('span');
    statusSpan.className = `status-badge ${task.status}`;
    statusSpan.textContent = getStatusLabel(task.status);
    metaDiv.appendChild(statusSpan);

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
        notesDiv.className = 'task-notes clickable-links';
        notesDiv.innerHTML = formatNotes(task.notes);
        cardDiv.appendChild(notesDiv);
    }

    // 参考リンクがある場合
    if (task.links && task.links.length > 0) {
        const linksDiv = document.createElement('div');
        linksDiv.className = 'links-display';

        task.links.forEach(link => {
            const linkElement = document.createElement('a');
            linkElement.href = link.url;
            linkElement.textContent = link.name;
            linkElement.target = '_blank';
            linkElement.rel = 'noopener noreferrer';
            linksDiv.appendChild(linkElement);
        });

        cardDiv.appendChild(linksDiv);
    }

    // タスク操作ボタン
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'task-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-edit';
    editBtn.textContent = '編集';
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditTaskModal(task);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = '削除';
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTask(task.id);
    });

    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);
    cardDiv.appendChild(actionsDiv);

    return cardDiv;
}

/**
 * ステータスラベル取得
 */
function getStatusLabel(status) {
    const labels = {
        'pending': '未着手',
        'in_progress': '進行中',
        'completed': '完了',
        'on_hold': '保留'
    };
    return labels[status] || status;
}

/**
 * ドラッグイベント設定（タスクカード用）
 */
function setupDragEvents(cardDiv) {
    cardDiv.addEventListener('dragstart', function(e) {
        e.dataTransfer.setData('text/plain', cardDiv.dataset.taskId);
        cardDiv.classList.add('dragging');
        isDragging = true;
    });

    cardDiv.addEventListener('dragend', function(e) {
        cardDiv.classList.remove('dragging');
        isDragging = false;
        stopAutoScroll();
    });
}

/**
 * ドロップゾーン設定（セクション用）
 */
function setupDropZone(gridDiv) {
    gridDiv.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        gridDiv.classList.add('drag-over');
    });

    gridDiv.addEventListener('dragleave', function(e) {
        // 子要素への移動では dragleave しない
        if (!gridDiv.contains(e.relatedTarget)) {
            gridDiv.classList.remove('drag-over');
        }
    });

    gridDiv.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        gridDiv.classList.remove('drag-over');

        const taskId = e.dataTransfer.getData('text/plain');
        const newSectionId = gridDiv.dataset.sectionId;

        if (taskId && newSectionId) {
            moveTaskToSection(taskId, newSectionId);
        }
    });
}

/**
 * 自動スクロール機能を開始
 */
function startAutoScroll(direction, speed = 5) {
    if (autoScrollInterval) return;

    autoScrollInterval = setInterval(() => {
        if (direction === 'up') {
            window.scrollBy(0, -speed);
        } else if (direction === 'down') {
            window.scrollBy(0, speed);
        }
    }, 16); // 60fps
}

/**
 * 自動スクロールを停止
 */
function stopAutoScroll() {
    if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
    }
}

/**
 * マウス位置による自動スクロール判定
 */
function handleAutoScroll(e) {
    if (!isDragging) return;

    const scrollThreshold = 100; // 画面端から100px以内
    const viewportHeight = window.innerHeight;
    const mouseY = e.clientY;

    stopAutoScroll();

    if (mouseY < scrollThreshold) {
        // 上端に近い場合は上にスクロール
        const speed = Math.max(5, (scrollThreshold - mouseY) / 5);
        startAutoScroll('up', speed);
    } else if (mouseY > viewportHeight - scrollThreshold) {
        // 下端に近い場合は下にスクロール
        const speed = Math.max(5, (mouseY - (viewportHeight - scrollThreshold)) / 5);
        startAutoScroll('down', speed);
    }
}

/**
 * タスクをセクションに移動
 */
async function moveTaskToSection(taskId, newSectionId) {
    try {
        const response = await fetch('api/tasks.php', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                task_id: parseInt(taskId),
                new_section_id: parseInt(newSectionId)
            })
        });

        const result = await response.json();

        if (result.success) {
            // データを再読み込み
            loadProjectData(currentProjectId);
        } else {
            alert('エラー: ' + (result.error || 'タスクの移動に失敗しました'));
        }

    } catch (error) {
        console.error('タスク移動エラー:', error);
        alert('エラー: ' + error.message);
    }
}

/**
 * 優先度ラベル取得
 */
function getPriorityLabel(priority) {
    const labels = {
        'high': '高',
        'medium': '中',
        'low': '低',
        'separate': '保'
    };
    return labels[priority] || priority;
}

/**
 * 備考テキストのフォーマット
 */
function formatNotes(notes) {
    if (!notes) return '';

    // 1. 見出し変換を最初に実行（改行変換前）
    let formatted = notes.replace(/^### ([^<\n]+)/gm, '<h3 class="note-h3">$1</h3>');
    formatted = formatted.replace(/^## ([^<\n]+)/gm, '<h2 class="note-h2">$1</h2>');
    formatted = formatted.replace(/^# ([^<\n]+)/gm, '<h1 class="note-h1">$1</h1>');

    // 2. **太字**を<strong>タグに変換
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 3. 改行をHTMLの改行に変換（最後に実行）
    formatted = formatted.replace(/\n/g, '<br>');

    // 4. URLを自動リンクに変換
    formatted = formatLinksInText(formatted);

    return formatted;
}

/**
 * テキスト内のURLを自動でリンクに変換
 */
function formatLinksInText(text) {
    const urlRegex = /(https?:\/\/[^\s<>"]+)/gi;
    return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

/**
 * モーダルを開く（タスク追加）
 */
function openAddTaskModal(sectionId) {
    const modal = document.getElementById('taskModal');
    const modalTitle = document.getElementById('modalTitle');
    const form = document.getElementById('taskForm');

    // タイトル設定
    modalTitle.textContent = 'タスク追加';

    // フォームリセット
    form.reset();
    document.getElementById('taskId').value = '';
    document.getElementById('sectionId').value = sectionId;

    // リンクリストもクリア
    displayLinksInForm([]);

    // モーダル表示
    modal.style.display = 'block';
}

/**
 * モーダルを開く（タスク編集）
 */
function openEditTaskModal(task) {
    const modal = document.getElementById('taskModal');
    const modalTitle = document.getElementById('modalTitle');

    // タイトル設定
    modalTitle.textContent = 'タスク編集';

    // フォームに値設定
    document.getElementById('taskId').value = task.id;
    document.getElementById('sectionId').value = task.section_id;
    document.getElementById('taskTitle').value = task.title || '';
    document.getElementById('taskDescription').value = task.description || '';
    document.getElementById('taskNotes').value = task.notes || '';
    document.getElementById('taskAssignee').value = task.assignee || '';
    document.getElementById('taskPriority').value = task.priority || 'medium';
    document.getElementById('taskStatus').value = task.status || 'pending';

    // 日付フィールド
    document.getElementById('taskStartDate').value = task.start_date || '';
    document.getElementById('taskEndDate').value = task.end_date || '';
    document.getElementById('taskActualStartDate').value = task.actual_start_date || '';

    // 進捗
    const progress = task.progress || 0;
    document.getElementById('taskProgress').value = progress;
    document.querySelector('.progress-value').textContent = progress + '%';

    // リンク表示
    displayLinksInForm(task.links || []);

    // モーダル表示
    modal.style.display = 'block';
}

/**
 * モーダルを閉じる
 */
function closeModal() {
    const modal = document.getElementById('taskModal');
    modal.style.display = 'none';
}

/**
 * リンクアイテムを追加
 */
function addLinkItem(name = '', url = '', linkId = null) {
    const linksList = document.getElementById('linksList');

    const linkItem = document.createElement('div');
    linkItem.className = 'link-item';
    linkItem.innerHTML = `
        <input type="text" class="link-name" placeholder="リンク名" value="${name}">
        <input type="url" class="link-url" placeholder="https://..." value="${url}">
        <button type="button" class="link-remove">削除</button>
    `;

    // データ属性でリンクIDを保存（編集時用）
    if (linkId) {
        linkItem.dataset.linkId = linkId;
    }

    // 削除ボタンのイベント
    linkItem.querySelector('.link-remove').addEventListener('click', function() {
        linkItem.remove();
    });

    linksList.appendChild(linkItem);
}

/**
 * フォームにリンクを表示
 */
function displayLinksInForm(links) {
    const linksList = document.getElementById('linksList');
    linksList.innerHTML = '';

    links.forEach(link => {
        addLinkItem(link.name, link.url, link.id);
    });
}

/**
 * フォーム送信処理
 */
async function handleFormSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const taskData = Object.fromEntries(formData);

    // 空の値を除去
    Object.keys(taskData).forEach(key => {
        if (taskData[key] === '') {
            delete taskData[key];
        }
    });

    const isEdit = taskData.id && taskData.id !== '';

    try {
        // タスクを保存
        const response = await fetch('api/tasks.php', {
            method: isEdit ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(taskData)
        });

        const result = await response.json();

        if (result.success) {
            // リンクも保存
            await saveTaskLinks(isEdit ? taskData.id : result.task_id);

            closeModal();
            // データを再読み込み
            loadProjectData(currentProjectId);
        } else {
            alert('エラー: ' + (result.error || 'タスクの保存に失敗しました'));
        }

    } catch (error) {
        console.error('タスク保存エラー:', error);
        alert('エラー: ' + error.message);
    }
}

/**
 * タスクのリンクを保存
 */
async function saveTaskLinks(taskId) {
    const linkItems = document.querySelectorAll('#linksList .link-item');

    // 既存のリンクをすべて削除してから新しく作成
    // （簡単な実装として、編集時は一旦全削除して再作成）
    if (document.getElementById('taskId').value) {
        // 編集時：既存リンクを削除
        await deleteAllTaskLinks(taskId);
    }

    // 新しいリンクを作成
    for (const linkItem of linkItems) {
        const nameInput = linkItem.querySelector('.link-name');
        const urlInput = linkItem.querySelector('.link-url');

        const name = nameInput.value.trim();
        const url = urlInput.value.trim();

        if (name && url) {
            await createLink('task', taskId, name, url);
        }
    }
}

/**
 * タスクの全リンクを削除
 */
async function deleteAllTaskLinks(taskId) {
    try {
        // まず既存のリンクを取得
        const response = await fetch(`api/links.php?linkable_type=task&linkable_id=${taskId}`);
        const data = await response.json();

        if (data.success && data.links) {
            // 各リンクを削除
            for (const link of data.links) {
                await fetch(`api/links.php?id=${link.id}`, {
                    method: 'DELETE'
                });
            }
        }
    } catch (error) {
        console.error('リンク削除エラー:', error);
    }
}

/**
 * リンクを作成
 */
async function createLink(linkableType, linkableId, name, url) {
    try {
        const response = await fetch('api/links.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                linkable_type: linkableType,
                linkable_id: linkableId,
                name: name,
                url: url
            })
        });

        const result = await response.json();

        if (!result.success) {
            console.error('リンク作成エラー:', result.error);
        }

    } catch (error) {
        console.error('リンク作成エラー:', error);
    }
}

/**
 * タスク削除
 */
async function deleteTask(taskId) {
    if (!confirm('このタスクを削除しますか？')) {
        return;
    }

    try {
        const response = await fetch(`api/tasks.php?id=${taskId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            // データを再読み込み
            loadProjectData(currentProjectId);
        } else {
            alert('エラー: ' + (result.error || 'タスクの削除に失敗しました'));
        }

    } catch (error) {
        console.error('タスク削除エラー:', error);
        alert('エラー: ' + error.message);
    }
}

/**
 * セクション追加モーダルを開く
 */
function openAddSectionModal() {
    const modal = document.getElementById('sectionModal');
    const form = document.getElementById('sectionForm');

    // フォームリセット
    form.reset();

    // モーダル表示
    modal.style.display = 'block';
}

/**
 * セクションモーダルを閉じる
 */
function closeSectionModal() {
    const modal = document.getElementById('sectionModal');
    modal.style.display = 'none';
}

/**
 * セクションフォーム送信処理
 */
async function handleSectionFormSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const sectionData = Object.fromEntries(formData);

    // プロジェクトIDを追加（動的に設定）
    sectionData.project_id = currentProjectId;

    try {
        const response = await fetch('api/sections.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(sectionData)
        });

        const result = await response.json();

        if (result.success) {
            closeSectionModal();
            // データを再読み込み
            loadProjectData(currentProjectId);
        } else {
            alert('エラー: ' + (result.error || 'セクションの作成に失敗しました'));
        }

    } catch (error) {
        console.error('セクション作成エラー:', error);
        alert('エラー: ' + error.message);
    }
}

/**
 * セクション削除
 */
async function deleteSection(sectionId) {
    if (!confirm('このセクションを削除しますか？（タスクがある場合は削除できません）')) {
        return;
    }

    try {
        const response = await fetch(`api/sections.php?id=${sectionId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            // データを再読み込み
            loadProjectData(currentProjectId);
        } else {
            alert('エラー: ' + (result.error || 'セクションの削除に失敗しました'));
        }

    } catch (error) {
        console.error('セクション削除エラー:', error);
        alert('エラー: ' + error.message);
    }
}

/**
 * エラーハンドリング
 */
window.addEventListener('error', function(e) {
    console.error('JavaScript エラー:', e.error);
    showError('JavaScriptエラーが発生しました。コンソールを確認してください。');
});

/**
 * 表示モード切り替え
 */
function switchView(viewMode) {
    const content = document.getElementById('content');
    const ganttContent = document.getElementById('ganttContent');
    const cardBtn = document.getElementById('cardViewBtn');
    const listBtn = document.getElementById('listViewBtn');
    const ganttBtn = document.getElementById('ganttViewBtn');

    // 全ボタンのactiveクラスを削除
    [cardBtn, listBtn, ganttBtn].forEach(btn => btn.classList.remove('active'));

    if (viewMode === 'list') {
        content.style.display = 'block';
        ganttContent.style.display = 'none';
        content.classList.add('list-view');
        listBtn.classList.add('active');
    } else if (viewMode === 'gantt') {
        content.style.display = 'none';
        ganttContent.style.display = 'block';
        cardBtn.classList.remove('active');
        ganttBtn.classList.add('active');

        // ガントチャートを強制的に表示（データがある場合のみ）
        if (currentProjectData && currentProjectData.sections) {
            // 少し遅延を入れて確実に描画
            setTimeout(() => {
                displayGanttChart();
            }, 100);
        }
    } else {
        content.style.display = 'block';
        ganttContent.style.display = 'none';
        content.classList.remove('list-view');
        cardBtn.classList.add('active');
    }

    // 設定を保存
    localStorage.setItem('taskViewMode', viewMode);
}

/**
 * 保存された表示モードを復元
 */
function restoreViewMode() {
    const savedMode = localStorage.getItem('taskViewMode') || 'card';
    switchView(savedMode);
}

// ===== ガントチャート機能 =====

/**
 * ガントチャート表示
 */
function displayGanttChart() {
    if (!currentProjectData) return;

    setupGanttDates();
    renderGanttHeader();
    renderGanttBody();
}

/**
 * ガントチャート期間設定
 */
function setupGanttDates() {
    const today = new Date();
    ganttDates = [];

    if (currentGanttPeriod === 'month') {
        // 2ヶ月前から4ヶ月後まで日単位で表示
        ganttStartDate = new Date(today.getFullYear(), today.getMonth() - 2, 1);
        ganttEndDate = new Date(today.getFullYear(), today.getMonth() + 4, 0);

        // 日付配列を作成
        const current = new Date(ganttStartDate);
        while (current <= ganttEndDate) {
            ganttDates.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }
    } else {
        // 4週間前から8週間後まで日単位で表示
        ganttStartDate = new Date(today);
        ganttStartDate.setDate(today.getDate() - 28);
        ganttEndDate = new Date(today);
        ganttEndDate.setDate(today.getDate() + 56);

        // 日付配列を作成
        const current = new Date(ganttStartDate);
        while (current <= ganttEndDate) {
            ganttDates.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }
    }
}

/**
 * ガントチャートヘッダー描画
 */
function renderGanttHeader() {
    const header = document.getElementById('ganttTimelineHeader');
    header.innerHTML = '';

    const today = new Date();
    const todayStr = formatDate(today);

    ganttDates.forEach(date => {
        const headerCell = document.createElement('div');
        headerCell.className = 'gantt-date-header';

        const dateStr = formatDate(date);
        const isToday = dateStr === todayStr;
        const isWeekend = date.getDay() === 0 || date.getDay() === 6; // 日曜日または土曜日

        if (isToday) {
            headerCell.classList.add('today');
        }

        if (isWeekend) {
            headerCell.classList.add('weekend');
        }

        // 曜日を取得
        const dayOfWeek = getDayOfWeek(date);

        // 月表示の場合は日付のみ、週表示の場合は月/日 + 曜日
        if (currentGanttPeriod === 'month') {
            headerCell.innerHTML = `
                <div>${date.getDate()}</div>
                <div class="day-of-week">${dayOfWeek}</div>
            `;
            // 月の最初の日は月も表示
            if (date.getDate() === 1) {
                headerCell.innerHTML = `
                    <div>${date.getMonth() + 1}/${date.getDate()}</div>
                    <div class="day-of-week">${dayOfWeek}</div>
                `;
            }
        } else {
            headerCell.innerHTML = `
                <div>${date.getMonth() + 1}/${date.getDate()}</div>
                <div class="day-of-week">${dayOfWeek}</div>
            `;
        }

        headerCell.dataset.date = dateStr;
        header.appendChild(headerCell);
    });
}

/**
 * 曜日取得
 */
function getDayOfWeek(date) {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[date.getDay()];
}

/**
 * ガントチャート本体描画
 */
function renderGanttBody() {
    const body = document.getElementById('ganttBody');
    const unscheduled = document.getElementById('unscheduledTasks');
    body.innerHTML = '';
    unscheduled.innerHTML = '';

    if (!currentProjectData.sections) return;

    currentProjectData.sections.forEach(section => {
        section.tasks.forEach(task => {
            if (task.start_date && task.end_date) {
                // スケジュール済みタスク
                const taskRow = createGanttTaskRow(task);
                body.appendChild(taskRow);
            } else {
                // 未スケジュールタスク
                const taskCard = createUnscheduledTask(task);
                unscheduled.appendChild(taskCard);
            }
        });
    });

    // スケジュール済みタスクがない場合のメッセージ
    if (body.children.length === 0) {
        const emptyRow = document.createElement('div');
        emptyRow.className = 'gantt-empty';
        emptyRow.innerHTML = `
            <div class="gantt-task-info">
                <div class="gantt-task-title" style="color: #999;">日程が設定されたタスクがありません</div>
            </div>
            <div class="gantt-timeline"></div>
        `;
        body.appendChild(emptyRow);
    }
}

/**
 * ガントチャートタスク行作成
 */
function createGanttTaskRow(task) {
    const row = document.createElement('div');
    row.className = 'gantt-task-row';
    row.dataset.taskId = task.id;

    // タスク情報
    const taskInfo = document.createElement('div');
    taskInfo.className = 'gantt-task-info';
    taskInfo.innerHTML = `
        <div class="gantt-task-title">${task.title}</div>
        <div class="gantt-task-meta">
            <span class="priority-badge ${task.priority}">${getPriorityLabel(task.priority)}</span>
            <span class="status-badge ${task.status}">${getStatusLabel(task.status)}</span>
            ${task.assignee ? `<span class="assignee">${task.assignee}</span>` : ''}
        </div>
    `;

    // タイムライン
    const timeline = document.createElement('div');
    timeline.className = 'gantt-timeline';

    const taskBar = createTaskBar(task);
    if (taskBar) {
        timeline.appendChild(taskBar);
    }

    row.appendChild(taskInfo);
    row.appendChild(timeline);

    return row;
}

/**
 * タスクバー作成
 */
function createTaskBar(task) {
    const startDate = new Date(task.start_date);
    const endDate = new Date(task.end_date);

    // 表示範囲外のタスクは表示しない
    if (endDate < ganttStartDate || startDate > ganttEndDate) {
        return null;
    }

    const bar = document.createElement('div');
    bar.className = `gantt-task-bar ${task.priority}`;
    bar.dataset.taskId = task.id;

    const { left, width } = calculateBarPosition(startDate, endDate);
    bar.style.left = left + '%';
    bar.style.width = width + '%';

    // 進捗バー（完了部分を白っぽく表示）
    const progress = task.progress || 0;
    if (progress > 0) {
        const progressBar = document.createElement('div');
        progressBar.className = 'gantt-progress-bar';
        progressBar.style.width = progress + '%';
        bar.appendChild(progressBar);
    }

    // タスク名をバー内に表示（短縮）
    const barText = document.createElement('div');
    barText.className = 'gantt-task-bar-text';
    barText.textContent = task.title.length > 15 ? task.title.substring(0, 12) + '...' : task.title;
    bar.appendChild(barText);

    // ツールチップ
    bar.title = `${task.title}\n期間: ${task.start_date} - ${task.end_date}\n進捗: ${progress}%`;

    // クリックで編集
    bar.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditTaskModal(task);
    });

    return bar;
}

/**
 * バー位置計算
 */
function calculateBarPosition(startDate, endDate) {
    const totalDays = ganttDates.length;

    // 開始位置を計算
    let startIndex = ganttDates.findIndex(date =>
        formatDate(date) === formatDate(startDate)
    );

    // 終了位置を計算
    let endIndex = ganttDates.findIndex(date =>
        formatDate(date) === formatDate(endDate)
    );

    // 範囲外の場合の調整
    if (startIndex === -1) {
        startIndex = startDate < ganttStartDate ? 0 : totalDays - 1;
    }

    if (endIndex === -1) {
        endIndex = endDate > ganttEndDate ? totalDays - 1 : 0;
    }

    // 最低1日分の幅を確保
    if (endIndex <= startIndex) {
        endIndex = startIndex;
    }

    const left = (startIndex / totalDays) * 100;
    const width = Math.max(1, ((endIndex - startIndex + 1) / totalDays) * 100);

    return { left: Math.max(0, left), width: Math.min(100 - left, width) };
}

/**
 * 未スケジュールタスク作成
 */
function createUnscheduledTask(task) {
    const taskDiv = document.createElement('div');
    taskDiv.className = 'unscheduled-task';
    taskDiv.dataset.taskId = task.id;
    taskDiv.innerHTML = `
        <div class="task-title">${task.title}</div>
        <div class="task-meta">
            <span class="priority-badge ${task.priority}">${getPriorityLabel(task.priority)}</span>
            <span class="status-badge ${task.status}">${getStatusLabel(task.status)}</span>
            ${task.assignee ? `<span class="assignee">${task.assignee}</span>` : ''}
        </div>
    `;

    // クリックで編集
    taskDiv.addEventListener('click', () => openEditTaskModal(task));

    return taskDiv;
}

/**
 * ガント期間切り替え
 */
function switchGanttPeriod(period) {
    currentGanttPeriod = period;

    // ボタンの状態更新
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === period);
    });

    // チャート再描画
    displayGanttChart();
}

/**
 * 今日までスクロール
 */
function scrollToToday() {
    const todayHeader = document.querySelector('.gantt-date-header.today');
    if (todayHeader) {
        todayHeader.scrollIntoView({ behavior: 'smooth', inline: 'center' });
    }
}

/**
 * 日付フォーマット関数
 */
function formatDate(date) {
    return date.toISOString().split('T')[0];
}