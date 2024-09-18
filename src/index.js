require('dotenv').config()

const fs = require('fs')
const path = require('path')
const util = require('util')
const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)
const { HttpsProxyAgent } = require('https-proxy-agent')
const { Client, IntentsBitField, PermissionsBitField, ActivityType } = require('discord.js')

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.GuildMessageReactions,
    ]
})

const axios = require('axios')
const cheerio = require('cheerio')

const guildsPath = path.resolve(__dirname, '../data/guilds.json')
const leaderboardChannelsPath = path.resolve(__dirname, '../data/leaderboardChannels.json')

let dataDir = path.resolve(__dirname, `../data`)
let leaderboardsDir = path.resolve(__dirname, `../leaderboards`)
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir)
    fs.mkdirSync(leaderboardsDir)
    const registerFromIndex = require('./register-commands.js')
    registerFromIndex(null, null)
}

let readFromFiles = false
let weapons = []
let leaderboardWeapons = []
let leaderboardMap = {}
let leaderboardChannelIds = []
let guardianMap = {}
let trackedGuardians
let proxyAgent

getWeapons().then(async () => {
    if (!fs.existsSync(guildsPath)) {
        await writeFile(guildsPath, '[]')
    }
    if (!fs.existsSync(leaderboardChannelsPath)) {
        await writeFile(leaderboardChannelsPath, '{}')
    }
    await getProxyAgent()
    await rwGuardians()
    client.login(process.env.DISCORD_BOT_TOKEN)
})

client.on('ready', async c => {
    try {
        client.user.setActivity({
            type: ActivityType.Custom,
            name: '/kills'
        })
        console.log(`${c.user.tag} is online`)
        setInterval(updateAllLeaderboards, 1000 * 60 * 60 * 24)
    } catch (error) {
        console.error(error.message)
    }
})

client.on('guildCreate', async guild => {
    try {
        let data = await readFile(guildsPath, 'utf8')
        if (!data.trim()) {
            data = '[]'
            await writeFile(guildsPath, data)
        }

        let registerGuilds = JSON.parse(data)
        registerGuilds.push({
            guildName: guild.name,
            guildId: guild.id
        })
        await writeFile(guildsPath, JSON.stringify(registerGuilds, null, 2))
        const registerFromIndex = require('./register-commands.js')
        await registerFromIndex(guild, client.user.id)
    } catch (error) {
        console.error(error.message)
    }
})

client.on('guildDelete', async guild => {
    try {
        for (let [weapon, guildData] of Object.entries(leaderboardMap)) {
            const tempMap = guildData.filter(item => item.guildId !== guild.id)
            if (tempMap.length === 0) {
                delete leaderboardMap[weapon]
            } else {
                leaderboardMap[weapon] = tempMap
            }
        }
        await writeFile(leaderboardChannelsPath, JSON.stringify(leaderboardMap, null, 2))

        let registerGuilds = JSON.parse(await readFile(guildsPath, 'utf8'))
        registerGuilds = registerGuilds.filter(item => item.guildId !== guild.id)
        await writeFile(guildsPath, JSON.stringify(registerGuilds, null, 2))
        readFromFiles = false
        await rwGuardians()
    } catch (error) {
        console.error(error.message)
    }
})

client.on('messageCreate', async message => {
    try {
        if (leaderboardChannelIds.includes(message.channel.id)) {
            if (message.author.id !== client.user.id || message.content === 'Self destructing...') {
                message.delete()
            }
            return
        }
    } catch (error) {
        console.error(error.message)
    }
})

client.on('channelDelete', async channel => {
    try {
        for (let [weapon, guildData] of Object.entries(leaderboardMap)) {
            const tempMap = guildData.filter(item => item.channelId !== channel.id)
            if (tempMap.length !== guildData.length) {
                if (tempMap.length === 0) {
                    delete leaderboardMap[weapon]
                } else {
                    leaderboardMap[weapon] = tempMap
                }
            }
        }
        await writeFile(leaderboardChannelsPath, JSON.stringify(leaderboardMap, null, 2))
        readFromFiles = false
        await rwGuardians()
    } catch (error) {
        console.error(error.message)
    }
})

