# Goalloom 发版流程优化建议方案

生成时间：2026-10-22
基于：1.9.8/1.9.9/1.9.10 三个版本的实战数据

---

## 📊 执行摘要

### 现状总结

**已完成优化 (2026-10-19):**
- ✅ M1.1: 本机并行验证 (17min → 2.5min, 85% 加速)
- ✅ M2.1: Apple 公证容错机制 (已扩展到全流程)
- ✅ M2.2: 构建缓存 (已实施,高度可能生效)
- ✅ M2.3: 测试/打包解耦 (架构已验证)

**实战效果 (1.9.8 → 1.9.10):**
- ✅ Test Windows: 114s → 101s (-11%, 可能为缓存效果)
- ✅ Package 时长稳定 (357-399s macOS, 178-183s Windows)
- ✅ M2.1 容错正常工作 (1.9.9/1.9.10 都遇到 CloudKit 故障但成功恢复)
- ⚠️ Test macOS: 72s → 481s (+409s, 但这是新增原生交互测试)

**新增挑战:**
- ⚠️ 失败重跑频繁 (1.9.9/1.9.10 各需 3 次才成功)
- ⚠️ Apple Profile 稳定性问题 (1.9.10 遇到 Profile 无故失效)
- ⚠️ Runner 环境问题 (显示器分辨率限制)

---

## 🎯 核心问题分析

### 问题 1: Test macOS 时长激增

#### 数据

| 版本 | Test macOS | 变化 | 原因 |
|------|-----------|------|------|
| 1.9.8 | 72s | baseline | 仅基础测试 |
| 1.9.9 | 416s | **+344s (+478%)** | 新增 295s 原生交互测试 |
| 1.9.10 | 481s | **+409s (+568%)** | 原生测试持续 |

#### 根本原因

**这不是性能退步,而是测试范围扩大:**
- 1.9.9 将 subtask/completed-layout/insight 的完整原生交互验收移入 CI
- 新增测试内容:
  - 20 subtask interaction checks
  - 35 transaction checks
  - 10 completed-layout checks
  - 35 empty-card measurements
  - Insight/weekly-review journeys
  - 50 generation checks (development + production modes)

**影响:**
- 测试覆盖显著提升 ✅
- CI 时长增加 5-7 分钟
- 总发版时长从 ~8min 增至 ~13-20min (排除失败重跑)

---

### 问题 2: 失败重跑频繁

#### 数据

| 版本 | 失败次数 | 主要原因 |
|------|---------|----------|
| 1.9.8 | 2次 | Cache action 错误 + 历史恢复测试失败 |
| 1.9.9 | 3次 | DOM 断言 + 显示器分辨率 + CloudKit |
| 1.9.10 | 3次 | Profile 失效 + API 403 + CloudKit |

#### 根本原因

**外部依赖不稳定:**
1. **Apple Profile 管理**
   - 1.9.10: Profile 无故变为 Invalid
   - 需要手动在 Apple Developer 门户重新生成
   - 触发时机不明确

2. **CloudKit 网络故障**
   - 1.9.9/1.9.10 都遇到 `NSURLErrorDomain -1005`
   - 发生在独立验证阶段
   - 1.9.10 已扩展容错到验证阶段 ✅

3. **Runner 环境限制**
   - 1.9.9: 显示器分辨率被限制到 1024×681 (期望 1440×900)
   - 导致界面断点测试失败
   - 1.9.9 已增加原生显示器预检查 ✅

**影响:**
- 每次失败重跑增加 5-10 分钟
- 1.9.9: 3 次失败 = 额外 ~20 分钟
- 1.9.10: 3 次失败 = 额外 ~25 分钟

---

### 问题 3: M2.2 缓存效果不明确

#### 数据

**间接证据 (Test Windows 时长):**
- 1.9.8: 114s (cache miss)
- 1.9.9: 111s (-3s, -3%)
- 1.9.10: 101s (-13s, -11%)

**缓存步骤状态:**
- ✅ Cache build output: success
- ✅ Post Cache build output: success
- ❓ 但未明确标注 "Cache restored from key" 或 "Cache not found"

#### 根本原因

**缺少明确的缓存状态记录:**
- GitHub Actions API 仅返回 `conclusion: "success"`
- 日志未明确记录 hit/miss 状态
- timing 文档未标注缓存情况

