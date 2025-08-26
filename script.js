// ===== CONFIGURAÇÃO =====
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxNN67rzmoIhXnxZhdCHNfkvkKCo8aeCUusWxFC1EbiLQ062K5c0lAN7sOlnjWHPyYJ/exec';

// ===== VARIÁVEIS GLOBAIS =====
let scriptUrl = SCRIPT_URL;
let tasks = [];
let editingTask = null;
let isConnected = false;

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Mudança Colaborativa - Sistema iniciando...');
    setupEventListeners();
    connectToScript();
});

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    // Filtros
    document.getElementById('searchInput').addEventListener('input', debounce(filterTasks, 300));
    document.getElementById('responsibleFilter').addEventListener('change', filterTasks);
    document.getElementById('statusFilter').addEventListener('change', filterTasks);
    document.getElementById('phaseFilter').addEventListener('change', filterTasks);
    
    // Botões
    document.getElementById('addTaskBtn').addEventListener('click', () => openTaskModal());
    document.getElementById('refreshBtn').addEventListener('click', loadTasks);
    document.getElementById('closeModal').addEventListener('click', closeTaskModal);
    document.getElementById('cancelBtn').addEventListener('click', closeTaskModal);
    
    // Formulário
    document.getElementById('taskForm').addEventListener('submit', saveTask);
    
    // Modal
    document.getElementById('taskModal').addEventListener('click', (e) => {
        if (e.target.id === 'taskModal') closeTaskModal();
    });
}

// ===== FUNÇÕES DE CONEXÃO =====
async function connectToScript() {
    updateConnectionStatus('loading');
    console.log('Conectando com Google Apps Script...', scriptUrl);
    
    try {
        await loadTasks();
        isConnected = true;
        updateConnectionStatus('connected');
        hideDebugPanel();
        document.getElementById('troubleshootingPanel').style.display = 'none';
        showMessage('🎉 Sistema carregado! Suas tarefas estão sincronizadas', 'success');
        console.log('✅ Conexão estabelecida com sucesso!');
    } catch (error) {
        isConnected = false;
        updateConnectionStatus('disconnected');
        
        console.error('❌ Erro de conexão:', error);
        showDebugPanel(error);
        
        let userMessage = '';
        if (error.message.includes('fetch')) {
            userMessage = '🌐 Problema de rede ou CORS. O Google Apps Script pode não estar publicado corretamente.';
        } else if (error.message.includes('HTTP 403')) {
            userMessage = '🔐 Erro de permissão. Verifique se o script está publicado com acesso "Qualquer pessoa".';
        } else if (error.message.includes('HTTP 404')) {
            userMessage = '❌ Script não encontrado. Verifique se a URL está correta.';
        } else {
            userMessage = `💥 Erro: ${error.message}`;
        }
        
        showMessage(userMessage, 'error');
    }
}

function updateConnectionStatus(status) {
    const statusEl = document.getElementById('topStatus');
    statusEl.className = 'connection-status';
    
    switch(status) {
        case 'connected':
            statusEl.classList.add('status-connected');
            statusEl.innerHTML = '✅ Conectado ao Google Sheets - Dados sincronizados automaticamente!';
            break;
        case 'loading':
            statusEl.classList.add('status-loading');
            statusEl.innerHTML = '⏳ Carregando suas tarefas do Google Sheets...';
            break;
        default:
            statusEl.classList.add('status-disconnected');
            statusEl.innerHTML = '❌ Erro de conexão - Verifique as informações de debug abaixo';
    }
}

// ===== CARREGAMENTO DE DADOS =====
async function loadTasks() {
    if (!scriptUrl) {
        throw new Error('URL do Google Apps Script não configurada');
    }
    
    showLoading(true);
    
    try {
        console.log('📡 Fazendo requisição para:', scriptUrl);
        
        const response = await fetch(`${scriptUrl}?action=getTasks&_t=${Date.now()}`, {
            method: 'GET',
            headers: {
                'Cache-Control': 'no-cache'
            }
        });
        
        console.log('📊 Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
        }
        
        const textResponse = await response.text();
        console.log('📄 Raw response:', textResponse.substring(0, 500) + '...');
        
        let data;
        try {
            data = JSON.parse(textResponse);
        } catch (parseError) {
            throw new Error('Resposta inválida do servidor. Verifique se o Google Apps Script está publicado corretamente.');
        }
        
        if (data.success) {
            tasks = data.tasks || [];
            console.log(`✅ Tasks carregadas: ${tasks.length} tarefas`);
            renderTasks();
            updateStats();
            populateFilters();
            showLoading(false);
        } else {
            throw new Error(data.error || 'Erro desconhecido ao carregar tarefas');
        }
    } catch (error) {
        showLoading(false);
        console.error('💥 Erro detalhado:', error);
        throw new Error(error.message);
    }
}