client.on('interactionCreate', async interaction => {
    try {
        let replied = false
        if (!interaction.isCommand() && !interaction.isAutocomplete()) return
        if (interaction.commandName === 'kills') {
            if (interaction.isCommand()) {
                if (leaderboardChannelIds.includes(interaction.channel.id)) {
                    interaction.reply('Self destructing...')
                    replied = true
                }
                
                let weapon = await interaction.options.getString('weapon')
                let guildId = interaction.guild.id
                if (!weapon) {
                    let found = false
                    for (let weaponKey in leaderboardMap) {
                        let guilds = leaderboardMap[weaponKey]
                        for (let guild of guilds) {
                            if (guild.guildId === guildId && guild.autofill === true) {
                                weapon = weaponKey
                                found = true
                                break
                            }
                        }
                        if (found) break
                    }
                    if (!found) weapon = 'Cryosthesia 77K'
                } else if (!weapons.some(w => w.toLowerCase() === weapon.toLowerCase())) {
                    if (!replied) interaction.reply('Please select a valid weapon')
                    return
                } else if (!weapons.includes(weapon)) {
                    for (w of weapons) {
                        if (weapon.toLowerCase() === w.toLowerCase()) {
                            weapon = w
                            break
                        }
                    }
                }
                if (!replied) await interaction.deferReply()
                let guardian = await interaction.options.getString('guardian')
                let kills
                let range
                let overrideId = false
                let overrideKills
                let weaponGuardians = guardianMap[weapon]
                let guardianData 
                if (/^.*#\d{4}$/.test(guardian)) {
                    guardian = [...trackedGuardians].find(g => g.toLowerCase() === guardian.toLowerCase()) || guardian
                    guardianData = weaponGuardians?.find(g => g.bungieId === guardian)
                    if (!guardianData) {
                        for (let i = 0; i < leaderboardWeapons.length; i++) {
                            let w = leaderboardWeapons[i]
                            weaponGuardians = guardianMap[w]
                            guardianData = weaponGuardians?.find(g => g.bungieId === guardian)
                            if (guardianData) {
                                guardianData = { membershipId: guardianData.membershipId , bungieId: guardianData.bungieId, kills: 0, range: 0, accountType: guardianData.accountType }
                                break
                            }
                        }
                    }
                } else if (interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    if (/^.* - .*$/.test(guardian)) {
                        let parts = guardian.split(' - ')
                        let part1 = parts.slice(0, -1).join(' - ')
                        let part2 = parts[parts.length - 1].replace(/,/g, '')
                        overrideKills = part2
                        if (/^\d{19}$/.test(part1)) {
                            overrideId = true
                            guardian = part1
                        } else if (/^.*#\d{4}$/.test(part1)) {
                            guardian = part1
                            guardian = [...trackedGuardians].find(g => g.toLowerCase() === guardian.toLowerCase()) || guardian
                            guardianData = weaponGuardians?.find(g => g.bungieId === guardian)
                            if (!guardianData) {
                                for (let i = 0; i < leaderboardWeapons.length; i++) {
                                    let w = leaderboardWeapons[i]
                                    weaponGuardians = guardianMap[w]
                                    guardianData = weaponGuardians?.find(g => g.bungieId === guardian)
                                    if (guardianData) {
                                        guardianData = { membershipId: guardianData.membershipId , bungieId: guardianData.bungieId, kills: 0, range: 0, accountType: guardianData.accountType }
                                        break
                                    }
                                }
                            }
                        }
                    } else {
                        if (/^\d{19}$/.test(guardian)) overrideId = true
                    }
                }
                if (!guardianData && !overrideId) {
                    let { membershipId, guardian: bungieId, accountType } = await fetchMembershipId(guardian, weapon, interaction.guild.name)
                    if (!membershipId) {
                        if (!replied) interaction.editReply(bungieId)
                        return
                    }
                    if (overrideKills) {
                        guardianData = { membershipId, bungieId, kills: overrideKills * 1, range: 0, accountType }
                    } else {
                        guardianData = { membershipId, bungieId, kills: 0, range: 0, accountType }
                    }
                    ({ kills, range } = await fetchKills(guardianData, weapon, proxyAgent))
                    if (!replied) await interaction.editReply(await generateOutput(kills, range, weapon, guardianData))
                    await rwGuardians()
                    return
                } else if (overrideId) {
                    let membershipId = guardian
                    let accountType = await fetchAccountType(membershipId)
                    let bungieId = await fetchBungieId(membershipId, accountType)
                    if (!bungieId) {
                        if (!replied) await interaction.editReply('Invalid URL numbers')
                        return
                    } else if (bungieId === 'D2 API is currently down') {
                        if (!replied) await interaction.editReply(bungieId)
                        return
                    }
                    guardianData = weaponGuardians?.find(g => g.bungieId === bungieId)
                    if (guardianData) {
                        if (overrideKills) {
                            if (overrideKills.toLowerCase() === 'remove') {
                                if (!replied) await interaction.editReply(`Removed ${bungieId} from the leaderboards`)
                                for (let i = 0; i < leaderboardWeapons.length; i++) {
                                    weapon = leaderboardWeapons[i]
                                    weaponGuardians = guardianMap[weapon]
                                    guardianData = weaponGuardians?.find(g => g.bungieId === bungieId)
                                    if (guardianData) {
                                        let guardianIndex = guardianMap[weapon].findIndex(g => g.bungieId === bungieId)
                                        guardianMap[weapon].splice(guardianIndex, 1)
                                        await writeLeaderboard(weapon)
                                    }
                                }
                                trackedGuardians.delete(bungieId)
                                return
                            }  
                            guardianData = { membershipId, bungieId: guardianData.bungieId, kills: overrideKills * 1, range: guardianData.range, accountType }
                        } else {
                            guardianData = { membershipId, bungieId: guardianData.bungieId, kills: guardianData.kills, range: guardianData.range, accountType }
                        }
                    } else {
                        guardianData = { membershipId, bungieId, kills: 0, range: 0, accountType }
                        if (overrideKills) {
                            guardianData = { membershipId, bungieId, kills: overrideKills * 1, range: 0, accountType }
                        } else {
                            guardianData = { membershipId, bungieId, kills: 0, range: 0, accountType }
                        }
                    }
                    ({ kills, range } = await fetchKills(guardianData, weapon, proxyAgent))
                    if (!replied) await interaction.editReply(await generateOutput(kills, range, weapon, guardianData))
                    await rwGuardians()
                    return
                }
                if (overrideKills) {
                    if (overrideKills.toLowerCase() === 'remove') {
                        if (!replied) await interaction.editReply(`Removed ${guardian} from the leaderboards`)
                        for (let i = 0; i < leaderboardWeapons.length; i++) {
                            weapon = leaderboardWeapons[i]
                            weaponGuardians = guardianMap[weapon]
                            guardianData = weaponGuardians?.find(g => g.bungieId === guardian)
                            if (guardianData) {
                                let guardianIndex = guardianMap[weapon].findIndex(g => g.bungieId === guardian)
                                guardianMap[weapon].splice(guardianIndex, 1)
                                await writeLeaderboard(weapon)
                            }
                        }
                        trackedGuardians.delete(guardian)
                        return
                    }               
                    guardianData = { membershipId: guardianData.membershipId , bungieId: guardianData.bungieId, kills: overrideKills * 1, range: guardianData.range, accountType: guardianData.accountType }
                }
                ({ kills, range } = await fetchKills(guardianData, weapon, proxyAgent))
                if (!replied) await interaction.editReply(await generateOutput(kills, range, weapon, guardianData))
                let currentBungieId = await fetchBungieId(guardianData.membershipId, guardianData.accountType)
                if (currentBungieId === 'D2 API is currently down')
                if (currentBungieId !== guardian && currentBungieId !== 'D2 API is currently down') {
                    let guardianIndex = guardianMap[weapon].findIndex(g => g.bungieId === guardian)
                    guardianMap[weapon][guardianIndex].bungieId = currentBungieId
                    trackedGuardians.delete(guardian)
                    trackedGuardians.add(currentBungieId)
                }
                await rwGuardians()
            } else if (interaction.isAutocomplete()) {
                const option = interaction.options.getFocused(true)
                if (option.name === 'guardian') {
                    const input = interaction.options.getString('guardian')
                    if (input) {
                        const guardianArray = Array.from(trackedGuardians)
                        const matches = guardianArray.filter(g => g && g.toLowerCase().includes(input.toLowerCase())).map(g => ({ name: g, value: g }))
                        if (matches.length > 0) {
                            interaction.respond(matches.slice(0, 12))
                        }
                    }
                } else if (option.name === 'weapon') {
                    const input = interaction.options.getString('weapon')
                    const matches = weapons.filter(w => w && w.toLowerCase().includes(input.toLowerCase())).map(w => ({ name: w, value: w }))
                    interaction.respond(matches.slice(0, 12))
                }            
            }        
        }

        if (interaction.commandName === 'create') {
            if (interaction.isCommand()) {
                if (leaderboardChannelIds.includes(interaction.channel.id)) {
                    interaction.reply('Self destructing...')
                    replied = true
                }
                let weapon = await interaction.options.getString('weapon')
                if (!weapons.some(w => w.toLowerCase() === weapon.toLowerCase())) {
                    if (!replied) interaction.reply('Please select a valid weapon')
                    return
                } else if (!weapons.includes(weapon)) {
                    for (w of weapons) {
                        if (weapon.toLowerCase() === w.toLowerCase()) {
                            weapon = w
                            break
                        }
                    }
                }

                for (let weaponKey in leaderboardMap) {
                    if (weaponKey.toLowerCase() === weapon.toLowerCase()) {
                        let guilds = leaderboardMap[weaponKey]
                        for (let guild of guilds) {
                            if (guild.guildId === interaction.guildId) {
                                if (!replied) await interaction.reply({ content: `The **${weapon} Leaderboard** already exists in ${interaction.guild.name}!`, ephemeral: true })
                                return
                            }
                        }
                    }
                }

                let guild = client.guilds.cache.get(interaction.guild.id)
                let channelId
                await guild.channels.create({
                    name: `${weapon.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/--+/g, '-')}-leaderboard`,
                    type: 0,
                    parent: interaction.channel.parent
                }).then(channel => {
                    channelId = channel.id
                }).catch(console.error)

                if (channelId) {
                    const channel = client.channels.cache.get(interaction.channel.id)
                    if (!replied) {
                        await channel.send(`The **${weapon} Leaderboard** has been added to ${interaction.guild.name}!`)
                        await interaction.reply({ content: `Feel free to move the leaderboard between categories and change the name from **${weapon.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/--+/g, '-')}-leaderboard** to anything you like!`, ephemeral: true })
                    }
                    let autofill = true
                    for (let weaponKey in leaderboardMap) {
                        let guilds = leaderboardMap[weaponKey]
                        for (let guild of guilds) {
                            if (guild.guildId === interaction.guildId && guild.autofill === true) {
                                autofill = false
                                break
                            }
                        }
                        if (!autofill) break
                    }
                    await addChannel(weapon, guild.name, guild.id, channelId, autofill)
                } else {
                    if (!replied) await interaction.reply({ content: 'Unable to add leaderboard - missing permissions', ephemeral: true })
                }
            } else if (interaction.isAutocomplete()) {
                const input = interaction.options.getString('weapon')
                const matches = (weapons.filter(w => w.toLowerCase()
                    .includes(input.toLowerCase())).map(w => ({ name: w, value: w })))
                interaction.respond(matches.slice(0, 12))
            }
        }

        if (interaction.commandName === 'update') {
            if (interaction.isCommand()) {
                let weapon = await interaction.options.getString('weapon')
                let guildId = interaction.guild.id
                let message = ""
                if (!weapon) {
                    let found = false
                    for (let weaponKey in leaderboardMap) {
                        let guilds = leaderboardMap[weaponKey]
                        for (let guild of guilds) {
                            if (guild.guildId === guildId && guild.autofill === true) {
                                weapon = weaponKey
                                found = true
                                break
                            }
                        }
                        if (found) break
                    }
                    if (leaderboardWeapons.length === 0) {
                        message += 'There are no leaderboards'
                    } else if (leaderboardWeapons.includes('Cryosthesia 77K')) {
                        if (!found) weapon = 'Cryosthesia 77K'
                    } else {
                        if (!found) weapon = leaderboardWeapons[0]
                    }
                } else if (!leaderboardWeapons.some(w => w.toLowerCase() === weapon.toLowerCase())) {
                    message += 'Please select an existing weapon leaderboard'
                } else if (!leaderboardWeapons.includes(weapon)) {
                    for (w of weapons) {
                        if (weapon.toLowerCase() === w.toLowerCase()) {
                            weapon = w
                            break
                        }
                    }
                }

                if (leaderboardChannelIds.includes(interaction.channel.id)) {
                    interaction.reply('Self destructing...')
                    await updateLeaderboard(weapon)
                    return
                }
                if (message === "") message += `Updating the **${weapon} Leaderboard**`
                interaction.reply(message)
                await updateLeaderboard(weapon)
            } else if (interaction.isAutocomplete()) {
                const input = interaction.options.getString('weapon')
                const matches = (leaderboardWeapons.filter(w => w.toLowerCase()
                    .includes(input.toLowerCase())).map(w => ({ name: w, value: w })))
                interaction.respond(matches.slice(0, 12))
            }
        }

        if (interaction.commandName === 'donate') {
            if (interaction.isCommand()) {
                if (leaderboardChannelIds.includes(interaction.channel.id)) {
                    interaction.reply('Self destructing...')
                    return
                }
                interaction.reply('Donations help keep me running. [Thank you!](https://paypal.me/chaseborchers)')
            }
        }
    } catch (error) {
        console.error(error.message)
    }
})

