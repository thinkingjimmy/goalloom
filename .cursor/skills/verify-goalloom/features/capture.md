# Capture a task

Capture adds a task from a time column, or saves the composer's text to Later when AI was skipped.

## Sub-features

- `capture-blank` opens quick add by double-clicking the blank part of an empty column.
- `capture-header` opens the same quick add from the column header.
- `capture-tail` opens quick add from the control at the end of a column that already has a task.
- `capture-composer` opens the global composer and, without an AI connection, saves that text to Later.

## How to get to it (user POV)

- Double-click the blank body of a column. The empty-state sentence and icon do not count.
- Choose `在今天新建` in the 今天 column header.
- After 今天 has a task, choose `新建到今天` at the end of the list (`添加任务…`).
- Choose the `新建` button at the lower right, press `Mod+N` while focus is outside a text field, or choose `新建` in search.

## Driving it with goalloom-verify

Preconditions:

- [First-run setup](./setup.md) has finished in this run. The main region is `时间看板`.
- 今天 has no tasks yet. The annual direction stays in 1年.

- **Blank column.** Double-click the lower blank area of 今天. Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs dblclick --horizon day`. A textbox named `新建到今天` appears. Wait with `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait --role textbox --name "新建到今天"`.
- **Save the blank-column task.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs fill --role textbox --name "新建到今天" --value "验证空白新建"` and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Enter`. A button named `验证空白新建` appears. Wait with `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait --role button --name "验证空白新建"`.
- **Close quick add.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Escape`. The `新建到今天` textbox is gone.
- **Column tail.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "新建到今天"`, `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs fill --role textbox --name "新建到今天" --value "验证列尾新建"`, and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Enter`. Wait for `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait --role button --name "验证列尾新建"`, then `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Escape`.
- **Column header.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "在今天新建"`, `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs fill --role textbox --name "新建到今天" --value "验证列头新建"`, and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Enter`. Wait for `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait --role button --name "验证列头新建"`, then close quick add with `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Escape`.
- **Composer from the button.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "新建"`. A dialog named `新建` appears. Wait with `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait --role dialog --name "新建"`.
- **Save to Later.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs fill --role textbox --name "写下想法" --value "验证composer" --within-dialog "新建"` and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "保存到 Later" --within-dialog "新建"`. The dialog closes and a button named `验证composer` appears. Wait with `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait --role button --name "验证composer"`.
- **Keyboard composer.** Click `全部` so focus is outside a text field. Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "全部"` and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Mod+n`. The `新建` dialog is back. Close it with `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Escape`.
- **Search composer.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "搜索与命令"` and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "新建" --within-dialog "搜索与命令"`. The `新建` dialog replaces search. Close it with `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Escape`.
- **Proof.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs screenshot --path output/tests/verify-goalloom/evidence/capture/board.png`, `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs aria --path output/tests/verify-goalloom/evidence/capture/board.aria.txt`, and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs items --path output/tests/verify-goalloom/evidence/capture/items.json`. The three 今天 titles are horizon `day`. `验证composer` is horizon `later`. The annual direction is still horizon `year`.

## Gotchas

- Double-clicking the empty-state sentence or icon does nothing. `dblclick --horizon` aims at the column's lower blank body.
- Quick add stays open after Enter. Escape closes it when the field is empty.
- Without an AI connection, the composer's primary button is `保存到 Later`. It does not file the text into 今天.
- `Mod+N` is ignored while a text field has focus.
- Column quick add does not show a success toast. The new button and `items.json` are the proof.