// ===== OPERAÇÕES CRUD =====
async function saveTaskToSheet(taskData, isUpdate = false) {
    try {
        const action = isUpdate ? 'updateTask' : 'saveTask';
        console.log(`💾 Salvando tarefa (${action}):`, taskData);
        
        const response = await fetch(scriptUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: action,
                task: taskData
            })
        });
        
        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            showMessage(`✅ ${result.message}`, 'success');
            await loadTasks();
        } else {
            throw new Error(result.error || 'Erro ao salvar tarefa');
        }
    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
        showMessage(`💥 ${error.message}`, 'error');
        throw error;
    }
}

async function deleteTaskFromSheet(task) {
    try {
        console.log('🗑️ Deletando tarefa:', task);
        
        const response = await fetch(scriptUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'deleteTask',
                rowIndex: task.rowIndex
            })
        });
        
        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            showMessage('🗑️ Tarefa excluída com sucesso!', 'success');
            await loadTasks();
        } else {
            throw new Error(result.error || 'Erro ao excluir tarefa');
        }
    } catch (error) {
        console.error('❌ Erro ao deletar:', error);
        showMessage(`💥 ${error.message}`, 'error');
        throw error;
    }
}

// ===== FUNÇÕES DE RENDERIZAÇÃO =====
function renderTasks() {
    const container = document.getElementById('tasksContainer');
    const filteredTasks = getFilteredTasks();
    
    if (filteredTasks.length === 0) {
        container.innerHTML = `
            <div class="no-tasks">
                <h3>📋 Nenhuma tarefa encontrada</h3>
                <p>Ajuste os filtros ou adicione uma nova tarefa</p>
                <button class="btn" onclick="openTaskModal()">➕ Criar primeira tarefa</button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredTasks.map(task => `
        <div class="task-card">
            <div class="phase-tag phase-${(task.fase || '').toLowerCase()}">${getPhaseLabel(task.fase)}</div>
            <div class="task-header">
                <div class="task-title">${task.tarefa || 'Sem título'}</div>
                <div class="status-badge status-${(task.status || 'pendente').toLowerCase()}">${task.status || 'Pendente'}</div>
            </div>
            <div class="task-meta">
                <div class="meta-item">👤 ${task.responsavel || 'Não atribuída'}</div>
                <div class="meta-item">📅 ${formatDate(task.prazo)}</div>
            </div>
            ${task.observacoes ? `<div class="task-notes">"${task.observacoes}"</div>` : ''}
            <div class="task-actions">
                <button class="btn btn-small" onclick="editTask('${task.id}')">✏️ Editar</button>
                <button class="btn btn-small ${task.status === 'Feito' ? 'btn-secondary' : 'btn-success'}" onclick="toggleTaskStatus('${task.id}')">
                    ${task.status === 'Feito' ? '↩️ Reabrir' : '✅ Marcar como feito'}
                </button>
                <button class="btn btn-small btn-danger" onclick="deleteTask('${task.id}')">🗑️ Excluir</button>
            </div>
        </div>
    `).join('');
    
    console.log(`🎨 Renderizadas ${filteredTasks.length} tarefas de ${tasks.length} total`);
}

function updateStats() {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'Feito').length;
    const inProgressTasks = tasks.filter(t => t.status === 'Fazendo').length;
    const pendingTasks = tasks.filter(t => t.status === 'Pendente').length;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const overdueTasks = tasks.filter(t => {
        if (!t.prazo || t.status === 'Feito') return false;
        const taskDate = new Date(t.prazo);
        return taskDate < today;
    }).length;
    
    const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    document.getElementById('stats').innerHTML = `
        <div class="stat-card">
            <div class="stat-number">${totalTasks}</div>
            <div class="stat-label">Total</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${completedTasks}</div>
            <div class="stat-label">Concluídas</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${inProgressTasks}</div>
            <div class="stat-label">Em Andamento</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${pendingTasks}</div>
            <div class="stat-label">Pendentes</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${overdueTasks}</div>
            <div class="stat-label">Em Atraso</div>
        </div>
    `;
    
    // Atualizar barra de progresso
    document.getElementById('progressBar').style.width = `${completionPercentage}%`;
    document.getElementById('progressText').textContent = 
        `${completionPercentage}% concluído (${completedTasks} de ${totalTasks} tarefas)`;
    
    console.log(`📊 Stats atualizadas: ${completionPercentage}% concluído`);
}

// ===== FUNÇÕES DE FILTRO =====
function getFilteredTasks() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const responsible = document.getElementById('responsibleFilter').value;
    const status = document.getElementById('statusFilter').value;
    const phase = document.getElementById('phaseFilter').value;
    
    return tasks.filter(task => {
        const matchesSearch = (task.tarefa || '').toLowerCase().includes(search) || 
                            (task.observacoes || '').toLowerCase().includes(search) ||
                            (task.responsavel || '').toLowerCase().includes(search);
        const matchesResponsible = !responsible || task.responsavel === responsible;
        const matchesStatus = !status || task.status === status;
        const matchesPhase = !phase || task.fase === phase;
        
        return matchesSearch && matchesResponsible && matchesStatus && matchesPhase;
    });
}

function populateFilters() {
    const responsibleFilter = document.getElementById('responsibleFilter');
    const responsibles = [...new Set(tasks.map(t => t.responsavel).filter(r => r && r.trim() !== ''))].sort();
    
    responsibleFilter.innerHTML = '<option value="">Todas as pessoas</option>' + 
        responsibles.map(r => `<option value="${r}">${r}</option>`).join('');
    
    console.log('🔍 Filtros atualizados:', responsibles);
}

function filterTasks() {
    renderTasks();
}

// ===== FUNÇÕES DO MODAL =====
function openTaskModal(task = null) {
    editingTask = task;
    
    if (task) {
        document.getElementById('modalTitle').textContent = '✏️ Editar Tarefa';
        document.getElementById('taskName').value = task.tarefa || '';
        document.getElementById('taskPhase').value = task.fase || '';
        document.getElementById('taskResponsible').value = task.responsavel || '';
        document.getElementById('taskDate').value = task.prazo || '';
        document.getElementById('taskStatus').value = task.status || 'Pendente';
        document.getElementById('taskNotes').value = task.observacoes || '';
    } else {
        document.getElementById('modalTitle').textContent = '➕ Nova Tarefa';
        document.getElementById('taskForm').reset();
    }
    
    document.getElementById('taskModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
    
    console.log('📝 Modal aberto:', task ? 'Editando' : 'Criando nova');
}

function closeTaskModal() {
    document.getElementById('taskModal').style.display = 'none';
    document.body.style.overflow = 'auto';
    editingTask = null;
    
    console.log('❌ Modal fechado');
}

// ===== AÇÕES DAS TAREFAS =====
async function saveTask(e) {
    e.preventDefault();
    
    if (!isConnected) {
        showMessage('🔌 Conecte-se ao Google Sheets primeiro', 'error');
        return;
    }
    
    const taskData = {
        fase: document.getElementById('taskPhase').value,
        tarefa: document.getElementById('taskName').value,
        responsavel: document.getElementById('taskResponsible').value,
        prazo: document.getElementById('taskDate').value,
        status: document.getElementById('taskStatus').value,
        observacoes: document.getElementById('taskNotes').value,
        id: editingTask ? editingTask.id : Date.now().toString()
    };
    
    if (editingTask) {
        taskData.rowIndex = editingTask.rowIndex;
    }
    
    try {
        await saveTaskToSheet(taskData, !!editingTask);
        closeTaskModal();
    } catch (error) {
        // Erro já tratado em saveTaskToSheet
    }
}

function editTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        openTaskModal(task);
    }
}

async function toggleTaskStatus(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const newStatus = task.status === 'Feito' ? 'Pendente' : 'Feito';
    const updatedTask = { ...task, status: newStatus };
    
    try {
        await saveTaskToSheet(updatedTask, true);
    } catch (error) {
        // Erro já tratado em saveTaskToSheet
    }
}

async function deleteTask(taskId) {
    if (!confirm('🗑️ Tem certeza que deseja excluir esta tarefa?\n\nEsta ação não pode ser desfeita.')) return;
    
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    try {
        await deleteTaskFromSheet(task);
    } catch (error) {
        // Erro já tratado em deleteTaskFromSheet
    }
}

// ===== FUNÇÕES DE DEBUG =====
function showDebugPanel(error) {
    const debugPanel = document.getElementById('debugPanel');
    const debugInfo = document.getElementById('debugInfo');
    
    const debugText = `URL do Script: ${scriptUrl}
Erro: ${error.name} - ${error.message}
Timestamp: ${new Date().toLocaleString()}

Teste manual:
Abra esta URL no navegador: ${scriptUrl}?action=getTasks
Você deve ver um JSON com "success": true

Navegador: ${navigator.userAgent}`;

    debugInfo.textContent = debugText;
    debugPanel.style.display = 'block';
    
    console.log('🔧 Debug panel mostrado');
}

function hideDebugPanel() {
    document.getElementById('debugPanel').style.display = 'none';
}

async function testConnection() {
    const result = document.getElementById('debugInfo');
    result.textContent = 'Testando conexão...\n';
    
    try {
        const testUrl = `${scriptUrl}?action=getTasks&test=1`;
        result.textContent += `Fazendo requisição para: ${testUrl}\n`;
        
        const response = await fetch(testUrl);
        result.textContent += `Status: ${response.status} ${response.statusText}\n`;
        
        const text = await response.text();
        result.textContent += `Resposta: ${text.substring(0, 500)}...\n`;
        
        if (response.ok) {
            const data = JSON.parse(text);
            
            if (data.success) {
                showMessage('✅ Teste de conexão bem-sucedido!', 'success');
                hideDebugPanel();
                connectToScript();
            } else {
                result.textContent += `Erro no script: ${data.error}\n`;
            }
        }
    } catch (error) {
        result.textContent += `Erro no teste: ${error.message}\n`;
    }
    
    console.log('🧪 Teste de conexão executado');
}

function showTroubleshooting() {
    document.getElementById('troubleshootingPanel').style.display = 'block';
}

function hideTroubleshooting() {
    document.getElementById('troubleshootingPanel').style.display = 'none';
}

// ===== FUNÇÕES UTILITÁRIAS =====
function getPhaseLabel(phase) {
    const labels = {
        'PREP': '🔧 Preparação',
        'CONTRATO': '📋 Contrato', 
        'MUDANÇA': '📦 Mudança',
        'INTEGRAÇÃO': '🐱 Integração',
        'FINALIZAÇÃO': '✅ Finalização',
        'EMERGÊNCIA': '🚨 Emergência'
    };
    return labels[phase] || phase || 'Sem fase';
}

function formatDate(dateString) {
    if (!dateString || dateString.trim() === '') return 'Sem prazo';
    
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Data inválida';
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const taskDate = new Date(dateString);
        taskDate.setHours(0, 0, 0, 0);
        
        const diffTime = taskDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        const formatted = date.toLocaleDateString('pt-BR');
        
        if (diffDays < 0) {
            return `${formatted} (${Math.abs(diffDays)} dias atrás)`;
        } else if (diffDays === 0) {
            return `${formatted} (hoje)`;
        } else if (diffDays === 1) {
            return `${formatted} (amanhã)`;
        } else if (diffDays <= 7) {
            return `${formatted} (${diffDays} dias)`;
        } else {
            return formatted;
        }
    } catch (error) {
        return dateString;
    }
}

function showLoading(show) {
    const container = document.getElementById('tasksContainer');
    if (show) {
        container.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Sincronizando com Google Sheets...</p>
            </div>
        `;
    }
}

