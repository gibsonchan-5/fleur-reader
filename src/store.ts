// 数据存储层
import { App, TFile, normalizePath } from 'obsidian';
import type { Annotation, MarkdownAnnotationData, AIResult } from './types';

export class AnnotationStore {
  private baseDir: string;

  constructor(private app: App, private pluginId: string) {
    this.baseDir = `${app.vault.configDir}/plugins/${pluginId}/data`;
  }

  private getFilePath(mdPath: string): string {
    const hash = this.hashPath(mdPath);
    return normalizePath(`${this.baseDir}/${hash}.json`);
  }

  private hashPath(path: string): string {
    return path.replace(/[^a-zA-Z0-9]/g, '_');
  }

  async ensureDir(): Promise<void> {
    if (!(await this.app.vault.adapter.exists(this.baseDir))) {
      await this.app.vault.adapter.mkdir(this.baseDir);
    }
  }

  async load(mdPath: string): Promise<MarkdownAnnotationData> {
    await this.ensureDir();
    const filePath = this.getFilePath(mdPath);

    try {
      if (await this.app.vault.adapter.exists(filePath)) {
        const content = await this.app.vault.adapter.read(filePath);
        return JSON.parse(content);
      }
    } catch (e) {
      console.error('加载标注数据失败:', e);
    }

    return { fileId: mdPath, annotations: [] };
  }

  async save(data: MarkdownAnnotationData): Promise<void> {
    await this.ensureDir();
    const filePath = this.getFilePath(data.fileId);
    await this.app.vault.adapter.write(filePath, JSON.stringify(data, null, 2));
  }

  async addAnnotation(mdPath: string, annotation: Annotation): Promise<void> {
    const data = await this.load(mdPath);
    data.annotations.push(annotation);
    await this.save(data);
  }

  async getAnnotations(mdPath: string): Promise<Annotation[]> {
    const data = await this.load(mdPath);
    return data.annotations;
  }

  async deleteAnnotation(mdPath: string, annotationId: string): Promise<void> {
    const data = await this.load(mdPath);
    data.annotations = data.annotations.filter(a => a.id !== annotationId);
    await this.save(data);
  }

  async updateAnnotation(mdPath: string, annotation: Annotation): Promise<void> {
    const data = await this.load(mdPath);
    const index = data.annotations.findIndex(a => a.id === annotation.id);
    if (index !== -1) {
      data.annotations[index] = annotation;
      await this.save(data);
    }
  }

  async removeAnnotation(mdPath: string, annotationId: string): Promise<void> {
    const data = await this.load(mdPath);
    data.annotations = data.annotations.filter(a => a.id !== annotationId);
    await this.save(data);
  }

  async addAIResult(mdPath: string, result: AIResult): Promise<void> {
    const data = await this.load(mdPath);
    if (!data.aiResults) {
      data.aiResults = [];
    }
    data.aiResults.push(result);
    await this.save(data);
  }

  async getAIResults(mdPath: string): Promise<AIResult[]> {
    const data = await this.load(mdPath);
    return data.aiResults || [];
  }

  async removeAIResult(mdPath: string, resultId: string): Promise<void> {
    const data = await this.load(mdPath);
    if (data.aiResults) {
      data.aiResults = data.aiResults.filter(r => r.id !== resultId);
      await this.save(data);
    }
  }
}
