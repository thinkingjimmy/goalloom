# Undo

Undo removes the latest task creation and says so on screen. The annual direction stays.

## Sub-features

- `undo-create` adds one 今天 task that can be undone.
- `undo-keyboard` undoes it with `Mod+Z` outside a text field.
- `undo-palette` undoes a second creation from `撤销上一步` in search.
- `undo-keeps-direction` leaves `验证这一年的方向` in place.

## How to get to it (user POV)

- Press `Mod+Z` while focus is outside a text field and no dialog is blocking the board.
- Choose `搜索与命令`, then `撤销上一步`, when that command is available.

## Driving it with goalloom-verify

Preconditions:

- [First-run setup](./setup.md) has finished in this run.
- Quick add is closed and no dialog is open.
- The board still has `验证这一年的方向`.

- **Create a task.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "在今天新建"`, `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs fill --role textbox --name "新建到今天" --value "验证键盘撤销"`, and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Enter`. Wait for `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait --role button --name "验证键盘撤销"`. Close quick add with `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Escape`.
- **Keyboard undo.** Click `全部` so focus is outside the field. Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "全部"` and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Mod+z`. The status toast appears. Capture it in the same command: `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait-text --text "已撤销：创建「验证键盘撤销」" --shot output/tests/verify-goalloom/evidence/undo/keyboard.png`. The button `验证键盘撤销` is gone.
- **Create another task.** Repeat the header path with `验证菜单撤销`: `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "在今天新建"`, `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs fill --role textbox --name "新建到今天" --value "验证菜单撤销"`, `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Enter`, `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait --role button --name "验证菜单撤销"`, and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Escape`.
- **Undo from search.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "搜索与命令"` and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "撤销上一步" --within-dialog "搜索与命令"`. Capture the toast: `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait-text --text "已撤销：创建「验证菜单撤销」" --shot output/tests/verify-goalloom/evidence/undo/palette.png`.
- **Proof.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs aria --path output/tests/verify-goalloom/evidence/undo/board.aria.txt` and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs items --path output/tests/verify-goalloom/evidence/undo/items.json`. `items.json` contains `验证这一年的方向` and does not contain `验证键盘撤销` or `验证菜单撤销`.

## Gotchas

- Column quick add does not show a toast. The undo toast is the visible feedback, and it stays about 2.5 seconds. Use `--shot` on `wait-text`.
- `Mod+Z` is ignored while a text field has focus. Escape closes an empty quick add before the shortcut.
- `撤销上一步` is disabled when there is nothing to undo. Create the task first.
- Undo of a creation is not a general redo stack. Restoring that task is a separate action and is not this recipe.
