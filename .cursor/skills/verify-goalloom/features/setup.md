# First-run setup

First-run setup locks the calendar, saves one annual direction into the 1年 column, and reaches the board after the optional AI step is skipped.

## Sub-features

- `setup-calendar` chooses 365 天 or 自然年 on the first screen.
- `setup-direction` confirms a direction title. An empty direction confirms the calendar and creates no task.
- `setup-skip-ai` leaves the optional AI step without connecting a provider.
- `setup-board` shows the direction as a 1年 task and as a flow chip.

## How to get to it (user POV)

- Open Goalloom with a workspace that has never confirmed setup. The calendar step is the first screen.

## Driving it with goalloom-verify

Preconditions:

- `launch` used a fresh run.
- `doctor` reports `worthDriving: true`, `surface` `onboarding`, and a `goalloom:` URL.

- **Record the instance.** Save the doctor. Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs doctor --path output/tests/verify-goalloom/evidence/setup/doctor.json`. `worthDriving` is true.
- **Settle the calendar step.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs settle`. Then `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs screenshot --path output/tests/verify-goalloom/evidence/setup/calendar.png`. The screenshot shows `欢迎来到 Goalloom` and the 365 天 card.
- **Choose a calendar.** Select 自然年, then return to the default 365 天 card. Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role radio --name-pattern "自然年"` and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role radio --name-pattern "365 天"`. The 365 天 radio is checked.
- **Open direction.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs settle` and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "下一步"`. A textbox named `这一年的方向` appears. Wait with `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait --role textbox --name "这一年的方向"`.
- **Enter the direction.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs fill --role textbox --name "这一年的方向" --value "验证这一年的方向"` and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs screenshot --path output/tests/verify-goalloom/evidence/setup/direction.png`. The field shows `验证这一年的方向`.
- **Confirm.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "确认并开始"`. The AI step shows `暂时跳过`.
- **Skip AI.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "暂时跳过"`. The board appears. Wait with `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait --role main --name "时间看板"`, `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait --role button --name "验证这一年的方向"`, and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait --role button --name "只看 验证这一年的方向"`.
- **Proof.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs screenshot --path output/tests/verify-goalloom/evidence/setup/board.png`, `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs aria --path output/tests/verify-goalloom/evidence/setup/board.aria.txt`, and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs items --path output/tests/verify-goalloom/evidence/setup/items.json`. The board snapshot and screenshot show the direction. `items.json` has one item titled `验证这一年的方向` on horizon `year`, and a flow with that title.

## Gotchas

- Enter in the direction field only moves focus to `确认并开始`. It does not confirm setup.
- The direction is written when setup is confirmed, before `暂时跳过`. The board is the first place that title is visible.
- `暂时跳过` stays disabled until that write finishes. The click command waits for it.
- Confirming an empty direction creates no task. This recipe uses a title so the board and `items.json` can both show it.
- Calendar mode and the start date lock at confirmation. Changing them later is a backup-and-reset flow, not this screen.
