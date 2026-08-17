// AI 服务层 - 流式 API 调用
import type FleurReaderPlugin from './main';

export class AIService {
  private plugin: FleurReaderPlugin;

  constructor(plugin: FleurReaderPlugin) {
    this.plugin = plugin;
  }

  async streamChat(
    messages: Array<{ role: string; content: string }>,
    onChunk: (chunk: string) => void,
    onDone?: () => void,
    onError?: (error: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const { baseUrl, apiKey, model } = this.plugin.settings;

    if (!baseUrl || !apiKey) {
      onError?.('请先配置 API 地址和密钥');
      return;
    }

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true
        }),
        signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        onError?.(`API 请求失败 (${response.status}): ${errorText}`);
        return;
      }

      if (!response.body) {
        onError?.('响应体为空');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            onDone?.();
            return;
          }

          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              onChunk(content);
            }
          } catch {
            // 忽略 JSON 解析错误
          }
        }
      }

      onDone?.();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // 用户取消，不报错
      }
      onError?.(error instanceof Error ? error.message : '未知错误');
    }
  }
}