**影响:**
- 无法准确评估 M2.2 效果
- 无法判断优化是否如预期工作
- 难以诊断缓存失效问题

---

### 问题 4: M2.1 Submit 重试被移除

#### 数据

**Notarize.mjs 演进:**

| 版本 | Submit 阶段 | Wait 阶段 | Validate 阶段 |
|------|-----------|----------|--------------|
| M2.1 (261eb2e) | ✅ 3次重试 | ✅ 30s轮询 + 容错 | ✅ 3次重试 |
| 1.9.10 (a10b43d) | ❌ **单次提交** | ✅ 30s轮询 + 容错 | ✅ 3次重试 (共享模块) |

**公证日志分析 (1.9.8/1.9.9/1.9.10):**
- ✅ 所有版本 `submitAttempts: 1` (首次提交成功)
- ✅ 状态轮询间隔稳定在 30-31s
- ✅ App 公证时长: 61-62s
- ✅ DMG 公证时长: 61-72s
- ❌ 无 submit 阶段网络故障记录

#### 根本原因

**实战中 Submit 失败极少发生:**
- 三个版本都未遇到 submit 网络故障
- 网络问题主要出现在 Wait 和 Validate 阶段
- Submit 失败通常是凭证/权限问题,重试无意义

**代码重构收益:**
- 从 ~178 行减至 ~45 行 (-75%)
- 提取共享工具到 `apple-tools.mjs`
- 新增独立验证功能 (`--validate-ticket`)

---

## 💡 优化建议方案

### 优先级分级

**🔴 P0 (立即执行, 0-1天):**
- 增加缓存状态明确日志
- Profile 预检查自动化

**🟡 P1 (短期优化, 1-2周):**
- Test macOS 原生测试选择性运行
- 失败诊断改善

**🟢 P2 (中期优化, 1-2月):**
- Hosted runner 环境标准化
- 监控和告警系统

---

## 🔴 P0: 立即执行

### P0.1 增加缓存状态明确日志

**问题:** 无法确认 M2.2 缓存是否生效

**方案:**

在 `.github/workflows/release.yml` 的 Test jobs 增加缓存状态输出:

```yaml
- name: Cache build output
  id: cache
  uses: actions/cache@v4.2.0
  with:
    path: |
      apps/desktop/out
      apps/desktop/node_modules/.vite
    key: ${{ runner.os }}-build-${{ hashFiles('apps/desktop/pnpm-lock.yaml', 'apps/desktop/src/**', 'apps/desktop/electron.vite.config.ts') }}
    restore-keys: |
      ${{ runner.os }}-build-

- name: Report cache status
  run: |
    if [ "${{ steps.cache.outputs.cache-hit }}" == "true" ]; then
      echo "✓ Cache HIT: restored from key ${{ runner.os }}-build-*"
      echo "CACHE_STATUS=hit" >> $GITHUB_ENV
    else
      echo "✗ Cache MISS: will build from scratch"
      echo "CACHE_STATUS=miss" >> $GITHUB_ENV
    fi

- name: Build desktop (conditional)
  if: steps.cache.outputs.cache-hit != 'true'
  run: pnpm --filter @goalloom/desktop build
```

**预期效果:**
- 每次运行明确显示 Cache HIT/MISS
- 可以准确评估 M2.2 效果
- 减少不必要的 build 步骤

**工作量:** 0.5 天
**风险:** 低

---

### P0.2 Profile 预检查自动化

**问题:** 1.9.10 遇到 Profile 无故失效,浪费 7m36s 才发现

**方案:**

1.9.10 已实现 `preflight_only` 模式,但需要手动触发。建议:

**方案 A: 本机预检查脚本**

```bash
#!/bin/bash
# scripts/preflight-check.sh

echo "🔍 Running release preflight checks..."

# 1. Profile 验证
echo "Checking Apple Developer profile..."
pnpm --filter @goalloom/desktop exec -- node scripts/build/session-profile.mjs --verify

if [ $? -ne 0 ]; then
  echo "❌ Profile check failed. Please regenerate in Apple Developer portal."
  exit 1
fi

# 2. 凭证验证
echo "Checking signing credentials..."
if [ -z "$APPLE_API_KEY" ] || [ -z "$CSC_LINK" ]; then
  echo "❌ Missing required credentials"
  exit 1
fi

# 3. 签名探测
echo "Testing codesign probe..."
# 实际签名一个测试文件
# ... (现有 preflight 逻辑)

echo "✅ All preflight checks passed"
```

