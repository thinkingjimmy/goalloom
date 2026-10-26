/**
 * [INPUT]: Actual local Docker inspect data and the original tool-owned container identity.
 * [OUTPUT]: An enforced network-none recovery boundary or a finite refusal before SQL dispatch.
 * [POS]: Owner-run recovery guard. It accepts no hosted URL, credential or operator attestation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
export const recoveryLabel = 'com.goalloom.recovery'
export const temporaryPaths = ['/recovery', '/tmp', '/var/run/postgresql']
export function assertIsolated(container, identity) {
  const host = container.HostConfig ?? {}, config = container.Config ?? {}, state = container.State ?? {}
  assert(/^[a-f0-9]{64}$/.test(identity.containerId) && container.Id === identity.containerId, 'recovery_container_changed')
  assert(container.Image === identity.image && /^sha256:[a-f0-9]{64}$/.test(identity.image), 'recovery_image_changed')
  assert(config.Labels?.[recoveryLabel] === identity.id && config.User === 'postgres', 'recovery_owner_changed')
  assert(state.Running === true && !state.Restarting && !state.Paused && state.StartedAt === identity.startedAt, 'recovery_process_changed')
  assert(host.NetworkMode === 'none' && !host.Privileged && host.ReadonlyRootfs === true, 'recovery_isolation_missing')
  assert(!host.PublishAllPorts && !Object.keys(host.PortBindings ?? {}).length && !Object.keys(container.NetworkSettings?.Ports ?? {}).length, 'recovery_ports_present')
  assert(!config.ExposedPorts || !Object.keys(config.ExposedPorts).length, 'recovery_exposed_ports_present')
  assert((host.Binds ?? []).length === 0 && (host.Mounts ?? []).length === 0, 'recovery_host_mount_present')
  assert((container.Mounts ?? []).every(mount => mount.Type === 'tmpfs' && temporaryPaths.includes(mount.Destination)), 'recovery_persistent_mount_present')
  assert(Object.keys(host.Tmpfs ?? {}).sort().join('|') === [...temporaryPaths].sort().join('|'), 'recovery_tmpfs_changed')
  assert(!host.VolumesFrom?.length && !host.Devices?.length && !host.DeviceRequests?.length && !Object.keys(config.Volumes ?? {}).length, 'recovery_device_or_volume_present')
  assert(!host.CapAdd?.length && host.CapDrop?.includes('ALL') && host.SecurityOpt?.includes('no-new-privileges:true'), 'recovery_privilege_changed')
  assert(!['host', 'container'].some(value => [host.PidMode, host.IpcMode, host.UTSMode].some(mode => mode?.startsWith(value))), 'recovery_host_namespace_present')
  assert(host.Memory > 0 && host.Memory <= 1073741824 && host.PidsLimit > 0 && host.PidsLimit <= 128, 'recovery_resource_boundary_missing')
  const networks = container.NetworkSettings?.Networks ?? {}
  assert(Object.keys(networks).every(name => name === 'none') && Object.values(networks).every(network => !network.IPAddress && !network.GlobalIPv6Address && !network.Gateway && !network.IPv6Gateway), 'recovery_network_present')
  return { closed: true, projectRef: 'keqprrgvcefqdwnxaafv', gateId: identity.containerId }
}
export function assertRecoveryCommand(value) {
  assert(['init', 'load', 'replay', 'status'].includes(value), 'unsupported_recovery_operation')
}
