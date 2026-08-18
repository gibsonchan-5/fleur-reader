// Markdown 编辑器操作层 - 支持 Live Preview 和 Reading Mode
import type { Editor, TFile } from 'obsidian';

/**
 * 转义正则特殊字符
 */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 从文件内容中查找并替换文本（宽松空白匹配）
 */
export function findAndReplace(content: string, searchText: string, replacement: string): string | null {
  // 先尝试精确匹配
  const exactIndex = content.indexOf(searchText);
  if (exactIndex !== -1) {
    return content.substring(0, exactIndex) + replacement + content.substring(exactIndex + searchText.length);
  }

  // 宽松匹配：将连续空白视为 \s+
  const parts = searchText.split(/\s+/);
  if (parts.length <= 1) return null;
  const fuzzyPattern = parts.map(p => escapeRegex(p)).join('\\s+');
  const regex = new RegExp(fuzzyPattern);
  const match = content.match(regex);
  if (!match) return null;

  return content.substring(0, match.index!) + replacement + content.substring(match.index! + match[0].length);
}

/**
 * 从文件内容中移除包裹标记（宽松空白匹配）
 */
export function unwrapText(content: string, prefix: string, suffix: string, searchText: string): string | null {
  // 精确匹配
  const wrapped = `${prefix}${searchText}${suffix}`;
  const exactIndex = content.indexOf(wrapped);
  if (exactIndex !== -1) {
    return content.substring(0, exactIndex) + searchText + content.substring(exactIndex + wrapped.length);
  }

  // 宽松匹配
  const parts = searchText.split(/\s+/);
  if (parts.length <= 1) return null;
  const escapedPrefix = escapeRegex(prefix);
  const escapedSuffix = escapeRegex(suffix);
  const pattern = `${escapedPrefix}${parts.map(p => escapeRegex(p)).join('\\s+')}\\s*${escapedSuffix}`;
  const regex = new RegExp(pattern);
  const match = content.match(regex);
  if (!match) return null;

  return content.substring(0, match.index!) + searchText + content.substring(match.index! + match[0].length);
}

/**
 * 在编辑器中包裹选中文本（Live Preview 模式）
 */
export function wrapSelection(editor: Editor, prefix: string, suffix: string): boolean {
  const selection = editor.getSelection();
  if (!selection) return false;
  
  editor.replaceSelection(`${prefix}${selection}${suffix}`);
  return true;
}

/**
 * 在编辑器中追加文本到选中内容后面
 */
export function appendToSelection(editor: Editor, suffix: string): boolean {
  const selection = editor.getSelection();
  if (!selection) return false;
  
  editor.replaceSelection(`${selection}${suffix}`);
  return true;
}

/**
 * 从 Reading Mode 的 DOM 中获取选中文本
 */
export function getReadingModeSelection(): string | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return null;
  
  const text = selection.toString().trim();
  return text || null;
}

/**
 * 检查是否在 Reading Mode 中
 */
export function isInReadingMode(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as HTMLElement;
  return !!el.closest?.('.markdown-preview-view, .markdown-rendered');
}

/**
 * 检查是否在 Live Preview 模式
 */
export function isInLivePreview(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as HTMLElement;
  return !!el.closest?.('.markdown-source-view, .cm-editor');
}
