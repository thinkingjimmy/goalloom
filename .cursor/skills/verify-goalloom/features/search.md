# Search

Search opens a command dialog, finds a task by title, and shows a clear empty state when nothing matches.

## Sub-features

- `search-button` opens search from the top bar.
- `search-keyboard` opens the same dialog with `Mod+K` when focus is outside a text field.
- `search-match` lists the annual direction and opens it.
- `search-empty` shows `没有找到条目` for a title that does not exist.
- `search-clear` restores the command list when the query is cleared.

## How to get to it (user POV)

- Choose `搜索与命令` in the top bar.
- Press `Mod+K` while focus is outside a text field and no other dialog is open.

## Driving it with goalloom-verify

Preconditions:

- [First-run setup](./setup.md) has finished in this run.
- The board contains a task titled `验证这一年的方向`.
- No dialog is open.

- **Top bar.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "搜索与命令"`. A dialog named `搜索与命令` appears, with focus in `搜索条目`. Wait with `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait --role dialog --name "搜索与命令"`.
- **Match.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs fill --role textbox --name "搜索条目" --value "验证这一年的方向" --within-dialog "搜索与命令"`. Wait until the result is listed: `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait --role button --name-pattern "^验证这一年的方向" --within-dialog "搜索与命令"`.
- **Capture the match.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs screenshot --path output/tests/verify-goalloom/evidence/search/match.png` and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs aria --path output/tests/verify-goalloom/evidence/search/match.aria.txt`. Both show the query and `验证这一年的方向`.
- **Open the result.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name-pattern "^验证这一年的方向" --within-dialog "搜索与命令"`. The search dialog closes and the task detail shows the same title.
- **Close detail.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Escape`. The board is visible again.
- **Keyboard entry.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "全部"` and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Mod+k`. The same search dialog returns.
- **Empty state.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs fill --role textbox --name "搜索条目" --value "没有的条目" --within-dialog "搜索与命令"` and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait-text --text "没有找到条目" --shot output/tests/verify-goalloom/evidence/search/empty.png`. The dialog shows `没有找到条目` and does not list `验证这一年的方向`.
- **Clear.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs fill --role textbox --name "搜索条目" --value "" --within-dialog "搜索与命令"` and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait --role button --name "撤销上一步" --within-dialog "搜索与命令"`. The command list is back, including `撤销上一步`.
- **Proof.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs aria --path output/tests/verify-goalloom/evidence/search/commands.aria.txt`. Then close the dialog with `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Escape`. `items --path output/tests/verify-goalloom/evidence/search/items.json` still lists `验证这一年的方向`; search does not change tasks.

## Gotchas

- Results wait for a short debounce. Wait for the result button or `没有找到条目`, not a fixed pause.
- The result button's accessible name includes the title and a location hint. Match it with `^验证这一年的方向` inside the dialog. The board has another control with that title behind the dialog.
- `Mod+K` does nothing while a text field or another dialog has focus.
- Opening a result leaves search. Close the detail before the empty-state check.
