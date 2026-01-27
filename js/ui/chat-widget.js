import { AIService } from '../services/ai-service.js';

export class ChatWidget {
    constructor() {
        this.render();
        this.isVisible = false;
        this.messagesContainer = this.widget.querySelector('.chat-messages');
    }

    render() {
        // Floating Button
        this.fab = document.createElement('button');
        this.fab.className = 'chat-fab';
        this.fab.style.display = 'none'; // START HIDDEN
        this.fab.innerHTML = '<i data-lucide="bot" style="width:28px;height:28px;"></i>';
        this.fab.onclick = () => this.toggle();

        // Window
        this.widget = document.createElement('div');
        this.widget.className = 'chat-window';
        this.widget.innerHTML = `
            <div class="chat-header">
                <div class="chat-title">
                    <div class="chat-avatar-mini"><i data-lucide="sparkles" style="width:16px;"></i></div>
                    <span>All Words AI</span>
                </div>
                <button class="btn-close-chat"><i data-lucide="x"></i></button>
            </div>
            <div class="chat-messages">
                <div class="message bot">
                    Olá! Sou sua assistente virtual. Como posso ajudar com suas aulas hoje?
                </div>
            </div>
            <div class="chat-input-area">
                <input type="text" class="chat-input" placeholder="Digite sua dúvida...">
                <button class="btn-send"><i data-lucide="send" style="width:18px;"></i></button>
            </div>
        `;

        document.body.appendChild(this.fab);
        document.body.appendChild(this.widget);

        // Bind Events
        this.widget.querySelector('.btn-close-chat').onclick = () => this.toggle();

        const input = this.widget.querySelector('.chat-input');
        const sendBtn = this.widget.querySelector('.btn-send');

        const sendMessage = () => {
            const text = input.value.trim();
            if (text) {
                this.addMessage(text, 'user');
                input.value = '';
                this.processAIResponse(text);
            }
        };

        sendBtn.onclick = sendMessage;
        input.onkeypress = (e) => {
            if (e.key === 'Enter') sendMessage();
        };

        // Lucide
        if (window.lucide) lucide.createIcons();
    }

    setVisibility(visible) {
        if (this.fab) {
            this.fab.style.display = visible ? 'flex' : 'none';
            if (!visible) {
                // If hiding, also close the window if open
                this.isVisible = false;
                this.widget.classList.remove('active');
            }
        }
    }

    toggle() {
        this.isVisible = !this.isVisible;
        this.widget.classList.toggle('active', this.isVisible);
        // Focus input if opening
        if (this.isVisible) {
            setTimeout(() => this.widget.querySelector('.chat-input').focus(), 100);
        }
    }

    open() {
        if (!this.isVisible) this.toggle();
    }

    openWithPrompt(text) {
        if (!this.isVisible) this.toggle();
        // Optional: Pre-fill input or auto-send?
        // Let's auto-fill input for user to confirm
        const input = this.widget.querySelector('.chat-input');
        input.value = text;
        input.focus();
    }

    addMessage(text, sender) {
        const msg = document.createElement('div');
        msg.className = `message ${sender}`;
        msg.textContent = text; // TextContent for safety XSS
        this.messagesContainer.appendChild(msg);
        this.scrollToBottom();
    }

    clear() {
        this.messagesContainer.innerHTML = '';
        this.addMessage('Olá! Sou sua assistente virtual. Como posso ajudar com suas aulas hoje?', 'bot');
    }

    showTyping() {
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.id = 'typing-indicator';
        indicator.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        this.messagesContainer.appendChild(indicator);
        this.scrollToBottom();
    }

    removeTyping() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    async processAIResponse(userText) {
        this.showTyping();
        const responseText = await AIService.sendMessage(userText);
        this.removeTyping();
        this.addMessage(responseText, 'bot');
    }
}

export const chatWidget = new ChatWidget();

// Make accessible to app.js
window.chatWidget = chatWidget;