async function getWeapons() {
    const { getWeapons } = await import('./weapons.mjs')
    weapons = await getWeapons()
}

async function sortWeapons() {
    weapons = weapons.sort((nameA, nameB) => {
        const indexA = leaderboardWeapons.indexOf(nameA)
        const indexB = leaderboardWeapons.indexOf(nameB)
        if (indexA === -1 && indexB === -1) return nameA.localeCompare(nameB)
        if (indexA === -1) return 1
        if (indexB === -1) return -1
        return indexA - indexB
    })
}

async function getProxyAgent() {
    // ********************************LOCATIONS********************************
    // WORLDWIDE -> gate.smartproxy.com:7000 (slow)
    // USA -> us.smartproxy.com:10000
    // REST -> https://dashboard.smartproxy.com/residential-proxies/proxy-setup
    // *************************************************************************
    proxyAgent = new HttpsProxyAgent(`https://${process.env.SMARTPROXY_USERNAME}:${process.env.SMARTPROXY_PASSWORD}@us.smartproxy.com:10000`)
}

async function rwGuardians() {
    if (!readFromFiles) {
        trackedGuardians = new Set()
        let data = await readFile(leaderboardChannelsPath, 'utf8')
        if (!data.trim()) {
            data = '{}'
            await writeFile(leaderboardChannelsPath, data)
        }
        leaderboardMap = JSON.parse(data)
    }
    leaderboardWeapons = []
    leaderboardChannelIds = []
    for (let [weapon, guildData] of Object.entries(leaderboardMap)) {
        leaderboardWeapons.push(weapon)
        for (let leaderboard of guildData) {
            leaderboardChannelIds.push(leaderboard.channelId)
        }

        let weaponDir = path.resolve(__dirname, `../leaderboards/${weapon}`)
        let guardiansPath = path.resolve(weaponDir, 'guardians.json')
        let leaderboardPath = path.resolve(weaponDir, 'leaderboard.txt')
        if (!fs.existsSync(weaponDir)) {
            fs.mkdirSync(weaponDir)
            await writeFile(guardiansPath, '[]')
            await writeFile(leaderboardPath, '')
        }

        if (!readFromFiles) {
            let data = await readFile(guardiansPath, 'utf8')
            if (!data) continue
            let guardians = JSON.parse(data)
            guardianMap[weapon] = guardians
            guardians.sort((a, b) => b.kills - a.kills)
            for (let guardian of guardians) {
                trackedGuardians.add(guardian.bungieId)
            }

            let json = '[ ' + guardians.map(g => JSON.stringify(g)).join(',\n  ') + ' ]'
            await writeFile(guardiansPath, json)
        } else {
            guardianMap[weapon].sort((a, b) => b.kills - a.kills)
            await writeFile(guardiansPath, '[ ' + Object.values(guardianMap[weapon]).flat().map(JSON.stringify).join(',\n  ') + ' ]')
        }
    }
    readFromFiles = true
    await sortWeapons()
}

