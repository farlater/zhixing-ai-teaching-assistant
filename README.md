# 知行 · AI 教学诊断

一个面向教学展示和日常教学的本地优先 AI 助教。教师电脑运行前端、后端、资料库与 AI 代理；学生手机连接教师热点后打开固定入口，选择课程并填写班级、姓名进入。API Key 永远不会发送到学生端。

核心闭环：

**课程 / 知识点 / 资料 → AI 出题与教师确认 → 发布检测 → 手机作答 / 拍照 → 判题与诊断 → 班级报告 / 学生画像 → 强化练习 → 教师 AI 助教**

## 当前能力

- 教师端：课程、知识点、PDF/PPTX/DOCX/图片资料、AI 出题、题库接口、检测发布、逐题与班级报告、学生画像、语音 AI 助教。
- 学生端：连接教师热点后选择课程，填写班级、姓名进入；支持客观题、文字和拍照作答；返回评分、错误原因、相关公式与强化练习。
- 资料入库：MinerU 官方 API 解析 PDF、Office、扫描件、公式、表格与版面；输出 Markdown、结构化 JSON 和独立图片，再对缺少图意的插图选择性调用百炼视觉。
- AI 问答：按问题检索课程、知识点、题库、课堂、作答和画像文件，减少无关上下文与 Token；回答要求标注来源。
- Markdown：支持 GFM 表格、列表、代码、KaTeX 公式和本地资料插图，并经过安全清洗。
- PWA：学生入口可安装到手机桌面，之后连上教师热点并打开 PWA 即可进入课程选择页。

未配置 AI Key 时，演示出题、启发式主观题评分和数据驱动建议仍可完整运行。首次启动会生成三节机械原理课程和固定 60 人演示数据。

## 当前 GIF 展示内容

- 当前按三节不同课程展示：`平面四杆机构的急回特性`、`定轴轮系的传动比`、`平面机构的组成与结构分析`；此前重复提供的第二份“四杆机构”文件不再作为第三节课；
- 每节课内置 3 道原创图示单选题，共 9 题；配图为项目内 SVG，不依赖网络图片；
- 学生演示路径：进入学生端 → 选择课程 → 填写班级、姓名 → 完成 3 题 → 查看逐题诊断；
- 教师报告预置 60 名虚构学生的确定性作答，可切换三节课查看掌握度、成绩分布、错误类型、逐题统计和建议；
- 实际演示者会占用预留的第 60 个学生位置，因此提交后报告仍显示 60 人。以上数据仅用于界面与 GIF 展示，不代表真实班级成绩。

## 架构

```mermaid
flowchart LR
    S[学生手机 / PWA] -->|教师热点 / 局域网 HTTP| T[教师电脑 Node 服务]
    W[教师浏览器] --> T
    T --> D[(data/db.json)]
    T --> K[data/knowledge Markdown 目录]
    T --> F[uploads 原始文件与插图]
    T --> M[MinerU 精准解析 API]
    T --> B[阿里云百炼兼容网关]
    B --> DS[DeepSeek 文本模型]
    B --> VL[千问视觉模型]
    B --> ASR[千问语音识别]
```

- React + TypeScript + Vite + Recharts；
- Express + TypeScript；
- 单机 JSON 原子写入，适合公开课和小规模使用；
- 百炼服务适配按文本、视觉、语音三个模块保持独立，当前共用一个 Key 与兼容网关。

`data/`、`uploads/`、`.env` 不会提交到 Git。

## 安装与运行

教师电脑使用下面的一键安装时，无需预装 Node.js 或 pnpm。

### Windows 一键安装（教师电脑推荐）

直接双击项目根目录的 `安装知行AI助教.bat`。安装程序会：

1. 下载并校验官方 Node.js LTS 便携运行时，不使用电脑中已有的 Node 环境；
2. 安装依赖并构建生产版本；
3. 安装到 `%LOCALAPPDATA%\Programs\ZhixingAI`；
4. 创建桌面“知行 AI 教学诊断”快捷方式；
5. 请求一次 Windows 管理员授权，为专用网络开放 TCP 4173；
6. 启动服务并打开教师端。

