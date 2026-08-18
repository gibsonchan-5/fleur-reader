import { ItemView, WorkspaceLeaf, Notice, MarkdownRenderer, Menu } from 'obsidian';
import type FleurReaderPlugin from './main';
import type { Annotation } from './types';
import { AIChatPanel } from './ai-chat-modal';

export const VIEW_TYPE_FLEUR_READER = 'fleur-reader-sidebar';

export class SidebarView extends ItemView {
  private data: { annotations: Annotation[] } = { annotations: [] };

  constructor(leaf: WorkspaceLeaf, private plugin: FleurReaderPlugin) {
    super(leaf);
  }

  getViewType() { return VIEW_TYPE_FLEUR_READER; }
  getDisplayText() { return 'FleurReader'; }
  getIcon() { return 'highlighter'; }

  async onOpen() {
    await this.loadData();
    this.renderUI();
  }

  async onClose() {}

  /** 刷新侧边栏 */
  refresh() { this.renderUI(); }

  async refreshAnnotations() {
    await this.loadData();
    this.renderUI();
  }

  private async loadData() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return;
    const data = await this.plugin.store.load(file.path);
    this.data = data;
  }

  // ════════════════════════════════════════════
  //  UI 渲染（完全对标 FleurPDF 侧边栏）
  // ════════════════════════════════════════════

  private renderUI() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('fleur-sidebar');

    // 顶部标题栏
    const header = container.createDiv();
    header.style.cssText = `
      display:flex;justify-content:space-between;align-items:center;
      margin-bottom:12px;padding-bottom:8px;
      border-bottom:1px solid var(--background-modifier-border);
    `;
    const titleEl = header.createSpan({ text: '批注' });
    titleEl.style.cssText = 'font-size:15px;font-weight:600;color:var(--text-normal);';

    // 导出笔记按钮
    const exportBtn = header.createEl('button');
    exportBtn.style.cssText = `
      font-size:12px;padding:4px 10px;
      border:1px solid var(--background-modifier-border);
      border-radius:4px;background:var(--background-primary);
      color:var(--text-muted);cursor:pointer;
      display:inline-flex;align-items:center;gap:4px;
    `;
    exportBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg> 导出笔记`;
    exportBtn.addEventListener('mouseenter', () => {
      exportBtn.style.borderColor = 'var(--interactive-accent)';
      exportBtn.style.color = 'var(--interactive-accent)';
    });
    exportBtn.addEventListener('mouseleave', () => {
      exportBtn.style.borderColor = 'var(--background-modifier-border)';
      exportBtn.style.color = 'var(--text-muted)';
    });
    exportBtn.addEventListener('click', () => this.exportAllNotes());

    // 内容区
    const body = container.createDiv();
    body.style.cssText = 'padding:4px 0 24px;';

    if (this.data.annotations.length === 0) {
      const empty = body.createDiv({ text: '暂无批注，选中文本右键添加' });
      empty.style.cssText = 'padding:20px;text-align:center;color:var(--text-muted);font-size:13px;';
      return;
    }

    // 按类型分组
    const groups: { type: string; label: string; icon: string; items: Annotation[] }[] = [
      { type: 'highlight', label: '高亮', icon: 'highlighter', items: [] },
      { type: 'underline', label: '划线', icon: 'underline', items: [] },
      { type: 'comment', label: '批注', icon: 'message-square', items: [] },
    ];

    this.data.annotations.forEach(ann => {
      const g = groups.find(g => g.type === ann.type);
      if (g) g.items.push(ann);
    });

    groups.forEach(group => {
      if (group.items.length === 0) return;

      // 分组标题
      const section = body.createDiv();
      section.style.cssText = 'margin-bottom:16px;';

      const pageTag = section.createDiv();
      pageTag.style.cssText = `
        display:inline-flex;align-items:center;gap:4px;
        font-size:11px;font-weight:500;letter-spacing:0.04em;
        color:var(--text-faint);text-transform:uppercase;
        padding:2px 0;margin-bottom:8px;
        border-bottom:1px solid var(--background-modifier-border);
        width:100%;
      `;
      pageTag.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> ${group.label}（${group.items.length}）`;

      group.items.forEach(ann => {
        this.renderAnnotation(section, ann);
      });
    });
  }

  // ── 单条标注卡片（HiNote 风格，完全对标 FleurPDF） ──

  private renderAnnotation(parent: HTMLElement, ann: Annotation) {
    const card = parent.createDiv();
    card.style.cssText = `
      margin-bottom:6px;
      border-radius:6px;
      background:var(--background-primary);
      border:1px solid var(--background-modifier-border);
      overflow:hidden;
      transition:border-color 0.15s ease;
    `;

    // 顶部色条
    const bar = card.createDiv();
    const barColor = ann.type === 'underline'
      ? (ann.color || '#E8590C')
      : (ann.color || '#FFC107');
    bar.style.cssText = `height:2px;background:${barColor};`;

    // 主体
    const main = card.createDiv();
    main.style.cssText = 'padding:10px 12px;';

    // 选中文本行（带悬停操作）
    const row = main.createDiv();
    row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;';

    // 类型图标
    const typeIcon = row.createDiv();
    typeIcon.style.cssText = `
      flex-shrink:0;width:18px;height:18px;margin-top:1px;
      display:flex;align-items:center;justify-content:center;
      color:var(--text-faint);
    `;
    if (ann.type === 'highlight') {
      typeIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
    } else if (ann.type === 'underline') {
      typeIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>`;
    } else {
      typeIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    }

    // 选中文本
    const textWrap = row.createDiv();
    textWrap.style.cssText = 'flex:1;min-width:0;';

    const textEl = textWrap.createDiv();
    textEl.style.cssText = `
      font-size:13px;line-height:1.5;
      color:var(--text-normal);
      word-break:break-word;
      overflow:hidden;
      display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;
    `;
    textEl.textContent = ann.text;

    // 操作按钮（悬停显示）
    const actions = row.createDiv();
    actions.style.cssText = `
      flex-shrink:0;display:flex;gap:2px;
      opacity:0;transition:opacity 0.12s ease;
    `;
    card.addEventListener('mouseenter', () => { actions.style.opacity = '1'; });
    card.addEventListener('mouseleave', () => { actions.style.opacity = '0'; });

    // AI 生成批注按钮
    const aiBtn = actions.createEl('button');
    aiBtn.title = 'AI 生成批注';
    aiBtn.style.cssText = `
      width:22px;height:22px;padding:3px;
      border:none;background:transparent;
      color:var(--text-faint);cursor:pointer;border-radius:3px;
      display:flex;align-items:center;justify-content:center;
    `;
    aiBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93L12 22"/><path d="M12 2a4 4 0 0 0-4 4c0 1.95 1.4 3.58 3.25 3.93"/><path d="M8 6h8"/><path d="M9 10h6"/><path d="M10 14h4"/><path d="M11 18h2"/></svg>`;
    aiBtn.addEventListener('mouseenter', () => {
      aiBtn.style.background = 'var(--background-modifier-hover)';
      aiBtn.style.color = 'var(--interactive-accent)';
    });
    aiBtn.addEventListener('mouseleave', () => {
      aiBtn.style.background = 'transparent';
      aiBtn.style.color = 'var(--text-faint)';
    });
    aiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.generateAIComment(ann);
    });

    // 删除按钮
    const delBtn = actions.createEl('button');
    delBtn.title = '删除';
    delBtn.style.cssText = `
      width:22px;height:22px;padding:3px;
      border:none;background:transparent;
      color:var(--text-faint);cursor:pointer;border-radius:3px;
      display:flex;align-items:center;justify-content:center;
    `;
    delBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    delBtn.addEventListener('mouseenter', () => {
      delBtn.style.background = 'var(--background-modifier-hover)';
      delBtn.style.color = 'var(--text-error)';
    });
    delBtn.addEventListener('mouseleave', () => {
      delBtn.style.background = 'transparent';
      delBtn.style.color = 'var(--text-faint)';
    });
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteAnnotation(ann);
    });

    // 批注区
    const commentSlot = main.createDiv();
    commentSlot.dataset['commentSlotFor'] = ann.id;

    if (ann.comment) {
      this.renderCommentDisplay(commentSlot, ann);
    } else {
      this.renderAddCommentHint(commentSlot, ann);
    }

    // 时间戳
    const footer = main.createDiv();
    footer.style.cssText = `
      margin-top:6px;margin-left:26px;
      font-size:11px;color:var(--text-faint);
      letter-spacing:0.01em;
    `;
    footer.textContent = new Date(ann.createdAt).toLocaleString('zh-CN');
  }

  // ── 批注显示/编辑 ──

  private renderCommentDisplay(slot: HTMLElement, ann: Annotation) {
    slot.style.cssText = 'margin-top:8px;margin-left:26px;';

    const display = slot.createDiv();
    display.style.cssText = `
      font-size:13px;line-height:1.5;
      color:var(--text-muted);font-style:italic;
      padding:6px 8px;
      background:var(--background-secondary);
      border-radius:4px;
      cursor:pointer;
    `;

    MarkdownRenderer.renderMarkdown(ann.comment || '', display, '', this);

    display.addEventListener('click', () => this.openCommentEditor(ann));
  }

  private renderAddCommentHint(slot: HTMLElement, ann: Annotation) {
    slot.style.cssText = 'margin-top:8px;margin-left:26px;';

    const hint = slot.createDiv({ text: '添加批注…' });
    hint.style.cssText = `
      font-size:12px;color:var(--text-faint);
      cursor:pointer;padding:2px 0;
    `;
    hint.addEventListener('click', () => this.openCommentEditor(ann));
  }

  private openCommentEditor(ann: Annotation) {
    // 清除旧的编辑区
    const existing = this.containerEl.querySelector(`[data-comment-editor-for="${ann.id}"]`);
    if (existing) existing.remove();

    const slot = this.containerEl.querySelector(`[data-comment-slot-for="${ann.id}"]`);
    if (!slot) return;

    const editorWrap = slot.createDiv();
    editorWrap.dataset['commentEditorFor'] = ann.id;

    const textarea = editorWrap.createEl('textarea');
    textarea.value = ann.comment || '';
    textarea.style.cssText = `
      width:100%;min-height:120px;max-height:400px;
      padding:8px 10px;
      border:1px solid var(--background-modifier-border);
      border-radius:4px;
      background:var(--background-primary);
      color:var(--text-normal);
      font-size:13px;line-height:1.5;
      resize:vertical;
      font-family:inherit;
      box-sizing:border-box;
    `;
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 400) + 'px';
    });
    textarea.focus();

    const btnRow = editorWrap.createDiv();
    btnRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;justify-content:flex-end;';

    const saveBtn = btnRow.createEl('button', { text: '保存' });
    saveBtn.style.cssText = `
      font-size:12px;padding:4px 12px;
      border:none;border-radius:4px;
      background:var(--interactive-accent);
      color:var(--text-on-accent);
      cursor:pointer;
    `;
    saveBtn.addEventListener('click', async () => {
      ann.comment = textarea.value.trim();
      if (ann.comment) {
        await this.plugin.store.updateAnnotation(this.getFilePath(), ann);
      }
      await this.refreshAnnotations();
    });

    const cancelBtn = btnRow.createEl('button', { text: '取消' });
    cancelBtn.style.cssText = `
      font-size:12px;padding:4px 12px;
      border:1px solid var(--background-modifier-border);
      border-radius:4px;
      background:var(--background-primary);
      color:var(--text-muted);
      cursor:pointer;
    `;
    cancelBtn.addEventListener('click', () => {
      editorWrap.remove();
    });
  }

  // ── AI 生成批注 ──

  private async generateAIComment(ann: Annotation) {
    ann.comment = '⏳ AI 正在生成批注…';
    await this.plugin.store.updateAnnotation(this.getFilePath(), ann);
    await this.refreshAnnotations();

      try {
        const { AIService } = await import('./ai-service');
        const service = new AIService(this.plugin);
        let result = '';

        await service.streamChat(
          [{ role: 'user', content: `请为以下文本生成一段精炼的批注（50-100字），包含关键要点和深层含义：\n\n「${ann.text}」` }],
          (text) => { result += text; }
        );

        ann.comment = result || '生成失败';
        await this.plugin.store.updateAnnotation(this.getFilePath(), ann);
        await this.refreshAnnotations();
      } catch (err) {
        ann.comment = '生成失败：' + (err as Error).message;
        await this.plugin.store.updateAnnotation(this.getFilePath(), ann);
        await this.refreshAnnotations();
      }
  }

  // ─ 删除 ──

  private async deleteAnnotation(ann: Annotation) {
    await this.plugin.patcher.deleteAnnotation(ann.id);
  }

  // ── 导出 ──

  private async exportAllNotes() {
    const file = this.app.workspace.getActiveFile();
    if (!file) { new Notice('请先打开一个 Markdown 文件'); return; }

    const lines: string[] = [`# ${file.basename} 批注导出`, '', `> 导出时间：${new Date().toLocaleString('zh-CN')}`, ''];

    const types: { type: string; label: string }[] = [
      { type: 'highlight', label: '📝 高亮' },
      { type: 'underline', label: '📏 划线' },
      { type: 'comment', label: '💬 批注' },
    ];

    for (const g of types) {
      const items = this.data.annotations.filter(a => a.type === g.type);
      if (items.length === 0) continue;

      lines.push(`## ${g.label}（${items.length}条）`, '');
      items.forEach(ann => {
        lines.push(`- **${ann.text}**`);
        if (ann.comment) lines.push(`  > ${ann.comment}`);
        lines.push(`  _${new Date(ann.createdAt).toLocaleString('zh-CN')}_`, '');
      });
    }

    const exportFolder = this.plugin.settings.noteFolder || 'FleurReader导出';
    await this.app.vault.createFolder(exportFolder).catch(() => {});

    const outPath = `${exportFolder}/${file.basename}-批注.md`;
    await this.app.vault.create(outPath, lines.join('\n'));
    new Notice(`已导出到 ${outPath}`);
  }

  private getFilePath(): string {
    return this.app.workspace.getActiveFile()?.path || '';
  }
}
