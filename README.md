# Folio

一个**本地多功能工具箱**：所见即所得 Markdown 编辑器（导出 Word / PDF / Markdown / HTML）+ 压缩解压 + 图片工具 + PDF 工具。纯前端、离线可用、无需安装、图片/文件不上传。

## 功能

**知识库 & 单词库**

- 🗂 知识库：长期保存重要文档，支持分类、搜索，一键存入 / 打开
- 🌐 划词翻译：编辑器里选中英文自动弹出翻译，支持整句；引擎可配（默认免费 MyMemory，可选 DeepL / LLM API）
- 📚 单词库：划词一键存入，带释义和上下文，支持列表搜索与复习卡片（认识 / 不认识）
- ⚙ 翻译设置：可填 DeepL / LLM 的 API key 提升专业词汇质量（key 存本地，不上传）
- 🧠 思维导图：由当前文档的标题层级自动生成交互式思维导图（markmap），知识库文档可一键生成

**Markdown 编辑器**

- ✍️ 所见即所得编辑：粘贴 Markdown 自动转富文本，像 Word 一样直接编辑
- 🧭 导航窗格：左侧显示文档标题大纲（H1~H6），长文档点击快速跳转
- 🎨 富文本工具栏：字体、字号、颜色、背景高亮、对齐、列表、引用、代码块、缩进
- 🖍 语法高亮：代码块自动识别语言并着色（highlight.js）
- ∑ LaTeX 公式：行内 `$...$` 与独立 `$$...$$`（KaTeX，已本地化）
- 🔀 双向转换：可在「富文本」和「Markdown 源码」间切换，颜色/字号以内联 HTML 保留
- 📄 导出 Word / PDF / Markdown / HTML
- 💬 批注：选中文字添加高亮批注，可定位/删除，导出 Word 时附文末批注列表
- 🧹 清理表情：一键删除文档里的 emoji 表情与装饰图标（先预览再确认）
- 🕘 历史记录 + 草稿自动保存 + **版本快照**（自动保存最近 30 个版本，可恢复），支持**导出 / 导入备份**（含历史、草稿、知识库），拖拽打开 `.md` 文件，或「载入文本」直接粘贴 Markdown 替换当前内容

**实用工具**

- 📦 打包压缩包：ZIP / TAR / TAR.GZ / GZ（单文件）
- 📂 解压压缩包：支持 ZIP / TAR / TAR.GZ / GZ / 7Z / RAR（7Z、RAR 用 7-Zip WASM，懒加载），查看内容并下载文件
- 🖼 图片转 PDF：拖入一张或多张图片，合成多页 PDF
- 🗜 图片压缩：拖入图片压缩体积（质量可调，WebP / JPEG）
- ✂ 去除背景：白底抠字（纯白 / 智能去白，彩色艺术字也能抠），实时预览，下载透明 PNG
- 🔗 PDF 合并：多个 PDF 合成一个
- ✂️ PDF 拆分：提取指定页（如 `1,3,5-7`）
- 🔤 乱码修复：修复 GBK / UTF-8 等编码导致的乱码
- 📄 Word 文字提取：从 `.docx` / `.doc` 提取文字（损坏文档也能抢救）

## 使用方法

直接双击打开 `index.html`，或访问在线版：[juiceonomics.github.io/markdown-converter](https://juiceonomics.github.io/markdown-converter/)。**无需安装、无需联网**（字体与公式已本地化）。

1. 粘贴 Markdown，或点「载入文件」打开本地 `.md` 文件
2. 用顶部工具栏编辑（字号、颜色、高亮、对齐等）
3. 点「导出 Word / PDF / Markdown / HTML」
4. 顶部标签可切换到「压缩工具」「图片工具」「PDF 工具」「文档修复」「知识库」「单词库」「思维导图」

## 文件说明

| 文件 | 作用 |
|------|------|
| `index.html` | 应用主体（全部逻辑与样式） |
| `marked.min.js` | Markdown → HTML 解析 |
| `turndown.js` / `turndown-plugin-gfm.js` | HTML → Markdown（含表格 / 任务列表） |
| `highlight.min.js` / `github.min.css` | 代码语法高亮 |
| `katex/` | KaTeX 数学公式渲染（JS + CSS + 字体，完整本地化） |
| `fflate.min.js` | ZIP / GZ / TAR 压缩 / 解压 |
| `sevenzip-wasm.js` / `.wasm` | 7z / RAR 解压（懒加载） |
| `jspdf.umd.min.js` | 图片转 PDF（懒加载） |
| `pdf-lib.min.js` | PDF 合并 / 拆分（懒加载） |
| `purify.min.js` | Markdown 渲染 XSS 消毒（DOMPurify） |
| `d3.min.js` / `markmap-lib.min.js` / `markmap-view.min.js` | 思维导图渲染（懒加载） |

## 说明

- 导出 Word 用的是 `.doc`（HTML 包装），Word 能直接打开并保留格式，但不是原生 `.docx`
- 导出 PDF 依赖浏览器打印（另存为 PDF）
- 公式在 Word 中会降级为原始 TeX 文本（Word 原生不支持 KaTeX 排版）
- 解压只能「查看 + 下载」，不能直接解压成桌面文件夹；带密码的加密压缩包不支持；RAR 只能解压不能打包（RAR 压缩算法为专有格式）
- PDF 合并 / 拆分不支持加密 PDF
- 历史记录、草稿、知识库、单词库存在浏览器 localStorage，不跨设备同步；可用「历史 → 导出备份 / 导入备份」手动迁移
- 划词翻译默认用 MyMemory 免费接口（匿名每日约 5000 字符）；要更好质量可在「⚙ 翻译」里填 DeepL 或 LLM（OpenAI 兼容，如 DeepSeek）的 API key
- 老式 `.doc` 的文字提取是「提取可读文字」，质量有限；建议用 Word 另存为 `.docx` 后提取更完整
- 大库（jsPDF / pdf-lib / 7-Zip WASM）按需懒加载，首屏更快
- 界面衬线字体走 Google Fonts，加载失败时自动降级为系统字体（宋体 / 微软雅黑）