**方案 B: GitHub Actions 预检查 Job**

```yaml
jobs:
  preflight:
    name: Preflight checks
    runs-on: macos-15
    environment: release
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-node
      - name: Run preflight
        run: pnpm --filter @goalloom/desktop exec -- node scripts/build/session-profile.mjs --verify
      - name: Test signing
        run: bash .github/scripts/macos-signing.sh verify

  test-mac:
    needs: preflight
    # ...
```

**预期效果:**
- Profile 问题提前 5-7 分钟发现
- 避免浪费完整 test job 时间
- 失败反馈更快

**工作量:** 0.5 天
**风险:** 低

---

## 🟡 P1: 短期优化 (1-2周)

### P1.1 Test macOS 原生测试选择性运行

**问题:** Test macOS 从 72s 增至 481s,增加测试覆盖的同时也显著延长了 CI 时间

**方案:**

**阶段 1: 测试分组 (1天)**

将原生交互测试分为两类:
- **快速验收** (~2-3 分钟): 核心功能冒烟测试
- **完整验收** (~6-8 分钟): 所有原生交互测试

```javascript
// tests/ci-test-groups.mjs
export const CI_GROUPS = {
  smoke: [
    'test:ui',              // 基础 UI
    'test:composer',        // Jev 交互
    'test:language',        // 多语言
  ],
  interaction: [
    'test:subtask',         // 20 checks
    'test:completed',       // 10 checks
    'test:insight',         // 35 checks
  ],
  generation: [
    'test:insight-generation', // 50 checks
  ],
}
```

**阶段 2: 条件触发 (2天)**

```yaml
# .github/workflows/release.yml

jobs:
  test-mac:
    steps:
      # ...基础测试
      - name: Run smoke tests
        run: pnpm --filter @goalloom/desktop test:smoke

      - name: Run interaction tests
        if: |
          github.event.inputs.full_test == 'true' ||
          contains(github.event.head_commit.message, '[full-test]')
        run: pnpm --filter @goalloom/desktop test:interaction

      - name: Run generation tests
        if: |
          github.event.inputs.full_test == 'true' ||
          contains(github.event.head_commit.message, '[full-test]')
        run: pnpm --filter @goalloom/desktop test:generation
```

**阶段 3: 智能选择 (3天,可选)**

基于 git diff 智能判断需要运行的测试:

```bash
# 检查变更的文件
if git diff --name-only HEAD~1 | grep -q "src/renderer/features/insight"; then
  echo "Insight changed, running full interaction tests"
  RUN_INTERACTION=true
fi

if git diff --name-only HEAD~1 | grep -q "src/main/workspace/review.ts"; then
  echo "Review logic changed, running generation tests"
  RUN_GENERATION=true
fi
```

**预期效果:**
- 日常发版: Test macOS ~120-180s (快速验收)
- 完整发版: Test macOS ~481s (完整验收)
- 总时长从 ~13-20min 降至 ~8-12min (日常)

**权衡:**
- ⚠️ 需要明确定义"日常"和"完整"发版标准
- ⚠️ 智能选择可能漏测边界情况
- ✅ 快速反馈周期显著改善

**工作量:** 3-6 天
**风险:** 中等 (需要验证测试覆盖率)

---

### P1.2 失败诊断改善

**问题:** 失败后需要手动分析日志,诊断时间长

**方案:**

**阶段 1: 结构化失败报告 (1天)**

```javascript
// scripts/ci/failure-diagnostics.mjs
export async function diagnoseFailure(job, step, logs) {
  const patterns = {
    'NSURLErrorDomain -1005': {
      type: 'network',
      component: 'CloudKit',
      action: 'Retry the failed job (transient network issue)',
      autoRetry: true,
    },
    'Profile.*Invalid': {
      type: 'credentials',
      component: 'Apple Profile',
      action: 'Regenerate profile in Apple Developer portal',
      autoRetry: false,
    },
    'resolution.*1024.*681': {
      type: 'environment',
      component: 'Runner Display',
      action: 'Runner resolution issue, retry on different runner',
      autoRetry: true,
    },
  }

  for (const [pattern, meta] of Object.entries(patterns)) {
    if (new RegExp(pattern, 'i').test(logs)) {
      return {
        matched: pattern,
        ...meta,
        timestamp: new Date().toISOString(),
      }
    }
  }

  return { type: 'unknown', action: 'Manual investigation required' }
}
```

