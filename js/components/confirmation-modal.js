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
     * @param {string} title 
     * @param {string} message 
     * @param {string} [confirmText='Delete'] - Text for the confirm button
     * @param {string} [confirmClass='btn-danger'] - Class for the confirm button (e.g. btn-danger, btn-primary)
     * @returns {Promise<boolean>}
     */
    show(title, message, confirmText = 'Delete', confirmClass = 'btn-danger') {
        const modal = document.getElementById('confirmation-modal');
        const titleEl = document.getElementById('confirmation-modal-title');
        const msgEl = document.getElementById('confirmation-modal-message');
        const confirmBtn = document.getElementById('confirm-action-btn');

        titleEl.textContent = title || 'Confirm Action';
        msgEl.textContent = message || 'Are you sure?';

        // Update button appearance
        confirmBtn.textContent = confirmText;
        // Reset classes and add new ones
        confirmBtn.className = 'btn focusable ' + confirmClass;

        modal.classList.add('visible');
        confirmBtn.focus();

        return new Promise((resolve) => {
            this.resolvePromise = resolve;
        });
    }

    close(result) {
        const modal = document.getElementById('confirmation-modal');
        modal.classList.remove('visible');
        if (this.resolvePromise) {
            this.resolvePromise(result);
            this.resolvePromise = null;
        }
    }
}

// Export global instance
const ConfirmationModal = new ConfirmationModalComponent();