async function fetchKills(guardian, weapon, proxyAgent) {
    const maxRetries = 5
    const retryDelay = 7000
    let retries = 0

    while (retries < maxRetries) {
        try {
            const response = await Promise.race([
                axios.get('https://warmind.io/crucible/' + guardian.membershipId, {
                    httpsAgent: proxyAgent,
                }),
                new Promise((resolve, reject) => {
                    setTimeout(() => reject(new Error('Initial request timeout')), retryDelay)
                })
            ])
            const html = response.data
            const $ = cheerio.load(html)
            let kills = 0
            $('td.h4').each(function () {
                if ($(this).text().trim() === weapon) {
                    kills = $(this).next().text().replace(/,/g, '') * 1
                    return false
                }
            })
            if (guardian.kills !== 0 && kills === 0) {
                kills = guardian.kills
            }
            let range = (kills < 5000) ? Math.floor(kills / 1000) * 1000 : Math.floor(kills / 5000) * 5000
            return { kills, range }
        } catch (error) {
            if (retries <= maxRetries) {
                console.log((error.code ? `Request failed with ${error.code}` : 'Initial request timed out') + `, retrying (${retries + 1}/${maxRetries})...`)
            }
            await new Promise(resolve => setTimeout(resolve, retryDelay))
        }
        retries++
    }

    throw new Error(`Failed to scrape kills after ${maxRetries} attempts.`)
}

