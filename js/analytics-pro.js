/**
 * ANALYTICS-PRO.JS
 * Motor de análisis dinámico para Vy-Lex
 */
'use strict';

window.AnalyticsPro = (() => {
  const PALETTES = {
    premium: ['#3B82F6', '#22D3EE', '#8B5CF6', '#F43F5E', '#10B981'],
    vibrant: ['#FF6D00', '#FFD600', '#00C853', '#00B0FF', '#D500F9'],
    mono: ['#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE', '#DBEAFE'],
    sunset: ['#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#6366F1']
  };

  /**
   * Filtra el set de datos según múltiples criterios
   */
  function filterData(data, filters) {
    if (!filters || filters.length === 0) return data;

    return data.filter(item => {
      return filters.every(f => {
        const value = item[f.field];
        const target = f.value;

        switch (f.operator) {
          case 'eq': return String(value).toLowerCase() === String(target).toLowerCase();
          case 'contains': return String(value).toLowerCase().includes(String(target).toLowerCase());
          case 'gt': return parseFloat(value) > parseFloat(target);
          case 'lt': return parseFloat(value) < parseFloat(target);
          case 'not': return String(value).toLowerCase() !== String(target).toLowerCase();
          default: return true;
        }
      });
    });
  }

  /**
   * Agrega los datos según dimensión y métrica
   */
  function aggregateData(data, dimension, metric) {
    const groups = {};

    data.forEach(item => {
      let keys = [];
      if (dimension === 'channel') {
        const can = item.canales || {};
        Object.keys(can).forEach(k => {
          if (String(can[k]).toUpperCase() === 'SÍ') {
            const labels = { wa: 'WhatsApp', ig: 'Instagram', tg: 'Telegram', wc: 'WebChat', pbx: 'PBX', msg: 'Messenger' };
            keys.push(labels[k] || k);
          }
        });
      } else {
        let key = item[dimension] || 'Sin definir';
        if (dimension === 'mesInicio' && !item[dimension]) key = 'Sin mes';
        keys.push(key);
      }
      
      keys.forEach(key => {
        if (!groups[key]) groups[key] = 0;

        if (metric === 'count') {
          groups[key]++;
        } else if (metric === 'value') {
          const m = parseFloat(item.mensualidad) || parseFloat(item.valorVenta) || 0;
          const a = parseFloat(item.aderencia) || 0;
          groups[key] += (m + a);
        } else if (metric === 'channels') {
          const can = item.canales || {};
          Object.values(can).forEach(v => {
            if (String(v).toUpperCase() === 'SÍ') groups[key]++;
          });
        } else if (metric === 'performance') {
          // Desempeño: tareas completadas vs participación total
          let score = 0;
          if (item.statusType === 'activo') score = 100;
          else if (item.statusType === 'impl') {
             let etapas = 0;
             if (item.rKickoff) etapas += 20;
             if (item.rVer) etapas += 20;
             if (item.rCap) etapas += 20;
             if (item.rGoLive) etapas += 20;
             if (item.rAct) etapas += 20;
             score = etapas;
          }
          if (!groups[key + '_count']) {
            groups[key + '_count'] = 0;
            groups[key + '_sum'] = 0;
          }
          groups[key + '_count']++;
          groups[key + '_sum'] += score;
        }
      });
    });

    if (metric === 'performance') {
      const perfGroups = {};
      Object.keys(groups).forEach(k => {
        if (k.endsWith('_count')) {
          const baseKey = k.replace('_count', '');
          perfGroups[baseKey] = Math.round(groups[k.replace('_count', '_sum')] / groups[k]);
        }
      });
      const sorted = Object.entries(perfGroups).sort((a, b) => b[1] - a[1]);
      return { labels: sorted.map(s => s[0]), values: sorted.map(s => s[1]) };
    }

    // Convertir a labels y values ordenados por valor descendente
    const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
    return {
      labels: sorted.map(s => s[0]),
      values: sorted.map(s => s[1])
    };
  }

  /**
   * Renderiza el gráfico usando Chart.js
   */
  function render(canvasId, config) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    // Destruir gráfico previo si existe
    if (window.APP && APP.charts && APP.charts[canvasId]) {
      APP.charts[canvasId].destroy();
    }

    const { type, labels, values, paletteName, label } = config;
    const colors = PALETTES[paletteName || 'premium'];

    const chartConfig = {
      type: type === 'pizza' ? 'doughnut' : 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: label || 'Valor',
          data: values,
          backgroundColor: type === 'pizza' ? colors : colors.map(c => c + '90'),
          borderColor: type === 'pizza' ? '#ffffff' : colors,
          borderWidth: 1,
          borderRadius: type === 'pizza' ? 0 : 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: type === 'bar-h' ? 'y' : 'x',
        plugins: {
          legend: {
            display: type === 'pizza',
            position: 'right',
            labels: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } }
          },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.8)',
            padding: 12,
            cornerRadius: 8
          }
        },
        scales: type === 'pizza' ? {} : {
          x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.5)' } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)' } }
        }
      }
    };

    if (type === 'line') {
      chartConfig.type = 'line';
      chartConfig.data.datasets[0].fill = true;
      chartConfig.data.datasets[0].tension = 0.4;
      chartConfig.data.datasets[0].backgroundColor = colors[0] + '30';
    }

    if (!window.APP) window.APP = {};
    if (!APP.charts) APP.charts = {};
    APP.charts[canvasId] = new Chart(ctx, chartConfig);
  }

  /**
   * Exporta el canvas como imagen PNG
   */
  function exportPNG(canvasId, filename = 'vylex-analytics.png') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  return { filterData, aggregateData, render, exportPNG, PALETTES };
})();