function showMessage(message, type = 'info') {
    // Remover mensagens existentes
    const existing = document.querySelectorAll('.message');
    existing.forEach(msg => msg.remove());
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.textContent = message;
    
    document.querySelector('.container').insertBefore(
        messageDiv, 
        document.querySelector('.container').firstElementChild.nextElementSibling
    );
    
    setTimeout(() => messageDiv.remove(), 6000);
    
    console.log(`📢 Mensagem (${type}):`, message);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ===== ATALHOS DE TECLADO =====
document.addEventListener('keydown', (e) => {
    // Ctrl+N para nova tarefa
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        if (isConnected) openTaskModal();
    }
    
    // Escape para fechar modal
    if (e.key === 'Escape') {
        closeTaskModal();
    }
    
    // Ctrl+R para atualizar
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        if (isConnected) loadTasks();
    }
});

// ===== AUTO-REFRESH =====
setInterval(() => {
    if (isConnected && document.visibilityState === 'visible') {
        console.log('🔄 Auto-refresh executando...');
        loadTasks().catch(error => {
            console.warn('⚠️ Auto-refresh falhou:', error);
        });
    }
}, 5 * 60 * 1000); // 5 minutos

// ===== INFO DO CONSOLE =====
console.log(`
🏠 MUDANÇA COLABORATIVA - Sistema carregado!
📊 URL do Google Apps Script: ${SCRIPT_URL}
⚡ Funcionalidades: CRUD completo, filtros, auto-refresh
🎯 Atalhos: Ctrl+N (nova tarefa), Esc (fechar modal), Ctrl+R (refresh)
`);
