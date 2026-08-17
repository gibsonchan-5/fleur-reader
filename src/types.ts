// 类型定义
export interface Annotation {
  id: string;
  type: 'highlight' | 'underline' | 'comment';
  line: number;  // 行号（从0开始）
  text: string;
  comment?: string;
  color?: string;
  underlineStyle?: 'solid' | 'dashed' | 'dotted' | 'wavy';
  createdAt: number;
}

export interface AIResult {
  id: string;
  text: string;
  question: string;
  answer: string;
  createdAt: number;
}

export interface MarkdownAnnotationData {
  fileId: string;
  annotations: Annotation[];
  aiResults?: AIResult[];
}
