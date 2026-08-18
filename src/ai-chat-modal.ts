import { MarkdownRenderer } from 'obsidian';
import type FleurReaderPlugin from './main';
import { AIService } from './ai-service';

const ICON_SEND = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
const ICON_STOP = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>`;

export class AIChatPanel {
  private panelEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private followUpInput: HTMLTextAreaElement | null = null;
  private sendBtn: HTMLButtonElement | null = null;
  private clickOutsideHandler: ((e: MouseEvent) => void) | null = null;

  private chatHistory: { role: string; content: string }[] = [];
  private rawMarkdown = '';
  private initialSent = false;
  private lastResponseEl: HTMLElement | null = null;
  private lastActionsEl: HTMLElement | null = null;

  private abortController: AbortController | null = null;
  private isStreaming = false;

  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private isResizing = false;

  constructor(
    private plugin: FleurReaderPlugin,
    private selectedText: string,
    private mode: 'explain' | 'translate' = 'explain'
  ) {}

  open(anchorX?: number, anchorY?: number) {
    if (this.panelEl) this.close();
    this.buildPanel(anchorX, anchorY);
    requestAnimationFrame(() => this.sendInitial());
  }

  close() {
    this.abortStream();
    if (this.clickOutsideHandler) {
      document.removeEventListener('mousedown', this.clickOutsideHandler);
      this.clickOutsideHandler = null;
    }
    if (this.panelEl) {
      this.panelEl.remove();
      this.panelEl = null;
    }
  }

  private abortStream() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.isStreaming) {
      this.isStreaming = false;
      this.updateSendButton();
    }
  }

  private buildPanel(anchorX?: number, anchorY?: number) {
    const panelWidth = 440;
    const panelHeight = 560;
    let left: number;
    let top: number;

    if (anchorX !== undefined && anchorY !== undefined) {
      // 优先在鼠标右侧打开，空间不够则放左侧
      if (anchorX + panelWidth + 20 < window.innerWidth) {
        left = anchorX + 20;
      } else {
        left = Math.max(20, anchorX - panelWidth - 20);
      }
      // 垂直方向：优先在鼠标下方，空间不够则放上方
      if (anchorY + panelHeight + 20 < window.innerHeight) {
        top = anchorY + 20;
      } else {
        top = Math.max(20, anchorY - panelHeight - 20);
      }
    } else {
      // 默认位置：屏幕右侧，垂直居中
      left = window.innerWidth - panelWidth - 24;
      top = (window.innerHeight - panelHeight) / 2;
      top = Math.max(20, top);
    }

    this.panelEl = document.body.createDiv('fleur-ai-panel');
    this.panelEl.style.cssText = `
      position: fixed;
      top: ${top}px;
      left: ${left}px;
      right: auto;
      width: ${panelWidth}px;
      height: ${panelHeight}px;
      background: var(--background-primary);
      border: 1px solid var(--background-modifier-border);
      border-radius: 10px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.14);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
      animation: fleurPanelIn 0.18s ease-out;
    `;

    if (!document.getElementById('fleur-panel-style')) {
      const style = document.createElement('style');
      style.id = 'fleur-panel-style';
      style.textContent = `
        @keyframes fleurPanelIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }

    this.clickOutsideHandler = (e: MouseEvent) => {
      if (this.panelEl && !this.panelEl.contains(e.target as Node)) {
        this.close();
      }
    };
    setTimeout(() => document.addEventListener('mousedown', this.clickOutsideHandler!), 50);

    // 标题栏
    const header = this.panelEl.createDiv();
    header.style.cssText = `
      padding: 13px 18px;
      border-bottom: 1px solid var(--background-modifier-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      background: var(--background-primary);
      cursor: grab;
      user-select: none;
    `;
    header.addEventListener('mousedown', (e) => this.onDragStart(e));

    const title = header.createSpan({ text: '阅读助手' });
    title.style.cssText = `
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.01em;
      color: var(--text-normal);
    `;

    const closeBtn = header.createEl('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
      width: 26px; height: 26px;
      border: none; background: transparent;
      color: var(--text-muted); cursor: pointer;
      border-radius: 4px;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px;
      line-height: 1;
      transition: all 0.15s ease;
    `;
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'var(--background-modifier-hover)';
      closeBtn.style.color = 'var(--text-normal)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'transparent';
      closeBtn.style.color = 'var(--text-muted)';
    });
    closeBtn.addEventListener('click', () => this.close());

    // 内容区
    this.bodyEl = this.panelEl.createDiv();
    this.bodyEl.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 16px 18px 8px;
    `;

    // 底部输入区
    const footer = this.panelEl.createDiv();
    footer.style.cssText = `
      padding: 10px 18px 14px;
      border-top: 1px solid var(--background-modifier-border);
      display: flex;
      gap: 8px;
      align-items: flex-end;
      flex-shrink: 0;
      background: var(--background-primary);
    `;

    this.followUpInput = footer.createEl('textarea');
    this.followUpInput.placeholder = '继续追问…';
    this.followUpInput.style.cssText = `
      flex: 1;
      min-height: 34px;
      max-height: 100px;
      padding: 7px 12px;
      border: 1px solid var(--background-modifier-border);
      border-radius: 6px;
      resize: none;
      font-size: 13px;
      line-height: 1.5;
      font-family: inherit;
      color: var(--text-normal);
      background: var(--background-primary);
      outline: none;
      box-sizing: border-box;
      transition: border-color 0.15s ease;
    `;
    this.followUpInput.addEventListener('focus', () => {
      this.followUpInput!.style.borderColor = 'var(--interactive-accent)';
    });
    this.followUpInput.addEventListener('blur', () => {
      this.followUpInput!.style.borderColor = 'var(--background-modifier-border)';
    });
    this.followUpInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendFollowUp();
      }
    });

    this.sendBtn = footer.createEl('button');
    this.sendBtn.innerHTML = ICON_SEND;
    this.sendBtn.style.cssText = `
      width: 36px; height: 36px;
      border: none;
      background: var(--background-secondary);
      color: var(--text-normal);
      cursor: pointer;
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      transition: all 0.15s ease;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    `;
    this.sendBtn.addEventListener('mouseenter', () => {
      this.sendBtn!.style.background = 'var(--background-modifier-hover)';
      this.sendBtn!.style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)';
    });
    this.sendBtn.addEventListener('mouseleave', () => {
      this.sendBtn!.style.background = 'var(--background-secondary)';
      this.sendBtn!.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
    });
    this.sendBtn.addEventListener('click', () => this.onSendOrAbort());

    // 右下角尺寸调整手柄
    const resizeHandle = this.panelEl.createDiv();
    resizeHandle.style.cssText = `
      position: absolute;
      right: 0; bottom: 0;
      width: 20px; height: 20px;
      cursor: nwse-resize;
      z-index: 10001;
    `;
    resizeHandle.addEventListener('mousedown', (e) => this.onResizeStart(e));
  }

  // ── 拖拽 & 缩放 ───

  private onDragStart(e: MouseEvent) {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    this.isDragging = true;
    const rect = this.panelEl!.getBoundingClientRect();
    this.dragOffsetX = e.clientX - rect.left;
    this.dragOffsetY = e.clientY - rect.top;
    document.addEventListener('mousemove', this.onDragMove);
    document.addEventListener('mouseup', this.onDragEnd);
  }

  private onDragMove = (e: MouseEvent) => {
    if (!this.isDragging || !this.panelEl) return;
    const x = e.clientX - this.dragOffsetX;
    const y = e.clientY - this.dragOffsetY;
    this.panelEl.style.left = `${x}px`;
    this.panelEl.style.top = `${y}px`;
    this.panelEl.style.right = 'auto';
  };

  private onDragEnd = () => {
    this.isDragging = false;
    document.removeEventListener('mousemove', this.onDragMove);
    document.removeEventListener('mouseup', this.onDragEnd);
  };

  private onResizeStart(e: MouseEvent) {
    e.stopPropagation();
    this.isResizing = true;
    const rect = this.panelEl!.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = rect.width;
    const startH = rect.height;

    const onMove = (e: MouseEvent) => {
      if (!this.isResizing || !this.panelEl) return;
      const w = startW + (e.clientX - startX);
      const h = startH + (e.clientY - startY);
      this.panelEl.style.width = `${Math.max(320, w)}px`;
      this.panelEl.style.height = `${Math.max(300, h)}px`;
    };
    const onUp = () => {
      this.isResizing = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ─── 消息渲染 ───

  private addMessage(role: 'user' | 'assistant', content: string) {
    if (!this.bodyEl) return;

    const msg = this.bodyEl.createDiv();
    msg.style.cssText = `
      margin-bottom: 12px;
      ${role === 'user'
        ? `margin-left:auto;max-width:85%;width:fit-content;`
        : `margin-right:auto;max-width:90%;`
      }
    `;

    const bubble = msg.createDiv();
    bubble.style.cssText = `
      padding: 10px 14px;
      border-radius: 10px;
      line-height: 1.5;
      word-break: break-word;
      ${role === 'user'
        ? 'background:var(--interactive-accent);color:var(--text-on-accent);'
        : 'background:var(--background-secondary);color:var(--text-normal);'
      }
    `;

    if (role === 'user') {
      bubble.textContent = content;
    } else {
      // AI 消息使用 Markdown 渲染
      MarkdownRenderer.renderMarkdown(content, bubble, '', this as any);
      this.lastResponseEl = bubble;
    }

    // 操作按钮（仅 AI 消息）
    if (role === 'assistant') {
      const actions = msg.createDiv();
      actions.style.cssText = `
        display:flex;gap:4px;margin-top:4px;
        padding-left:4px;
      `;
      this.lastActionsEl = actions;

      const copyBtn = actions.createEl('button', { text: '复制' });
      copyBtn.style.cssText = `
        font-size:11px;padding:2px 8px;
        border:1px solid var(--background-modifier-border);
        border-radius:4px;background:transparent;
        color:var(--text-muted);cursor:pointer;
      `;
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(content);
        copyBtn.textContent = '已复制';
        setTimeout(() => { copyBtn.textContent = '复制'; }, 1500);
      });

      const regenBtn = actions.createEl('button', { text: '重新生成' });
      regenBtn.style.cssText = `
        font-size:11px;padding:2px 8px;
        border:1px solid var(--background-modifier-border);
        border-radius:4px;background:transparent;
        color:var(--text-muted);cursor:pointer;
      `;
      regenBtn.addEventListener('click', () => this.regenerate());
    }

    this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  }

  private addStreamingChunk(content: string) {
    if (!this.bodyEl) return;

    if (!this.lastResponseEl) {
      const msg = this.bodyEl.createDiv();
      msg.style.cssText = 'margin-bottom:12px;margin-right:auto;max-width:90%;';
      const bubble = msg.createDiv();
      bubble.style.cssText = `
        padding:10px 14px;border-radius:10px;
        line-height:1.5;word-break:break-word;
        background:var(--background-secondary);color:var(--text-normal);
      `;
      this.lastResponseEl = bubble;

      const actions = msg.createDiv();
      actions.style.cssText = 'display:flex;gap:4px;margin-top:4px;padding-left:4px;';
      this.lastActionsEl = actions;

      const copyBtn = actions.createEl('button', { text: '复制' });
      copyBtn.style.cssText = `
        font-size:11px;padding:2px 8px;
        border:1px solid var(--background-modifier-border);
        border-radius:4px;background:transparent;
        color:var(--text-muted);cursor:pointer;
      `;
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(this.rawMarkdown);
        copyBtn.textContent = '已复制';
        setTimeout(() => { copyBtn.textContent = '复制'; }, 1500);
      });

      const regenBtn = actions.createEl('button', { text: '重新生成' });
      regenBtn.style.cssText = `
        font-size:11px;padding:2px 8px;
        border:1px solid var(--background-modifier-border);
        border-radius:4px;background:transparent;
        color:var(--text-muted);cursor:pointer;
      `;
      regenBtn.addEventListener('click', () => this.regenerate());
    }

    this.rawMarkdown += content;
    // 清空后用 Markdown 重新渲染
    this.lastResponseEl.empty();
    MarkdownRenderer.renderMarkdown(this.rawMarkdown, this.lastResponseEl, '', this as any);
    this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  }

  // ─── 发送逻辑 ───

  private async sendInitial() {
    if (this.initialSent) return;
    this.initialSent = true;

    const question = this.mode === 'translate'
      ? '请将以下文本翻译成' + (this.isChinese(this.selectedText) ? '英文' : '中文') + '。只输出翻译结果，不要附加任何额外解释。'
      : '请解释这段内容的含义，包括关键词释义、背景要点和深层逻辑。';

    this.chatHistory = [
      {
        role: 'system',
        content: '你是一位专业的文献阅读助手。请根据用户选中的文本内容，给出准确、有条理、有深度的回答。回答时使用 Markdown 格式，标题用 ## 或 ###，重点加粗。'
      },
      {
        role: 'user',
        content: `以下是我从文档中选中的内容：\n\n「${this.selectedText}」\n\n${question}`
      }
    ];

    await this.doStream();
  }

  private async sendFollowUp() {
    const input = this.followUpInput;
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    this.addMessage('user', text);
    this.chatHistory.push({ role: 'user', content: text });

    await this.doStream();
  }

  private async doStream() {
    const service = new AIService(this.plugin);
    this.rawMarkdown = '';
    this.lastResponseEl = null;
    this.lastActionsEl = null;
    this.isStreaming = true;
    this.updateSendButton();

    this.abortController = new AbortController();

    try {
      let errMessage = '';
      await service.streamChat(
        this.chatHistory,
        (chunk) => this.addStreamingChunk(chunk),
        undefined,
        (error) => { errMessage = error; },
        this.abortController.signal
      );

      if (errMessage) {
        this.addMessage('assistant', `❌ ${errMessage}`);
      } else if (this.rawMarkdown) {
        this.chatHistory.push({ role: 'assistant', content: this.rawMarkdown });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // 用户主动中断
        if (this.rawMarkdown) {
          this.chatHistory.push({ role: 'assistant', content: this.rawMarkdown });
        }
      } else {
        this.addMessage('assistant', `❌ 请求失败：${err.message}`);
      }
    } finally {
      this.isStreaming = false;
      this.abortController = null;
      this.updateSendButton();
    }
  }

  private async regenerate() {
    if (this.isStreaming) return;
    if (this.chatHistory.length < 2) return;

    // 移除最后一条 AI 回复
    this.chatHistory.pop();
    this.bodyEl!.lastElementChild?.remove(); // 移除最后一条消息 DOM

    await this.doStream();
  }

  private onSendOrAbort() {
    if (this.isStreaming) {
      this.abortStream();
    } else {
      this.sendFollowUp();
    }
  }

  private updateSendButton() {
    if (!this.sendBtn) return;
    if (this.isStreaming) {
      this.sendBtn.innerHTML = ICON_STOP;
      this.sendBtn.style.background = 'var(--background-modifier-hover)';
    } else {
      this.sendBtn.innerHTML = ICON_SEND;
      this.sendBtn.style.background = 'var(--background-secondary)';
    }
  }

  private isChinese(text: string): boolean {
    return /[\u4e00-\u9fff]/.test(text);
  }
}
