/**
 * [INPUT]: The resolved device locale.
 * [OUTPUT]: Five complete account and sync error catalogs.
 * [POS]: Mobile account copy; no provider or platform exception leaks into task UI.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { LocaleId } from '@goalloom/local-store'
const en = {
  googleConfiguration: "Google sign-in is unavailable. Continue with Apple or use this device.",
  title: 'Account and sync', account: 'Account', signedOut: 'Not signed in', signOut: 'Sign out',
  keepLocal: 'Your tasks stay on this device. Sign in again with the same account to continue sync.',
  configuration: 'Sign-in is not configured for this build. You can keep using this device.',
  auth: 'Sign-in could not finish. Please try again.', network: 'Cannot connect. Check your connection and try again.',
  storage: 'Cannot read or save protected credentials. Your local tasks are kept.', working: 'Signing in…',
  signedIn: 'Signed in', syncReady: 'Synced', syncing: 'Syncing…', offline: 'Offline · changes stay on this device',
  password: 'Sync password', enterPassword: 'Enter the password set on your first device.',
  wrongPassword: 'The sync password is incorrect.', merge: 'Merge and start sync',
  mergeNote: 'Both boards have tasks. A protective copy is made before merging.',
  replace: 'Use the synced board', replaceAck: 'Replace this device’s tasks with the synced board',
  mismatch: 'This device belongs to another account. Sign in with the original account.',
  backup: 'The protective copy could not be verified. Your original board is kept.',
  review: 'Review sync differences', defer: 'Later', current: 'Synced version', local: 'This device’s version',
  next: 'Next', finish: 'Finish', forgotten: 'Forgot password?', recovery: 'Create a new encrypted workspace',
  recoveryNote: 'Your existing cloud workspace and other devices are kept. This device needs a new sync password.',
}
const zh: typeof en = {
  googleConfiguration: "Google 登录暂不可用，可使用 Apple 或直接使用。",
  title: '账号与同步', account: '账号', signedOut: '未登录', signOut: '退出登录',
  keepLocal: '任务会保留在这台设备上。再次使用相同账号登录后可继续同步。',
  configuration: '当前版本尚未完成登录配置，你可以继续在本机使用。', auth: '登录未完成，请重试。',
  network: '暂时无法连接，请检查网络后重试。', storage: '无法读取或保存受保护的凭据，本机任务已保留。', working: '正在登录…',
  signedIn: '已登录', syncReady: '已同步', syncing: '正在同步…', offline: '离线 · 更改保留在本机',
  password: '同步密码', enterPassword: '输入在第一台设备上设置的密码。', wrongPassword: '同步密码不正确。',
  merge: '合并并开始同步', mergeNote: '两边都有任务。合并前会创建保护副本。',
  replace: '使用同步看板', replaceAck: '用同步看板替换这台设备上的任务', mismatch: '这台设备已绑定其他账号，请使用原账号登录。',
  backup: '保护副本未能通过验证，原看板已保留。', review: '确认同步差异', defer: '稍后处理', current: '同步版本', local: '本机版本',
  next: '下一项', finish: '完成', forgotten: '忘记密码？', recovery: '创建新的加密工作区', recoveryNote: '原云端工作区和其他设备会保留。这台设备需要设置新的同步密码。',
}
const ja: typeof en = {
  googleConfiguration: "Google ログインは利用できません。Apple または端末内で続けられます。",
  title: 'アカウントと同期', account: 'アカウント', signedOut: '未ログイン', signOut: 'ログアウト', keepLocal: 'タスクはこの端末に残ります。同じアカウントでログインすると同期を再開できます。',
  configuration: 'このビルドのログイン設定は未完了です。端末内で引き続き使えます。', auth: 'ログインできませんでした。再試行してください。', network: '接続できません。通信状況を確認してください。', storage: '保護された認証情報を読み書きできません。端末のタスクは保持されます。', working: 'ログイン中…',
  signedIn: 'ログイン済み', syncReady: '同期済み', syncing: '同期中…', offline: 'オフライン · 変更は端末に保存', password: '同期パスワード', enterPassword: '最初の端末で設定したパスワードを入力してください。', wrongPassword: '同期パスワードが違います。', merge: '統合して同期', mergeNote: '両方のボードにタスクがあります。保護コピーを作成してから統合します。', replace: '同期ボードを使用', replaceAck: '端末のタスクを同期ボードに置き換える', mismatch: '別のアカウントに紐づいています。元のアカウントでログインしてください。', backup: '保護コピーを検証できませんでした。元のボードは保持されます。', review: '同期の差分を確認', defer: '後で', current: '同期された版', local: 'この端末の版', next: '次へ', finish: '完了', forgotten: 'パスワードを忘れた場合', recovery: '新しい暗号化ワークスペースを作成', recoveryNote: '既存のクラウドと他の端末は保持されます。この端末に新しい同期パスワードを設定します。',
}
const es: typeof en = {
  googleConfiguration: "Google no está disponible. Continúa con Apple o usa este dispositivo.",
  title: 'Cuenta y sincronización', account: 'Cuenta', signedOut: 'Sin sesión', signOut: 'Cerrar sesión', keepLocal: 'Las tareas quedan en este dispositivo. Entra con la misma cuenta para seguir sincronizando.', configuration: 'Este inicio de sesión aún no está configurado. Puedes seguir usando el dispositivo.', auth: 'No se pudo iniciar sesión. Inténtalo de nuevo.', network: 'No se puede conectar. Comprueba la conexión.', storage: 'No se pueden leer o guardar las credenciales protegidas. Se conservan las tareas locales.', working: 'Iniciando sesión…', signedIn: 'Sesión iniciada', syncReady: 'Sincronizado', syncing: 'Sincronizando…', offline: 'Sin conexión · cambios guardados aquí', password: 'Contraseña de sincronización', enterPassword: 'Introduce la contraseña del primer dispositivo.', wrongPassword: 'La contraseña no es correcta.', merge: 'Combinar y sincronizar', mergeNote: 'Ambos tableros tienen tareas. Se crea una copia de protección antes de combinar.', replace: 'Usar el tablero sincronizado', replaceAck: 'Reemplazar las tareas de este dispositivo por el tablero sincronizado', mismatch: 'Este dispositivo pertenece a otra cuenta. Entra con la cuenta original.', backup: 'No se pudo verificar la copia. Se conserva el tablero original.', review: 'Revisar diferencias', defer: 'Más tarde', current: 'Versión sincronizada', local: 'Versión de este dispositivo', next: 'Siguiente', finish: 'Finalizar', forgotten: '¿Olvidaste la contraseña?', recovery: 'Crear un nuevo espacio cifrado', recoveryNote: 'Se conservan el espacio anterior y los otros dispositivos. Este dispositivo necesita una nueva contraseña.',
}
const fr: typeof en = {
  googleConfiguration: "Google est indisponible. Continuez avec Apple ou sur cet appareil.",
  title: 'Compte et synchronisation', account: 'Compte', signedOut: 'Non connecté', signOut: 'Se déconnecter', keepLocal: 'Les tâches restent sur cet appareil. Reconnectez-vous avec le même compte pour reprendre la synchro.', configuration: 'La connexion n’est pas configurée pour cette version. Vous pouvez continuer en local.', auth: 'La connexion a échoué. Réessayez.', network: 'Connexion impossible. Vérifiez le réseau.', storage: 'Impossible de lire ou enregistrer les identifiants protégés. Les tâches locales sont conservées.', working: 'Connexion…', signedIn: 'Connecté', syncReady: 'Synchronisé', syncing: 'Synchronisation…', offline: 'Hors ligne · modifications conservées ici', password: 'Mot de passe de synchronisation', enterPassword: 'Saisissez le mot de passe défini sur le premier appareil.', wrongPassword: 'Le mot de passe est incorrect.', merge: 'Fusionner et synchroniser', mergeNote: 'Les deux tableaux contiennent des tâches. Une copie de protection précède la fusion.', replace: 'Utiliser le tableau synchronisé', replaceAck: 'Remplacer les tâches de cet appareil par le tableau synchronisé', mismatch: 'Cet appareil est lié à un autre compte. Connectez-vous avec le compte initial.', backup: 'La copie n’a pas pu être vérifiée. Le tableau initial est conservé.', review: 'Examiner les différences', defer: 'Plus tard', current: 'Version synchronisée', local: 'Version de cet appareil', next: 'Suivant', finish: 'Terminer', forgotten: 'Mot de passe oublié ?', recovery: 'Créer un nouvel espace chiffré', recoveryNote: 'L’espace précédent et les autres appareils sont conservés. Cet appareil a besoin d’un nouveau mot de passe.',
}
export const accountCopy = (locale: LocaleId) => ({ zh, en, ja, es, fr })[locale]