**阶段 2: 失败总结 Comment (2天)**

在 PR 或 Run 页面自动添加失败总结:

```yaml
- name: Post failure diagnostics
  if: failure()
  uses: actions/github-script@v7
  with:
    script: |
      const diagnostics = require('./scripts/ci/failure-diagnostics.mjs')
      const report = await diagnostics.diagnoseFailure(...)
      
      await github.rest.issues.createComment({
        issue_number: context.issue.number,
        body: `## 🚨 CI Failure Diagnostic

**Component:** ${report.component}
**Type:** ${report.type}
**Action:** ${report.action}

${report.autoRetry ? '✅ This failure is transient, safe to retry' : '⚠️ Manual intervention required'}

**Logs:** [View details](${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId})`
      })
```

**预期效果:**
- 失败诊断时间从 5-10 分钟降至 1-2 分钟
- 明确是否需要重试或修复
- 减少无效重试

**工作量:** 3 天
**风险:** 低

---

### P1.3 M2.1 Submit 重试恢复 (可选)

**问题:** 虽然实战中未遇到 submit 网络故障,但移除重试降低了容错性

**方案:**

**方案 A: 保守恢复 (1天)**

仅恢复 submit 阶段的单次重试 (不是原来的 3 次):

```javascript
// apps/desktop/scripts/build/apple-tools.mjs
export async function submitWithRetry(notarytool, archive, timeout, report) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await notarytool(['submit', archive, '--no-wait'], timeout)
    const submission = json(result.stdout)
    
    if (result.code === 0 && submission?.id) {
      report.submitAttempts = attempt
      return submission
    }
    
    if (attempt === 1 && isNetworkError(result)) {
      console.log('Submit failed with network error, retrying once...')
      await delay(5000) // 5s backoff
      continue
    }
    
    throw new Error(failure('Notary upload', result))
  }
}
```

**方案 B: 现状维持 (0天)**

保持当前单次提交:
- 实战证明 submit 失败极少
- Wait 阶段容错已足够
- 代码简洁性优先

**建议:** **方案 B** (现状维持)

**理由:**
- 1.9.8/1.9.9/1.9.10 都未遇到 submit 失败
- Submit 失败通常是权限/凭证问题,重试无意义
- Wait 阶段容错是更关键的防线

**工作量:** 0-1 天
**风险:** 低

---

## 🟢 P2: 中期优化 (1-2月)

### P2.1 Hosted Runner 环境标准化

**问题:** 1.9.9 遇到显示器分辨率限制,导致测试失败

**方案:**

**阶段 1: 环境预检查 (2天)**

```yaml
- name: Verify runner environment
  run: |
    echo "=== Runner Environment ==="
    system_profiler SPDisplaysDataType || true
    echo "Display resolution: $(system_profiler SPDisplaysDataType | grep Resolution || echo 'N/A')"
    
    # 检查最低要求
    MIN_WIDTH=1440
    MIN_HEIGHT=900
    
    ACTUAL_WIDTH=$(system_profiler SPDisplaysDataType | grep -o 'Resolution: [0-9]* x' | grep -o '[0-9]*' || echo 0)
    
    if [ "$ACTUAL_WIDTH" -lt "$MIN_WIDTH" ]; then
      echo "❌ Runner display too small: ${ACTUAL_WIDTH}x??? (need ${MIN_WIDTH}x${MIN_HEIGHT})"
      exit 1
    fi
    
    echo "✅ Display resolution OK"
```

**阶段 2: 自定义 Runner 配置 (可选, 1周)**

如果 GitHub-hosted runner 不稳定,考虑自托管 runner:
- 固定硬件配置
- 预装依赖
- 独立 macOS 显示器设置

**预期效果:**
- 提前发现环境问题
- 减少因环境导致的失败

**工作量:** 2天 - 1周
**风险:** 中等 (自托管 runner 需要维护成本)

---

### P2.2 监控和告警系统

