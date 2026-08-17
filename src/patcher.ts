// Markdown 视图拦截 + 右键菜单
// 同时支持「阅读视图」（rendered HTML）和「实时预览」（CodeMirror）
import { Menu, Modal, Notice, MarkdownPostProcessor, MarkdownView } from 'obsidian';
import type FleurReaderPlugin from './main';
import type { Annotation } from './types';
import { AIChatPanel } from './ai-chat-modal';

type UnderlineStyle = 'solid' | 'dashed' | 'dotted' | 'wavy';

/** 选区快照 */
interface SelectionSnapshot {
  text: string;
  line: number;
  timestamp: number;
}

export class MarkdownPatcher {
  boundContextMenu: ((e: MouseEvent) => void) | null = null;
  boundMouseDown: ((e: MouseEvent) => void) | null = null;
  boundMouseUp: ((e: MouseEvent) => void) | null = null;
  private lastSnapshot: SelectionSnapshot | null = null;

  constructor(private plugin: FleurReaderPlugin) {}

  install() {
    this.boundContextMenu = (e: MouseEvent) => this.onContextMenu(e);
    this.boundMouseDown = (e: MouseEvent) => this.onMouseDown(e);
    this.boundMouseUp = (e: MouseEvent) => this.onMouseUp(e);

    document.addEventListener('contextmenu', this.boundContextMenu, true);
    document.addEventListener('mousedown', this.boundMouseDown, true);
    document.addEventListener('mouseup', this.boundMouseUp, true);

    // 注册 Markdown 后处理器，用于在阅读视图中恢复标注样式
    this.plugin.registerMarkdownPostProcessor((el, ctx) => {
      this.applyAnnotationsToElement(el, ctx.sourcePath);
    });

    console.log('[FleurReader] Patcher installed');
  }

  // ════════════════════════════════════════════
  //  视图检测
  // ════════════════════════════════════════════

  private isInMarkdownView(target: EventTarget | null): boolean {
    if (!target) return false;
    const el = target as HTMLElement;
    return !!el.closest?.(
      '.markdown-reading-view, .markdown-preview-view, .markdown-source-view, ' +
      '.workspace-leaf-content[data-type="markdown"]'
    );
  }

  private isInReadingView(target: EventTarget | null): boolean {
    if (!target) return false;
    const el = target as HTMLElement;
    return !!el.closest?.('.markdown-reading-view, .markdown-preview-view');
  }

  private isInLivePreview(target: EventTarget | null): boolean {
    if (!target) return false;
    const el = target as HTMLElement;
    return !!el.closest?.('.cm-editor');
  }

  // ════════════════════════════════════════════
  //  鼠标事件
  // ════════════════════════════════════════════

  private onMouseDown(_e: MouseEvent) {}

  private onMouseUp(e: MouseEvent) {
    if (e.button !== 0) return;
    if (!this.isInMarkdownView(e.target)) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (!text) return;

    const line = this.getSelectionLine(selection);
    this.lastSnapshot = { text, line, timestamp: Date.now() };

    console.log('[FleurReader] Selection saved:', { text: text.substring(0, 60), line });
  }

  /** 从 Selection 对象获取行号 */
  private getSelectionLine(selection: Selection): number {
    const range = selection.getRangeAt(0);
    const container = range.startContainer;
    const el = container.nodeType === Node.TEXT_NODE
      ? container.parentElement
      : container as HTMLElement;
    const blockEl = el?.closest?.('[data-line]');
    if (blockEl) return parseInt(blockEl.getAttribute('data-line') || '0');

    // live preview fallback: CodeMirror 行号
    const cmLine = el?.closest?.('.cm-line');
    if (cmLine) {
      const lines = document.querySelectorAll('.cm-line');
      const idx = Array.from(lines).indexOf(cmLine as Element);
      if (idx >= 0) return idx;
    }
    return 0;
  }

  // ════════════════════════════════════════════
  //  右键菜单
  // ════════════════════════════════════════════

  private onContextMenu(e: MouseEvent) {
    if (!this.isInMarkdownView(e.target)) return;

    const selection = window.getSelection();
    let selectedText = (selection && !selection.isCollapsed)
      ? selection.toString().trim()
      : '';

    let line = 0;
    let source = '';

    if (selectedText) {
      source = 'live-selection';
      line = this.getSelectionLine(selection!);
    } else if (this.lastSnapshot && Date.now() - this.lastSnapshot.timestamp < 3000) {
      source = 'snapshot';
      selectedText = this.lastSnapshot.text;
      line = this.lastSnapshot.line;
    } else {
      return;
    }

    console.log('[FleurReader] onContextMenu:', { source, text: selectedText.substring(0, 60), line });

    e.preventDefault();
    e.stopPropagation();

    this.showContextMenu(e.clientX, e.clientY, selectedText, line);
  }

