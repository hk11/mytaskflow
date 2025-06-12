/**
 * MyTaskFlow メインJavaScript
 */

// グローバル変数
let currentProjectData = null;

// DOM読み込み完了時に実行
document.addEventListener('DOMContentLoaded', function() {
    loadProjectData();
    initializeModalEvents();
});

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
}

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

        // グローバル変数に保存
        currentProjectData = data;

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
 * ドラッグイベント設定（タスクカード用）
 */
function setupDragEvents(cardDiv) {
    cardDiv.addEventListener('dragstart', function(e) {
        e.dataTransfer.setData('text/plain', cardDiv.dataset.taskId);
        cardDiv.classList.add('dragging');
    });

    cardDiv.addEventListener('dragend', function(e) {
        cardDiv.classList.remove('dragging');
    });
}

/**
 * ドロップゾーン設定（セクション用）
 */
function setupDropZone(gridDiv) {
    gridDiv.addEventListener('dragover', function(e) {
        e.preventDefault();
        gridDiv.classList.add('drag-over');
    });

    gridDiv.addEventListener('dragleave', function(e) {
        gridDiv.classList.remove('drag-over');
    });

    gridDiv.addEventListener('drop', function(e) {
        e.preventDefault();
        gridDiv.classList.remove('drag-over');

        const taskId = e.dataTransfer.getData('text/plain');
        const newSectionId = gridDiv.dataset.sectionId;

        if (taskId && newSectionId) {
            moveTaskToSection(taskId, newSectionId);
        }
    });
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
            loadProjectData();
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

    // URLを自動リンクに変換
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
            loadProjectData();
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
            loadProjectData();
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

    // プロジェクトIDを追加（現在は固定値1）
    sectionData.project_id = 1;

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
            loadProjectData();
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
            loadProjectData();
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
    const errorElement = document.getElementById('error');
    errorElement.style.display = 'block';
    errorElement.textContent = 'JavaScriptエラーが発生しました。コンソールを確認してください。';
});