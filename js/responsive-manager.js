/**
 * 📱 RESPONSIVE - Gestor de Navegación en Móviles
 * Maneja el sidebar colapsable y opciones responsivas
 */

class ResponsiveManager {
  constructor() {
    this.isMobile = window.innerWidth < 768;
    this.isTablet = window.innerWidth >= 480 && window.innerWidth < 768;
    this.isDesktop = window.innerWidth >= 768;
    
    this.sidebar = document.getElementById('sidebar');
    this.content = document.getElementById('content');
    this.topbar = document.querySelector('.topbar');
    
    this.init();
  }

  init() {
    this.createMenuButton();
    this.createOverlay();
    this.setupEventListeners();
    this.adjustLayout();
    
    // Escuchar cambios de tamaño
    window.addEventListener('resize', () => this.handleResize());
    window.addEventListener('orientationchange', () => this.handleOrientationChange());
    
    console.log('✓ ResponsiveManager inicializado');
  }

  /**
   * Crear botón de menú para móviles
   */
  createMenuButton() {
    if (!this.isMobile && !this.isTablet) return;
    
    // Verificar si ya existe
    if (document.getElementById('mobileMenuBtn')) return;
    
    const menuBtn = document.createElement('button');
    menuBtn.id = 'mobileMenuBtn';
    menuBtn.className = 'mobile-menu-btn';
    menuBtn.innerHTML = '<i class="fas fa-bars"></i>';
    menuBtn.title = 'Abrir menú';
    
    // Agregar estilos inline iniciales
    menuBtn.style.cssText = `
      position: fixed;
      bottom: 16px;
      left: 16px;
      z-index: 98;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--primary), var(--primary-dark));
      border: none;
      color: #fff;
      font-size: 20px;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(255, 109, 0, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
    `;
    
    menuBtn.addEventListener('click', () => this.toggleSidebar());
    document.body.appendChild(menuBtn);
  }

  /**
   * Crear overlay para cerrar sidebar
   */
  createOverlay() {
    if (!this.isMobile && !this.isTablet) return;
    
    if (document.querySelector('.sidebar-overlay')) return;
    
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.addEventListener('click', () => this.closeSidebar());
    document.body.appendChild(overlay);
  }

  /**
   * Toggle del sidebar
   */
  toggleSidebar() {
    const overlay = document.querySelector('.sidebar-overlay');
    
    if (this.sidebar.classList.contains('mobile-open')) {
      this.closeSidebar();
    } else {
      this.openSidebar();
    }
  }

  /**
   * Abrir sidebar
   */
  openSidebar() {
    this.sidebar.classList.add('mobile-open');
    const overlay = document.querySelector('.sidebar-overlay');
    if (overlay) overlay.classList.add('active');
    
    const menuBtn = document.getElementById('mobileMenuBtn');
    if (menuBtn) {
      menuBtn.innerHTML = '<i class="fas fa-times"></i>';
      menuBtn.title = 'Cerrar menú';
    }
  }

  /**
   * Cerrar sidebar
   */
  closeSidebar() {
    this.sidebar.classList.remove('mobile-open');
    const overlay = document.querySelector('.sidebar-overlay');
    if (overlay) overlay.classList.remove('active');
    
    const menuBtn = document.getElementById('mobileMenuBtn');
    if (menuBtn) {
      menuBtn.innerHTML = '<i class="fas fa-bars"></i>';
      menuBtn.title = 'Abrir menú';
    }
  }

  /**
   * Cerrar sidebar al hacer click en item
   */
  setupEventListeners() {
    // Cerrar sidebar al hacer click en nav item
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        if (this.isMobile || this.isTablet) {
          setTimeout(() => this.closeSidebar(), 300);
        }
      });
    });
    
    // Cerrar sidebar al hacer ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (this.isMobile || this.isTablet)) {
        this.closeSidebar();
      }
    });
  }

  /**
   * Manejar cambios de tamaño
   */
  handleResize() {
    const wasDesktop = this.isDesktop;
    
    this.isMobile = window.innerWidth < 480;
    this.isTablet = window.innerWidth >= 480 && window.innerWidth < 768;
    this.isDesktop = window.innerWidth >= 768;
    
    // Si cambia de móvil a desktop
    if (wasDesktop !== this.isDesktop) {
      this.closeSidebar();
      this.adjustLayout();
    }
    
    this.adjustFooter();
  }

  /**
   * Manejar cambio de orientación
   */
  handleOrientationChange() {
    console.log('Orientación:', window.orientation);
    setTimeout(() => {
      this.handleResize();
      window.scrollTo(0, 0);
    }, 100);
  }

  /**
   * Ajustar layout según pantalla
   */
  adjustLayout() {
    if (this.isDesktop) {
      // Desktop
      this.sidebar.classList.remove('mobile-open');
      const overlay = document.querySelector('.sidebar-overlay');
      if (overlay) overlay.classList.remove('active');
      
      const menuBtn = document.getElementById('mobileMenuBtn');
      if (menuBtn) menuBtn.style.display = 'none';
    } else {
      // Móvil/Tablet
      const menuBtn = document.getElementById('mobileMenuBtn');
      if (menuBtn) menuBtn.style.display = 'flex';
    }
  }

  /**
   * Ajustar position del botón según footer
   */
  adjustFooter() {
    const menuBtn = document.getElementById('mobileMenuBtn');
    if (!menuBtn) return;
    
    // Verificar si hay contenido debajo
    const lastElement = document.querySelector('.section.active .upsell-form, .section.active .kanban-items, .section.active table');
    
    if (lastElement) {
      const rect = lastElement.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - 80) {
        menuBtn.style.bottom = window.innerHeight - rect.bottom + 'px';
      } else {
        menuBtn.style.bottom = '16px';
      }
    }
  }

  /**
   * Detectar si es dispositivo touchscreen
   */
  static isTouchDevice() {
    return (
      (typeof window !== 'undefined' && 'ontouchstart' in window) ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
    );
  }

  /**
   * Obtener información del dispositivo
   */
  static getDeviceInfo() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      isMobile: window.innerWidth < 480,
      isTablet: window.innerWidth >= 480 && window.innerWidth < 768,
      isDesktop: window.innerWidth >= 768,
      isLandscape: window.innerWidth > window.innerHeight,
      isPortrait: window.innerWidth < window.innerHeight,
      isTouch: this.isTouchDevice(),
      userAgent: navigator.userAgent,
      pixelRatio: window.devicePixelRatio
    };
  }
}

/**
 * Inicializar cuando el DOM esté listo
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.responsiveManager = new ResponsiveManager();
  });
} else {
  window.responsiveManager = new ResponsiveManager();
}

/**
 * Exportar para uso global
 */
window.ResponsiveManager = ResponsiveManager;
