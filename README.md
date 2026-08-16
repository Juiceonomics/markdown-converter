# Folio

一个**所见即所得**的 Markdown 编辑器，可以把 Markdown 一键导出成 **Word（.doc）** 或 **PDF**。

## 功能

- ✍️ 所见即所得编辑：粘贴 Markdown 自动转富文本，像 Word 一样直接编辑
- 🎨 富文本工具栏：字体、字号、颜色、背景高亮、对齐、列表、引用、代码块、缩进
- 🖍 语法高亮：代码块自动识别语言并着色（highlight.js）
- ∑ LaTeX 公式：行内 `$...$` 与独立 `$$...$$`（KaTeX，已本地化、离线可用）
- 🔀 双向转换：可在「富文本」和「Markdown 源码」之间切换，颜色/字号以内联 HTML 保留
- 📄 导出 Word / PDF：导出 `.doc`（Word 直接打开、保留样式）或 PDF（浏览器打印）

## 使用方法

直接双击打开 `index.html` 即可，**无需安装、无需联网**（公式与字体已本地化）。

1. 粘贴 Markdown，或点「载入文件」打开本地 `.md` 文件
2. 用顶部工具栏编辑（字号、颜色、高亮、对齐等）
3. 点「导出 Word」或「导出 PDF」

## 文件说明

| 文件 | 作用 |
|------|------|
| `index.html` | 应用主体（全部逻辑与样式） |
| `marked.min.js` | Markdown → HTML 解析 |
| `turndown.js` / `turndown-plugin-gfm.js` | HTML → Markdown（含表格 / 任务列表） |
| `highlight.min.js` / `atom-one-dark.min.css` | 代码语法高亮 |
| `katex/` | KaTeX 数学公式渲染（JS + CSS + 字体，完整本地化） |

## 说明

- 导出 Word 用的是 `.doc`（HTML 包装），Word 能直接打开并保留格式，但不是原生 `.docx`
- 导出 PDF 依赖浏览器打印（另存为 PDF）
- 公式在 Word 中会降级为原始 TeX 文本（Word 原生不支持 KaTeX 排版）
- 界面衬线字体走 Google Fonts，加载失败时自动降级为系统字体（宋体 / 微软雅黑）
