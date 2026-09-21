# 将文档放入私人 GitHub 仓库

## 当前状态

计划账号：`thinkingjimmy`。计划仓库名：`goalloom`。要求：Private。

本次已尝试通过 GitHub 连接器读取 `thinkingjimmy/goalloom`，返回 404；这可能表示仓库不存在，也可能表示当前连接无访问权限，不能据此断言远端不存在。当前会话暴露的 GitHub 操作均为读取，未提供创建仓库或提交文件入口；容器也没有已配置的 GitHub CLI 登录。**本资料包尚未提交到 GitHub，没有远端提交 SHA。**

如用户已自行创建同名仓库，先读取现有仓库的可见性与内容，再采用已有仓库工作流；不要据此文档推断远端不存在。

**更正此前说明：当前会话不能通过 GitHub 连接器直接向已有仓库写入文件。** 仅创建空私人仓库并不能解决当前会话缺少写入操作的问题。请在你自己的已登录 GitHub 环境执行以下脚本；不要把 token、密码或 SSH 私钥发到聊天中。

## 推荐：在 Mac 本地运行附带脚本

前提：已经安装 Git 和 GitHub CLI，且 `gh` 登录的是 `thinkingjimmy`，具备创建私人仓库权限。

解压文件包，进入包含此文档的 `goalloom` 目录，然后运行：

```bash
gh auth status
# 若未登录，先运行 gh auth login，并按提示登录自己的 GitHub 账号。
bash scripts/publish-private-repo.sh
```

脚本会校验账号、拒绝复用同名远端仓库、拒绝在其他 Git 工作树中运行，仅暂存本资料包列明的文档与截图；先创建 Private 仓库并读回可见性，确认后再推送。它不购买域名、不创建公开仓库、不覆盖现有远端，也不删除任何仓库。

脚本如果遇到已存在仓库或部分成功会停止，保留本地文件，按错误说明处理后再继续；不自动 force push 或删除重建。

## 手动方式，适用于 macOS / Windows 终端

在**全新解压、确认不属于其他 Git 仓库**的 `goalloom` 目录里逐行执行；Git 与 GitHub CLI 需提前安装并登录。不要复制到已有产品的仓库根目录运行。

```bash
gh api user --jq .login
# 必须核对输出是 thinkingjimmy。

git init -b main
git add -- README.md AGENTS.md CREATE_REPO.md docs scripts .gitignore .gitattributes
git commit -m "docs: add Goalloom v0.3 product requirements and development plan"

gh repo create thinkingjimmy/goalloom --private --source=. --remote=origin --description "A goal-linked personal todo board across five time horizons."
gh repo view thinkingjimmy/goalloom --json visibility --jq .visibility
# 必须确认输出 PRIVATE，再执行下一行。
git push -u origin main
```

命令参数依据 [GitHub CLI 官方文档](https://cli.github.com/manual/gh_repo_create)。上述命令需在用户本地执行，本资料包没有声称这些远端操作已经发生。

提交失败若提示缺少 Git 用户名 / 邮箱，请用自己的提交身份配置；不要复制他人的身份或把私人凭据写入文档。

## 创建后验证

```bash
gh repo view thinkingjimmy/goalloom --json nameWithOwner,visibility,url
git ls-remote origin refs/heads/main
```

在 GitHub 打开 README，检查 PRD、TODO、技术文档和参考图能否访问。若账号只授权了部分仓库，需在 GitHub App 设置中把新仓库加入可访问范围，之后可让当前连接器读取它；能否修改仍取决于该会话实际是否提供写入操作。

产品名已确定为 Goalloom。今后如再更名，展示名和仓库名可以单独评估；正式发布客户端后的应用标识与数据目录不要直接全局替换，详见 [命名边界](docs/NAMING.md)。
