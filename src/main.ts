// 主入口
import { Plugin, WorkspaceLeaf, TFile, Notice, MarkdownView } from 'obsidian';
import { SidebarView, VIEW_TYPE_FLEUR_READER } from './sidebar';
import { MarkdownPatcher } from './patcher';
import { AnnotationStore } from './store';
import { FleurSettings, DEFAULT_SETTINGS, FleurSettingTab } from './settings';

export default class FleurReaderPlugin extends Plugin {
  store: AnnotationStore;
  patcher: MarkdownPatcher;
  sidebar: SidebarView | null = null;
  settings: FleurSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.store = new AnnotationStore(this.app, this.manifest.id);
    this.patcher = new MarkdownPatcher(this);
    this.patcher.install();

    this.registerView(VIEW_TYPE_FLEUR_READER, (leaf) => {
      this.sidebar = new SidebarView(leaf, this);
      return this.sidebar;
    });

    this.addRibbonIcon('file-text', 'FleurReader', () => {
      this.activateSidebar();
    });

    this.addCommand({
      id: 'open-sidebar',
      name: '打开批注侧边栏',
      callback: () => this.activateSidebar()
    });

    this.addSettingTab(new FleurSettingTab(this.app, this));

    // 注册 Markdown 后处理器（Reading Mode 气泡提示）
    this.registerMarkdownPostProcessor((el, ctx) => {
      this.processReadingMode(el, ctx);
    });

    // 监听文件切换，刷新侧边栏
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file?.extension === 'md') {
          this.sidebar?.refresh();
        }
      })
    );

    // 默认打开侧边栏
    this.app.workspace.onLayoutReady(() => {
      this.activateSidebar();
    });
  }

  onunload() {
    this.patcher?.uninstall();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateSidebar() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_FLEUR_READER)[0];

    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({ type: VIEW_TYPE_FLEUR_READER, active: true });
        leaf = rightLeaf;
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  /**
   * Reading Mode 后处理器：给批注文本添加 data-fleur-annotation 属性
   * 用于触发鼠标悬停气泡提示
   */
  async processReadingMode(el: HTMLElement, ctx: any) {
    // 获取当前文件路径
    const file = ctx.sourcePath ? this.app.vault.getAbstractFileByPath(ctx.sourcePath) as TFile : null;
    if (!file) return;

    // 加载批注数据
    const data = await this.store.load(file.path);
    const commentAnnotations = data.annotations.filter(a => a.type === 'comment' && a.comment);

    if (commentAnnotations.length === 0) return;

    // 遍历所有文本节点，查找匹配
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const textNodes: Text[] = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode as Text);
    }

    for (const textNode of textNodes) {
      const text = textNode.textContent;
      if (!text) continue;

      for (const ann of commentAnnotations) {
        if (text.includes(ann.text)) {
          // 创建包裹 span
          const span = document.createElement('span');
          span.dataset.fleurAnnotation = ann.id;
          span.style.cssText = 'cursor: pointer; position: relative;';
          span.textContent = ann.text;

          // 替换文本节点
          const before = text.substring(0, text.indexOf(ann.text));
          const after = text.substring(text.indexOf(ann.text) + ann.text.length);

          const fragment = document.createDocumentFragment();
          if (before) fragment.appendChild(document.createTextNode(before));
          fragment.appendChild(span);
          if (after) fragment.appendChild(document.createTextNode(after));

          textNode.parentNode?.replaceChild(fragment, textNode);
        }
      }
    }
  }
}