首次使用需要联网下载运行环境和依赖。以后双击桌面图标即可启动，不需要打开命令行。开始菜单同时提供“配置 AI 服务”“停止本地服务”和“卸载”入口。重新安装或升级时会保留原有 `data`、`uploads` 和 `.env`。

GitHub Actions 的 `Build Windows installer` 工作流还会生成包含 Node 运行时和生产依赖的 `.exe` 一键安装包及便携版 ZIP。下载 `.exe` 后安装不再需要 Node.js 或 pnpm；便携版解压后双击“启动知行课堂.bat”即可。未签名的测试版可能显示 Windows SmartScreen 提示。

### 学生端 Android APK

`student-android/` 是独立的轻量 Android 客户端。学生手机连接教师热点后，APK 默认打开 `http://192.168.137.1:4173/join`；如果教师电脑地址不同，可点击顶部“连接设置”修改。APK 只加载教师电脑提供的学生页面，不包含后端、课程数据或 AI Key，因此教师端更新题目和页面后无需重新发布 APK。

APK 支持填写班级姓名、答题、诊断，以及从相册选择或直接拍摄手写答案。教师端当前发布的课堂会直接出现在学生入口；演示数据中若同时保留多个课件课堂，则先选择本节展示内容。`Build student Android APK` 工作流会生成可直接安装的演示 APK。当前自动产物使用 Android debug 签名，适合内部演示和课件录制；正式长期分发前应配置固定 release keystore。

### 开发方式

源码开发要求 Node.js 20+ 和 pnpm 10+。

```bash
pnpm install
pnpm dev
```

- 开发教师端：<http://localhost:5173/teacher>
- 开发学生端：<http://localhost:5173/join>
- API：<http://localhost:4173/api/health>

公开课使用生产模式：

```bash
pnpm build
pnpm start
```

Windows 也可双击 `start.bat`。生产模式教师端为 <http://localhost:4173/teacher>。

## Windows 热点与学生自动入课

1. 教师端进入“课堂检测”，发布一个检测；新检测发布时会自动结束上一个活动检测。
2. 点击“热点入课” → “打开热点设置”，在 Windows 中开启移动热点。
3. 把系统显示的热点名称、密码填回页面，选择学生访问地址并保存。Windows 热点常见地址是 `http://192.168.137.1:4173`，但应以页面检测结果为准。
4. 投屏热点 Wi-Fi 二维码，学生扫码连接。
5. 学生打开已安装的“知行课堂”PWA，或访问页面显示的固定 `/join` 地址。进入后选择课程并填写班级、姓名，不输入课堂码。

手机系统不允许 Wi-Fi 二维码在连网后替网页静默启动浏览器，所以“扫码”负责连热点，“打开 PWA/固定地址”由系统安全策略要求。首次访问建议把学生端添加到桌面。Windows 防火墙弹窗出现时需允许 Node.js 在“专用网络”通信。

## MinerU 与百炼配置

复制模板：

```powershell
Copy-Item .env.example .env
```

在教师电脑 `.env` 中填写：

```env
DASHSCOPE_API_KEY=你的百炼APIKey
BAILIAN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
BAILIAN_TEXT_MODEL=deepseek-v4-flash
BAILIAN_VISION_MODEL=qwen3-vl-flash
BAILIAN_ASR_MODEL=qwen3-asr-flash
MINERU_API_TOKEN=你的MinerU Token
MINERU_API_BASE=https://mineru.net/api/v4
MINERU_MODEL_VERSION=vlm
MINERU_ENABLE_OCR=true
MATERIAL_IMAGE_ENRICHMENT=smart
MATERIAL_VISION_MODE=smart
```

如果百炼控制台给出带业务空间 ID 的专属兼容地址，应把 `BAILIAN_BASE_URL` 替换成控制台地址。修改配置后重启服务。

