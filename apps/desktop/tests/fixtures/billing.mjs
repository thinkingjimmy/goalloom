/**
 * [INPUT]: A live Settings or first-run locator after account-only login.
 * [OUTPUT]: Explicit qualified sync preparation through the existing UI action.
 * [POS]: Shared native fixture step; login itself never discovers or registers a cloud workspace.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export async function configureSync(root) {
  await root.getByRole('button', { name: /^(开始同步|Start sync|同期を始める|Empezar a sincronizar|Démarrer la synchro|配置同步|Set up sync|同期を設定|Configurar sincronización|Configurer la synchronisation)$/ }).click()
}
