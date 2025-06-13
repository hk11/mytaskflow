/**
 * MyTaskFlow プロジェクト選択画面 JavaScript
 */

// グローバル変数
let currentProjects = [];
let isEventInitialized = false;

// DOM読み込み完了時に実行
document.addEventListener('DOMContentLoaded', function() {
    loadProjects();

    if (!isEventInitialized) {
        initializeEvents();
        isEventInitialized = true;
    }
});

/**
 * イベントリスナー初期化
 */
function initializeEvents() {
    // プロジェクト作成ボタン
    document.getElementById('createProjectBtn').addEventListener('click', openCreateProjectModal);

    // モーダル関連
    const modal = document.getElementById('projectModal');
    const closeBtn = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelBtn');
    const projectForm = document.getElementById('projectForm');

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    projectForm.addEventListener('submit', handleFormSubmit);

    // モーダル外クリックで閉じる
    window.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });

    // 検索機能
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    searchInput.addEventListener('input', function(e) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchProjects(e.target.value);
        }, 300);
    });
}

/**
 * プロジェクト一覧を読み込み
 */
async function loadProjects() {
    const loadingElement = document.getElementById('loading');
    const errorElement = document.getElementById('error');
    const projectsGrid = document.getElementById('projectsGrid');
    const emptyState = document.getElementById('emptyState');

    try {
        loadingElement.style.display = 'block';
        errorElement.style.display = 'none';
        projectsGrid.innerHTML = '';
        emptyState.style.display = 'none';

        const response = await fetch('api/projects.php');

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'プロジェクトの取得に失敗しました');
        }

        loadingElement.style.display = 'none';

        currentProjects = data.projects;
        displayProjects(currentProjects);

    } catch (error) {
        console.error('プロジェクト読み込みエラー:', error);
        loadingElement.style.display = 'none';
        errorElement.style.display = 'block';
        errorElement.textContent = `エラー: ${error.message}`;
    }
}

/**
 * プロジェクト一覧を表示
 */
function displayProjects(projects) {
    const projectsGrid = document.getElementById('projectsGrid');
    const emptyState = document.getElementById('emptyState');

    if (projects.length === 0) {
        projectsGrid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    projectsGrid.style.display = 'grid';
    emptyState.style.display = 'none';
    projectsGrid.innerHTML = '';

    projects.forEach(project => {
        const projectCard = createProjectCard(project);
        projectsGrid.appendChild(projectCard);
    });
}

/**
 * プロジェクトカードを作成
 */
function createProjectCard(project) {
    const cardDiv = document.createElement('div');
    cardDiv.className = `project-card ${project.status}`;
    cardDiv.dataset.projectId = project.id;

    // プロジェクトヘッダー
    const headerDiv = document.createElement('div');
    headerDiv.className = 'project-header';

    const titleH2 = document.createElement('h2');
    titleH2.className = 'project-title';
    titleH2.textContent = project.name;

    const statusSpan = document.createElement('span');
    statusSpan.className = `project-status ${project.status}`;
    statusSpan.textContent = getStatusLabel(project.status);

    headerDiv.appendChild(titleH2);
    headerDiv.appendChild(statusSpan);

    // プロジェクト説明
    const descriptionP = document.createElement('p');
    descriptionP.className = 'project-description';
    descriptionP.textContent = project.description || 'プロジェクトの説明はありません';

    // 統計情報
    const statsDiv = document.createElement('div');
    statsDiv.className = 'project-stats';

    const sectionStat = document.createElement('div');
    sectionStat.className = 'stat-item';
    sectionStat.innerHTML = `📂 ${project.section_count}セクション`;

    const taskStat = document.createElement('div');
    taskStat.className = 'stat-item';
    taskStat.innerHTML = `📋 ${project.task_count}タスク`;

    const progressStat = document.createElement('div');
    progressStat.className = 'stat-item';
    progressStat.innerHTML = `✅ ${project.progress}%完了`;

    statsDiv.appendChild(sectionStat);
    statsDiv.appendChild(taskStat);
    statsDiv.appendChild(progressStat);

    // プロジェクト操作ボタン
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'project-actions';

    const menuBtn = document.createElement('button');
    menuBtn.className = 'btn-menu';
    menuBtn.innerHTML = '⋮';
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showProjectMenu(e, project);
    });

    actionsDiv.appendChild(menuBtn);

    // プロジェクトクリックイベント
    cardDiv.addEventListener('click', () => {
        openProject(project.id);
    });

    cardDiv.appendChild(headerDiv);
    cardDiv.appendChild(descriptionP);
    cardDiv.appendChild(statsDiv);
    cardDiv.appendChild(actionsDiv);

    return cardDiv;
}

