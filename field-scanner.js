const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

async function explorer() {
    const configPaths = [
        path.join(__dirname, 'data', 'global_config.local.json'),
        path.join(__dirname, 'data', 'global_config.json'),
        path.join(__dirname, 'global_config.json')
    ];
    let globalConfig = {};
    for (const p of configPaths) {
        try {
            if (!fs.existsSync(p)) continue;
            globalConfig = JSON.parse(fs.readFileSync(p, 'utf8'));
            break;
        } catch (_e) {}
    }
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