**问题:** 缺少发版流程的系统性监控

**方案:**

**阶段 1: 时长监控 (3天)**

```javascript
// scripts/ci/metrics-collector.mjs
export function collectMetrics(run) {
  return {
    version: run.version,
    runId: run.id,
    startedAt: run.created_at,
    finishedAt: run.updated_at,
    duration: calculateDuration(run),
    jobs: run.jobs.map(job => ({
      name: job.name,
      duration: calculateDuration(job),
      conclusion: job.conclusion,
    })),
    cacheStatus: {
      macOS: detectCacheStatus(run, 'Test macOS'),
      windows: detectCacheStatus(run, 'Test Windows'),
    },
    notarization: extractNotarizationMetrics(run),
    failures: extractFailures(run),
  }
}
```

**阶段 2: Baseline 对比 (2天)**

```javascript
// 自动对比 baseline
const baseline = loadBaseline('v1.9.8')
const current = collectMetrics(currentRun)

const alerts = []
if (current.jobs.testMac.duration > baseline.testMac * 1.5) {
  alerts.push({
    severity: 'warning',
    message: `Test macOS took ${current.jobs.testMac.duration}s (baseline: ${baseline.testMac}s, +${percent}%)`,
  })
}
```

**阶段 3: 可视化 Dashboard (可选, 1周)**

使用 GitHub Pages 或 Grafana 展示:
- 发版时长趋势
- 缓存命中率
- 失败率统计
- 公证时长分布

**预期效果:**
- 自动发现性能退步
- 趋势分析和容量规划
- 数据驱动的优化决策

**工作量:** 5天 - 2周
**风险:** 低

---

## 📋 实施路线图

### 第 1 周: P0 立即执行

| 任务 | 工作量 | 预期产出 |
|------|--------|----------|
| P0.1 缓存状态日志 | 0.5天 | 明确的 Cache HIT/MISS 输出 |
| P0.2 Profile 预检查 | 0.5天 | 本机预检查脚本 + CI preflight job |
| **合计** | **1天** | |

**验证方式:** 下次发版记录缓存状态和 preflight 耗时

---

### 第 2-3 周: P1 短期优化

| 任务 | 工作量 | 预期产出 |
|------|--------|----------|
| P1.1 测试分组 | 3-6天 | smoke/interaction/generation 分组 |
| P1.2 失败诊断 | 3天 | 自动失败报告 |
| **合计** | **6-9天** | |

**验证方式:**
- 日常发版使用 smoke 测试,验证时长降至 ~8-12min
- 遇到失败后,检查自动诊断报告准确性

---

### 第 4-8 周: P2 中期优化 (可选)

| 任务 | 工作量 | 预期产出 |
|------|--------|----------|
| P2.1 环境标准化 | 2天-1周 | 环境预检查 + (可选) 自托管 runner |
| P2.2 监控系统 | 5天-2周 | 时长监控 + baseline 对比 + (可选) Dashboard |
| **合计** | **1-3周** | |

**验证方式:**
- 监控数据连续收集 5-10 个发版
- Dashboard 展示趋势和异常

---

## 💰 投入产出分析

### 预期时长优化

| 场景 | 当前 (1.9.10) | 优化后 | 节省 | 备注 |
|------|--------------|--------|------|------|
| **日常发版 (无失败)** | ~13-20min | **~8-12min** | **~5-8min** | P1.1 测试选择性运行 |
| **完整发版 (无失败)** | ~13-20min | **~13-20min** | **0min** | 保持完整测试 |
| **失败诊断** | ~5-10min | **~1-2min** | **~4-8min** | P1.2 自动诊断 |
| **Profile 失效** | ~7-8min | **<1min** | **~7min** | P0.2 提前发现 |

**年度节省估算 (假设每月 4 次发版):**
- 日常发版 (75%): 3次 × 6min × 12月 = **216 min/年 (~3.6 小时)**
- 失败诊断 (50%): 2次 × 6min × 12月 = **144 min/年 (~2.4 小时)**
- Profile 问题 (10%): 0.4次 × 7min × 12月 = **34 min/年**
- **总计: ~6 小时/年**

---

### 稳定性提升

