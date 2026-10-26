/**
 * [INPUT]: Explicit current-D2 profile, finite stages and an active development-only execution window.
 * [OUTPUT]: Offline default plan or protected, sequential real-provider journey dispatch.
 * [POS]: D3 acceptance entry; historical D0 reports and mutation modes are not replayed.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {runCurrentD2Cli} from './d3/cli.mjs'
await runCurrentD2Cli(process.argv.slice(2),{family:'grace'})
