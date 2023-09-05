(async()=>{
    "use strict";

    require("dotenv").config()

    // Dependencies
    const { Client, Intents, MessageEmbed } = require("discord.js")
    const { Pagination } = require("pagination.djs")
    const { MongoClient } = require("mongodb")
    const bottleneck = require("bottleneck")
    const request = require("request-async")
    const hashJS = require("hash.js")
    const crypto = require("crypto")
    
    // Variables
    const bCommands = require("./commands.json")
    const bot = new Client({ intents: [ Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_REACTIONS, Intents.FLAGS.DIRECT_MESSAGE_REACTIONS, Intents.FLAGS.DIRECT_MESSAGES ] })
    
    const mClient = new MongoClient(process.env.MONGODB_URL)
    const database = mClient.db(process.env.MONGODB_DB)
    const passwords = database.collection(process.env.MONGODB_CL)

    const threads = new bottleneck.default({
        maxConcurrent: 40,
        minTime: 1000,
    })

    // Functions
    const eAES256 = (string)=>{
        const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(process.env.MASTER_KEY), Buffer.from(process.env.AES_IV))
        let encrypted = cipher.update(string, "utf8", "hex")
        encrypted += cipher.final("hex")
        return encrypted
    }
    const dAES256 = (string)=>{
        const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(process.env.MASTER_KEY), Buffer.from(process.env.AES_IV))
        let decrypted = decipher.update(string, "hex", "utf8")
        decrypted += decipher.final("utf8")
        return decrypted
    }

    async function checkPassword(userID, compromised, password){
        const user = await bot.users.fetch(userID)
        if(compromised) return await user.send(`**[WARNING]** ONE OF YOUR PASSWORD IS COMPROMISED.\`\`\`${password}\`\`\``)
        const passwordHash = hashJS.sha1().update(password).digest("hex")
        const response = await request(`https://api.pwnedpasswords.com/range/${passwordHash.slice(0, 5).toUpperCase()}`)

        if(!response.body.match(passwordHash.slice(5, 40).toUpperCase())) return

        await user.send(`**[WARNING]** ONE OF YOUR PASSWORD IS COMPROMISED.\`\`\`${password}\`\`\``)
        await passwords.updateOne({ password: eAES256(password) }, { $set: { compromised: true } })
    }

    async function checkPasswords(){
        const data = await passwords.find({}).toArray()
        if(!data.length) return

        for( const password of data ) threads.schedule(checkPassword, dAES256(password.userID), password.compromised, dAES256(password.password))
    }
    
    // Main
    console.log("Connecting to the database, please wait...")
    await mClient.connect()
    console.log("Successfully connected to the database.")

    bot.on("ready", ()=>{
        bot.guilds.cache.forEach((guild)=>{guild.commands.set([])})
        bot.guilds.cache.forEach((guild)=>{guild.commands.cache.forEach((command)=>{guild.commands.delete(command)})})
        const commands = bot.application?.commands
        for( const command of bCommands ) commands?.create(command)
    
        bot.user.setActivity("Keeping your passwords safe. <3")
        console.log("SafeMyPass is running.")

        checkPasswords()
        setInterval(()=>{checkPasswords()}, 24 * 60 * 60 * 1000) // Execute commands inside every 24 hours
    })
    
    bot.on("interactionCreate", async(interaction)=>{
        if(!interaction.isCommand()) return
    
        if(interaction.commandName === "check"){
            const password = interaction.options.getString("password", true)
            const passwordHash = hashJS.sha1().update(password).digest("hex")
            const response = await request(`https://api.pwnedpasswords.com/range/${passwordHash.slice(0, 5).toUpperCase()}`)
    
            response.body.match(passwordHash.slice(5, 40).toUpperCase()) ? await interaction.reply({ content: "Your password is compromised.", ephemeral: true }) : await interaction.reply({ content: "Your password is not compromised.", ephemeral: true })
        }else if(interaction.commandName === "add"){
            const password = interaction.options.getString("password", true)
            var exists = await passwords.find({}).toArray()
            if(exists.length > +process.env.MAXIMUM_PASSWORDS) return await interaction.reply({ content: `The maximum passwords you can add is ${process.env.MAXIMUM_PASSWORDS}.`, ephemeral: true })
            exists = await passwords.findOne({ userID: eAES256(interaction.user.id), password: eAES256(password) })

            if(exists) return await interaction.reply({ content: "You have already added that password.", ephemeral: true })

            checkPassword(interaction.user.id, false, password)
            await passwords.insertOne({ userID: eAES256(interaction.user.id), password: eAES256(password), compromised: false })
            await interaction.reply({ content: "Password sucessfully added.", ephemeral: true })
        }else if(interaction.commandName === "delete"){
            const password = interaction.options.getString("password", true)
            const exists = await passwords.findOne({ userID: eAES256(interaction.user.id), password: eAES256(password) })

            if(!exists) return await interaction.reply({ content: "Password does not exists.", ephemeral: true })

            await passwords.deleteOne({ userID: eAES256(interaction.user.id), password: eAES256(password) })
            await interaction.reply({ content: "Password sucessfully deleted.", ephemeral: true })
        }else if(interaction.commandName === "list"){
            const data = await passwords.find({ userID: eAES256(interaction.user.id) }).toArray()
            if(!data.length) return await interaction.reply({ content: "No passwords found.", ephemeral: true })

            const embeds = []
            const pagination = new Pagination(interaction, {
                firstEmoji: "⏮",
                prevEmoji: "◀️",
                nextEmoji: "▶️",
                lastEmoji: "⏭",
                idle: 30000,
                ephemeral: true
            })

            for( let i = 0; i <= data.length-1; i+=10){
                const passwords = data.slice(i, i+10)
                const bPasswords = []

                for( let i2 in passwords ) bPasswords.push(`${i2+1}. ${dAES256(passwords[i2].password)} | ${passwords[i2].compromised ? "Compromised." : "Not Compromised."}`)

                const embed = new MessageEmbed()
                .setTitle("Your Passwords")
                .setDescription(bPasswords.join("\n"))
                embed.setColor("BLUE")
                embeds.push(embed)
            }

            pagination.setEmbeds(embeds)
            pagination.setEmbeds(embeds, (embed, index, array)=>{return embed.setFooter({ text: `Page ${index + 1}/${array.length}` })})
            pagination.render()
        }else if(interaction.commandName === "begone"){
            const exists = await passwords.findOne({ userID: eAES256(interaction.user.id) })

            if(!exists) return await interaction.reply({ content: "There are no data related to your account in the database.", ephemeral: true })
    
            await passwords.deleteMany({ userID: eAES256(interaction.user.id) })
            await interaction.reply({ content: "All the data related to your accounth as been deleted.", ephemeral: true })
        }
    })
    
    bot.login(process.env.BOT_TOKEN)
})()