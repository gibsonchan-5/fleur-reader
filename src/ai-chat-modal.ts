import { Modal, App, MarkdownRenderer, MarkdownRenderChild } from 'obsidian';
import type FleurReaderPlugin from './main';
import { AIService } from './ai-service';

export class AIChatPanel {
  private modal: Modal;
  private content: HTMLElement;
  private chatContainer: HTMLElement;
  private inputContainer: HTMLElement;
  private input: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private messages: Array<{ role: string; content: string }> = [];
  private isStreaming = false;
  private abortController: AbortController | null = null;

  constructor(private plugin: FleurReaderPlugin, initialText: string, private mode: 'explain' | 'translate') {
    this.modal = new Modal(plugin.app);
    this.modal.titleEl.setText(mode === 'explain' ? 'AI 解释' : 'AI 翻译');
    
    this.content = this.modal.contentEl;
    this.content.style.cssText = `
      display: flex;
      flex-direction: column;
      height: 70vh;
      padding: 0;
    `;

    // 聊天容器
    this.chatContainer = this.content.createDiv();
    this.chatContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;

    // 输入容器
    this.inputContainer = this.content.createDiv();
    this.inputContainer.style.cssText = `
      padding: 12px 16px;
      border-top: 1px solid var(--background-modifier-border);
      display: flex;
      gap: 8px;
      align-items: flex-end;
    `;

    this.input = this.inputContainer.createEl('textarea');
    this.input.placeholder = '输入问题或编辑内容...';
    this.input.style.cssText = `
      flex: 1;
      min-height: 40px;
      max-height: 120px;
      padding: 8px 12px;
      border: 1px solid var(--background-modifier-border);
      border-radius: 6px;
      background: var(--background-primary);
      color: var(--text-normal);
      font-family: inherit;
      font-size: 14px;
      resize: none;
      outline: none;
    `;

    this.sendBtn = this.inputContainer.createEl('button');
    this.sendBtn.style.cssText = `
      padding: 8px 16px;
      background: var(--interactive-accent);
      color: var(--text-on-accent);
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s ease;
    `;
    this.updateSendButton();

    // 事件绑定
    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto';
      this.input.style.height = Math.min(this.input.scrollHeight, 120) + 'px';
    });

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    this.sendBtn.addEventListener('click', () => this.handleSend());

    // 添加初始消息
    this.addMessage('user', initialText);
    
    if (mode === 'explain') {
      this.addMessage('assistant', '我来解释这段内容：\n\n');
      this.startStreaming();
    } else if (mode === 'translate') {
      this.addMessage('assistant', '翻译结果：\n\n');
      this.startStreaming();
    }
  }

  private updateSendButton() {
    this.sendBtn.textContent = this.isStreaming ? '停止' : '发送';
    this.sendBtn.style.background = this.isStreaming 
      ? 'var(--text-error)' 
      : 'var(--interactive-accent)';
  }

  private handleSend() {
    if (this.isStreaming) {
      this.abortController?.abort();
      this.isStreaming = false;
      this.updateSendButton();
    } else {
      const text = this.input.value.trim();
      if (!text) return;
      
      this.addMessage('user', text);
      this.input.value = '';
      this.input.style.height = 'auto';
      
      this.addMessage('assistant', '');
      this.startStreaming();
    }
  }

  private async startStreaming() {
    this.isStreaming = true;
    this.abortController = new AbortController();
    this.updateSendButton();

    const lastMessage = this.chatContainer.lastElementChild as HTMLElement;
    const contentEl = lastMessage.querySelector('.message-content') as HTMLElement;
    
    if (!contentEl) return;

    const aiService = new AIService(this.plugin);
    const file = this.plugin.app.workspace.getActiveFile();
    if (!file) return;

    // 构建消息历史
    const chatMessages = [
      ...this.messages,
      { role: 'user', content: this.getLastUserMessage() }
    ];

    let fullContent = '';

    await aiService.streamChat(
      chatMessages,
      (chunk) => {
        fullContent += chunk;
        this.renderMarkdown(contentEl, fullContent, file.path);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
      },
      () => {
        this.messages.push({ role: 'assistant', content: fullContent });
        this.isStreaming = false;
        this.updateSendButton();
      },
      (error) => {
        contentEl.textContent = `错误：${error}`;
        this.isStreaming = false;
        this.updateSendButton();
      },
      this.abortController.signal
    );
  }

  private getLastUserMessage(): string {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === 'user') {
        return this.messages[i].content;
      }
    }
    return '';
  }

  private addMessage(role: string, content: string) {
    const msgEl = this.chatContainer.createDiv();
    msgEl.className = `message message-${role}`;
    msgEl.style.cssText = `
      display: flex;
      ${role === 'user' ? 'justify-content: flex-end;' : 'justify-content: flex-start;'}
    `;

    const bubble = msgEl.createDiv();
    bubble.className = 'message-bubble';
    bubble.style.cssText = `
      max-width: 70%;
      padding: 10px 14px;
      border-radius: 12px;
      ${role === 'user' 
        ? 'background: var(--interactive-accent); color: var(--text-on-accent);' 
        : 'background: var(--background-secondary); color: var(--text-normal);'}
    `;

    const contentEl = bubble.createDiv();
    contentEl.className = 'message-content';
    
    if (content) {
      const file = this.plugin.app.workspace.getActiveFile();
      if (file) {
        this.renderMarkdown(contentEl, content, file.path);
      } else {
        contentEl.textContent = content;
      }
    }

    if (role === 'user') {
      this.messages.push({ role, content });
    }

    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  private async renderMarkdown(el: HTMLElement, markdown: string, sourcePath: string) {
    el.empty();
    const renderChild = new MarkdownRenderChild(el);
    await MarkdownRenderer.renderMarkdown(markdown, el, sourcePath, renderChild);
  }

  open() {
    this.modal.open();
  }

  close() {
    this.abortController?.abort();
    this.modal.close();
  }
}
