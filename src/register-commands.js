require('dotenv').config()

const fs = require('fs')
const util = require('util')
const readFile = util.promisify(fs.readFile)
const path = require('path')

const { Client, IntentsBitField, REST, Routes } = require('discord.js')
const { SlashCommandBuilder } = require('@discordjs/builders')
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

const guildCommands = [
    new SlashCommandBuilder()
        .setName('kills')
        .setDescription("Display your kill count for any weapon from Charlemagne")
        .addStringOption(option =>
            option.setName('guardian')
                .setDescription('The name of the Guardian you want to look up')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('weapon')
                .setDescription('The name of the weapon you want to look up')
                .setRequired(false)
                .setAutocomplete(true))
        .setDMPermission(false)
        .toJSON(),

    new SlashCommandBuilder()
        .setName('create')
        .setDescription('not visible')
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('Create a weapon leaderboard in a new text channel (admins only)')
                .addStringOption(option =>
                    option.setName('weapon')
                        .setDescription('The name of the weapon the leaderboard tracks')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .setDefaultMemberPermissions(0)
        .setDMPermission(false)
        .toJSON(),

    new SlashCommandBuilder()
        .setName('update')
        .setDescription('not visible')
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('Manually trigger a leaderboard update (admins only)')
                .addStringOption(option =>
                    option.setName('weapon')
                        .setDescription('The name of the weapon for which leaderboard updates')
                        .setRequired(false)
                        .setAutocomplete(true)))
        .setDefaultMemberPermissions(0)
        .setDMPermission(false)
        .toJSON()
]

const globalCommands = [
    new SlashCommandBuilder()
        .setName('donate')
        .setDescription('Donations help keep me running. Thank you!')
        .toJSON()
]

let botId = ''
let manual = false

client.on('ready', async c => {
    botId = c.user.id
    if (manual) await registerGuildCommands().catch(console.error)
    await rest.put(Routes.applicationCommands(botId), { body: globalCommands })
    console.log('Registered Donate command')
    client.destroy()
})

async function registerGuildCommands() {
    const registerGuilds = JSON.parse(await readFile(registerGuildsPath, 'utf8'))
    for (const guild of registerGuilds) {
        await rest.put(
            Routes.applicationGuildCommands(botId, guild.guildId), { body: guildCommands }
        )
        console.log(`Registered commands for ${guild.guildName}`)
    }
}

async function registerAllCommands(main) {
    manual = main
    client.login(process.env.DISCORD_BOT_TOKEN)
}

async function registerFromIndex(guild, botId) {
    if (!guild) {
        registerAllCommands(false)
        return
    }
    let guildName = guild.name
    try {
        await rest.put(
            Routes.applicationGuildCommands(botId, guild.id), { body: guildCommands }
        )
        console.log(`Registered commands for ${guildName} successfully`)
    } catch (error) {
        console.log(`Failed to register commands for ${guildName}\n\n`, error)
    }
}

module.exports = registerFromIndex

if (require.main === module) registerAllCommands(true)