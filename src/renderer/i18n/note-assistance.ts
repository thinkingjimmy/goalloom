/**
 * [INPUT]: Current UI locale and an authoritative carryover count.
 * [OUTPUT]: Five-language inline note assistance copy.
 * [POS]: Copy for the choice-first rewrite flow; no model-generated pressure claims.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { currentLocale } from './index'
const en = {
  title: 'I’m stuck', question: 'What’s getting in the way?', invitation: 'Need help finding a next step?',
  carried: (count: number) => `This task has been carried forward ${count} times.`,
  choices: ['I’m not sure where to start', 'This feels too big', 'I’m waiting on someone or something'],
  other: 'Something else…', generate: 'Find a next step', rethink: 'Rethink', later: 'Not now', cancel: 'Cancel',
  pending: 'Rewriting your notes…', unavailable: 'Enable drafting and review in Settings to use this help.', settings: 'Open Settings',
  stale: 'Your task changed while AI was working. Your edits are kept. Try again with the current notes.',
  failed: 'Could not rewrite your notes. Your original notes are kept. Try again.',
  tooLong: 'These notes are too long to rewrite in full. Shorten them before trying again.',
}
type Copy = typeof en
const zh: Copy = {
  title: '卡住了', question: '是什么让你难以继续？', invitation: '需要帮你找到下一步吗？', carried: n => `这个任务已经顺延 ${n} 次了。`,
  choices: ['不知道从哪里开始', '任务太大，不知道如何拆小', '正在等待某个人或某个条件'], other: '其他原因…', generate: '帮我找到下一步', rethink: '重新想想', later: '暂时不用', cancel: '取消',
  pending: '正在重写笔记…', unavailable: '在设置中开启「起草与复盘」后，即可使用此帮助。', settings: '打开设置',
  stale: '生成期间任务有变化。已保留你的编辑，请基于当前笔记重试。', failed: '未能重写笔记。原文已保留，请重试。', tooLong: '笔记太长，无法完整重写。请精简后再试。',
}
const ja: Copy = {
  title: '進められない', question: '何が妨げになっていますか？', invitation: '次の一歩を一緒に考えますか？', carried: n => `このタスクは${n}回繰り越されています。`,
  choices: ['どこから始めればよいかわからない', 'タスクが大きすぎる', '誰かや何かを待っている'], other: 'その他…', generate: '次の一歩を考える', rethink: '考え直す', later: '今はしない', cancel: 'キャンセル',
  pending: 'メモを書き直しています…', unavailable: '設定で「下書きと振り返り」を有効にしてください。', settings: '設定を開く',
  stale: '生成中にタスクが変更されました。編集は保持されています。現在のメモでもう一度お試しください。', failed: 'メモを書き直せませんでした。元のメモは保持されています。もう一度お試しください。', tooLong: 'メモが長すぎて全体を書き直せません。短くしてからお試しください。',
}
const es: Copy = {
  title: 'Estoy atascado', question: '¿Qué te impide avanzar?', invitation: '¿Te ayudo a encontrar el siguiente paso?', carried: n => `Esta tarea se ha trasladado ${n} veces.`,
  choices: ['No sé por dónde empezar', 'La tarea parece demasiado grande', 'Estoy esperando a alguien o algo'], other: 'Otro motivo…', generate: 'Encontrar el siguiente paso', rethink: 'Replantear', later: 'Ahora no', cancel: 'Cancelar',
  pending: 'Reescribiendo tus notas…', unavailable: 'Activa los borradores y revisiones en Ajustes para usar esta ayuda.', settings: 'Abrir Ajustes',
  stale: 'La tarea cambió durante la generación. Conservamos tus cambios. Reintenta con las notas actuales.', failed: 'No se pudieron reescribir las notas. Conservamos las originales. Reintenta.', tooLong: 'Las notas son demasiado largas para reescribirlas completas. Acórtalas y reintenta.',
}
const fr: Copy = {
  title: 'Je suis bloqué', question: 'Qu’est-ce qui vous empêche d’avancer ?', invitation: 'Besoin d’aide pour trouver la prochaine étape ?', carried: n => `Cette tâche a été reportée ${n} fois.`,
  choices: ['Je ne sais pas par où commencer', 'Cette tâche me semble trop grande', 'J’attends quelqu’un ou quelque chose'], other: 'Autre raison…', generate: 'Trouver la prochaine étape', rethink: 'Repenser', later: 'Pas maintenant', cancel: 'Annuler',
  pending: 'Réécriture de vos notes…', unavailable: 'Activez les brouillons et bilans dans les réglages pour utiliser cette aide.', settings: 'Ouvrir les réglages',
  stale: 'La tâche a changé pendant la génération. Vos modifications sont conservées. Réessayez avec les notes actuelles.', failed: 'Impossible de réécrire les notes. Les notes originales sont conservées. Réessayez.', tooLong: 'Les notes sont trop longues pour être réécrites en entier. Raccourcissez-les avant de réessayer.',
}
export function noteAssistanceMessages(): Copy { return { zh, en, ja, es, fr }[currentLocale()] }