  private showContextMenu(x: number, y: number, text: string, line: number) {
    const s = this.plugin.settings;
    const menu = new Menu();

    // 1. 高亮
    menu.addItem((item) => {
      item.setTitle('高亮');
      item.setIcon('highlighter');
      item.onClick(() => this.applyHighlight(text, line, s.highlightColor, 'highlight'));
    });

    menu.addSeparator();

    // 2. 划线
    menu.addItem((item) => {
      item.setTitle('划线');
      item.setIcon('underline');
      item.onClick(() => this.applyUnderline(text, line, s.underlineStyle, s.underlineColor));
    });

    menu.addSeparator();

    // 3. 批注
    menu.addItem((item) => {
      item.setTitle('批注');
      item.setIcon('message-square');
      item.onClick(() => this.showCommentDialog(text, line));
    });

    menu.addSeparator();

    // 4. 询问AI
    menu.addItem((item) => {
      item.setTitle('询问AI');
      item.setIcon('bot');
      item.onClick(() => this.askAI(text));
    });

    menu.addSeparator();

    // 5. AI 翻译
    menu.addItem((item) => {
      item.setTitle('AI 翻译');
      item.setIcon('languages');
      item.onClick(() => this.askAITranslate(text));
    });

    menu.showAtPosition({ x, y });
  }

  // ════════════════════════════════════════════
  //  高亮
  // ════════════════════════════════════════════

  private async applyHighlight(
    text: string, line: number, color: string, type: 'highlight' | 'comment'
  ): Promise<string> {
    const file = this.plugin.app.workspace.getActiveFile();
    if (!file) return '';

    const annotation: Annotation = {
      id: this.plugin.generateId(),
      type,
      line,
      text,
      color,
      createdAt: Date.now()
    };

    await this.plugin.store.addAnnotation(file.path, annotation);
    this.plugin.sidebar?.refresh();

    // 尝试立即在 DOM 上显示高亮样式
    this.tryStyleInDOM(text, annotation);

    new Notice('已添加高亮');
    return annotation.id;
  }

  private async applyUnderline(
    text: string, line: number, style: UnderlineStyle, color: string
  ): Promise<string> {
    const file = this.plugin.app.workspace.getActiveFile();
    if (!file) return '';

    const annotation: Annotation = {
      id: this.plugin.generateId(),
      type: 'underline',
      line,
      text,
      color,
      underlineStyle: style,
      createdAt: Date.now()
    };

    await this.plugin.store.addAnnotation(file.path, annotation);
    this.plugin.sidebar?.refresh();

    this.tryStyleInDOM(text, annotation);

    new Notice('已添加划线');
    return annotation.id;
  }

  /** 尝试在当前 DOM 中立即应用样式（无需切换视图） */
  private tryStyleInDOM(text: string, ann: Annotation) {
    // 在 Markdown 渲染区域查找文本节点并包裹
    const containers = document.querySelectorAll('.markdown-preview-view, .markdown-preview-sizer');
    for (const container of Array.from(containers)) {
      const found = this.findAndWrapText(container as HTMLElement, text, ann);
      if (found) return;
    }
  }

  // ════════════════════════════════════════════
  //  批注对话框
  // ════════════════════════════════════════════

