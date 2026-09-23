import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { envNumber, requiredEnv } from "./env.js";

async function main() {
  const apiId = envNumber("TELEGRAM_API_ID");
  const apiHash = requiredEnv("TELEGRAM_API_HASH");
  const rl = readline.createInterface({ input, output });
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: () => rl.question("Telegram phone number: "),
    password: () => rl.question("Two-step password, if Telegram asks for it: "),
    phoneCode: () => rl.question("Login code from Telegram: "),
    onError: (error) => console.error(error),
  });

  console.log("\nSave this in backend/.env as TELEGRAM_STRING_SESSION:");
  console.log(client.session.save());
  await client.disconnect();
  rl.close();
}

main().catch((error) => {
  console.error("[login] failed", error);
  process.exit(1);
});
