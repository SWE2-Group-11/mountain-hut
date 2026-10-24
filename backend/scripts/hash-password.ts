// scripts/hash-password.ts
// Usage:
//   npx tsx scripts/hash-password.ts <password> [salt]
// If no salt is given, a random one is generated.

import { generatePasswordHash, hashPassword } from "../src/services/password-service";

const [password = "password", givenSalt] = process.argv.slice(2);

const { salt, hash } = givenSalt
    ? { salt: givenSalt, hash: hashPassword(password, givenSalt) }
    : generatePasswordHash(password);

console.log("=== DATA TO INSERT INTO THE DB ===");
console.log(`Salt: ${salt}`);
console.log(`Hash: ${hash}`);