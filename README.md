# Folio

一个**本地多功能工具箱**：所见即所得 Markdown 编辑器（导出 Word / PDF / Markdown / HTML）+ 压缩解压 + 图片工具 + PDF 工具。纯前端、离线可用、无需安装、图片/文件不上传。

## 功能

**Markdown 编辑器**

- ✍️ 所见即所得编辑：粘贴 Markdown 自动转富文本，像 Word 一样直接编辑
- 🎨 富文本工具栏：字体、字号、颜色、背景高亮、对齐、列表、引用、代码块、缩进
- 🖍 语法高亮：代码块自动识别语言并着色（highlight.js）
- ∑ LaTeX 公式：行内 `$...$` 与独立 `$$...$$`（KaTeX，已本地化）
- 🔀 双向转换：可在「富文本」和「Markdown 源码」间切换，颜色/字号以内联 HTML 保留
- 📄 导出 Word / PDF / Markdown / HTML
- 💬 批注：选中文字添加高亮批注，可定位/删除，导出 Word 时附文末批注列表
- 🕘 历史记录 + 草稿自动保存（localStorage），支持拖拽打开 `.md` 文件

**实用工具**

- 📦 打包 ZIP：拖入文件一键压缩成 `.zip`
- 📂 解压 ZIP：查看压缩包内容并下载文件
- 🖼 图片转 PDF：拖入一张或多张图片，合成多页 PDF
- 🗜 图片压缩：拖入图片压缩体积（质量可调，WebP / JPEG）
- 🔗 PDF 合并：多个 PDF 合成一个
- ✂️ PDF 拆分：提取指定页（如 `1,3,5-7`）
- 🔤 乱码修复：修复 GBK / UTF-8 等编码导致的乱码
- 📄 Word 文字提取：从 `.docx` / `.doc` 提取文字（损坏文档也能抢救）

## 使用方法

直接双击打开 `index.html`，或访问在线版：[juiceonomics.github.io/markdown-converter](https://juiceonomics.github.io/markdown-converter/)。**无需安装、无需联网**（字体与公式已本地化）。

1. 粘贴 Markdown，或点「载入文件」打开本地 `.md` 文件
2. 用顶部工具栏编辑（字号、颜色、高亮、对齐等）
3. 点「导出 Word / PDF / Markdown / HTML」
4. 顶部标签可切换到「压缩工具」「图片工具」「PDF 工具」

## 文件说明

| 文件 | 作用 |
|------|------|
| `index.html` | 应用主体（全部逻辑与样式） |
| `marked.min.js` | Markdown → HTML 解析 |
| `turndown.js` / `turndown-plugin-gfm.js` | HTML → Markdown（含表格 / 任务列表） |
| `highlight.min.js` / `github.min.css` | 代码语法高亮 |
| `katex/` | KaTeX 数学公式渲染（JS + CSS + 字体，完整本地化） |
| `fflate.min.js` | ZIP 压缩 / 解压 |
| `jspdf.umd.min.js` | 图片转 PDF |
| `pdf-lib.min.js` | PDF 合并 / 拆分 |

## 说明

- 导出 Word 用的是 `.doc`（HTML 包装），Word 能直接打开并保留格式，但不是原生 `.docx`
- 导出 PDF 依赖浏览器打印（另存为 PDF）
- 公式在 Word 中会降级为原始 TeX 文本（Word 原生不支持 KaTeX 排版）
- 解压只能「查看 + 下载」，不能直接解压成桌面文件夹；带密码的加密 zip 不支持
- PDF 合并 / 拆分不支持加密 PDF
- 历史记录存在浏览器 localStorage，不跨设备同步
- 老式 `.doc` 的文字提取是「提取可读文字」，质量有限；建议用 Word 另存为 `.docx` 后提取更完整
- 界面衬线字体走 Google Fonts，加载失败时自动降级为系统字体（宋体 / 微软雅黑）
