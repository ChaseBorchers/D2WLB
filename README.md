# D2WLB
**Destiny 2 Weapon Leaderboard Bot**    
Made with 💙 by Chase Borchers  

## Getting started
This README will guide you on installing dependencies, modifying the `.env` file, and obtaining all environment variable data from [Smartproxy](https://smartproxy.com/), [bungie.net](https://www.bungie.net/7/en/Destiny), and the [Discord Developer Portal](https://discord.com/developers/applications). You will also be guided on the Discord bot creation process and its functionality within Discord and the terminal.

## Dependencies
This project uses the latest dependency versions from [Node.js](https://nodejs.org/en/download/package-manager). Execute the following commands to install the latest dependencies required.

**Change directory to the parent directory** - `cd path/to/D2WLB`

**Install dependencies** - `npm install`

**Update dependencies** - `npm update`

## Environment variables
This project uses a `.env` file to store API keys and passwords. **DO NOT SHARE THIS FILE WITH OTHERS!**

### Modify `.env` file
Rename `template.env` to `.env` and obtain the actual values from the next section.

## Obtain keys and passwords for `.env` file

### `SMARTPROXY_USERNAME` & `SMARTPROXY_PASSWORD`
The bot needs rotating proxies to bypass rate limiting restrictions from [Charlemagne](https://warmind.io/crucible).  
Without this, two or more users triggering slash commands within a short period of time will break the bot.  

[Smartproxy](https://smartproxy.com/) is the cheapest reliable solution to bypassing web scraping restrictions found thus far.  

**[Pricing](https://dashboard.smartproxy.com/residential-proxies/pricing) (residential proxies)**
- 100MB 3-day free trial
    - ~8,000 free requests
    - Cancellable
        - Unable to make new purchases until trial expires, even if all data is used
- Pay as you go - $7/GB
    - ~80,000 requests per payment
    - Recommended
- 2GB - $12/mo
    - ~160,000 requests per month
    - Cheapest subscription but still overkill

**Obtaining Smartproxy username and password**
- Navigate to the authentication page [here](https://dashboard.smartproxy.com/residential-proxies/authentication)
    - Edit user (click `...` to the left of `Total users`)
        - Copy `USERNAME` and paste into `.env`
        - Copy `PASSWORD` and paste into `.env`

### `D2_API_KEY`
The bot uses the Destiny 2 API to obtain a Guardian's current Bungie ID, membership ID, platform, and time played.

**Obtaining a Destiny 2 API key**
- Log in to your Destiny 2 account at [bungie.net](https://www.bungie.net/7/en/Destiny)
- Create a new application [here](https://www.bungie.net/en/Application/Create)
    - Add a name
    - Leave `Website` blank
    - Set `OAuth Client Type` to `Not Applicable`
    - Leave `Redirect URL` blank
    - Leave all options under `Scope` blank
    - Leave `Origin Header` blank
    - Agree to the [Terms of Use](https://www.bungie.net/7/en/Legal/Terms) for the Bungie.net API
    - Click `Create New App` and keep `Application Status` set to `Private`
- Copy the API key and paste into `.env`

### `DISCORD_BOT_TOKEN`
The bot is set up through the Discord Developer Portal.

**Creating a Discord bot and obtaining the token**
- Log in to the [Discord Developer Portal](https://discord.com/developers/applications)
    - Your account must have a verified email address
    - Click `New Application`
        - Name the application
        - Agree to the Discord [Developer Terms of Service](https://support-dev.discord.com/hc/en-us/articles/8562894815383-Discord-Developer-Terms-of-Service) and [Developer Policy](https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy)
        - Click `Create`
    - Navigate to the `Installation` page
        - Under `Installation Contexts`, uncheck `User Install` and keep `Guild Install` selected
        - Scroll down to `Default Install Settings`
            - Add the following scopes: `applications.commands`, `bot`
            - Add the following permissions: `Manage Channels`, `Manage Messages`, `Send Messages`
        - Click `Save Changes`
        - Note: use the Discord provided link above to invite the bot to a server for the first time
    - Navigate to the `Bot` page
        - Click `Reset Token`, choose `Yes, do it!`, and provide authentication
            - Copy the token and paste into `.env`
            - Note: the token is not accessible to copy unless it is reset
        - Choose whether the bot is public or private
            - This determines who can add the bot to servers
        - Select `PRESENCE INTENT` to be on
        - Select `SERVER MEMBERS INTENT` to be on
        - Select `MESSAGE CONTENT INTENT` to be on
        - Click `Save Changes`

## Terminal commands
Once the above has been completed, you may now bring the bot online using the terminal. All following subsections must be completed while in the parent directory.

**Change directory to the parent directory** - `cd path/to/D2WLB`

### Bring the bot online
The bot must be online before servers are joined.
The following will bring the bot online. On the first launch, necessary files will be generated and global commands will be registered.

**Start `index.js`** - `node src/index.js`

### Manually register and unregister server commands
If needed, the following will register/unregister commands for all known servers within `guilds.json`:

**Register commands** - `node src/register-commands.js`

**Unregister commands** - `node src/unregister-commands.js`

## Adding the bot to servers
You must have the `Manage Server` permission for the server you are inviting the bot to.

### The bot is not in any servers and you can't access its profile within Discord
Use the Discord provided link from the bot installation page to add the bot to a server.

### You share a server with the bot and can access its profile within Discord
Click `Add App` to add the bot to a server.

## Commands
The bot includes the following commands:

### /create leaderboard
Creates a weapon leaderboard in a new text channel (admins only).

### /update leaderboard
Manually triggers a leaderboard update (admins only).

### /kills
Displays a Guardian's kill count for any weapon from Charlemagne. 
- Automatically adds the Guardian to the weapon's respective leaderboard if it exists

### /donate
Gives information on how to support the project.

## General info
- The bot automatically registers commands upon joining a new server
- The bot automatically removes information about servers upon being removed
- Leaderboards persist internally even if all leaderboard channels are deleted
- All leaderboards update automatically every 24 hours