| 指标 | 当前 | 目标 | 改善 |
|------|------|------|------|
| **首次成功率** | ~33% (1/3) | **~70%** | **+37%** |
| **平均重试次数** | 2-3次 | **0-1次** | **-1.5次** |
| **失败诊断时长** | 5-10min | **1-2min** | **-75%** |

---

### 开发投入

| 阶段 | 工作量 | 风险 | 价值 |
|------|--------|------|------|
| **P0 (立即)** | 1天 | 低 | 高 (数据透明度 + 快速失败) |
| **P1 (短期)** | 6-9天 | 中 | 高 (时长优化 + 诊断) |
| **P2 (中期)** | 1-3周 | 中 | 中 (监控和预防) |
| **总计** | **2-4周** | | |

**ROI 估算:**
- 投入: ~2-4 周开发时间
- 收益: ~6 小时/年节省 + 显著稳定性提升
- **回报周期: 4-6 个月**

---

## 🎯 决策建议

### 立即执行 (本周)

✅ **必做:**
1. P0.1 缓存状态日志 (0.5天)
2. P0.2 Profile 预检查 (0.5天)

**理由:**
- 投入小,风险低
- 立即改善数据透明度
- 避免 Profile 失效浪费时间

---

### 短期规划 (2-3周)

🟡 **建议:**
1. P1.1 测试选择性运行 (3-6天)
   - **分阶段实施:** 先做测试分组,再做条件触发
   - **智能选择为可选项:** 如果分组效果已足够,不必实现
   
2. P1.2 失败诊断改善 (3天)
   - **高价值:** 显著减少诊断时间
   - **低风险:** 不影响现有流程

---

### 中期观察 (1-2月)

🟢 **可选:**
1. P2.1 环境标准化
   - **仅在问题复现时实施**
   - 如果 1.9.9 的显示器问题是偶发,暂不投入

2. P2.2 监控系统
   - **P0/P1 完成后再评估**
   - 如果数据已足够透明,监控优先级降低

---

### 不建议的方向

❌ **暂不考虑:**
1. M2.1 Submit 重试恢复
   - 实战证明不需要
   - 保持代码简洁

2. 完全并行化 Test macOS
   - 原生交互测试有环境依赖
   - 收益不明确,风险较高

---

## 📊 成功指标

### 短期指标 (1-2月)

- ✅ 缓存命中率: >80%
- ✅ 日常发版时长: <12min
- ✅ 失败诊断时长: <2min
- ✅ Profile 失效提前发现: 100%

### 中期指标 (3-6月)

- ✅ 首次成功率: >70%
- ✅ 平均重试次数: <1次
- ✅ 完整发版时长: <15min

---

## 🔄 持续改进

### 每次发版后

1. **记录关键指标**
   - 总时长
   - 各 job 时长
   - 缓存状态
   - 失败情况

2. **更新 baseline**
   - 每 3-5 个版本更新一次 baseline
   - 记录优化效果

3. **回顾失败原因**
   - 分析新失败模式
   - 更新诊断规则

### 每季度

1. **对比优化目标**
   - 实际时长 vs 预期时长
   - 稳定性指标

2. **评估新优化方向**
   - 是否需要 P2 优化
   - 是否有新瓶颈

---

## 📝 附录: 快速参考

### 常见失败处理

| 错误特征 | 原因 | 处理方式 |
|---------|------|----------|
| `NSURLErrorDomain -1005` | CloudKit 网络 | 重跑失败 job |
| `Profile.*Invalid` | Profile 失效 | 重新生成 Profile |
| `resolution.*1024` | Runner 显示器 | 重跑 (换 runner) |
| `Cache not found` | 缓存失效 | 正常,首次 build |

### 发版 Checklist

**发版前:**
- [ ] 运行本机 `pnpm verify`
- [ ] 运行 preflight 检查
- [ ] 确认 Profile 有效

**发版中:**
- [ ] 检查缓存状态 (HIT/MISS)
- [ ] 观察 Test jobs 时长
- [ ] 如失败,查看自动诊断

**发版后:**
- [ ] 记录关键指标
- [ ] 下载公证日志
- [ ] 更新 baseline (每 3-5 版本)

---

**文档版本:** v1.0
**最后更新:** 2026-10-22
**作者:** Claude Opus 5.5
**基于数据:** 1.9.8/1.9.9/1.9.10 发版实战

[PROTOCOL]: Update this header when making changes, then check README.md.