  private showCommentDialog(text: string, line: number) {
    const hlColor = this.plugin.settings.highlightColor;

    const modal = new Modal(this.plugin.app);
    modal.titleEl.style.display = 'none';

    const root = modal.contentEl.createDiv();
    root.style.cssText = `
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
      max-width:480px;margin:0 auto;padding:20px 24px;
    `;

    const quoteBlock = root.createDiv();
    quoteBlock.style.cssText = `
      padding:12px 16px;margin-bottom:16px;
      background:var(--background-secondary);
      border-radius:4px;
      position:relative;
    `;
    const quoteBar = quoteBlock.createDiv();
    quoteBar.style.cssText = `
      position:absolute;left:0;top:0;bottom:0;
      width:3px;background:${hlColor};
      border-radius:4px 0 0 4px;
    `;
    const quoteText = quoteBlock.createDiv();
    quoteText.style.cssText = `
      font-size:13.5px;line-height:1.65;
      color:var(--text-normal);
      font-style:italic;
      letter-spacing:0.01em;
      max-height:120px;overflow-y:auto;
      word-break:break-word;
    `;
    quoteText.textContent = text;

    const inputLabel = root.createDiv();
    inputLabel.style.cssText = `
      font-size:11.5px;font-weight:500;
      color:var(--text-faint);
      letter-spacing:0.05em;text-transform:uppercase;
      margin-bottom:6px;
    `;
    inputLabel.textContent = '注释';

    const textarea = root.createEl('textarea');
    textarea.placeholder = '';
    textarea.style.cssText = `
      width:100%;min-height:90px;
      padding:10px 12px;
      border:1px solid var(--background-modifier-border);
      border-radius:5px;
      resize:vertical;
      font-size:14px;line-height:1.6;
      font-family:inherit;
      color:var(--text-normal);
      background:var(--background-primary);
      outline:none;box-sizing:border-box;
      transition:border-color 0.15s ease;
    `;
    textarea.addEventListener('focus', () => {
      textarea.style.borderColor = 'var(--interactive-accent)';
    });
    textarea.addEventListener('blur', () => {
      textarea.style.borderColor = 'var(--background-modifier-border)';
    });

    const btnRow = root.createDiv();
    btnRow.style.cssText = `
      display:flex;justify-content:flex-end;gap:8px;margin-top:16px;
    `;

    const cancelBtn = btnRow.createEl('button', { text: '取消' });
    cancelBtn.style.cssText = `
      font-size:13px;padding:6px 14px;
      border-radius:5px;
      border:1px solid var(--background-modifier-border);
      background:transparent;
      color:var(--text-muted);
      cursor:pointer;font-family:inherit;
    `;
    cancelBtn.addEventListener('click', () => modal.close());

    const saveBtn = btnRow.createEl('button', { text: '保存' });
    saveBtn.style.cssText = `
      font-size:13px;padding:6px 16px;
      border-radius:5px;
      border:none;
      background:var(--interactive-accent);
      color:var(--text-on-accent);
      cursor:pointer;font-weight:500;font-family:inherit;
      transition:opacity 0.15s ease;
    `;

    const doAdd = async () => {
      const comment = textarea.value.trim();
      if (!comment) { new Notice('批注内容不能为空'); return; }
      modal.close();

      const file = this.plugin.app.workspace.getActiveFile();
      if (!file) return;

      const annotation: Annotation = {
        id: this.plugin.generateId(),
        type: 'comment',
        line,
        text,
        color: hlColor,
        comment,
        createdAt: Date.now()
      };

      await this.plugin.store.addAnnotation(file.path, annotation);
      this.plugin.sidebar?.refresh();
      new Notice('已添加批注');
    };

    saveBtn.addEventListener('click', doAdd);

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        doAdd();
      }
      if (e.key === 'Escape') {
        modal.close();
      }
    });

    modal.open();
    setTimeout(() => textarea.focus(), 100);
  }

  // ════════════════════════════════════════════
  //  后处理器 — 阅读视图标注恢复
  // ════════════════════════════════════════════

  async applyAnnotationsToElement(el: HTMLElement, sourcePath: string) {
    const data = await this.plugin.store.load(sourcePath);
    if (!data || data.annotations.length === 0) return;

    data.annotations.forEach(ann => {
      this.findAndWrapText(el, ann.text, ann);
    });
  }

  /**
   * 在容器元素中查找与 annotation.text 匹配的文本节点，
   * 将其拆分为子 span 并应用标注样式
   */
  private findAndWrapText(container: HTMLElement, text: string, ann: Annotation): boolean {
    if (!text.trim()) return false;
    const cleaned = text.trim();

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    let textNode: Text | null;

    while ((textNode = walker.nextNode() as Text | null)) {
      const content = textNode.textContent || '';
      if (!content.trim()) continue;

      // 跳过已有标注样式的节点
      if (textNode.parentElement?.dataset?.['fleurAnnId']) continue;

      const idx = content.indexOf(cleaned);
      if (idx === -1) continue;

      // 找到了匹配
      const full = content;
      const before = full.substring(0, idx);
      const middle = full.substring(idx, idx + cleaned.length);
      const after = full.substring(idx + cleaned.length);

      const parent = textNode.parentNode;
      if (!parent) return false;

      const span = document.createElement('span');
      span.textContent = middle;
      span.dataset['fleurAnnId'] = ann.id;
      span.dataset['fleurType'] = ann.type;

      this.applyAnnotationStyle(span, ann);

      if (before) parent.insertBefore(document.createTextNode(before), textNode);
      parent.insertBefore(span, textNode);
      if (after) parent.insertBefore(document.createTextNode(after), textNode);
      parent.removeChild(textNode);

      return true;
    }

    return false;
  }

  /** 根据标注类型应用样式 */
  private applyAnnotationStyle(span: HTMLElement, ann: Annotation) {
    const color = ann.color || '#FFC107';
    if (ann.type === 'highlight' || ann.type === 'comment') {
      span.style.backgroundColor = color;
      span.style.borderRadius = '2px';
    } else if (ann.type === 'underline') {
      const style = ann.underlineStyle || 'solid';
      span.style.textDecoration = style === 'wavy'
        ? `underline wavy ${color}`
        : `underline ${style} ${color}`;
      span.style.textUnderlineOffset = '3px';
    }
  }

  // ════════════════════════════════════════════
  //  AI
  // ════════════════════════════════════════════

  private askAI(text: string) {
    const panel = new AIChatPanel(this.plugin, text, 'explain');
    panel.open();
  }

  private askAITranslate(text: string) {
    const panel = new AIChatPanel(this.plugin, text, 'translate');
    panel.open();
  }

  // ════════════════════════════════════════════
  //  卸载
  // ════════════════════════════════════════════

  uninstall() {
    if (this.boundContextMenu) {
      document.removeEventListener('contextmenu', this.boundContextMenu, true);
      this.boundContextMenu = null;
    }
    if (this.boundMouseDown) {
      document.removeEventListener('mousedown', this.boundMouseDown, true);
      this.boundMouseDown = null;
    }
    if (this.boundMouseUp) {
      document.removeEventListener('mouseup', this.boundMouseUp, true);
      this.boundMouseUp = null;
    }
    console.log('[FleurReader] Patcher uninstalled');
  }
}