async function fetchMembershipId(guardian, weapon, guild) {
    const encodedBungieId = encodeURIComponent(guardian)
    const bungieId = guardian
    let membershipId
    let accountType
    try {
        const response = await axios.get(`https://www.bungie.net/Platform/Destiny2/SearchDestinyPlayer/-1/${encodedBungieId}/`, { headers: { 'X-API-Key': process.env.D2_API_KEY } })
        let maxTime = 0
        if (response.data.Response.length === 0) {
            guardian =  `${guardian} doesn't exist; check spelling and hashtag identifier`
            return { guardian, membershipId, accountType }
        }
        const promisePlatforms = response.data.Response.map(async (platform) => {
            try {
                const statsResponse = await axios.get(`https://www.bungie.net/Platform/Destiny2/${platform.membershipType}/Account/${platform.membershipId}/Stats/`, { headers: { 'X-API-Key': process.env.D2_API_KEY } })
                const timePlayed = statsResponse.data.Response.mergedAllCharacters.results.allPvP.allTime.secondsPlayed.basic.value
                if (timePlayed > maxTime) {
                    maxTime = timePlayed
                    membershipId = platform.membershipId
                    guardian = platform.bungieGlobalDisplayName +  '#' + String(platform.bungieGlobalDisplayNameCode).padStart(4, '0')
                    accountType = platform.membershipType
                }
            } catch (error) {
                if (!(error instanceof TypeError) && (!error.response || error.response.status !== 500)) {
                    console.error(error)
                }
            }
        })
        await Promise.all(promisePlatforms)
        return { guardian, membershipId, accountType }
    } catch (error) {
        if (!(error instanceof TypeError)) {
            guardian = 'D2 API is currently down'
        }
        if (!error.response || error.response.status === 400 || error.response.status === 500) {
            guardian = 'D2 API response error; Insert 19-digit membership ID as Guardian name.\nThis can be found in the URL at Guardian tracking websites such as Trials Report or Charlemagne.'
        }
        return { guardian, membershipId, accountType }
    }    
}

