# r3tards NFT Supply, Wallets & Burns

## Collection Supply

Total supply: `1033`

Current supply at audit snapshot: `1031`

The current supply is lower than total supply because 2 NFTs have been burned by community members.

## Key Wallets

| Label | Address | Notes |
|---|---|---|
| Team / Deployer | `0x40Ea55E0b8f02f8eBc9D91e082e202ed988647fA` | Deployer and royalty wallet |
| Activations | `0x18d5346216315667c51d69f346e3c768136f8018` | Activation wallet |
| Locked Team Supply Smart Contract | `0xec823eaffa4584f482a0d9c3e634840d14066242` | 35 NFTs held at snapshot; provided source defines 3-year-plus-1-day timelock and owner-only withdrawals |
| Future Collabs & Partners | `0xf10ed040f182511ef2179adea749920881a4eef9` | Future partnerships / collaborations |
| Community Treasury | `0xdfc19dd5f80048df12d7a71cb01226f8ce24a954` | Community initiatives / treasury |

## Locked Team Supply Evidence

The lock contract source and deterministic Foundry tests are included in `r3tards-locked-supply-audit/`. The provided source defines `unlockTime = block.timestamp + (3 * 365 days + 1 days)`, four allowed owner addresses, and owner-only withdrawals after unlock. The recorded Foundry test output shows 31 tests passed and 0 failed.

The token custody proof is separate: `locked_tokens.csv` verifies that 35 NFTs are owned by the lock contract at the audit snapshot.

## Community Burns

### Burn #1

r3tardbot report:  
https://x.com/r3tardbot/status/2048889359558939060?s=20

Community member proof:  
https://x.com/AlexxDumii/status/2048890619712467148?s=20

Transaction:  
https://monadscan.com/tx/0x6e8d254e9a44a310814c73cae0271237e8f46157df5c05df3264ba4644b18032

### Burn #2

r3tardbot report:  
https://x.com/r3tardbot/status/2058532823800172774?s=20

Community member proof:  
https://x.com/andalfthegreat/status/2058533141304799319?s=20

Transaction:  
https://monadscan.com/tx/0x465c8c18e0089db770bcdfe6e69603ae145eac4b62b82e900bbd6f4b7b35edc7

## Notes

This section documents supply, treasury wallets, locked team allocation, and community burn proofs for transparency.

The current supply value is accurate as of the audit snapshot and may change if future burns occur.
