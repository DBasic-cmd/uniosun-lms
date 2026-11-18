// Creates a platform administrator: the account that provisions institutions.
//
//   npm run create:platform-admin
//
// Values come from PLATFORM_ADMIN_NAME / _EMAIL / _IDENTIFIER / _PASSWORD when set,
// otherwise you are prompted for them (the password is not echoed).
require('dotenv').config();
const readline = require('readline');
const mongoose = require('mongoose');
const User = require('../src/models/User');

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Print the prompt but nothing that is typed after it.
      rl._writeToOutput = (text) => {
        if (text.startsWith(question)) rl.output.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function readConfig() {
  const env = process.env;
  const name = env.PLATFORM_ADMIN_NAME || await ask('Full name: ');
  const email = (env.PLATFORM_ADMIN_EMAIL || await ask('Email: ')).toLowerCase();
  const identifier = env.PLATFORM_ADMIN_IDENTIFIER || await ask('Staff identifier: ');
  let password = env.PLATFORM_ADMIN_PASSWORD;
  if (!password) {
    password = await ask('Password (min 12 characters): ', { hidden: true });
    const confirm = await ask('Confirm password: ', { hidden: true });
    if (password !== confirm) throw new Error('Passwords do not match.');
  }
  return { name: name.trim(), email: email.trim(), identifier: identifier.trim(), password };
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');
  const config = await readConfig();

  if (!config.name || !config.identifier) throw new Error('Name and identifier are required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email)) throw new Error('Enter a valid email address.');
  if (!config.password || config.password.length < 12) {
    throw new Error('Password must be at least 12 characters.');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const existing = await User.findOne({ role: 'platform_admin', email: config.email });
  if (existing) {
    console.log(`A platform administrator with ${config.email} already exists; nothing changed.`);
    return;
  }

  await User.create({ ...config, role: 'platform_admin', status: 'active' });
  console.log(`Created platform administrator ${config.email}.`);
  console.log('Sign in with a blank institution code. Remove PLATFORM_ADMIN_PASSWORD from .env if it is set there.');
}

main()
  .catch((error) => {
    console.error(`Could not create platform administrator: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
