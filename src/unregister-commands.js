require('dotenv').config()

const fs = require('fs')
const util = require('util')
const readFile = util.promisify(fs.readFile)
const path = require('path')

const { Client, IntentsBitField, REST, Routes } = require('discord.js')
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN)

const registerGuildsPath = path.resolve(__dirname, '../data/guilds.json')

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.GuildMessageReactions,
    ]
})

const commands = []

let botId = ''

client.on('ready', async c => {
    botId = c.user.id
    await registerCommands().catch(console.error)
    await rest.put(
        Routes.applicationCommands(botId), { body: [] }
      )
    client.destroy()
})

async function registerCommands() {
    const registerGuilds = JSON.parse(await readFile(registerGuildsPath, 'utf8'))
    for (const guild of registerGuilds) {
        await rest.put(
            Routes.applicationGuildCommands(botId, guild.guildId), { body: commands }
        )
        console.log(`Unregistered commands for ${guild.guildName}`)
    }
}

if (require.main === module) {
    client.login(process.env.DISCORD_BOT_TOKEN)
}