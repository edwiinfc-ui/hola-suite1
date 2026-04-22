/**
 * raw-task-explorer.js — Exploración profunda de campos de ClickUp
 * 
 * Mejoras:
 *  - Paginación completa (hasta 20 páginas)
 *  - Filtro por estado (--status="en proceso")
 *  - Exportación a all_fields_export.json
 *  - Resumen estadístico
 */

const fetch = require('node-fetch');
const fs = require('fs');

async function explorer() {
    const args = process.argv.slice(2);
    const statusFilter = args.find(a => a.startsWith('--status='))?.split('=')[1]?.toLowerCase();
    
    if (!fs.existsSync('global_config.json')) {
        console.error('Error: global_config.json no encontrado');
        return;
    }

    const globalConfig = JSON.parse(fs.readFileSync('global_config.json', 'utf8'));
    const apiKey = globalConfig.clickupApiKey;
    const listId = globalConfig.clickupListId;

    if (!apiKey || !listId) {
        console.error('Error: API Key o List ID no configurados en global_config.json');
        return;
    }

    console.log(`🚀 Iniciando exploración en lista ${listId}...`);
    if (statusFilter) console.log(`🔍 Filtrando por estado: "${statusFilter}"`);

    const allTasks = [];
    let page = 0;
    const maxPages = 15;

    while (page < maxPages) {
        process.stdout.write(`  Descargando página ${page}... `);
        const url = `https://api.clickup.com/api/v2/list/${listId}/task?page=${page}&include_closed=true&archived=false&subtasks=true`;
        
        try {
            const res = await fetch(url, { headers: { Authorization: apiKey } });
            if (!res.ok) {
                console.error(`\n❌ Error HTTP ${res.status}: ${await res.text()}`);
                break;
            }
            const data = await res.json();
            if (!data.tasks || data.tasks.length === 0) {
                console.log('fin.');
                break;
            }
            
            allTasks.push(...data.tasks);
            console.log(`recibidas ${data.tasks.length} tareas.`);
            if (data.tasks.length < 100) break;
            page++;
            await new Promise(r => setTimeout(r, 300));
        } catch (e) {
            console.error(`\n❌ Error de red: ${e.message}`);
            break;
        }
    }

    const filtered = statusFilter 
        ? allTasks.filter(t => String(t.status?.status || '').toLowerCase().includes(statusFilter))
        : allTasks;

    console.log(`\n✅ Total tareas descargadas: ${allTasks.length}`);
    console.log(`🎯 Tareas tras filtro: ${filtered.length}`);

    // Estadísticas de campos
    const fieldStats = {};
    const statusStats = {};

    filtered.forEach(t => {
        const s = t.status?.status || 'desconocido';
        statusStats[s] = (statusStats[s] || 0) + 1;
        
        (t.custom_fields || []).forEach(f => {
            if (!fieldStats[f.name]) {
                fieldStats[f.name] = { id: f.id, type: f.type, count: 0, examples: new Set() };
            }
            fieldStats[f.name].count++;
            if (f.value !== null && f.value !== undefined && f.value !== '') {
                fieldStats[f.name].examples.add(JSON.stringify(f.value).substring(0, 50));
            }
        });
    });

    console.log('\n📊 Resumen de Estados:');
    Object.entries(statusStats).sort((a,b) => b[1] - a[1]).forEach(([s, count]) => {
        console.log(`  - ${s.padEnd(30)}: ${count}`);
    });

    console.log('\n🧩 Mapa de Custom Fields (Top 20 por frecuencia):');
    Object.entries(fieldStats)
        .sort((a,b) => b[1].count - a[1].count)
        .slice(0, 25)
        .forEach(([name, info]) => {
            const examples = Array.from(info.examples).slice(0, 2).join(' | ');
            console.log(`  - ${name.padEnd(35)} [${info.id}] (${info.type.padEnd(10)}) -> ${info.count} tareas. Ej: ${examples}`);
        });

    const exportFile = 'all_fields_export.json';
    fs.writeFileSync(exportFile, JSON.stringify({
        total: allTasks.length,
        filtered: filtered.length,
        fields: fieldStats,
        sample_tasks: filtered.slice(0, 10)
    }, null, 2));

    console.log(`\n💾 Exportado detalle completo a: ${exportFile}`);
    console.log('--- Fin del reporte ---\n');
}

explorer();
