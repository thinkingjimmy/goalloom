/**
 * [INPUT]: The active server locale.
 * [OUTPUT]: Five-language note-rewrite messages without task content.
 * [POS]: Shared main/worker copy for the assistance boundary.
 */
import { serverLocale } from './server'
const catalogs = {
  zh: {
  notesRewritten: '已重写笔记',
  notesChanged: '笔记已编辑，无法撤销重写。新内容已保留。',
  inactive: '请先将任务恢复为未完成并解除归档。',
  contextChanged: '任务或日期已变化，请重新查看预览。'
},
  en: {
  notesRewritten: 'Notes rewritten',
  notesChanged: 'Notes have been edited. The rewrite cannot be undone; your changes are kept.',
  inactive: 'Reopen and unarchive this task first.',
  contextChanged: 'The task or date changed. Review the preview again.'
},
  ja: {
  notesRewritten: 'メモを書き直しました',
  notesChanged: 'メモが編集されています。書き直しは取り消せません。変更は保持されます。',
  inactive: 'タスクを未完了に戻し、アーカイブを解除してください。',
  contextChanged: 'タスクまたは日付が変わりました。プレビューを再確認してください。'
},
  es: {
  notesRewritten: 'Notas reescritas',
  notesChanged: 'Las notas se editaron. No se puede deshacer la reescritura; conservamos tus cambios.',
  inactive: 'Reabre la tarea y quita el archivo primero.',
  contextChanged: 'La tarea o la fecha cambió. Revisa la vista previa.'
},
  fr: {
  notesRewritten: 'Notes réécrites',
  notesChanged: 'Les notes ont été modifiées. La réécriture ne peut pas être annulée ; vos changements sont conservés.',
  inactive: 'Rouvrez cette tâche et désarchivez-la avant de continuer.',
  contextChanged: 'La tâche ou la date a changé. Vérifiez l’aperçu.'
},
}
export function assistanceServerText() { return catalogs[serverLocale()] }
