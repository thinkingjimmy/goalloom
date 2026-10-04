# Later sidebar

Later is the unplanned column. Its top-bar control collapses and expands that sidebar without deleting tasks.

## Sub-features

- `later-open` starts expanded on a fresh profile, labelled `收起 Later` when it holds no tasks.
- `later-collapse` hides the sidebar from the top bar.
- `later-expand` shows it again from the top bar.
- `later-keyboard` toggles it with `Mod+1` when focus is outside a text field.

## How to get to it (user POV)

- Choose `收起 Later` or `展开 Later` at the left of the top bar. A count is added only when Later has tasks.
- Press `Mod+1` while focus is outside a text field and no dialog is open.

## Driving it with goalloom-verify

Preconditions:

- [First-run setup](./setup.md) has finished in this run.
- Later has no tasks, so the control names are exactly `收起 Later` and `展开 Later`.
- No dialog is open.

- **Expanded state.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs get --role button --name "收起 Later" --attribute aria-expanded`. The value is `true`. Screenshot with `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs screenshot --path output/tests/verify-goalloom/evidence/later/open.png`.
- **Collapse.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "收起 Later"` and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait --role button --name "展开 Later"`. `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs get --role button --name "展开 Later" --attribute aria-expanded` returns `false`.
- **Collapsed proof.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs screenshot --path output/tests/verify-goalloom/evidence/later/collapsed.png` and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs aria --path output/tests/verify-goalloom/evidence/later/collapsed.aria.txt`. The snapshot shows `展开 Later` and does not show the Later column text field.
- **Expand from the keyboard.** Click `全部` so focus is outside a text field. Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs click --role button --name "全部"` and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs press --key Mod+1`. Wait with `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs wait --role button --name "收起 Later"`. `aria-expanded` is `true` again.
- **Proof.** Run `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs screenshot --path output/tests/verify-goalloom/evidence/later/expanded.png` and `node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs items --path output/tests/verify-goalloom/evidence/later/items.json`. The annual direction is still the only item. Toggling Later does not remove it.

## Gotchas

- After Later contains tasks, the accessible name gains a count, for example `收起 Later · 1 项待办`. This recipe stays on the empty name.
- `Mod+1` is ignored while a text field has focus, and while a dialog is open.
- The sidebar stays mounted while collapsed. Prove it with `aria-expanded` and the ARIA snapshot, not by assuming the column node was destroyed.
- The preference is device-local. This run's profile starts expanded because the harness does not copy an existing preference.