/**
 * プロジェクトメニューを表示
 */
function showProjectMenu(event, project) {
    // 簡単な実装：confirmダイアログを使用
    const action = confirm(`プロジェクト「${project.name}」を編集しますか？\n\nOK: 編集\nキャンセル: 削除`);

    if (action) {
        openEditProjectModal(project);
    } else {
        deleteProject(project.id, project.name);
    }
}

/**
 * プロジェクトを開く
 */
function openProject(projectId) {
    window.location.href = `main.html?project_id=${projectId}`;
}

/**
 * プロジェクト作成モーダルを開く
 */
function openCreateProjectModal() {
    const modal = document.getElementById('projectModal');
    const modalTitle = document.getElementById('modalTitle');
    const form = document.getElementById('projectForm');
    const saveBtn = document.getElementById('saveBtn');

    modalTitle.textContent = '新規プロジェクト作成';
    saveBtn.textContent = '作成';

    // フォームリセット
    form.reset();
    document.getElementById('projectId').value = '';

    modal.style.display = 'block';
}

/**
 * プロジェクト編集モーダルを開く
 */
function openEditProjectModal(project) {
    const modal = document.getElementById('projectModal');
    const modalTitle = document.getElementById('modalTitle');
    const saveBtn = document.getElementById('saveBtn');

    modalTitle.textContent = 'プロジェクト編集';
    saveBtn.textContent = '更新';

    // フォームに値設定
    document.getElementById('projectId').value = project.id;
    document.getElementById('projectName').value = project.name || '';
    document.getElementById('projectDescription').value = project.description || '';
    document.getElementById('projectStatus').value = project.status || 'active';

    modal.style.display = 'block';
}

/**
 * モーダルを閉じる
 */
function closeModal() {
    const modal = document.getElementById('projectModal');
    modal.style.display = 'none';
}

/**
 * フォーム送信処理
 */
async function handleFormSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const projectData = Object.fromEntries(formData);

    // 空の値を除去
    Object.keys(projectData).forEach(key => {
        if (projectData[key] === '') {
            delete projectData[key];
        }
    });

    const isEdit = projectData.id && projectData.id !== '';

    try {
        const response = await fetch('api/projects.php', {
            method: isEdit ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(projectData)
        });

        const result = await response.json();

        if (result.success) {
            closeModal();
            // データを再読み込み
            loadProjects();
        } else {
            alert('エラー: ' + (result.error || 'プロジェクトの保存に失敗しました'));
        }

    } catch (error) {
        console.error('プロジェクト保存エラー:', error);
        alert('エラー: ' + error.message);
    }
}

/**
 * プロジェクト削除
 */
async function deleteProject(projectId, projectName) {
    if (!confirm(`プロジェクト「${projectName}」を削除しますか？\n\n※セクションやタスクがある場合は削除できません`)) {
        return;
    }

    try {
        const response = await fetch(`api/projects.php?id=${projectId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            // データを再読み込み
            loadProjects();
        } else {
            alert('エラー: ' + (result.error || 'プロジェクトの削除に失敗しました'));
        }

    } catch (error) {
        console.error('プロジェクト削除エラー:', error);
        alert('エラー: ' + error.message);
    }
}

/**
 * プロジェクト検索
 */
function searchProjects(searchText) {
    if (!searchText.trim()) {
        displayProjects(currentProjects);
        return;
    }

    const filteredProjects = currentProjects.filter(project => {
        return project.name.toLowerCase().includes(searchText.toLowerCase()) ||
               (project.description && project.description.toLowerCase().includes(searchText.toLowerCase()));
    });

    displayProjects(filteredProjects);
}

/**
 * ステータスラベル取得
 */
function getStatusLabel(status) {
    const labels = {
        'active': '🟢 進行中',
        'completed': '🔵 完了',
        'on_hold': '🟡 保留',
        'archived': '⚫ アーカイブ'
    };
    return labels[status] || status;
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