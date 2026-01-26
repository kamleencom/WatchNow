// --- Confirmation Modal ---

class ConfirmationModalComponent {
    constructor() {
        this.resolvePromise = null;
        this.render();
        this.setupEventListeners();
    }

    render() {
        if (document.getElementById('confirmation-modal')) return;

        const modalHtml = `
            <div id="confirmation-modal" class="modal-overlay">
                <div class="modal-content glass-panel" style="max-width: 400px; text-align: center;">
                    <h3 id="confirmation-modal-title" style="margin-bottom: 15px;">Confirm Action</h3>
                    <p id="confirmation-modal-message" style="margin-bottom: 25px; opacity: 0.8;">Are you sure?</p>
                    <div class="modal-actions" style="justify-content: center;">
                        <button id="confirm-cancel-btn" class="btn btn-text focusable">Cancel</button>
                        <button id="confirm-action-btn" class="btn btn-danger focusable">Delete</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    setupEventListeners() {
        const cancelBtn = document.getElementById('confirm-cancel-btn');
        const confirmBtn = document.getElementById('confirm-action-btn');

        // Remove old listeners if any (though standard DOM replacement handles this)
        // Using arrow functions to bind 'this'
        cancelBtn.addEventListener('click', () => this.close(false));
        confirmBtn.addEventListener('click', () => this.close(true));
    }

    /**
     * Shows the confirmation modal
     * @param {Object} options - Modal options
     */
    show(options = {}) {
        const {
            title = 'Confirm Action',
            message = 'Are you sure?',
            confirmText = 'Delete',
            confirmClass = 'btn-danger',
            onConfirm = null,
            onCancel = null
        } = options;

        const modal = document.getElementById('confirmation-modal');
        const titleEl = document.getElementById('confirmation-modal-title');
        const msgEl = document.getElementById('confirmation-modal-message');
        const confirmBtn = document.getElementById('confirm-action-btn');

        titleEl.textContent = title;
        msgEl.textContent = message;

        // Update button appearance
        confirmBtn.textContent = confirmText;
        confirmBtn.className = 'btn focusable ' + confirmClass;

        // Store callbacks
        this.onConfirm = onConfirm;
        this.onCancel = onCancel;

        modal.classList.add('visible');

        if (window.nav && typeof nav.setFocus === 'function') {
            nav.setFocus(confirmBtn);
        } else {
            confirmBtn.focus();
        }

        return new Promise((resolve) => {
            this.resolvePromise = resolve;
        });
    }

    close(result) {
        const modal = document.getElementById('confirmation-modal');
        if (!modal) return;

        modal.classList.remove('visible');

        if (result && this.onConfirm) {
            this.onConfirm();
        } else if (!result && this.onCancel) {
            this.onCancel();
        }

        if (this.resolvePromise) {
            this.resolvePromise(result);
            this.resolvePromise = null;
        }

        this.onConfirm = null;
        this.onCancel = null;
    }
}

// Export global instance
window.ConfirmationModal = new ConfirmationModalComponent();
