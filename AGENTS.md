# AccountKit agent instructions

This repository owns shared account and authentication behavior for Bitbaum
products. When a consumer finds a common lifecycle, recovery, identity-linking,
session, mail-adapter, screen or schema defect, fix it here, add the regression
test, release the package through the verified path, and then update consumers.
Do not patch the same shared behavior in app repositories.

Consumer-specific roles, tenant policy, legacy actor mappings, provider
configuration and data migrations remain owned by each product. Preserve their
contracts and prove migration parity; do not infer identity from email or
silently alter account ownership.

Read the README and existing tests before changing a public contract. Run
`pnpm run verify`. Authentication changes must retain real database lifecycle
coverage and consumer/browser journey coverage where the affected integration
is exercised. Do not move or rewrite published tags.