async function fetchAccountType(membershipId) {
    let accountType = 0
    while (true) {
        try {
            const response = await axios.get(`https://www.bungie.net/Platform/Destiny2/${accountType}/Profile/${membershipId}/?components=100`, { headers: { 'X-API-Key': process.env.D2_API_KEY } })
            if (response.data.Response) {
                return accountType
            }
        } catch (error) {
            if (!(error instanceof TypeError) && (!error.response || error.response.status !== 500)) {
                // do nothing
            }
        }
        accountType++
    }
}

async function fetchBungieId(membershipId, accountType) {
    try {
        const response = await axios.get(`https://www.bungie.net/Platform/Destiny2/${accountType}/Profile/${membershipId}/?components=100`, { headers: { 'X-API-Key': process.env.D2_API_KEY } })
        let bungieId = await response.data.Response.profile.data.userInfo.bungieGlobalDisplayName + '#' + String(response.data.Response.profile.data.userInfo.bungieGlobalDisplayNameCode).padStart(4, '0')
        return bungieId
    } catch (error) {
        if (error.response.status !== 503) console.error(error)
        return 'D2 API is currently down'
    }
}

async function generateOutput(kills, range, weapon, guardianData) {
    let guardian = guardianData.bungieId
    if (leaderboardWeapons.includes(weapon)) {
        let guardianIndex = guardianMap[weapon].findIndex(g => g.membershipId === guardianData.membershipId)
        if (guardianIndex !== -1) {
            if (!trackedGuardians.has(guardian)) {
                trackedGuardians.delete(guardianMap[weapon][guardianIndex].bungieId)
                guardianMap[weapon][guardianIndex].bungieId = guardian
                guardianData.range = guardianMap[weapon][guardianIndex].range
            }
            guardianMap[weapon][guardianIndex].kills = kills
            if (kills === 0) return `${weapon} is not in ${b(guardian)}'s top 10 weapons`
        } else {
            if (!trackedGuardians.has(guardian)) {
                trackedGuardians.add(guardian)
            }
            if (kills === 0) {
                if (guardianMap[leaderboardWeapons[0]]) {
                    guardianMap[leaderboardWeapons[0]].push({
                        membershipId: guardianData.membershipId,
                        bungieId: guardian,
                        kills: 0,
                        range: 0,
                        accountType: guardianData.accountType
                    })
                }
                return `${weapon} is not in ${b(guardian)}'s top 10 weapons`
            } else {
                guardianMap[weapon] = guardianMap[weapon] || []
                guardianMap[weapon].push({
                    membershipId: guardianData.membershipId,
                    bungieId: guardian,
                    kills: kills,
                    range: 0,
                    accountType: guardianData.accountType,
                })
            }
            guardianIndex = guardianMap[weapon].findIndex(g => g.membershipId === guardianData.membershipId)
        }
        let output = `${b(guardian)} has ${k(kills)} kills with ${weapon}`
        if (guardianData.range !== range) {
            if (guardianData.range === 0) {
                output += ` - added to ${r(range)}+`
            } else {
                output += ` - moved to ${r(range)}+`
            }
            guardianMap[weapon][guardianIndex].range = range
            writeLeaderboard(weapon)
        }
        return output
    } else {
        if (!trackedGuardians.has(guardian)) {
            trackedGuardians.add(guardian)
            if (guardianMap[leaderboardWeapons[0]]) {
                guardianMap[leaderboardWeapons[0]].push({
                    membershipId: guardianData.membershipId,
                    bungieId: guardian,
                    kills: 0,
                    range: 0,
                    accountType: guardianData.accountType
                })
            }
        }
        if (kills === 0) {
            return `${weapon} is not in ${b(guardian)}'s top 10 weapons`
        }
        return `${b(guardian)} has ${k(kills)} kills with ${weapon}`
    }
}

