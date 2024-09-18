import { setApiKey, setLanguage, includeTables, load, getAllInventoryItemDefs } from '@d2api/manifest-node'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { resolve } from 'path'

setApiKey(process.env.API_KEY)
setLanguage('en')

includeTables(['InventoryItem'])

export async function getWeapons() {
    await load()

    const inventoryItems = getAllInventoryItemDefs('InventoryItem')

    let weapons = new Set()
    inventoryItems.forEach(item => {
        if (item.itemType === 3) {
            weapons.add(item.displayProperties.name)
        }
    })
    weapons = [...weapons]
    weapons = weapons.filter(weapon => weapon !== "")
    weapons = weapons.sort(([nameA], [nameB]) => {
        return nameA.localeCompare(nameB)
    })
    writeFileSync('./data/weapons.json', JSON.stringify(weapons, null, 2))
    return weapons
}

if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    getWeapons()
}