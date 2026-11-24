// Generates a random SETUP_TOKEN and VAULT_KEY. Prints them — store VAULT_KEY somewhere safe:
// losing it makes the encrypted vault entries unreadable.
import { randomBytes } from 'node:crypto';
console.log('SETUP_TOKEN=' + randomBytes(24).toString('base64url'));
console.log('VAULT_KEY=' + randomBytes(32).toString('base64'));
