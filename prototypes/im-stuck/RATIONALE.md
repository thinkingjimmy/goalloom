# I’m stuck surface

## Problem

The stuck flow already lives inside the task dialog. Opening it hides the task editor in the left column and leaves the right rail in place: a 20px carry-over headline, the same count split by source, a cumulative-time line, the reconfirm question, an I’m stuck / Reschedule pair, a read-only month calendar, and Cancel / Archive / Delete. The calendar does not write a date. Reschedule writes from a left-column form. The product rule to keep is one dialog, one facts snapshot, and management actions outside the assistance flow.

## Usage (caller's view)

This pass is a throwaway comparison, not a production API. Open `prototypes/im-stuck/index.html`. Keys 1–3 or the bottom picker switch three layouts of the same task. Nothing in `src/` imports it. After a direction is chosen, the production change is confined to the task dialog: `ItemDetail` decides what stays mounted, `AssistancePanel` renders in that slot, and `ActivityDrawer` renders only the facts that slot does not already show.

## Shape

Three layouts, one dialog, same tokens as the paper theme in `src/renderer/styles.css`.

- Split is the current slot swap. Left column is either the task, the help form, or the reschedule form. The rail keeps the full fact stack and the calendar.
- On the task keeps the title, due date, and description mounted. The help form is a section in that column. The rail keeps one fact line and the management actions. Activity is a list, not a month grid. Reschedule is a disclosure in the form.
- One column drops the rail. The same fact becomes one secondary line under the title. Management actions sit on the dialog footer.

The public surface of a later implementation should stay the dialog’s existing help / schedule / task modes. The layout choice should not add a second modal or a second facts calculation.

## Synthesis decision

Not adopted yet. The picker is the checkpoint asked for before any product edit. Split is the baseline. On the task and One column are the two other shapes: help joins the task and the rail shrinks, or the rail goes away. A text-only arena was not run; the decision is visual and the three layouts are the candidates.

## Tradeoffs accepted

- We accept a throwaway HTML copy of the paper tokens in exchange for not mounting prototype branches inside `ItemDetail`.
- We accept that On the task pushes the description below the help form, in exchange for never unmounting the task title.
- We accept that removing the month grid drops day-by-day activity dots. The list remains. The grid does not own reschedule.
- We accept that One column puts Cancel / Archive / Delete on the same reading order as the task, in exchange for deleting the second column of repeated facts.

## Alternatives considered

- Help inside the 248px rail. The consent paragraph and the difficulty field do not fit the rail’s width, so the rail would have to grow until it became a second sheet. Rejected before building.
- A new modal stacked on the task dialog. The assistance spec already forbids two focus-taking modals, and it would hide the task the same way Split does.

## Open questions and risks

- Should the month grid be removed, or only demoted behind View activity?
- On the resting task, is the reconfirm sentence plus I’m stuck… enough, or should the form stay open?
- Does One column make Cancel / Archive / Delete too easy to hit while writing guidance?

## Next implementation step

Wait for a picked variant. Then change the dialog slot in `ItemDetail`, `AssistancePanel`, and `ActivityDrawer` to match it, and delete this prototype.
