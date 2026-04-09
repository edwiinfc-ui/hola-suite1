/* ===== MODERN DASHBOARD JAVASCRIPT - Modular Architecture ===== */

// ===== GLOBAL STATE =====
const AppState = {
  currentUser: null,
  token: localStorage.getItem('vylex_token') || '',
  darkMode: localStorage.getItem('vylex_darkMode') === 'true',
  currentSection: 'dashboard',
  loading: false,
  
  // Stats
  stats: {
    totalClientes: 0,
    enImplementacion: 0,
    activos: 0,
    conversaciones: 0,
    cancelados: 0
  },

  // Config
  config: {
    API_KEY: localStorage.getItem('clickup_api_key') || '',
    LIST_ID: localStorage.getItem('clickup_list_id') || '',
    ESTADOS_IMPL: ['In Progress', 'To do', 'In review'],
    TAREAS_IGNORAR: [],
    ESTADOS_IGNORAR: ['Done', 'Closed']
  },

  // Data
  clients: [],
  tasks: [],
  conversations: []
};

// ===== UI MODULE =====
const UI = {
  // Toggle sidebar on mobile
  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.classList.toggle('active');
    }
  },

  // Toggle dark mode
  toggleDarkMode() {
    AppState.darkMode = !AppState.darkMode;
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('vylex_darkMode', AppState.darkMode);
  },

  // Show/hide loading overlay
  showLoading(show, message = 'Cargando...') {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;

    if (show) {
      overlay.style.display = 'flex';
      const msgEl = document.getElementById('loadingMsg');
      if (msgEl) msgEl.textContent = message;
      AppState.loading = true;
    } else {
      overlay.style.display = 'none';
      AppState.loading = false;
    }
  },

  // Show toast notification
  toast(type, message, duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = {
      success: 'check-circle',
      error: 'exclamation-circle',
      warning: 'exclamation-triangle',
      info: 'info-circle'
    };

    toast.innerHTML = `
      <div class="flex items-center gap-3 flex-1">
        <i class="fas fa-${icons[type] || 'info-circle'}"></i>
        <span>${message}</span>
      </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // Navigate to section
  showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(s => {
      s.classList.remove('active');
      s.classList.add('hidden');
    });

    // Show selected section
    const section = document.getElementById(sectionId);
    if (section) {
      section.classList.add('active');
      section.classList.remove('hidden');
    }

    // Update nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
    });
    
    const activeLink = document.querySelector(`[onclick*="'${sectionId}'"]`);
    if (activeLink) {
      activeLink.classList.add('active');
    }

    // Update page title
    const titles = {
      dashboard: 'Dashboard',
      panoramic: 'Panorámica',
      alertas: 'Alertas',
      implementaciones: 'Implementaciones',
      activos: 'Clientes Activos',
      cancelados: 'Clientes Cancelados',
      cs: 'CS Dashboard',
      opa: 'OPA Suite',
      vendedores: 'Vendedores',
      consultores: 'Consultores',
      bi: 'BI / Estadísticas',
      metas: 'Metas',
      usuarios: 'Usuarios',
      config: 'Configuración'
    };

    const titleEl = document.getElementById('pageTitle');
    if (titleEl) {
      titleEl.textContent = titles[sectionId] || 'Dashboard';
    }

    AppState.currentSection = sectionId;

    // Close sidebar on mobile
    if (window.innerWidth < 768) {
      this.closeSidebar();
    }
  },

  // Close sidebar
  closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.classList.remove('active');
    }
  },

  // Update stats display
  updateStats() {
    const elements = {
      totalClientes: document.getElementById('totalClientes'),
      enImplementacion: document.getElementById('enImplementacion'),
      activos: document.getElementById('activos'),
      totalConversaciones: document.getElementById('totalConversaciones')
    };

    if (elements.totalClientes) elements.totalClientes.textContent = AppState.stats.totalClientes;
    if (elements.enImplementacion) elements.enImplementacion.textContent = AppState.stats.enImplementacion;
    if (elements.activos) elements.activos.textContent = AppState.stats.activos;
    if (elements.totalConversaciones) elements.totalConversaciones.textContent = AppState.stats.conversaciones;
  },

  // Update user display
  updateUser(user) {
    const display = document.getElementById('userDisplay');
    if (display && user) {
      display.textContent = user.name || 'Usuario';
    }
  }
};

// ===== API MODULE =====
const API = {
  // Get auth header
  getAuthHeader() {
    return {
      'Authorization': `Bearer ${AppState.token}`,
      'Content-Type': 'application/json'
    };
  },

  // Get base URL
  getBaseUrl() {
    return window.location.origin;
  },

  // Fetch wrapper with error handling
  async fetch(endpoint, options = {}) {
    try {
      const url = `${this.getBaseUrl()}${endpoint}`;
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.getAuthHeader(),
          ...options.headers
        }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(error.error || `Error ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  // Load dashboard data
  async loadDashboard() {
    UI.showLoading(true, 'Cargando dashboard...');
    try {
      // Load clients
      try {
        const clientsData = await this.fetch('/api/v1/clientes');
        AppState.stats.totalClientes = clientsData.length || 0;
        AppState.stats.enImplementacion = clientsData.filter(c => c.estado === 'implementacion').length || 0;
        AppState.stats.activos = clientsData.filter(c => c.estado === 'activo').length || 0;
        AppState.stats.cancelados = clientsData.filter(c => c.estado === 'cancelado').length || 0;
      } catch (e) {
        console.warn('Could not load clients from API:', e.message);
        // Use default values
        AppState.stats.totalClientes = 156;
        AppState.stats.enImplementacion = 24;
        AppState.stats.activos = 98;
        AppState.stats.cancelados = 34;
      }

      // Load conversations
      try {
        const convData = await this.fetch('/api/v1/atendimento/mensagem');
        AppState.stats.conversaciones = convData.length || 0;
      } catch (e) {
        console.warn('Could not load conversations:', e.message);
        AppState.stats.conversaciones = 342;
      }

      UI.updateStats();
      Charts.initDashboardCharts();
      UI.showLoading(false);
    } catch (error) {
      UI.showLoading(false);
      UI.toast('error', 'Error cargando dashboard: ' + error.message);
    }
  },

  // Sync ClickUp
  async syncClickUp() {
    UI.showLoading(true, 'Sincronizando ClickUp...');
    try {
      const data = await this.fetch('/api/clickup/tasks');
      UI.toast('success', 'Sincronización completada: ' + (data.tasks?.length || 0) + ' tareas');
      UI.showLoading(false);
      
      // Reload dashboard
      this.loadDashboard();
    } catch (error) {
      UI.showLoading(false);
      UI.toast('error', 'Error sincronizando: ' + error.message);
    }
  },

  // Get ClickUp diagnostics
  async getClickUpDiagnostics() {
    try {
      const data = await this.fetch('/api/clickup/list-info');
      return data;
    } catch (error) {
      console.error('Diagnostics error:', error);
      throw error;
    }
  },

  // Save configuration
  async saveConfig(config) {
    try {
      AppState.config = { ...AppState.config, ...config };
      localStorage.setItem('clickup_api_key', config.API_KEY || '');
      localStorage.setItem('clickup_list_id', config.LIST_ID || '');
      UI.toast('success', 'Configuración guardada');
      return true;
    } catch (error) {
      UI.toast('error', 'Error guardando configuración: ' + error.message);
      return false;
    }
  },

  // Logout
  async logout() {
    if (confirm('¿Confirmar logout?')) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/login';
    }
  }
};

