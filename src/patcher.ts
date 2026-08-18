// Markdown 编辑器拦截 + 右键菜单 + 侵入式编辑
// 支持 Live Preview 模式和 Reading Mode
import { Menu, MarkdownView, Notice, Modal, TFile } from 'obsidian';
import type { Editor } from 'obsidian';
import type FleurReaderPlugin from './main';
import { AIChatPanel } from './ai-chat-modal';
import { wrapSelection, appendToSelection, findAndReplace, getReadingModeSelection, isInReadingMode, isInLivePreview } from './editor';

/** 自定义批注输入弹窗 */
class CommentModal extends Modal {
  private textarea: HTMLTextAreaElement;
  private onConfirm: (text: string) => void;

  constructor(
    plugin: FleurReaderPlugin,
    private previewText: string,
    onConfirm: (text: string) => void
  ) {
    super(plugin.app);
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h3', { text: '添加批注' });

    // 显示选中文本预览
    const preview = contentEl.createDiv();
    preview.style.cssText = `
      font-size: 13px; color: var(--text-muted);
      background: var(--background-secondary);
      padding: 8px 12px; border-radius: 6px;
      margin-bottom: 12px; max-height: 60px;
      overflow: hidden; line-height: 1.5;
    `;
    preview.textContent = this.previewText;

    this.textarea = contentEl.createEl('textarea');
    this.textarea.placeholder = '输入批注内容…';
    this.textarea.style.cssText = `
      width: 100%; min-height: 100px;
      padding: 10px 12px;
      border: 1px solid var(--background-modifier-border);
      border-radius: 6px;
      background: var(--background-primary);
      color: var(--text-normal);
      font-size: 14px; line-height: 1.5;
      resize: vertical;
      font-family: inherit;
      box-sizing: border-box;
    `;

    const btnRow = contentEl.createDiv();
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px;';

    const cancelBtn = btnRow.createEl('button', { text: '取消' });
    cancelBtn.style.cssText = `
      padding: 6px 16px; border-radius: 6px; cursor: pointer;
      border: 1px solid var(--background-modifier-border);
      background: var(--background-primary);
      color: var(--text-muted); font-size: 13px;
    `;
    cancelBtn.addEventListener('click', () => this.close());

    const confirmBtn = btnRow.createEl('button', { text: '确定' });
    confirmBtn.style.cssText = `
      padding: 6px 16px; border-radius: 6px; cursor: pointer;
      border: none;
      background: var(--interactive-accent);
      color: var(--text-on-accent); font-size: 13px;
    `;
    confirmBtn.addEventListener('click', () => {
      const text = this.textarea.value.trim();
      if (!text) return;
      this.close();
      this.onConfirm(text);
    });

    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        confirmBtn.click();
      }
    });

    setTimeout(() => this.textarea.focus(), 50);
  }

  onClose() {
    this.contentEl.empty();
  }
}

export class MarkdownPatcher {
  private boundContextMenu: ((e: MouseEvent) => void) | null = null;
  private boundClick: ((e: MouseEvent) => void) | null = null;
  private boundMouseover: ((e: MouseEvent) => void) | null = null;
  private boundMouseout: ((e: MouseEvent) => void) | null = null;

