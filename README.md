# FleurReader - 智能阅读助手

[English](#english) | 中文

## 中文

FleurReader 是一个 Obsidian 插件，为 Markdown 文件提供智能阅读和批注功能。通过 AI 驱动的解释、翻译和批注功能，帮助您更深入地理解和记录阅读内容。

### 主要特性

- 📝 **高亮标注**：选中文本后右键添加高亮，支持自定义颜色
- 📏 **下划线标注**：多种下划线样式（直线、虚线、点线、波浪线）
- 💬 **批注功能**：为选中文本添加个人批注
- 🤖 **AI 辅助**：
  - 智能解释：AI 解释选中的文本内容
  - 智能翻译：一键翻译选中文本
  - AI 批注：让 AI 自动生成有价值的批注
- 📋 **侧边栏管理**：集中查看所有批注，支持快速跳转
- 📤 **导出功能**：一键导出所有批注为独立的 Markdown 笔记
- 🌍 **多语言支持**：中文友好的界面和交互

### 为什么选择 FleurReader？

相比其他 PDF 阅读插件，FleurReader 专注于 Markdown 文件，具有以下独特优势：

1. **中文友好**：专为中文用户设计，界面和 AI 交互都针对中文优化
2. **所见即所得**：高亮和批注直接显示在 Markdown 文件中，无需切换视图
3. **AI 深度集成**：不仅是标注工具，更是智能阅读助手
4. **一键导出**：轻松将批注整理为独立的笔记文件
5. **原生集成**：充分利用 Obsidian 的 Markdown 编辑能力

### 安装方法

#### 方法一：BRAT 插件（推荐）

1. 在 Obsidian 中安装 [BRAT](https://github.com/tfthacker/obsidian42-brat) 插件
2. 在 BRAT 设置中添加此仓库：`https://github.com/yourusername/fleur-reader`
3. 启用 FleurReader 插件

#### 方法二：手动安装

1. 从 [Releases](https://github.com/yourusername/fleur-reader/releases) 下载最新版本
2. 解压到 Obsidian vault 的 `.obsidian/plugins/` 目录下
3. 在 Obsidian 设置中启用 FleurReader 插件

#### 方法三：从源码构建

```bash
git clone https://github.com/yourusername/fleur-reader.git
cd fleur-reader
npm install
npm run build
```

### 使用说明

#### 基本操作

1. **高亮文本**
   - 在 Markdown 文件中选中文本
   - 右键点击选中的文本
   - 选择"高亮"选项
   - 可自定义高亮颜色

2. **添加下划线**
   - 选中文本后右键
   - 选择"划线"选项
   - 可自定义下划线样式和颜色

3. **添加批注**
   - 选中文本后右键
   - 选择"批注"选项
   - 输入批注内容并保存

#### AI 功能

1. **AI 解释**
   - 选中文本后右键
   - 选择"AI 解释"
   - AI 会生成详细的解释说明

2. **AI 翻译**
   - 选中文本后右键
   - 选择"AI 翻译"
   - AI 会提供准确的翻译

3. **AI 批注**
   - 在侧边栏的批注卡片中点击"AI 批注"按钮
   - AI 会为选中文本自动生成有价值的批注

#### 侧边栏管理

1. **打开侧边栏**
   - 点击左侧工具栏的 FleurReader 图标
   - 或使用命令面板搜索"打开批注侧边栏"

2. **管理批注**
   - 在侧边栏查看所有批注
   - 点击批注卡片可快速定位到原文
   - 支持删除和编辑批注

3. **导出笔记**
   - 点击侧边栏顶部的"导出笔记"按钮
   - 选择保存位置
   - 所有批注将导出为独立的 Markdown 文件

### 配置说明

在 Obsidian 设置中找到 FleurReader 插件设置：

- **AI 配置**：设置 AI 服务提供商、API Key、Base URL 和模型
  - 支持 DeepSeek、OpenAI、智谱 AI、Moonshot 等
  - API Key 仅保存在本地
- **标注设置**：自定义默认高亮颜色和下划线样式
- **笔记导出**：设置默认导出文件夹
- **侧边栏配置**：选择侧边栏位置（左侧/右侧）

### 技术栈

- TypeScript
- Obsidian API
- Markdown Renderer
- AI Integration (OpenAI API 兼容)

### 许可证

MIT License

---

## English

FleurReader is an Obsidian plugin that provides intelligent reading and annotation features for Markdown files. With AI-powered explanation, translation, and annotation capabilities, it helps you deeply understand and document your reading content.

### Key Features

- 📝 **Highlight**: Right-click to highlight selected text with customizable colors
- 📏 **Underline**: Multiple underline styles (solid, dashed, dotted, wavy)
- 💬 **Annotations**: Add personal comments to selected text
- 🤖 **AI Assistance**:
  - Smart Explanation: AI explains selected text content
  - Smart Translation: One-click translation
  - AI Annotations: Automatically generate valuable annotations
- 📋 **Sidebar Management**: View all annotations in one place with quick navigation
- 📤 **Export**: Export all annotations as a separate Markdown note
- 🌍 **Multi-language Support**: Chinese-friendly interface and interactions

### Why Choose FleurReader?

Compared to other PDF reading plugins, FleurReader focuses on Markdown files with unique advantages:

1. **Chinese-Friendly**: Designed for Chinese users with optimized UI and AI interactions
2. **WYSIWYG**: Highlights and annotations display directly in Markdown files without view switching
3. **Deep AI Integration**: Not just an annotation tool, but an intelligent reading assistant
4. **One-Click Export**: Easily organize annotations into separate note files
5. **Native Integration**: Fully leverages Obsidian's Markdown editing capabilities

### Installation

#### Method 1: BRAT Plugin (Recommended)

1. Install [BRAT](https://github.com/tfthacker/obsidian42-brat) plugin in Obsidian
2. Add this repository in BRAT settings: `https://github.com/yourusername/fleur-reader`
3. Enable FleurReader plugin

#### Method 2: Manual Installation

1. Download the latest version from [Releases](https://github.com/yourusername/fleur-reader/releases)
2. Extract to `.obsidian/plugins/` directory in your Obsidian vault
3. Enable FleurReader plugin in Obsidian settings

#### Method 3: Build from Source

```bash
git clone https://github.com/yourusername/fleur-reader.git
cd fleur-reader
npm install
npm run build
```

### Usage

#### Basic Operations

1. **Highlight Text**
   - Select text in Markdown file
   - Right-click the selected text
   - Choose "Highlight" option
   - Customize highlight color

2. **Add Underline**
   - Select text and right-click
   - Choose "Underline" option
   - Customize underline style and color

3. **Add Annotation**
   - Select text and right-click
   - Choose "Annotation" option
   - Enter annotation content and save

#### AI Features

1. **AI Explanation**
   - Select text and right-click
   - Choose "AI Explanation"
   - AI generates detailed explanation

2. **AI Translation**
   - Select text and right-click
   - Choose "AI Translation"
   - AI provides accurate translation

3. **AI Annotation**
   - Click "AI Annotation" button in sidebar annotation card
   - AI automatically generates valuable annotations

#### Sidebar Management

1. **Open Sidebar**
   - Click FleurReader icon in left toolbar
   - Or use command palette to search "Open Annotation Sidebar"

2. **Manage Annotations**
   - View all annotations in sidebar
   - Click annotation cards to quickly locate original text
   - Support deleting and editing annotations

3. **Export Notes**
   - Click "Export Notes" button at top of sidebar
   - Choose save location
   - All annotations exported as separate Markdown file

### Configuration

Find FleurReader plugin settings in Obsidian settings:

- **AI Configuration**: Set AI service provider, API Key, Base URL, and model
  - Supports DeepSeek, OpenAI, Zhipu AI, Moonshot, etc.
  - API Key stored locally only
- **Annotation Settings**: Customize default highlight color and underline style
- **Note Export**: Set default export folder
- **Sidebar Configuration**: Choose sidebar position (left/right)

### Tech Stack

- TypeScript
- Obsidian API
- Markdown Renderer
- AI Integration (OpenAI API compatible)

### License

MIT License