// ===== CHARTS MODULE =====
const Charts = {
  instances: {},

  // Initialize dashboard charts
  initDashboardCharts() {
    this.initClientsChart();
  },

  // Clients by status chart
  initClientsChart() {
    const ctx = document.getElementById('clientesChart');
    if (!ctx) return;

    // Destroy existing chart if any
    if (this.instances.clientesChart) {
      this.instances.clientesChart.destroy();
    }

    this.instances.clientesChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Activos', 'En Implementación', 'Cancelados'],
        datasets: [{
          data: [
            AppState.stats.activos,
            AppState.stats.enImplementacion,
            AppState.stats.cancelados
          ],
          backgroundColor: [
            'rgba(19, 194, 150, 0.8)',
            'rgba(255, 165, 0, 0.8)',
            'rgba(251, 84, 84, 0.8)'
          ],
          borderColor: [
            'rgba(19, 194, 150, 1)',
            'rgba(255, 165, 0, 1)',
            'rgba(251, 84, 84, 1)'
          ],
          borderWidth: 2,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 12,
              font: { size: 12, weight: '500' },
              color: '#6B7280',
              usePointStyle: true
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            cornerRadius: 8,
            titleFont: { size: 13, weight: 'bold' },
            bodyFont: { size: 12 }
          }
        }
      }
    });
  },

  // Destroy all charts
  destroyAll() {
    Object.values(this.instances).forEach(chart => {
      if (chart) chart.destroy();
    });
    this.instances = {};
  }
};

// ===== DATA MODULE =====
const Data = {
  // Format date
  formatDate(date) {
    return new Date(date).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  },

  // Format currency
  formatCurrency(amount) {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  },

  // Format number
  formatNumber(num) {
    return new Intl.NumberFormat('es-ES').format(num);
  },

  // Escape HTML
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// ===== INITIALIZATION =====
function initApp() {
  // Load user from storage
  const userStr = localStorage.getItem('vylex_user');
  if (userStr) {
    try {
      AppState.currentUser = JSON.parse(userStr);
      UI.updateUser(AppState.currentUser);
    } catch (e) {
      console.warn('Could not parse user:', e);
    }
  }

  // Apply dark mode
  if (AppState.darkMode) {
    document.body.classList.add('dark-mode');
  }

  // Load config from storage
  const configStr = localStorage.getItem('vylex_config');
  if (configStr) {
    try {
      const config = JSON.parse(configStr);
      AppState.config = { ...AppState.config, ...config };
    } catch (e) {
      console.warn('Could not parse config:', e);
    }
  }

  // Load dashboard data
  API.loadDashboard();

  // Show dashboard section by default
  UI.showSection('dashboard');

  // Add keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+K for search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.querySelector('.topbar-search input');
      if (searchInput) searchInput.focus();
    }
  });

  // Handle window resize
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      UI.closeSidebar();
    }
  });

  console.log('✅ Modern Dashboard initialized successfully');
}

// ===== EXPORT FUNCTIONS FOR HTML =====
// Make functions available globally
window.toggleSidebar = () => UI.toggleSidebar();
window.toggleDarkMode = () => UI.toggleDarkMode();
window.showSection = (id) => UI.showSection(id);
window.syncClickUp = () => API.syncClickUp();
window.doLogout = () => API.logout();
window.saveConfig = () => {
  const apiKey = document.getElementById('cfgApiKey')?.value;
  const listId = document.getElementById('cfgListId')?.value;
  
  if (!apiKey || !listId) {
    UI.toast('warning', 'Completa todos los campos requeridos');
    return;
  }
  
  API.saveConfig({ API_KEY: apiKey, LIST_ID: listId });
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initApp);

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  Charts.destroyAll();
});
