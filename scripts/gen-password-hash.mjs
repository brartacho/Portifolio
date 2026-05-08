import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
    console.error('Uso: node scripts/gen-password-hash.mjs SUA_SENHA');
    process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
console.log('\nADMIN_PASSWORD_HASH=' + hash);
console.log('\nCopie a linha acima para o .env / Vercel Environment Variables.\n');
