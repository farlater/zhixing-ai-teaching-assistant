# 知行 · AI 教学诊断

一个面向教学展示和日常教学的本地优先 AI 助教。教师电脑运行前端、后端、资料库与 AI 代理；学生手机连接教师热点后，用 APK 扫描课堂二维码，自动取得教师电脑地址、端口和当前检测。API Key 永远不会发送到学生端。

核心闭环：

**课程 / 知识点 / 资料 → AI 出题与教师确认 → 发布检测 → 手机作答 / 拍照 → 判题与诊断 → 班级报告 / 学生画像 → 强化练习 → 教师 AI 助教**

## 当前能力

- 教师端：课程、知识点、PDF/PPTX/DOCX/图片资料、AI 出题、题库接口、检测发布、逐题与班级报告、学生画像、语音 AI 助教。
- 学生端：连接教师热点后扫描课堂二维码，填写班级、姓名进入；支持客观题、文字和拍照作答；返回评分、错误原因、相关公式与强化练习。
- 资料入库：MinerU 官方 API 解析 PDF、Office、扫描件、公式、表格与版面；输出 Markdown、结构化 JSON 和独立图片，再对缺少图意的插图选择性调用百炼视觉。
- AI 问答：按问题检索课程、知识点、题库、课堂、作答和画像文件，减少无关上下文与 Token；回答要求标注来源。
- Markdown：支持 GFM 表格、列表、代码、KaTeX 公式和本地资料插图，并经过安全清洗。
- PWA：课堂二维码也可由手机浏览器直接打开对应检测。

首次启动只预置三节大学《机械原理》课程、知识点和 9 道题，不创建任何虚构学生、作答或统计。客观题可由程序判定；AI 出题、手写识别、主观题诊断和教师问答需要配置百炼 API Key。

## 当前预置内容

- 当前按三节不同课程展示：`平面四杆机构的急回特性`、`定轴轮系的传动比`、`平面机构的组成与结构分析`；此前重复提供的第二份“四杆机构”文件不再作为第三节课；
- 每节课内置 3 道图示题，共 9 题。题图来自江苏大学 803《机械原理》官方样题和内蒙古农业大学公开课程课件，应用内保留来源说明；
- 学生路径：连接热点 → APK 扫描当前课堂二维码 → 填写班级、姓名 → 完成 3 题 → 查看逐题诊断；
- 教师报告只使用实际提交形成统计。没有提交时显示空状态，不生成学生姓名、分数或比例。

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

GitHub Actions 的 `Build Windows installer` 工作流还会生成包含 Node 运行时和生产依赖的 `.exe` 一键安装包及便携版 ZIP。下载 `.exe` 后安装不再需要 Node.js 或 pnpm；便携版解压后双击 `Start-Zhixing.bat` 即可。未签名的测试版可能显示 Windows SmartScreen 提示。

### 学生端 Android APK

`student-android/` 是独立的轻量 Android 客户端。APK 打开后显示“扫码加入课堂”，扫描教师端二维码后自动保存教师电脑 IP、端口与检测 ID，再加载学生页面；扫描或连接失败时才显示手动地址设置。APK 不包含后端、课程数据或 AI Key，因此教师端更新题目和页面后无需重新发布 APK。

APK 支持填写班级姓名、答题、诊断，以及从相册选择或直接拍摄手写答案。教师端始终只有一个活动检测，二维码也会指定该检测。`Build student Android APK` 工作流会生成可直接安装的 APK。当前自动产物使用 Android debug 签名，适合内部使用；正式长期分发前应配置固定 release keystore。

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

## Windows 热点与学生扫码入课

1. 教师端进入“课堂检测”，发布一个检测；新检测发布时会自动结束上一个活动检测。
2. 学生在手机 Wi-Fi 设置中手动连接教师电脑热点。
3. 教师点击“显示二维码”，选择页面检测到的热点网卡地址并保存。Windows 热点常见地址是 `http://192.168.137.1:4173`，但应以页面检测结果为准。
4. 学生打开 APK，点击“扫码加入课堂”并扫描教师端二维码。二维码格式为 `http://教师电脑IP:4173/join?assessment=检测ID`。
5. APK 自动保存地址、端口和课堂，学生只需填写班级、姓名。手机浏览器扫描同一二维码也可直接打开 PWA。

二维码不包含 Wi-Fi 名称或密码，也不负责连接热点。Windows 防火墙弹窗出现时需允许 Node.js 在“专用网络”通信。

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

也可以在教师端右上角点击齿轮图标，直接填写百炼 API Key 和 MinerU Token；密钥不会回显，并且只允许教师电脑本机修改。保存后立即生效。若使用 `.env` 手工修改，则重启服务。

如果百炼控制台给出带业务空间 ID 的专属兼容地址，应把 `BAILIAN_BASE_URL` 替换成控制台地址。

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
