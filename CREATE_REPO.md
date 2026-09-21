# 私人 GitHub 仓库维护与首次创建说明

## 当前状态

`thinkingjimmy/goalloom` 已创建，读回可见性为 **Private**；初始文档提交 `06e70d5` 已验证。下面的创建命令仅作为首次上传历史操作说明，不是当前待执行任务。**维护现有仓库时不要重新执行创建脚本，不要删除重建或force push。**

后续更新从现有远端最新分支开始，核对差异后创建新提交；写入前再次检查分支是否变化，保护规则要求PR时走PR流程。不要将旧文档包整体覆盖到已有应用代码上。连接器能否写入，以当前会话实际动作与权限为准，不能沿用历史会话的只读结论。

不要把token、密码、SSH私钥或付费图标许可密钥发到聊天中或写入仓库。

## 首次创建历史说明：在 Mac 本地运行附带脚本

前提：已经安装 Git 和 GitHub CLI，且 `gh` 登录的是 `thinkingjimmy`，具备创建私人仓库权限。

解压文件包，进入包含此文档的 `goalloom` 目录，然后运行：

```bash
gh auth status
# 若未登录，先运行 gh auth login，并按提示登录自己的 GitHub 账号。
bash scripts/publish-private-repo.sh
```

脚本会校验账号、拒绝复用同名远端仓库、拒绝在其他 Git 工作树中运行，仅暂存本资料包列明的文档与截图；先创建 Private 仓库并读回可见性，确认后再推送。它不购买域名、不创建公开仓库、不覆盖现有远端，也不删除任何仓库。

脚本如果遇到已存在仓库或部分成功会停止，保留本地文件，按错误说明处理后再继续；不自动 force push 或删除重建。

## 首次创建历史说明：手动方式

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

命令参数依据 [GitHub CLI 官方文档](https://cli.github.com/manual/gh_repo_create)。上述首次创建命令不应在现有仓库重复执行；远端当前状态以上文读回结果为准。

提交失败若提示缺少 Git 用户名 / 邮箱，请用自己的提交身份配置；不要复制他人的身份或把私人凭据写入文档。

## 创建后验证

```bash
gh repo view thinkingjimmy/goalloom --json nameWithOwner,visibility,url
git ls-remote origin refs/heads/main
```

在 GitHub 打开 README，检查 PRD、TODO、技术文档和参考图能否访问。若账号只授权了部分仓库，需在 GitHub App 设置中把新仓库加入可访问范围，之后可让当前连接器读取它；能否修改仍取决于该会话实际是否提供写入操作。

产品名已确定为 Goalloom。今后如再更名，展示名和仓库名可以单独评估；正式发布客户端后的应用标识与数据目录不要直接全局替换，详见 [命名边界](docs/NAMING.md)。
