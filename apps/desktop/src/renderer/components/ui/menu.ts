/**
 * [INPUT]: Shared theme colors, menu radii and paper/minimal padding tokens.
 * [OUTPUT]: Common surface and row classes for Radix and custom feature menus.
 * [POS]: Menu presentation only; callers retain semantics, selection, positioning and focus behavior.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export const menuStyles = {
  surface: 'flex min-w-[208px] max-w-[380px] flex-col rounded-menu bg-raised p-menu-inset shadow-floating',
  item: 'flex min-h-[34px] w-full items-center gap-2.5 rounded-menu-item px-2.5 py-0 text-left text-[13px] [&:hover:not(:disabled)]:bg-hover aria-selected:bg-hover',
  check: 'flex w-3.5 shrink-0',
  text: 'min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap',
  hint: 'shrink-0 text-[12px] text-muted-foreground',
  heading: 'm-0 px-2.5 pt-1.5 pb-1 text-[12px] text-muted-foreground',
  separator: 'mx-1 my-1.5 h-px bg-hairline',
}