async function addChannel(weapon, guildName, guildId, channelId, autofill) {
    let guildData = leaderboardMap[weapon]
    if (guildData) {
        guildData.push({ guildName, guildId, channelId, autofill })
    } else {
        guildData = [{ guildName, guildId, channelId, autofill }]
        leaderboardMap[weapon] = guildData
    }
    readFromFiles = false
    await writeFile(leaderboardChannelsPath, JSON.stringify(leaderboardMap, null, 2))
    await writeLeaderboard(weapon)
}

async function updateLeaderboard(weapon) {
    for (let weaponName in guardianMap) {
        if (weaponName === weapon) {
            const promiseBungieIds = guardianMap[weapon].map(async (guardianData) => {
                let currentBungieId = await fetchBungieId(guardianData.membershipId, guardianData.accountType)
                let guardianIndex = guardianMap[weapon].findIndex(g => g.bungieId === guardianData.bungieId)
                if (currentBungieId !== guardianData.bungieId) {
                    guardianMap[weapon][guardianIndex].bungieId = currentBungieId
                    trackedGuardians.delete(guardianData.bungieId)
                    trackedGuardians.add(currentBungieId)
                }
            })
            await Promise.all(promiseBungieIds)
            await rwGuardians()
            const guardians = guardianMap[weapon]
            const groupSize = 15
            for (let i = 0; i < guardians.length; i += groupSize) {
                const group = guardians.slice(i, i + groupSize)
                const promiseKills = group.map(async (guardian) => {
                    let { kills, range } = await fetchKills(guardian, weapon, proxyAgent)
                    guardian.kills = kills
                    guardian.range = range
                })
                await Promise.all(promiseKills)
                setTimeout(() => {}, 1000)
            }
            break
        }
    }
    writeLeaderboard(weapon)
}

