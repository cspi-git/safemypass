# SafeMyPass
SafeMyPass is a Discord bot that checks if your password has been compromised and checks your saved passwords for breaches on a daily basis.

## Installation
Github:
```
git clone https://github.com/cspi-git/safemypass
```

NpmJS:
```
npm i mongodb pagination.djs bottleneck request-async discord.js@13.3.1 hash.js crypto dotenv
```

## Setup
1. Create a MongoDB database at https://mongodb.com/
2. Open **.env** and set the MongoDB access URL, making sure to set the MongoDB database (MONGODB_DB) and it's collection (MONGODB_CL).
3. Create a strong password for the encryption key (MASTER_KEY) and make sure It's 32 bytes. As for the IV (AES_IV), make sure it's 16 bytes.
4. Lastly put your Discord bot token on **BOT_TOKEN** value.

## Usage
```
node index.js
```

## Data Safety
Everything is encrypted using AES256-CBC except the compromised property on the database. Keep in mind that this also depends on who's running the Discord bot and where it's hosted. Zero-Knowledge policy is not implemented in SafeMyPass.

## License
MIT © CSPI