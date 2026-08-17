import { ItemView, WorkspaceLeaf, MarkdownRenderer, MarkdownRenderChild } from 'obsidian';
import type FleurReaderPlugin from './main';
import type { Annotation } from './types';
import { AIChatPanel } from './ai-chat-modal';
import { AIService } from './ai-service';

export const VIEW_TYPE_SIDEBAR = 'fleur-reader-sidebar';

export class SidebarView extends ItemView {
  private annotationsContainer: HTMLElement;
  private emptyStateEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf, private plugin: FleurReaderPlugin) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_SIDEBAR;
  }

  getDisplayText() {
    return 'FleurReader 批注';
  }

  getIcon() {
    return 'file-text';
  }

  async onOpen() {
    this.renderUI();
    await this.refreshAnnotations();
  }

  async onClose() {
    // Cleanup
  }

  /**
   * 刷新侧边栏（重新渲染 UI）
   */
  refresh() {
    this.renderUI();
  }

  private renderUI() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('fleur-reader-sidebar');

    // 顶部工具栏
    const toolbar = container.createDiv();
    toolbar.addClass('fleur-reader-toolbar');

    const exportBtn = toolbar.createEl('button', { text: '导出笔记' });
    exportBtn.addEventListener('click', () => this.exportAnnotations());

    // 批注列表容器
    this.annotationsContainer = container.createDiv();
    this.annotationsContainer.addClass('fleur-reader-annotations');

    // 空状态提示
    this.emptyStateEl = this.annotationsContainer.createDiv();
    this.emptyStateEl.addClass('fleur-reader-empty');
    this.emptyStateEl.setText('选中文本后右键添加批注');
  }

  async refreshAnnotations() {
    const file = this.plugin.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') {
      this.emptyStateEl.setText('打开 Markdown 文件以查看批注');
      this.annotationsContainer.empty();
      this.annotationsContainer.appendChild(this.emptyStateEl);
      return;
    }

    const annotations = await this.plugin.store.getAnnotations(file.path);
    this.annotationsContainer.empty();

    if (annotations.length === 0) {
      this.annotationsContainer.appendChild(this.emptyStateEl);
      this.emptyStateEl.setText('暂无批注，选中文本后右键添加');
      return;
    }

    // 按时间倒序显示
    const sorted = [...annotations].sort((a, b) => b.createdAt - a.createdAt);

    sorted.forEach(ann => {
      this.renderAnnotationCard(ann, file.path);
    });
  }

  private renderAnnotationCard(ann: Annotation, filePath: string) {
    const card = this.annotationsContainer.createDiv();
    card.addClass('fleur-reader-annotation-card');
    card.addClass(`fleur-reader-${ann.type}`);

    // 头部：类型图标 + 时间
    const header = card.createDiv();
    header.addClass('fleur-reader-card-header');

    const typeLabel = header.createSpan();
    typeLabel.addClass('fleur-reader-type-label');
    if (ann.type === 'highlight') {
      typeLabel.setText('📝 高亮');
    } else if (ann.type === 'underline') {
      typeLabel.setText('📏 划线');
    } else {
      typeLabel.setText('💬 批注');
    }

    const time = header.createSpan();
    time.addClass('fleur-reader-time');
    time.setText(new Date(ann.createdAt).toLocaleString('zh-CN'));

    // 选中文本
    const textBlock = card.createDiv();
    textBlock.addClass('fleur-reader-text');
    textBlock.setText(ann.text);

    // 批注内容（如果有）
    if (ann.comment) {
      const commentBlock = card.createDiv();
      commentBlock.addClass('fleur-reader-comment');
      const commentRenderChild = new MarkdownRenderChild(commentBlock);
      MarkdownRenderer.renderMarkdown(ann.comment, commentBlock, filePath, commentRenderChild);
    }

    // 操作按钮
    const actions = card.createDiv();
    actions.addClass('fleur-reader-actions');

    if (ann.type !== 'comment') {
      // 添加批注按钮
      const commentBtn = actions.createEl('button', { text: '💬 添加批注' });
      commentBtn.addEventListener('click', () => {
        this.openCommentDialog(ann, filePath);
      });
    }

    // AI 批注按钮
    const aiBtn = actions.createEl('button', { text: '✨ AI 批注' });
    aiBtn.addEventListener('click', async () => {
      await this.generateAIComment(ann, filePath);
    });

    // AI 翻译按钮
    const translateBtn = actions.createEl('button', { text: '🌐 翻译' });
    translateBtn.addEventListener('click', () => {
      const panel = new AIChatPanel(this.plugin, ann.text, 'translate');
      panel.open();
    });

    // AI 解释按钮
    const explainBtn = actions.createEl('button', { text: '💡 解释' });
    explainBtn.addEventListener('click', () => {
      const panel = new AIChatPanel(this.plugin, ann.text, 'explain');
      panel.open();
    });

    // 删除按钮
    const deleteBtn = actions.createEl('button', { text: '🗑️ 删除' });
    deleteBtn.addEventListener('click', async () => {
      if (confirm('确定要删除这条批注吗？')) {
        await this.plugin.store.deleteAnnotation(filePath, ann.id);
        await this.refreshAnnotations();
      }
    });
  }

  private openCommentDialog(ann: Annotation, filePath: string) {
    const modal = new (require('obsidian').Modal)(this.app);
    modal.titleEl.setText('添加批注');

    const content = modal.contentEl;
    content.style.padding = '16px';

    const textarea = content.createEl('textarea');
    textarea.style.cssText = `
      width: 100%;
      min-height: 120px;
      padding: 8px;
      border: 1px solid var(--background-modifier-border);
      border-radius: 4px;
      background: var(--background-primary);
      color: var(--text-normal);
      font-family: inherit;
      font-size: 14px;
      resize: vertical;
    `;
    textarea.placeholder = '输入批注内容...';

    const buttonContainer = content.createDiv();
    buttonContainer.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    `;

    const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
    cancelBtn.addEventListener('click', () => modal.close());

    const saveBtn = buttonContainer.createEl('button', { text: '保存' });
    saveBtn.addClass('mod-cta');
    saveBtn.addEventListener('click', async () => {
      const comment = textarea.value.trim();
      if (!comment) {
        new (require('obsidian').Notice)('批注不能为空');
        return;
      }

      // 创建新的批注条目
      const newAnn: Annotation = {
        id: Date.now().toString(),
        type: 'comment',
        text: ann.text,
        line: ann.line,
        comment: comment,
        createdAt: Date.now()
      };

      await this.plugin.store.addAnnotation(filePath, newAnn);
      modal.close();
      await this.refreshAnnotations();
    });

    modal.open();
  }

  private async generateAIComment(ann: Annotation, filePath: string) {
    const aiService = new AIService(this.plugin);
    const prompt = `请为以下文本生成简洁的批注：\n\n"${ann.text}"\n\n批注要求：
1. 解释核心概念
2. 指出关键点
3. 提供上下文或应用场景
4. 保持简洁（100字以内）`;

    const messages = [
      { role: 'system', content: '你是一位专业的阅读助手，擅长为文本生成简洁有价值的批注。' },
      { role: 'user', content: prompt }
    ];

    // 创建临时卡片显示 AI 生成中
    const tempCard = this.annotationsContainer.createDiv();
    tempCard.addClass('fleur-reader-annotation-card');
    tempCard.createDiv({ text: '✨ AI 正在生成批注...', cls: 'fleur-reader-loading' });

    let generatedComment = '';

    await aiService.streamChat(
      messages,
      (chunk) => {
        generatedComment += chunk;
      },
      async () => {
        // AI 生成完成
        if (generatedComment) {
          const newAnn: Annotation = {
            id: Date.now().toString(),
            type: 'comment',
            text: ann.text,
            line: ann.line,
            comment: generatedComment,
            createdAt: Date.now()
          };

          await this.plugin.store.addAnnotation(filePath, newAnn);
          await this.refreshAnnotations();
        }
      },
      (error) => {
        tempCard.setText(`❌ AI 批注生成失败：${error}`);
      }
    );
  }

  private async exportAnnotations() {
    const file = this.plugin.app.workspace.getActiveFile();
    if (!file) {
      return;
    }

    const annotations = await this.plugin.store.getAnnotations(file.path);
    if (annotations.length === 0) {
      new (require('obsidian').Notice)('没有可导出的批注');
      return;
    }

    // 生成 Markdown 内容
    let content = `# ${file.basename} - 批注笔记\n\n`;
    content += `> 导出时间：${new Date().toLocaleString('zh-CN')}\n\n`;
    content += `---\n\n`;

    const sorted = [...annotations].sort((a, b) => a.line - b.line);

    sorted.forEach(ann => {
      // 原文引用
      content += `## 原文（第 ${ann.line + 1} 行）\n\n`;
      content += `> ${ann.text}\n\n`;

      if (ann.type === 'highlight') {
        content += `**类型**：📝 高亮\n\n`;
      } else if (ann.type === 'underline') {
        content += `**类型**：📏 划线\n\n`;
      } else {
        content += `**类型**：💬 批注\n\n`;
      }

      // 批注内容
      if (ann.comment) {
        content += `### 批注\n\n`;
        content += `${ann.comment}\n\n`;
      }

      content += `---\n\n`;
    });

    // 询问保存位置
    const modal = new (require('obsidian').Modal)(this.app);
    modal.titleEl.setText('导出批注笔记');

    const contentEl = modal.contentEl;
    contentEl.style.padding = '16px';

    const pathInput = contentEl.createEl('input', { type: 'text' });
    pathInput.style.cssText = `
      width: 100%;
      padding: 8px;
      margin-bottom: 12px;
      border: 1px solid var(--background-modifier-border);
      border-radius: 4px;
      background: var(--background-primary);
      color: var(--text-normal);
    `;
    const defaultPath = `${file.basename}-批注笔记.md`;
    pathInput.value = defaultPath;
    pathInput.placeholder = '输入文件路径（例如：笔记/批注.md）';

    const buttonContainer = contentEl.createDiv();
    buttonContainer.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    `;

    const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
    cancelBtn.addEventListener('click', () => modal.close());

    const saveBtn = buttonContainer.createEl('button', { text: '保存' });
    saveBtn.addClass('mod-cta');
    saveBtn.addEventListener('click', async () => {
      const savePath = pathInput.value.trim();
      if (!savePath) {
        return;
      }

      try {
        await this.plugin.app.vault.create(savePath, content);
        new (require('obsidian').Notice)(`笔记已导出到：${savePath}`);
        modal.close();
      } catch (error) {
        new (require('obsidian').Notice)(`导出失败：${error}`);
      }
    });

    modal.open();
  }
}