  /** 当前悬浮的气泡 */
  private tooltipEl: HTMLElement | null = null;
  /** 当前气泡的隐藏定时器 */
  private tooltipHideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private plugin: FleurReaderPlugin) {}

  install() {
    this.boundContextMenu = (e: MouseEvent) => this.onContextMenu(e);
    this.boundClick = (e: MouseEvent) => this.onClick(e);
    this.boundMouseover = (e: MouseEvent) => this.onMouseOver(e);
    this.boundMouseout = (e: MouseEvent) => this.onMouseOut(e);

    document.addEventListener('contextmenu', this.boundContextMenu, true);
    document.addEventListener('click', this.boundClick, true);
    document.addEventListener('mouseover', this.boundMouseover, true);
    document.addEventListener('mouseout', this.boundMouseout, true);

    console.log('[FleurReader] Patcher installed');
  }

  uninstall() {
    if (this.boundContextMenu) document.removeEventListener('contextmenu', this.boundContextMenu, true);
    if (this.boundClick) document.removeEventListener('click', this.boundClick, true);
    if (this.boundMouseover) document.removeEventListener('mouseover', this.boundMouseover, true);
    if (this.boundMouseout) document.removeEventListener('mouseout', this.boundMouseout, true);
    this.removeTooltip();
  }

  private getActiveView(): MarkdownView | null {
    return this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
  }

  // ════════════════════════════════════════════
  //  右键菜单
  // ════════════════════════════════════════════

  private onContextMenu(e: MouseEvent) {
    const inLivePreview = isInLivePreview(e.target);
    const inReadingMode = isInReadingMode(e.target);

    if (!inLivePreview && !inReadingMode) return;

    const view = this.getActiveView();
    if (!view) return;

    let selection = '';

    if (inLivePreview) {
      const editor = view.editor;
      if (!editor) return;
      selection = editor.getSelection();
    } else if (inReadingMode) {
      selection = getReadingModeSelection() || '';
    }

    if (!selection || selection.trim().length === 0) return;

    e.preventDefault();

    const menu = new Menu();

    menu.addItem((item) => {
      item.setTitle('添加高亮');
      item.setIcon('highlighter');
      item.onClick(() => this.addHighlight(selection, inLivePreview ? view.editor : null, inReadingMode));
    });

    menu.addItem((item) => {
      item.setTitle('添加划线');
      item.setIcon('underline');
      item.onClick(() => this.addUnderline(selection, inLivePreview ? view.editor : null, inReadingMode));
    });

    menu.addItem((item) => {
      item.setTitle('添加批注');
      item.setIcon('message-square');
      item.onClick(() => this.showCommentModal(selection, inLivePreview ? view.editor : null, inReadingMode));
    });

    menu.addSeparator();

    menu.addItem((item) => {
      item.setTitle('AI 解释');
      item.setIcon('sparkles');
      item.onClick(() => this.askAIExplain(selection, e.clientX, e.clientY));
    });

    menu.addItem((item) => {
      item.setTitle('AI 翻译');
      item.setIcon('languages');
      item.onClick(() => this.askAITranslate(selection, e.clientX, e.clientY));
    });

    menu.addItem((item) => {
      item.setTitle('询问AI');
      item.setIcon('bot');
      item.onClick(() => this.askAI(selection));
    });

    menu.showAtMouseEvent(e);
  }

  // ════════════════════════════════════════════
  //  气泡提示（Reading Mode 悬浮显示批注）
  // ════════════════════════════════════════════

  private async onMouseOver(e: MouseEvent) {
    if (!isInReadingMode(e.target)) return;

    const target = e.target as HTMLElement;

    // 查找最近的带有批注数据的元素
    const annotatedEl = target.closest('[data-fleur-annotation]') as HTMLElement | null;
    if (!annotatedEl) return;

    const annotationId = annotatedEl.dataset['fleurAnnotation'];
    if (!annotationId) return;

    // 防止重复创建
    if (this.tooltipEl) {
      const existingId = this.tooltipEl.dataset['tooltipFor'];
      if (existingId === annotationId) return;
      this.removeTooltip();
    }

    // 加载批注数据
    const file = this.plugin.app.workspace.getActiveFile();
    if (!file) return;

    const data = await this.plugin.store.load(file.path);
    const annotation = data.annotations.find(a => a.id === annotationId);
    if (!annotation || !annotation.comment) return;

    // 创建气泡
    this.tooltipEl = document.body.createDiv('fleur-reader-tooltip');
    this.tooltipEl.dataset['tooltipFor'] = annotationId;
    this.tooltipEl.style.cssText = `
      position: fixed;
      z-index: 99999;
      background: var(--background-secondary);
      border: 1px solid var(--background-modifier-border);
      border-radius: 8px;
      padding: 10px 14px;
      max-width: 320px;
      font-size: 13px;
      line-height: 1.5;
      color: var(--text-normal);
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s ease;
    `;
    this.tooltipEl.textContent = annotation.comment;

    // 定位到元素下方
    const rect = annotatedEl.getBoundingClientRect();
    this.tooltipEl.style.left = `${rect.left}px`;
    this.tooltipEl.style.top = `${rect.bottom + 6}px`;

    document.body.appendChild(this.tooltipEl);
    requestAnimationFrame(() => { this.tooltipEl!.style.opacity = '1'; });

    // 如果气泡超出屏幕底部，翻到上方
    const tooltipRect = this.tooltipEl.getBoundingClientRect();
    if (tooltipRect.bottom > window.innerHeight - 10) {
      this.tooltipEl.style.top = `${rect.top - tooltipRect.height - 6}px`;
    }
  }

  private onMouseOut(e: MouseEvent) {
    if (!isInReadingMode(e.target)) return;

    const target = e.target as HTMLElement;
    const annotatedEl = target.closest('[data-fleur-annotation]');
    if (!annotatedEl) return;

    // 延迟隐藏，避免鼠标移动到气泡上就消失
    if (this.tooltipHideTimer) clearTimeout(this.tooltipHideTimer);
    this.tooltipHideTimer = setTimeout(() => {
      // 检查鼠标是否还在气泡上
      const related = e.relatedTarget as HTMLElement;
      if (related && this.tooltipEl && this.tooltipEl.contains(related)) return;
      this.removeTooltip();
    }, 200);
  }

  private removeTooltip() {
    if (this.tooltipHideTimer) {
      clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    if (this.tooltipEl) {
      this.tooltipEl.style.opacity = '0';
      setTimeout(() => {
        this.tooltipEl?.remove();
        this.tooltipEl = null;
      }, 150);
    }
  }

  // ════════════════════════════════════════════
  //  点击处理
  // ════════════════════════════════════════════

  private onClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.classList.contains('fleur-reader-delete')) {
      e.preventDefault();
      e.stopPropagation();
      const annotationId = target.dataset['annotationId'];
      if (annotationId) {
        this.deleteAnnotation(annotationId);
      }
    }
  }

  // ════════════════════════════════════════════
  //  侵入式编辑
  // ════════════════════════════════════════════

  private async addHighlight(selection: string, editor: Editor | null, inReadingMode: boolean) {
    const file = this.plugin.app.workspace.getActiveFile();
    if (!file) return;

    if (inReadingMode) {
      const content = await this.plugin.app.vault.read(file);
      const updated = findAndReplace(content, selection, `==${selection}==`);
      if (updated) {
        await this.plugin.app.vault.modify(file, updated);
        // 切回 Live Preview 让编辑器加载新内容
        this.plugin.app.workspace.activeLeaf?.setViewState({
          type: 'markdown',
          state: { file: file.path, mode: 'source' }
        });
      }
    } else if (editor) {
      if (!wrapSelection(editor, '==', '==')) return;
    }

    await this.plugin.store.addAnnotation(file.path, {
      id: this.plugin.generateId(),
      type: 'highlight',
      text: selection,
      color: '#FFC107',
      createdAt: Date.now(),
    });

    this.plugin.sidebar?.refreshAnnotations();
    new Notice('已添加高亮');
  }

  private async addUnderline(selection: string, editor: Editor | null, inReadingMode: boolean) {
    const file = this.plugin.app.workspace.getActiveFile();
    if (!file) return;

    if (inReadingMode) {
      const content = await this.plugin.app.vault.read(file);
      const updated = findAndReplace(content, selection, `<u>${selection}</u>`);
      if (updated) {
        await this.plugin.app.vault.modify(file, updated);
        this.plugin.app.workspace.activeLeaf?.setViewState({
          type: 'markdown',
          state: { file: file.path, mode: 'source' }
        });
      }
    } else if (editor) {
      if (!wrapSelection(editor, '<u>', '</u>')) return;
    }

    await this.plugin.store.addAnnotation(file.path, {
      id: this.plugin.generateId(),
      type: 'underline',
      text: selection,
      color: '#E8590C',
      createdAt: Date.now(),
    });

    this.plugin.sidebar?.refreshAnnotations();
    new Notice('已添加划线');
  }

  /** 显示批注输入弹窗 */
  private showCommentModal(selection: string, editor: Editor | null, inReadingMode: boolean) {
    const modal = new CommentModal(this.plugin, selection, async (comment) => {
      await this.saveComment(selection, comment, editor, inReadingMode);
    });
    modal.open();
  }

  private async saveComment(selection: string, comment: string, editor: Editor | null, inReadingMode: boolean) {
    const file = this.plugin.app.workspace.getActiveFile();
    if (!file) return;

    if (inReadingMode) {
      const content = await this.plugin.app.vault.read(file);
      // 批注 = 高亮 + 内联注释：==文本==%% 批注 %%
      const wrapped = `==${selection}==%% ${comment} %%`;
      const updated = findAndReplace(content, selection, wrapped);
      if (updated) {
        await this.plugin.app.vault.modify(file, updated);
        this.plugin.app.workspace.activeLeaf?.setViewState({
          type: 'markdown',
          state: { file: file.path, mode: 'source' }
        });
      }
    } else if (editor) {
      // Live Preview: ==选中文本==%% 批注 %%
      if (!wrapSelection(editor, '==', `==%% ${comment} %%`)) return;
    }

    await this.plugin.store.addAnnotation(file.path, {
      id: this.plugin.generateId(),
      type: 'comment',
      text: selection,
      color: '#FFC107',
      comment: comment,
      createdAt: Date.now(),
    });

    this.plugin.sidebar?.refreshAnnotations();
    new Notice('已添加批注');
  }

  // ═══════════════════════════════════════════
  //  AI 功能
  // ═══════════════════════════════════════════

  private askAIExplain(text: string, anchorX?: number, anchorY?: number) {
    const panel = new AIChatPanel(this.plugin, text, 'explain');
    panel.open(anchorX, anchorY);
  }

  private askAITranslate(text: string, anchorX?: number, anchorY?: number) {
    const panel = new AIChatPanel(this.plugin, text, 'translate');
    panel.open(anchorX, anchorY);
  }

  private askAI(text: string) {
    const question = window.prompt('请输入你的问题：');
    if (!question) return;

    const queryText = `关于以下内容：\n\n"${text}"\n\n问题：${question}`;
    const panel = new AIChatPanel(this.plugin, queryText, 'explain');
    panel.open();
  }

  // ════════════════════════════════════════════
  //  删除批注
  // ════════════════════════════════════════════

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** 将文本拆分为词组，用 \s+ 连接，实现模糊空白匹配 */
  private makeFuzzyPattern(text: string): string {
    const parts = text.trim().split(/\s+/).map(p => this.escapeRegex(p));
    return parts.join('\\s+');
  }

  async deleteAnnotation(annotationId: string) {
    const file = this.plugin.app.workspace.getActiveFile();
    if (!file) return;

    const data = await this.plugin.store.load(file.path);
    const annotation = data.annotations.find(a => a.id === annotationId);
    if (!annotation) return;

    // 优先用 Editor API（Live Preview），否则回退 vault.modify + 编辑器重新加载
    const view = this.getActiveView();
    const editor = view?.editor;

    let updated: string | null = null;
    let plainText = annotation.text;

    if (editor) {
      const content = editor.getValue();
      updated = this.buildUnwrapRegex(content, annotation, plainText);
      if (updated !== null && updated !== content) {
        editor.setValue(updated);
      }
    } else {
      const content = await this.plugin.app.vault.read(file);
      updated = this.buildUnwrapRegex(content, annotation, plainText);
      if (updated !== null && updated !== content) {
        await this.plugin.app.vault.modify(file, updated);
        // 切到 source 模式让编辑器加载新内容
        this.plugin.app.workspace.activeLeaf?.setViewState({
          type: 'markdown',
          state: { file: file.path, mode: 'source' }
        });
      }
    }

    await this.plugin.store.deleteAnnotation(file.path, annotationId);
    this.plugin.sidebar?.refreshAnnotations();
    new Notice('已删除批注');
  }

  /**
   * 用模糊匹配移除包裹标记，匹配失败时用精确匹配回退
   */
  private unwrapFuzzy(content: string, wrappedPrefix: string, wrappedSuffix: string, annotationText: string): string {
    // 先尝试模糊匹配（处理空白差异）
    const parts = annotationText.trim().split(/\s+/).map(p => this.escapeRegex(p));
    const fuzzyText = parts.join('[\\s\\u00a0]*');  // 用 [\s\u00a0]* 匹配任意空白（包括不可见空格）
    const regex = new RegExp(`${this.escapeRegex(wrappedPrefix)}(${fuzzyText})${this.escapeRegex(wrappedSuffix)}`, 'g');

    const result = content.replace(regex, (_match, captured: string) => captured);
    if (result !== content) return result;

    // 回退：精确匹配（处理特殊情况）
    const exactWrapped = `${wrappedPrefix}${annotationText}${wrappedSuffix}`;
    return content.replace(exactWrapped, annotationText);
  }

  /** 用模糊空白匹配构建正则，移除高亮/划线/批注包裹 */
  private buildUnwrapRegex(content: string, annotation: { type: string; text: string; comment?: string }, _plainText: string): string | null {
    if (annotation.type === 'highlight') {
      return this.unwrapFuzzy(content, '==', '==', annotation.text);
    }

    if (annotation.type === 'underline') {
      const parts = annotation.text.trim().split(/\s+/).map(p => this.escapeRegex(p));
      const fuzzyText = parts.join('[\\s\\u00a0]*');
      const regex = new RegExp(`<u>[\\s\\u00a0]*(${fuzzyText})[\\s\\u00a0]*</u>`, 'g');
      const r1 = content.replace(regex, (_m, c: string) => c);
      if (r1 !== content) return r1;
      // 回退：精确匹配
      const exactWrapped = `<u>${annotation.text}</u>`;
      return content.replace(exactWrapped, annotation.text);
    }

    if (annotation.type === 'comment') {
      const fuzzyComment = annotation.comment ? annotation.comment.trim().split(/\s+/).map(p => this.escapeRegex(p)).join('[\\s\\u00a0]*') : '';

      if (fuzzyComment) {
        const fuzzyText = this.makeFuzzyPattern(annotation.text).replace(/\\s\+/g, '[\\s\\u00a0]*');
        // 带高亮的批注：==文本==%% 批注 %%
        const regex1 = new RegExp(`==(${fuzzyText})==%%[\\s\\u00a0]*${fuzzyComment}[\\s\\u00a0]*%%`, 'g');
        const r1 = content.replace(regex1, (_m, c: string) => c);
        if (r1 !== content) return r1;
        // 不带高亮的批注：文本%% 批注 %%
        const regex2 = new RegExp(`(${fuzzyText})%%[\\s\\u00a0]*${fuzzyComment}[\\s\\u00a0]*%%`, 'g');
        const r2 = content.replace(regex2, (_m, c: string) => c);
        if (r2 !== content) return r2;
        // 回退：精确匹配
        const exact1 = `==${annotation.text}==%% ${annotation.comment} %%`;
        const r3 = content.replace(exact1, annotation.text);
        if (r3 !== content) return r3;
        const exact2 = `${annotation.text}%% ${annotation.comment} %%`;
        return content.replace(exact2, annotation.text);
      }
      // 无批注内容，只移除 %% 包裹
      return this.unwrapFuzzy(content, '==%%', '%%', annotation.text);
    }

    return content;
  }
}