async function writeLeaderboard(weapon) {
    await rwGuardians()
    let totalKills = 0
    let weaponDir = path.resolve(__dirname, `../leaderboards/${weapon}`)
    let leaderboardPath = path.resolve(weaponDir, 'leaderboard.txt')
    let leaderboardTxt = ''
    const leaderboard = leaderboardMap[weapon]
    for (let { channelId, guildId } of leaderboard) {
        const channel = client.channels.cache.get(channelId)
        let messages
        try {
            messages = await channel.messages.fetch().catch(console.error.message)
        } catch (error) {
            let owner = await client.guilds.cache.get(guildId).fetchOwner()
            client.users.fetch(owner, false).then((user) => {
                user.send(`I need the \`View Channel\` permission for the **${weapon} Leaderboard** to update it!`)
            })
            continue
        }
        await channel.bulkDelete(messages)
        channel.send(`## ${weapon} Leaderboard`)
        leaderboardTxt += `## ${weapon} Leaderboard\n\n`

        let currentRange = null
        let message = ''
        let messageCount = 0
        
        for (let guardian of guardianMap[weapon]) {
            if (guardian.range > 0) {
                if (currentRange !== guardian.range) {
                    if (message) {
                        channel.send(message)
                        leaderboardTxt += message + '\n'
                        message = ''
                        messageCount = 0
                    }
                    currentRange = guardian.range
                    message += `## __${k(guardian.range).replace(',', '__,__')}+__\n`
                }
                message += `${guardian.bungieId.replace(/(^#|[*_])/g, '\\$1')} - ${k(guardian.kills)}\n`
                messageCount++
                totalKills += guardian.kills
                if (messageCount >= 75) {
                    channel.send(message)
                    leaderboardTxt += message + '\n'
                    message = `\n`
                    messageCount = 1
                }
            }
        }
        
        if (message) {
            channel.send(message)
            leaderboardTxt += message + '\n'
        }
        channel.send(`## Total Kills - ${k(totalKills)}`)
        leaderboardTxt += `## Total Kills - ${k(totalKills)}`
    }
    await writeFile(leaderboardPath, leaderboardTxt)
}

async function updateAllLeaderboards() {
    for (let weapon in guardianMap) {
        await updateLeaderboard(weapon)
    }
}

function k(kills) {
    return kills.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function b(bungieId) {
    return bungieId.slice(0, -5).replace(/(^#|[*_])/g, '\\$1')
}

function r(range) {
    return range.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}