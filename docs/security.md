# Client encryption and privacy boundaries

This repository contains the complete desktop client, including its key handling, encryption, network calls and decryption. It makes those paths inspectable; publication alone is not an independent security audit or proof that an installed binary matches the source.

## Source paths

- packages/crypto/src: password derivation, workspace encryption, key envelopes, signatures and recovery verification.
- packages/sync/src: encrypted operation exchange, bounded transport, receipt checks and retained-copy verification.
- apps/desktop/src/main/sync: device credentials, protected key custody and actual desktop sync orchestration.
- apps/desktop/src/main/smart: explicitly authorized AI requests, consent and provider transport.

Workspace content is encrypted on the device before sync transmission and decrypted on the device. Password-derived material and workspace keys follow the client custody paths above. Account identity, request times, sizes and service metadata are distinct from encrypted task content.

Explicit built-in AI and bring-your-own-key requests can send selected plaintext context to their selected provider after the applicable consent. Encrypted sync does not mean every network feature sends ciphertext. Link previews and software updates have separate network paths.

The hosted implementation is maintained privately. Existing public history remains under its original license terms. Public release commits, workflow runs and SHA256SUMS identify the source and delivered files; do not infer reproducible-build or third-party-audit acceptance from those records.
