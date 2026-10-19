/**
 * [INPUT]: Device language for a self-contained OAuth result page.
 * [OUTPUT]: Static five-language sign-in copy and navigation labels.
 * [POS]: Browser-return copy; no user data or provider response is interpolated into HTML.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export const callbackCopy = {
  zh: ['zh-CN', '已登录，可以关闭此页面', '登录未完成', '打开 Goalloom', '目标看板', '智能输入', '版本发布', '下载', '反馈', '切换主题', '请回到 Goalloom 完成同步设置。', '请回到应用重试登录。'],
  en: ['en', 'Signed in. You can close this tab.', 'Sign-in did not finish', 'Open Goalloom', 'Goal board', 'Smart input', 'Releases', 'Download', 'Feedback', 'Change theme', 'Return to Goalloom to finish sync setup.', 'Please try signing in again in the app.'],
  ja: ['ja', 'ログインしました。このタブを閉じられます。', 'ログインが完了しませんでした', 'Goalloom を開く', '目標ボード', 'スマート入力', 'リリース', 'ダウンロード', 'フィードバック', 'テーマを切り替える', 'Goalloom に戻って同期設定を完了してください。', 'アプリでログインをやり直してください。'],
  es: ['es', 'Sesión iniciada. Puedes cerrar esta pestaña.', 'No se completó el inicio de sesión', 'Abrir Goalloom', 'Tablero de objetivos', 'Entrada inteligente', 'Versiones', 'Descargar', 'Comentarios', 'Cambiar tema', 'Vuelve a Goalloom para completar la configuración de sincronización.', 'Vuelve a intentar iniciar sesión en la aplicación.'],
  fr: ['fr', 'Connexion réussie. Vous pouvez fermer cet onglet.', 'La connexion a échoué', 'Ouvrir Goalloom', 'Tableau des objectifs', 'Saisie intelligente', 'Versions', 'Télécharger', 'Commentaires', 'Changer de thème', 'Revenez dans Goalloom pour terminer la configuration de la synchronisation.', 'Réessayez de vous connecter dans l’application.'],
} as const
