const fetch = require('node-fetch');
const fs = require('fs');

async function explorer() {
    const globalConfig = JSON.parse(fs.readFileSync('global_config.json', 'utf8'));
    const apiKey = globalConfig.clickupApiKey;
    const listId = globalConfig.clickupListId;

    const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/field`, {
        headers: { Authorization: apiKey }
    });
    const data = await res.json();
    
    data.fields.forEach(f => {
        console.log(`\nFIELD: ${f.name} (ID: ${f.id}, Type: ${f.type})`);
        if (f.type_config && f.type_config.options) {
            console.log('Options:');
            f.type_config.options.forEach(opt => {
                console.log(` - [${opt.id || opt.orderindex}] ${opt.name || opt.label}`);
            });
        }
    });
}
explorer();
