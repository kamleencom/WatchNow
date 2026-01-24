/**
 * Router Manager
 * Handles navigation between main views.
 */
class Router {
    constructor() {
        this.currentView = 'home';
    }

    init() {
        this.setupNavigation();
    }

    setupNavigation() {
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => {
            el.addEventListener('click', () => {
                this.switchToView(el.dataset.target);
            });
        });
    }

    switchToView(targetId) {
        state.currentView = targetId;

        document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => {
            el.classList.toggle('active', el.dataset.target === targetId);
        });

        document.querySelectorAll('.view-section').forEach(el => {
            el.classList.remove('active');
        });

        const targetSection = document.getElementById(targetId);
        if (targetSection) {
            targetSection.classList.add('active');
        }

        if (window.lucide) {
            lucide.createIcons();
        }

        if (targetId === 'home') {
            if (typeof renderHomeView === 'function') {
                renderHomeView();
            }
        }
    }
}

window.router = new Router();