在 [MinerU API 管理页](https://mineru.net/apiManage/token) 申请 Token 后写入教师电脑 `.env`。Token 只在 Node 后端使用，不会下发给学生。当前使用精准解析 API 的 `vlm` 模型：本地文件先申请签名上传地址，上传后后台轮询，完成时下载结果 ZIP。单文件按官方限制为 200 MB、600 页；教师页面会自动刷新解析状态。

MinerU 负责扫描页 OCR、阅读顺序、公式 LaTeX、表格结构和图片裁切。结果包中的 `full.md` 会写入课程知识目录，原始 Markdown、`content_list.json`、`middle/model` 等 JSON 保存在 `data/mineru/<material-id>/`，图片保存在 `uploads/materials/<material-id>/`。系统检查内容列表后，只把没有语义 `content` 的插图/图表交给百炼视觉补充，不重复识别扫描正文、公式或表格。`MATERIAL_IMAGE_ENRICHMENT=smart` 为默认策略，`off` 完全关闭补充识别，`full` 识别全部提取图片；均不设单份图片数量上限。

未配置 MinerU Token 时，TXT/Markdown/CSV/JSON 始终可本地直接读取，PDF/PPTX/DOCX/图片仍保留轻量兼容解析；此时 `MATERIAL_VISION_MODE` 控制兼容路径的百炼视觉策略。正式课堂资料建议配置 MinerU，以免复杂版式退化。

截至 2026-08-11，本项目按百炼 OpenAI 兼容接口接入：

- DeepSeek 负责出题、主观题评分、诊断、画像和教师问答。模型可按额度和延迟在 `deepseek-v4-flash` / `deepseek-v4-pro` 间切换，参见[百炼 DeepSeek API](https://help.aliyun.com/en/model-studio/deepseek-api)。
- `qwen3-vl-flash` 负责学生手写答案，以及 MinerU 未提供图意文本的课程插图补充；需要更高精度时可改为可用的 Plus 视觉模型，参见[百炼视觉理解](https://help.aliyun.com/zh/model-studio/vision/)。
- `qwen3-asr-flash` 负责教师中文语音转文字，前端上传 16 kHz 单声道 WAV，参见[Qwen ASR API](https://help.aliyun.com/en/model-studio/qwen-asr-api-reference)。

注册流程：登录[阿里云百炼控制台](https://bailian.console.aliyun.com/)，开通模型服务并创建 API Key；确认所选地域、业务空间和模型额度；把 Key 与对应兼容地址写入 `.env`。不要把真实 Key 放入源码或 Git。

## 课程资料与知识目录

上传资料后会生成：

```text
data/knowledge/<course-id>/
├── 00-course.md
├── 01-knowledge-points/
├── 02-materials/
├── 03-question-bank/
├── 04-classrooms/<assessment-id>/
│   ├── overview.md
│   ├── report.md
│   └── submissions/<student-id>.md
├── 05-students/
└── manifest.json
```

教师助教先检索 `manifest.json`，只读取与问题最相关的少量文件。全局约束在 `prompts/teacher-assistant.md`，资料处理规范在 `skills/course-material-ingestion/`。

当前已直接接入 [MinerU 精准解析 API](https://mineru.net/doc/docs/)，不是自行仿写 MinerU。系统消费其 Markdown、内容列表/中间结构 JSON 和图片资源，并把可检索正文同步进现有目录；详细字段以 [MinerU 输出文件说明](https://opendatalab.github.io/MinerU/reference/output_files/) 为准。Docling 不再进入默认运行链路。

## Markdown 与安全

页面使用 `react-markdown`、GFM、`remark-math` 和 KaTeX。原始 HTML 不执行，并通过 `rehype-sanitize` 清洗；资料图片只从安全 URL 渲染。模型提示要求公式使用 `$...$` 或 `$$...$$`，文件图片引用已有 `/uploads/...` 地址。

## 题库接口

`server/questionBank.ts` 提供 `QuestionBankProvider`。页面已保留“仅题库”和“混合模式”；接入校本题库时替换当前空实现即可。

## 测试

```bash
pnpm check
pnpm test
pnpm build
```

正式多人长期使用前建议把 JSON 迁移到 SQLite/PostgreSQL，并加入教师登录、备份、限流和学生身份合并。

## GitHub

源码托管于 <https://github.com/farlater/zhixing-ai-teaching-assistant>。课堂服务仍运行在教师电脑，GitHub Pages 不能代替本地后端。
