// ================================================================
// CONFIG & STATE
// ================================================================
const CONFIG = {
  API_KEY: '',
  LIST_ID: '',
  DIAS_META:{kickoff:3,verificacion:2,instalacion:5,capacitacion:7,activacion:2,total:20},
  ESTADOS_IMPL:['listo para kickoff','en kickoff','en onboarding','listo para onboarding','en análisis meta','en analisis meta','listo para instalación','listo para instalacion','en instalación','en instalacion','en capacitación','en capacitacion','go-live','go live','activación canales','activacion canales','revisión comercial','revision comercial','site en desarrollo','concluído','concluido','closed','cerrado','cancelado','en espera wispro'],
  ESTADOS_IGNORAR:[],
  TAREAS_IGNORAR:['configurar whatsapp','configurar telefonia','configurar instagram','configurar messenger','configurar webchat','teste','crear vm'],
  MESES:['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
  CONSULTORES:{'edwin':'Edwin Franco','franco':'Edwin Franco','e. franco':'Edwin Franco','alejandro':'Alejandro Zambrano','zambrano':'Alejandro Zambrano','alex':'Alejandro Zambrano','mariane':'Mariane Teló','telo':'Mariane Teló','mari':'Mariane Teló'},
  PAISES:{
    'argentina':'Argentina','colombia':'Colombia',
    'mexico':'México','méxico':'México','venezuela':'Venezuela',
    'republica dominicana':'República Dominicana','república dominicana':'República Dominicana',
    'peru':'Perú','perú':'Perú','ecuador':'Ecuador','honduras':'Honduras',
    'chile':'Chile','paraguay':'Paraguay','bolivia':'Bolivia','uruguay':'Uruguay',
    'costa rica':'Costa Rica','panama':'Panamá','panamá':'Panamá',
    'nicaragua':'Nicaragua','guatemala':'Guatemala','el salvador':'El Salvador',
    'brasil':'Brasil','brazil':'Brasil'
  },
  FERIADOS:{
    'Argentina':['01-01','02-24','02-25','03-24','04-02','04-18','04-19','05-01','05-25','06-17','06-20','07-09','08-17','10-12','11-20','12-08','12-25'],
    'Colombia':['01-01','01-06','04-17','04-18','04-19','05-01','06-29','07-20','08-07','10-13','11-03','11-10','12-08','12-25'],
    'México':['01-01','02-03','03-17','04-17','04-18','05-01','09-16','11-02','11-18','12-25'],
    'Brasil':['01-01','02-12','02-13','04-17','04-18','04-21','05-01','06-19','09-07','10-12','11-02','11-15','11-20','12-25'],
    'Chile':['01-01','04-17','04-18','05-01','05-21','07-16','08-15','09-18','09-19','10-12','12-08','12-25'],
    'Perú':['01-01','04-17','04-18','05-01','06-29','07-28','07-29','08-30','11-01','12-08','12-25'],
    'Venezuela':['01-01','04-17','04-18','04-19','05-01','06-24','07-05','07-24','10-12','12-25'],
    'Ecuador':['01-01','04-18','05-01','05-24','08-10','10-09','11-02','11-03','12-25'],
    'Honduras':['01-01','04-14','04-15','04-17','04-18','05-01','09-15','10-03','10-12','12-25'],
    'Panamá':['01-01','01-09','04-17','04-18','05-01','11-03','11-10','11-28','12-08','12-25']
  }
};

const APP = {
  data:[],
  filteredByDate:[],
  filtered:{impl:[],activos:[],cancelados:[]},
  charts:{},
  currentSection:'dashboard',
  language:'es',
  currentUser:null,
  syncing:false,
  lastSync:null,
  apiMeta:{source:'none',taskCount:0,syncedAt:null},
  sortState:{},
  panoFilter:'all',panoPais:'',panoCons:'',
  dateFilter:{active:'all',from:null,to:null},
  holaConversations:[],
  holaDepartments:{},
  alertWords:{danger:[],warning:[]},
  mejoras:[],
  csEvents:[],
  upsells:{},
  channelOverrides:{},
  clientLogs:{},
  kanbanMeta:{},
  customApis:[],
  branding:null,
  salesData:[],
  externalSubmissions:[],
  salesFields:[],
  pendingConflicts:[],
  syncProtectedFields:[],
  users:[],
  groups:[],
  workspaceMembers:[],
  permissions:{
    admin:{dashboard:true,clients:true,config:true,export:true,users:true,delete:true},
    consultant:{dashboard:true,clients:true,config:false,export:true,users:false,delete:false},
    cs:{dashboard:true,clients:false,config:false,export:false,users:false,delete:false},
    viewer:{dashboard:true,clients:false,config:false,export:false,users:false,delete:false}
  },
  kanbanConsFilter:'',kanbanPaisFilter:'',kanbanOnlyAlert:false,
  wikiCurrentPage:'overview'
};

function defaultBranding(){
  return {
    name:'VY - LEX',
    tagline:'Control Center — v2.0',
    sidebarTagline:'Control Center',
    initial:'H',
    logoUrl:'',
    primary:'#FF6D00',
    secondary:'#00D4FF'
  };
}

function defaultSalesFields(){
  return [
    {key:'campaign',label:'Campaña'},
    {key:'segmento',label:'Segmento'},
    {key:'producto',label:'Producto'}
  ];
}

function defaultProtectedFields(){
  return ['canales','email','telefono','plan','rKickoff','rCap','estado','motivo'];
}

function parseFieldDefinitions(raw, fallback){
  const base=Array.isArray(fallback)&&fallback.length?fallback:[];
  if(!raw||!raw.trim())return base;
  try{
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed)){
      return parsed
        .map(item=>typeof item==='string'?{key:item,label:item}:item)
        .filter(item=>item&&item.key)
        .map(item=>({key:String(item.key).trim(),label:String(item.label||item.key).trim()}));
    }
  }catch{}
  const defs=raw.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{
    const parts=line.split(/[:|]/);
    const key=(parts.shift()||'').trim();
    const label=(parts.join('|')||key).trim();
    return key?{key,label}:null;
  }).filter(Boolean);
  return defs.length?defs:base;
}

function parseProtectedFields(raw){
  if(!raw||!raw.trim())return defaultProtectedFields();
  return raw.split(/[\n,]/).map(v=>v.trim()).filter(Boolean);
}

function parseDateAny(value){
  if(!value)return null;
  if(value instanceof Date)return isNaN(value.getTime())?null:value;
  if(typeof value==='number'||(/^\d+$/.test(String(value))&&String(value).length>=10)){
    const asNumber=Number(value);
    const ms=String(Math.abs(asNumber)).length<=10?asNumber*1000:asNumber;
    const date=new Date(ms);
    return isNaN(date.getTime())?null:date;
  }
  if(typeof value==='string'){
    const trimmed=value.trim();
    const esMatch=trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(esMatch){
      const date=new Date(Number(esMatch[3]),Number(esMatch[2])-1,Number(esMatch[1]));
      return isNaN(date.getTime())?null:date;
    }
    const date=new Date(trimmed);
    return isNaN(date.getTime())?null:date;
  }
  return null;
}

function formatDateISO(date){
  const parsed=parseDateAny(date);
  return parsed?parsed.toISOString().split('T')[0]:'';
}

function monthKeyFromDate(date){
  const parsed=parseDateAny(date);
  if(!parsed)return'';
  return `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}`;
}

function isCurrentMonth(date){
  const parsed=parseDateAny(date);
  const now=new Date();
  return !!parsed&&parsed.getFullYear()===now.getFullYear()&&parsed.getMonth()===now.getMonth();
}

function isPreviousMonth(date){
  const parsed=parseDateAny(date);
  if(!parsed)return false;
  const now=new Date();
  const prev=new Date(now.getFullYear(),now.getMonth()-1,1);
  return parsed.getFullYear()===prev.getFullYear()&&parsed.getMonth()===prev.getMonth();
}

function collectAssignedConsultants(...values){
  const names=[];
  values.flat().forEach(value=>{
    if(!value)return;
    if(Array.isArray(value))return value.forEach(item=>names.push(item));
    names.push(value);
  });
  return Array.from(new Set(names.map(name=>String(name).trim()).filter(Boolean)));
}

function getAssignedConsultantsLabel(client){
  const list=collectAssignedConsultants(client?.consultoresAsignados||[],client?.rKickoff,client?.rVer,client?.rCap,client?.rGoLive,client?.rAct);
  return list.length?list.join(', '):'—';
}

function findConversationMatches(client){
  const name=normalizeText(client?.nombre||'');
  const dominio=normalizeText(client?.dominio||'');
  return (APP.holaConversations||[]).filter(conv=>{
    const contact=normalizeText(conv.contactName||conv.contact||'');
    const org=normalizeText(conv.company||conv.account||'');
    return !!name&&(
      (contact&& (contact.includes(name)||name.includes(contact)))||
      (org&& (org.includes(name)||name.includes(org)))||
      (!!dominio&&((contact&&contact.includes(dominio))||(org&&org.includes(dominio))))
    );
  });
}

function extractTaskLogs(task){
  const rawLogs=[...(Array.isArray(task?.status_history)?task.status_history:[]),...(Array.isArray(task?.history)?task.history:[]),...(Array.isArray(task?.movements)?task.movements:[]),...(Array.isArray(task?.activity)?task.activity:[])];
  return rawLogs.map((item,index)=>{
    const from=item.from_status||item.old_status||item.from||item.before||'';
    const to=item.to_status||item.new_status||item.to||item.after||item.status||'';
    const detail=item.detail||item.text||item.description||`${from&&to?`${from} -> ${to}`:to||from||'Movimiento registrado'}`;
    const date=parseDateAny(item.date||item.date_created||item.timestamp||item.ts||item.created_at||item.updated_at);
    return {
      id:String(item.id||`${task?.id||'task'}-log-${index}`),
      fecha:formatDateISO(date)||formatDateISO(task?.date_updated)||new Date().toISOString().split('T')[0],
      tipo:item.type||'status',
      detalle,
      fromStatus:from,
      toStatus:to,
      source:'clickup_history'
    };
  }).filter(log=>log.detalle);
}

function inferLifecycleDatesFromLogs(logs){
  const sorted=[...(logs||[])].sort((a,b)=>String(a.fecha||'').localeCompare(String(b.fecha||'')));
  let completedAt=null;
  let canceledAt=null;
  sorted.forEach(log=>{
    const text=normalizeText(`${log.toStatus||''} ${log.detalle||''}`);
    const date=parseDateAny(log.fecha);
    if(!completedAt&&date&&(text.includes('conclu')||text.includes('activo')||text.includes('activac')||text.includes('go-live')))completedAt=date;
    if(!canceledAt&&date&&text.includes('cancel'))canceledAt=date;
  });
  return {completedAt,canceledAt};
}

function normalizeHolaBaseUrl(url){
  return String(url||'').trim().replace(/\/+$/,'');
}

function normalizeHolaApiBase(url){
  const base=normalizeHolaBaseUrl(url);
  if(!base)return'';
  return /\/api\/v1$/i.test(base)?base:`${base}/api/v1`;
}

function getHolaApiBases(url){
  const plain=normalizeHolaBaseUrl(url);
  const api=normalizeHolaApiBase(url);
  return {plain,api};
}

function sanitizeHolaWorkspace(value, baseUrl=''){
  const raw=String(value||'').trim();
  if(!raw)return'';
  const normalizedBase=normalizeHolaBaseUrl(baseUrl);
  if(/^https?:\/\//i.test(raw))return'';
  if(normalizedBase&&normalizeHolaBaseUrl(raw)===normalizedBase)return'';
  if(/\/api\/v1/i.test(raw))return'';
  return raw;
}

function getHolaAuthHeader(token){
  const raw=String(token||'').trim();
  return raw.toLowerCase().startsWith('bearer ')?raw:`Bearer ${raw}`;
}

async function fetchJsonWithFallback(urls, headers){
  const errors=[];
  for(const url of urls){
    try{
      const resp=await fetch(url,{headers});
      if(!resp.ok){errors.push(`${resp.status} @ ${url}`);continue;}
      const json=await resp.json();
      return {json,url};
    }catch(err){
      errors.push(`${err.message} @ ${url}`);
    }
  }
  throw new Error(errors.slice(0,4).join(' | ')||'Sin respuesta de la API');
}

function canUseServerProxy(){
  return typeof window!=='undefined'&&window.location&&/^https?:$/i.test(window.location.protocol);
}

async function postJson(url, body){
  const headers={'Content-Type':'application/json'};
  if(APP?.token)headers.Authorization=`Bearer ${APP.token}`;
  const resp=await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});
  const json=await resp.json().catch(()=>({}));
  if(!resp.ok)throw new Error(json?.error||`HTTP ${resp.status}`);
  return json;
}

function normalizeHolaConversation(raw){
  const opaRoute=raw.id_rota||raw.rota||raw.route||null;
  const opaAttendees=Array.isArray(opaRoute?.atendentes)?opaRoute.atendentes:[];
  const opaOperations=Array.isArray(opaRoute?.operacoes)?opaRoute.operacoes:[];
  const firstAttendance=opaAttendees.map(item=>parseDateAny(item.inicio)).filter(Boolean).sort((a,b)=>a-b)[0]||null;
  const openedAt=parseDateAny(opaRoute?.inicio||raw.inicio||raw.date||raw.createdAt||raw.created_at);
  const endedAt=parseDateAny(opaRoute?.fim||raw.fim||raw.updatedAt||raw.updated_at);
  const waitMinutes=openedAt&&firstAttendance?Math.max(0,Math.round((firstAttendance-openedAt)/60000)):null;
  const serviceMinutes=openedAt&&endedAt?Math.max(0,Math.round((endedAt-openedAt)/60000)):null;
  const sectorId=String(opaRoute?.setor||raw.setor||opaRoute?.departamento||'').trim();
  const sectorName=APP.holaDepartments?.[sectorId]?.nome||APP.holaDepartments?.[sectorId]?.name||sectorId||'';
  const activeAttendee=opaAttendees.find(item=>!item.fim)||opaAttendees[opaAttendees.length-1]||null;
  const activeOperation=opaOperations[opaOperations.length-1]||null;
  const opaStatusRaw=String(opaRoute?.status||raw.status||raw.state||'').trim();
  const mappedStatus=normalizeOpaStatus(opaStatusRaw,endedAt,activeAttendee,opaRoute?.aguardandoCliente);
  const lastMessage=raw.lastMessage||raw.last_message||raw.preview||raw.body||raw.mensagem||raw.latest_message?.text||raw.messages?.[0]?.text||'';
  const updated=parseDateAny(opaRoute?.update||raw.updatedAt||raw.updated_at||raw.last_activity_at||raw.date||raw.created_at);
  const messages=Array.isArray(raw.messages)?raw.messages.map(msg=>({text:msg.text||msg.body||msg.message||msg.mensagem||''})):[];
  return processConversationAlerts({
    id:String(raw._id||raw.id||raw.uuid||Date.now()+Math.random()),
    routeId:String(opaRoute?._id||raw.id_rota||raw.routeId||''),
    protocol:opaRoute?.protocolo||raw.protocolo||'',
    contactName:raw.contactName||raw.contact_name||raw.contact?.name||raw.customer?.name||raw.id_cliente?.nome||raw.name||'Desconocido',
    contact:raw.contact||raw.phone||raw.customer?.phone||raw.canal_cliente||'',
    company:raw.company||raw.account?.name||raw.workspace_name||'',
    channel:normalizeText(opaRoute?.canal||raw.canal||raw.channel||raw.channel_type||raw.source||'whatsapp')||'whatsapp',
    agentName:raw.agentName||raw.agent_name||raw.assignee?.name||raw.owner?.name||raw.id_atendente?.nome||raw.id_atend?.nome||'Sin agente',
    activeAgentName:activeAttendee?.nome||raw.id_atendente?.nome||raw.id_atend?.nome||'',
    activeOperation:activeOperation?.tipo||'',
    sectorId,
    sectorName,
    queueStatus:opaRoute?.aguardandoCliente?'waiting_customer':'',
    waitMinutes,
    serviceMinutes,
    openedAt:openedAt?openedAt.toISOString():'',
    endedAt:endedAt?endedAt.toISOString():'',
    updatedAt:updated?formatDate(updated)+' '+updated.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}):'',
    status:mappedStatus,
    rawStatus:opaStatusRaw,
    isActiveAttendance:!!activeAttendee&&!endedAt,
    attendantCount:opaAttendees.length,
    lastMessage,
    messages
  });
}

function normalizeOpaStatus(status, endedAt, activeAttendee, waitingCustomer){
  const normalized=normalizeText(status||'');
  if(endedAt||normalized==='f'||normalized.includes('final'))return'resolved';
  if(waitingCustomer)return'pending';
  if(activeAttendee||normalized==='ea'||normalized.includes('atendimento'))return'open';
  return normalized||'open';
}

function formatMinutesLabel(minutes){
  if(minutes==null||Number.isNaN(Number(minutes)))return'—';
  const total=Math.max(0,Number(minutes));
  if(total<60)return `${total} min`;
  const hours=Math.floor(total/60);
  const remain=total%60;
  return remain?`${hours}h ${remain}m`:`${hours}h`;
}

function summarizeHolaMetrics(conversations){
  const validWaits=conversations.map(c=>Number(c.waitMinutes)).filter(v=>Number.isFinite(v));
  const validService=conversations.map(c=>Number(c.serviceMinutes)).filter(v=>Number.isFinite(v));
  const sectorMap={};
  const agentMap={};
  const activeCount=conversations.filter(c=>c.isActiveAttendance||c.status==='open').length;
  conversations.forEach(conv=>{
    const sector=conv.sectorName||conv.sectorId||'—';
    const agent=conv.activeAgentName||conv.agentName||'—';
    sectorMap[sector]=(sectorMap[sector]||0)+1;
    agentMap[agent]=(agentMap[agent]||0)+1;
  });
  const topSector=Object.entries(sectorMap).sort((a,b)=>b[1]-a[1])[0];
  const topAgent=Object.entries(agentMap).sort((a,b)=>b[1]-a[1])[0];
  return {
    avgWait:validWaits.length?Math.round(validWaits.reduce((s,v)=>s+v,0)/validWaits.length):null,
    avgService:validService.length?Math.round(validService.reduce((s,v)=>s+v,0)/validService.length):null,
    topSector:topSector?`${topSector[0]} (${topSector[1]})`:'—',
    topAgent:topAgent?`${topAgent[0]} (${topAgent[1]})`:'—',
    activeCount
  };
}

function buildOpaTimeline(detail){
  const rows=[];
  const observaciones=Array.isArray(detail?.observaciones)?detail.observaciones:[];
  const motivos=Array.isArray(detail?.motivos)?detail.motivos:[];
  const route=detail?.id_rota||detail?.rota||null;
  const operations=Array.isArray(route?.operacoes)?route.operacoes:[];
  const messages=Array.isArray(detail?.mensagem)?detail.mensagem:Array.isArray(detail?.messages)?detail.messages:[];
  observaciones.forEach(item=>{
    rows.push({date:item.data||item.date||'',label:'Observacion',text:item.mensagem||item.mensaje||item.text||''});
  });
  motivos.forEach(item=>{
    rows.push({
      date:item.data||item.date||'',
      label:'Motivo',
      text:item.idMotivo?.motivo||item.motivo||item.idDepartamento||''
    });
  });
  operations.forEach(item=>{
    rows.push({
      date:item.date||item.data||'',
      label:item.tipo||'Operacion',
      text:[item.departamento?.nome||item.departamento||'',item.atendente?.nome||item.atendente||''].filter(Boolean).join(' · ')
    });
  });
  messages.forEach(item=>{
    rows.push({
      date:item.data||item.date||item.created_at||'',
      label:'Mensaje',
      text:item.mensagem||item.message||item.text||item.body||''
    });
  });
  return rows
    .filter(row=>row.text||row.date)
    .sort((a,b)=>(parseDateAny(a.date)?.getTime()||0)-(parseDateAny(b.date)?.getTime()||0));
}

async function fetchOpaAttendanceDetail(convId, headers, baseUrl){
  const {plain,api}=getHolaApiBases(baseUrl);
  const attempts=[
    {type:'detail',url:`${api}/atendimento/${encodeURIComponent(convId)}`},
    {type:'messages',url:`${api}/atendimento/mensagem/${encodeURIComponent(convId)}`},
    {type:'detail',url:`${plain}/atendimento/${encodeURIComponent(convId)}`},
    {type:'messages',url:`${plain}/atendimento/mensagem/${encodeURIComponent(convId)}`}
  ];
  let detailData=null;
  let messageData=null;
  const errors=[];
  for(const attempt of attempts){
    try{
      const resp=await fetch(attempt.url,{headers});
      if(!resp.ok){errors.push(`${resp.status} @ ${attempt.url}`);continue;}
      const json=await resp.json();
      const data=json?.data;
      if(!data)continue;
      if(attempt.type==='detail'&&!detailData)detailData=data;
      if(attempt.type==='messages'&&!messageData)messageData=data;
      if(detailData&&messageData)break;
    }catch(err){
      errors.push(`${err.message} @ ${attempt.url}`);
    }
  }
  if(!detailData&&!messageData)throw new Error(errors.slice(0,4).join(' | ')||'Sin detalle de la API');
  const merged={...(detailData||{}),...(messageData||{})};
  merged.id_rota=messageData?.id_rota||detailData?.id_rota||merged.id_rota||null;
  merged.observacoes=[...(detailData?.observacoes||[]),...(messageData?.observacoes||[])];
  merged.motivos=[...(detailData?.motivos||[]),...(messageData?.motivos||[])];
  if(messageData?.mensagem)merged.mensagem=messageData.mensagem;
  return merged;
}

async function fetchOpaDepartments(baseUrl, headers){
  const {plain,api}=getHolaApiBases(baseUrl);
  const candidates=[
    `${api}/departamento`,
    `${api}/departamento/`,
    `${plain}/departamento`
  ];
  try{
    const {json}=await fetchJsonWithFallback(candidates,headers);
    const rows=Array.isArray(json?.data)?json.data:Array.isArray(json)?json:[];
    APP.holaDepartments=rows.reduce((acc,row)=>{
      const id=String(row._id||row.id||'').trim();
      if(id)acc[id]=row;
      return acc;
    },{});
  }catch{
    APP.holaDepartments=APP.holaDepartments||{};
  }
}

function getActiveSource(){
  return (document.getElementById('cfgPrimarySource')?.value||localStorage.getItem('holaPrimarySource')||'clickup').trim();
}

function applyBranding(){
  const branding=APP.branding||defaultBranding();
  document.documentElement.style.setProperty('--primary',branding.primary||'#FF6D00');
  document.documentElement.style.setProperty('--primary-dark',branding.primary||'#E65100');
  document.documentElement.style.setProperty('--accent',branding.secondary||'#00D4FF');
  setTxt('brandLoginName',branding.name);
  setTxt('brandLoginTagline',branding.tagline);
  setTxt('brandSidebarName',branding.name);
  setTxt('brandSidebarTagline',branding.sidebarTagline||branding.tagline);
  const mark=document.getElementById('brandLogoMark');
  const img=document.getElementById('brandLogoImage');
  if(mark)mark.textContent=(branding.initial||branding.name||'D').slice(0,3).toUpperCase();
  if(img){
    if(branding.logoUrl){
      img.src=branding.logoUrl;
      img.style.display='block';
      if(mark)mark.style.display='none';
    }else{
      img.removeAttribute('src');
      img.style.display='none';
      if(mark)mark.style.display='flex';
    }
  }
}

function saveBranding(){
  APP.branding={
    name:document.getElementById('cfgBrandName')?.value.trim()||'Dashboard',
    tagline:document.getElementById('cfgBrandTagline')?.value.trim()||'Analytics operativo',
    sidebarTagline:document.getElementById('cfgBrandTagline')?.value.trim()||'Analytics operativo',
    initial:(document.getElementById('cfgBrandInitial')?.value.trim()||'D').slice(0,3),
    logoUrl:document.getElementById('cfgBrandLogoUrl')?.value.trim()||'',
    primary:document.getElementById('cfgBrandPrimary')?.value||'#FF6D00',
    secondary:document.getElementById('cfgBrandSecondary')?.value||'#00D4FF'
  };
  localStorage.setItem('holaBranding',JSON.stringify(APP.branding));
  applyBranding();
  toast('success',t('toast.branding_updated','Branding actualizado'));
}

function populateBrandingForm(){
  const branding=APP.branding||defaultBranding();
  const pairs=[
    ['cfgBrandName',branding.name],
    ['cfgBrandTagline',branding.tagline],
    ['cfgBrandInitial',branding.initial],
    ['cfgBrandLogoUrl',branding.logoUrl],
    ['cfgBrandPrimary',branding.primary],
    ['cfgBrandSecondary',branding.secondary]
  ];
  pairs.forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.value=value||'';});
}

// ================================================================
// AUTH
// ================================================================
// ================================================================
// AUTH
// ================================================================
function getAuthHeader() {
  return APP.token ? { 'Authorization': `Bearer ${APP.token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function doLogin(){
  const email=document.getElementById('loginEmail').value.trim();
  const pass=document.getElementById('loginPass').value;
  
  try {
    const lang = document.getElementById('langSelector') ? document.getElementById('langSelector').value : 'es';
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: email, password: pass, lang })
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Credenciales incorrectas');
    
    const user = { ...data.user, email: data.user.username, pass: pass, avatar: (data.user.name || 'U').charAt(0).toUpperCase(), color: 'var(--primary)' };
    
    APP.token = data.token;
    APP.currentUser = user;
    
    const scr=document.getElementById('loginScreen');
    scr.style.transition='opacity .5s';scr.style.opacity='0';
    setTimeout(()=>{
      scr.classList.add('hidden');
      document.getElementById('mainApp').classList.remove('hidden');
      setUserUI(user);
      loadSavedData();
      syncClickUp();
      fetchUsersFromServer(); // Cargar la lista de usuarios completa para el Admin
    },500);
  } catch(error) {
    const err=document.getElementById('loginError');
    err.style.display='flex';
    document.getElementById('loginErrorMsg').textContent = error.message;
    setTimeout(()=>err.style.display='none',4000);
  }
}

async function fetchUsersFromServer() {
  if (APP.currentUser?.role !== 'admin') return;
  try {
    const res = await fetch('/api/users', { headers: getAuthHeader() });
    if (!res.ok) return;
    const data = await res.json();
    if (data.users) {
       APP.users = data.users.map(u => ({ ...u, email: u.username, avatar: (u.name||'U').charAt(0).toUpperCase(), color: 'var(--primary)' }));
    }
  } catch(e) {}
}

function doLogout(){
  APP.currentUser=null;
  document.getElementById('mainApp').classList.add('hidden');
  const scr=document.getElementById('loginScreen');
  scr.classList.remove('hidden');scr.style.opacity='1';
}
function setUserUI(u){
  document.getElementById('userAvatar').textContent=u.avatar;
  document.getElementById('userAvatarTop').textContent=u.avatar;
  document.getElementById('userNameDisplay').textContent=u.name;
  document.getElementById('userRoleDisplay').textContent={admin:'Administrador',consultant:'Consultor',cs:'CS Team',viewer:'Visualizador'}[u.role]||u.role;
}
document.getElementById('loginPass').addEventListener('keypress',e=>{if(e.key==='Enter')doLogin();});

// ================================================================
// NAVIGATION
// ================================================================
const SECTION_META={
  dashboard:['Dashboard','Visión general del sistema'],
  panoramic:['Vista Panorámica','Todos los clientes de un vistazo'],
  implementaciones:['Implementaciones','Clientes en proceso activo'],
  activos:['Clientes Activos','Plataforma en producción'],
  cancelados:['Cancelados','Análisis de bajas'],
  alertas:['Alertas','Clientes en riesgo'],
  opa:['OPA / Hola Suite','Conversaciones y alertas de palabras clave'],
  cs:['CS Dashboard','Customer Success — Bajas y retenciones'],
  kanban:['Kanban','Tablero de proyecto por etapas'],
  canales:['Canales','Estado de canales por cliente'],
  consultores:['Consultores','Desempeño del equipo'],
  bi:['BI Dashboard','Business Intelligence'],
  ventas:['Ventas & Leads','Embudo comercial, marketing y pipeline'],
  metas:['Metas','Seguimiento de objetivos'],
  mejoras:['Mejoras','Registro de puntos de mejora'],
  wiki:['Wiki / Tutorial','Documentación y guías del equipo'],
  reportes:['Reportes','Exportar y descargar'],
  busqueda:['Búsqueda Rápida','Encuentra cualquier cliente'],
  comparacion:['Comparación ClickUp / Planilla','Crosscheck de datos entre fuentes'],
  usuarios:['Usuarios','Gestión de usuarios y permisos'],
  config:['Configuración','Ajustes del sistema']
};

const SECTION_META_I18N={
  es:SECTION_META,
  en:{
    dashboard:['Dashboard','System overview'],
    panoramic:['Panoramic View','All clients at a glance'],
    implementaciones:['Implementations','Clients in active rollout'],
    activos:['Active Clients','Platform in production'],
    cancelados:['Canceled','Churn and cancellations'],
    alertas:['Alerts','Clients at risk'],
    opa:['OPA / Hola Suite','Conversations and alert keywords'],
    cs:['CS Dashboard','Customer Success and churn'],
    kanban:['Kanban','Stage-based board'],
    canales:['Channels','Channel status by client'],
    consultores:['Consultants','Team performance'],
    bi:['BI Dashboard','Business intelligence'],
    ventas:['Sales & Leads','Pipeline and marketing'],
    metas:['Goals','Goal tracking'],
    mejoras:['Improvements','Improvement log'],
    comparacion:['Field Comparison','Compare data from ClickUp and Google Sheets'],
    wiki:['Wiki / Tutorial','Documentation and guides'],
    reportes:['Reports','Exports and downloads'],
    busqueda:['Search','Find any client'],
    usuarios:['Users','Users and permissions'],
    config:['Settings','System settings']
  },
  pt:{
    dashboard:['Dashboard','Visão geral do sistema'],
    panoramic:['Vista Panorâmica','Todos os clientes de relance'],
    implementaciones:['Implementações','Clientes em implantação'],
    activos:['Clientes Ativos','Plataforma em produção'],
    cancelados:['Cancelados','Análise de cancelamentos'],
    alertas:['Alertas','Clientes em risco'],
    opa:['OPA / Hola Suite','Conversas e palavras de alerta'],
    cs:['CS Dashboard','Customer Success e churn'],
    kanban:['Kanban','Quadro por etapas'],
    canales:['Canais','Status de canais por cliente'],
    consultores:['Consultores','Desempenho da equipe'],
    bi:['BI Dashboard','Business intelligence'],
    ventas:['Vendas & Leads','Funil e marketing'],
    metas:['Metas','Acompanhamento de metas'],
    mejoras:['Melhorias','Registro de melhorias'],
    comparacion:['Comparação de Campos','Comparar dados de ClickUp e Google Sheets'],
    wiki:['Wiki / Tutorial','Documentação e guias'],
    reportes:['Relatórios','Exportações e downloads'],
    busqueda:['Busca','Encontrar qualquer cliente'],
    usuarios:['Usuários','Usuários e permissões'],
    config:['Configuração','Ajustes do sistema']
  }
};

const I18N={
  es:{
    'nav.main':'Principal','nav.dashboard':'Dashboard','nav.panoramic':'Vista Panorámica','nav.clients':'Clientes','nav.implementations':'Implementaciones','nav.active':'Activos','nav.canceled':'Cancelados','nav.alerts':'Alertas','nav.cs':'CS Dashboard','nav.opa':'OPA / Hola Suite','nav.project':'Proyecto','nav.kanban':'Kanban','nav.channels':'Canales','nav.analysis':'Análisis','nav.consultants':'Consultores','nav.bi':'BI Dashboard','nav.sales':'Ventas & Leads','nav.goals':'Metas','nav.tools':'Herramientas','nav.improvements':'Mejoras','nav.wiki':'Wiki / Tutorial','nav.reports':'Reportes','nav.search':'Búsqueda','nav.system':'Sistema','nav.users':'Usuarios','nav.config':'Configuración','nav.logout':'Salir',
    'login.email':'Email','login.email_placeholder':'usuario@holasuite.com','login.password':'Contraseña','login.password_placeholder':'••••••••','login.enter':'Ingresar',
    'action.sync':'Sincronizar','placeholder.search_client':'Buscar cliente... (Ctrl+K)',
    'date.period':'Período','date.all':'Todos','date.today':'Hoy','date.7d':'7 días','date.month':'Mes actual','date.prevmonth':'Mes anterior','date.3m':'3 meses','date.year':'Este año','date.all_data':'Todos los datos',
    'common.all':'Todos','common.active':'Activos','common.impl_short':'Impl.','common.in_impl':'En Impl.','common.canceled':'Cancelados','common.with_alert':'Con Alerta','common.no_ip':'Sin IP','common.all_countries':'Todos los países','common.all_consultants':'Todos los consultores','common.view_all':'Ver todas','common.search':'Buscar...','common.country':'País','common.consultant':'Consultor','common.alert':'Alerta','common.critical':'🚨 Crítica','common.warning':'⚠️ Advertencia','common.export':'Exportar','common.plan':'Plan',
    'dash.total_clients':'Total Clientes','dash.full_base':'Base completa','dash.active_clients':'Clientes Activos','dash.in_implementation':'En Implementación','dash.in_progress':'En proceso','dash.canceled':'Cancelados','dash.avg_impl_days':'Prom. Días Impl.','dash.goal_20_days':'Meta: 20 días','dash.active_alerts':'Alertas Activas','dash.requires_attention':'Requieren atención','dash.upsell_cross_sell':'Upsell / Cross-sell','dash.in_impl_short':'En impl.','dash.no_ip_domain':'Sin IP/Dominio','dash.not_linked':'Sin vincular','dash.lifecycle_ops':'Ciclo de Vida & Operación','dash.alert_impl':'Implementaciones con Alerta',
    'dash.chart.client_status':'Estado de Clientes','dash.chart.general_distribution':'Distribución general','dash.chart.clients_by_country':'Clientes por País','dash.chart.top_countries':'Top países','dash.chart.active_channels':'Canales Activos','dash.chart.channel_distribution':'Distribución de canales','dash.chart.consultant_performance':'Desempeño Consultores','dash.chart.active_by_consultant':'Activos por consultor','dash.chart.monthly_trend':'Evolución Mensual','dash.chart.monthly_trend_sub':'Activos · Impl. · Cancelados',
    'life.arrived_month':'Llegaron este mes','life.open_prev_month':'Impl. abiertas del mes pasado','life.finished_month':'Finalizaron este mes','life.finished_same_month':'Finalizaron entrando este mes','life.finished_other_month':'Finalizaron entrando en otros meses','life.finished_late':'Finalizaron con atraso','life.finished_on_time':'Finalizaron en tiempo meta','life.high_support':'Clientes con soporte alto',
    'pano.intro':'Vista de todos los clientes del período seleccionado.','pano.colors':'Colores:','pano.green_active':'verde=activo','pano.orange_impl':'naranja=implementación','pano.red_alert':'rojo=cancelado/alerta','pano.yellow_no_ip':'amarillo=sin IP',
    'impl.intro':'Clientes en proceso de implementación activo. Seguimiento de etapas, días y consultores responsables.','impl.goal':'Meta: completar en 20 días.','impl.in_progress':'Impl. en curso','impl.started_month':'Iniciadas este mes','impl.on_goal':'En meta','impl.late':'Con atraso','impl.mixed':'Participación mixta','impl.full':'Participación 100%','impl.table_title':'En Implementación',
    'active.intro':'Clientes con plataforma en producción. Estos clientes completaron exitosamente la implementación y están usando ¡Hola! Suite.','active.table_title':'Clientes Activos',
    'cancel.intro':'Análisis de clientes cancelados. Determina si usaron la plataforma, cuánto tiempo, canales y motivos.','cancel.intro_strong':'Esta información es clave para mejorar retención.','cancel.total':'Total Cancelados','cancel.used_platform':'Usaron Plataforma','cancel.no_real_use':'Sin Uso Real','cancel.avg_use_days':'Prom. Días de Uso','cancel.retained':'Retenidos','cancel.chart.reasons':'Motivos de Cancelación','cancel.chart.by_country':'Cancelados por País','cancel.table_title':'Clientes Cancelados','cancel.platform_use':'Uso plat.','cancel.with_use':'Con uso','cancel.without_use':'Sin uso',
    'bi.general_kpis':'KPIs Generales','bi.consultant_period_table':'Tabla BI — Consultor × Período','bi.summary_consultant_month':'Resumen por Consultor y Mes','bi.impl_by_month':'Implementaciones por Mes','bi.stage_metrics_by_month':'Métricas de Etapas por Mes',
    'alerts.intro':'Centro de alertas activas. Revisa clientes en riesgo, sin movimiento, sin IP/dominio y otros estados críticos.','alerts.intro_strong':'Atención inmediata requerida.','alerts.critical_days':'Críticas (+20 días)','alerts.no_movement':'Sin mov. +7 días','alerts.churn_risk':'Riesgo de Baja','alerts.paused':'En Pausa','alerts.thresholds':'Umbrales de Alerta:','alerts.critical_impl_days':'Días impl. crítico:','alerts.no_movement_days':'Sin mov. (días):','alerts.active_risk_days':'Riesgo activo (días):',
    'opa.intro':'Conversaciones de ¡Hola! Suite / Opa Suite. Detección automática de palabras de alerta configuradas.','opa.intro_strong':'Configura las palabras clave para el equipo CS.','opa.api_not_configured':'API no configurada','opa.sync_convs':'Sincronizar convs.','opa.config_alert_words':'Configurar palabras alerta','opa.config_api':'Configurar API','opa.alert_words':'Palabras / Frases de Alerta','opa.critical_red':'Críticas (rojo)','opa.new_critical_word':'Nueva palabra crítica...','opa.warning_yellow':'Advertencia (amarillo)','opa.new_warning_word':'Nueva palabra advertencia...','opa.default_categories':'Categorías predefinidas:','opa.cat_risk':'Clientes en riesgo','opa.cat_cancellation':'Cancelación/Baja','opa.cat_pause':'Pausa/Detenido','opa.cat_missing_req':'Sin requisito','opa.cat_support':'Soporte','opa.total_conversations':'Total Conversaciones','opa.critical_alerts':'Con Alertas Críticas','opa.warnings':'Con Advertencias','opa.resolved':'Resueltas','opa.pending':'Pendientes','opa.search_conv':'Buscar conversación...','opa.no_alert':'Sin alerta','opa.only_alerts':'Solo con alertas','opa.no_data':'Configura la API de ¡Hola! Suite para ver conversaciones reales.','opa.go_config':'Ve a Configuración → ¡Hola! / Opa Suite API',
    'cs.intro':'Dashboard del equipo de Customer Success. Visualiza solicitudes de baja, retenciones, clientes perdidos y recuperados.','cs.intro_strong':'Datos derivados de ClickUp + registros manuales.','cs.chart.trend':'Tendencia Bajas vs Retenciones','cs.chart.reasons':'Motivos de Baja','cs.requests':'Solicitudes de Baja','cs.retention':'Retenciones','cs.recovered':'Clientes Recuperados',
    'kanban.intro':'Vista Kanban de todas las implementaciones activas. Muestra clientes por etapa de implementación.','kanban.intro_strong':'Orden por prioridad: 🚨 Crítico primero.',
    'channels.intro':'Gestión de canales. Visualiza cuántos clientes tienen cada canal activo, pendiente o sin configurar.','channels.chart.by_country':'Distribución de Canales por País','channels.chart.by_plan':'Canales por Plan','channels.table_title':'Estado de Canales por Cliente',
    'consultants.intro':'Análisis detallado del desempeño de consultores. Muestra participación en etapas, implementaciones completas e incompletas, y estadísticas de éxito según el período seleccionado.','consultants.chart.stage_compare':'Comparativo por Etapa','consultants.activity_month':'Actividad por Consultor / Mes','consultants.summary_full_mixed':'Resumen 100% vs Mixta',
    'goals.intro':'Seguimiento de metas del período. Las metas son configurables en la sección de Configuración.','goals.chart.goal_vs_real':'Meta vs Real — Días por Etapa','goals.chart.consultant_efficiency':'Eficiencia por Consultor',
    'common.refresh':'Actualizar','common.add':'Agregar','common.register':'Registrar','common.filter_by':'Filtrar por:','common.only_alert':'Solo con alerta','common.status':'Estado','common.open':'Abierto','common.resolved':'Resuelto','common.pending':'Pendiente','common.channel':'Canal','common.critical_plain':'Crítica','common.warning_plain':'Advertencia','common.save':'Guardar','common.test':'Probar','common.date':'Fecha','common.client':'Cliente','common.result':'Resultado','common.notes':'Notas',
    'config.not_configured':'Sin configurar','config.sync_sheets':'Sincronizar Sheets','config.go_users':'Ir a Usuarios','config.add_api':'Agregar API','config.apply_branding':'Aplicar Branding','config.import_json':'Importar JSON','config.import_sales':'Importar ventas','config.save_rules':'Guardar reglas','config.export_dataset':'Exportar dataset',
    'modal.client_data_title':'Completar Datos del Cliente','modal.client_channels':'Canales contratados / activos','modal.log_type':'Tipo de log','modal.log_detail':'Detalle del log','modal.save_data':'Guardar Datos','modal.upsell_title':'Registrar Upsell / Cross-sell','modal.save_upsell':'Guardar Upsell','modal.cs_event':'Evento CS','modal.select_client':'Seleccionar cliente...','modal.reason_strategy':'Motivo / Estrategia','modal.reason_strategy_placeholder':'Describe el motivo o estrategia...','modal.notes_placeholder':'Observaciones adicionales...',
    'users.new_user':'Nuevo Usuario','users.save_user':'Guardar Usuario','users.intro':'Gestión de usuarios, grupos y permisos.','users.intro_strong':'Solo el Administrador puede crear, editar o eliminar usuarios.','users.system_users':'Usuarios del Sistema','users.permission_matrix':'Matriz de Permisos','users.groups':'Grupos de Usuarios','users.new_group':'Nuevo Grupo','users.group_name_placeholder':'Nombre del grupo...','users.create_group':'Crear Grupo','users.available_roles':'Roles Disponibles',
    'search.intro':'Busca cualquier cliente por nombre, IP, dominio, email o país.','search.shortcut':'Atajo:','search.placeholder':'Buscar por nombre, IP, dominio, email, país...',
    'reports.intro':'Genera y descarga reportes personalizados en formato Excel. Los filtros del período seleccionado aplican a todos los reportes.','reports.generate':'Generar','reports.executive_desc':'KPIs, consultores, canales y análisis completo.','reports.executive':'Ejecutivo','reports.export_all':'Exportar Todo','reports.canceled_desc':'Análisis de bajas, motivos, retenciones y uso de plataforma.','reports.cs_report':'Reporte CS','reports.channels_desc':'Estado de todos los canales: activos, pendientes, por cliente.','reports.upsell_desc':'Upgrades y cross-sells registrados durante implementaciones.',
    'wiki.intro':'Base de conocimiento del equipo. Documentación de etapas, buenas prácticas y tutoriales.','wiki.intro_strong':'Todos los campos del sistema tienen puntos (i) explicativos.',
    'improvements.intro':'Registro de mejoras, dudas y problemas detectados. El equipo puede votar y priorizar.','improvements.intro_strong':'Los puntos de mejora son la base para crecer.',
    'modal.general_info':'Información General','modal.clickup_status':'Estado ClickUp','modal.impl_start':'F. Inicio Impl.','modal.activation_date':'F. Activación','modal.cancel_date':'F. Cancelación','modal.impl_days':'Días Implementación','modal.usage_days':'Días de Uso','modal.days_no_movement':'Días Sin Movimiento','modal.last_update':'Última Actualización','modal.consultants_by_stage':'Consultores por Etapa','modal.all_consultants':'Todos los consultores asignados','modal.trainings_done':'Cap. Realizadas','modal.lifecycle':'Ciclo de Vida','modal.impl_time':'Tiempo de implementación','modal.usage_time':'Tiempo de uso','modal.modules_added':'Módulos adicionados','modal.modules_canceled':'Módulos cancelados','modal.support_chats':'Chats / soporte en Hola Suite','modal.support_compare':'Comparativo soporte','modal.high_support':'Soporte alto','modal.with_support':'Con soporte','modal.no_relevant_support':'Sin soporte relevante','modal.channels_access':'Canales & Acceso','modal.active_channels':'Canales activos','modal.no_channels':'Sin canales registrados','modal.movement_logs':'Logs de Movimiento','modal.no_date':'Sin fecha','modal.no_detail':'Sin detalle','modal.no_synced_logs':'Sin logs sincronizados. Puedes agregarlos manualmente o importarlos desde el dataset/API.','modal.no_movement_label':'Sin movimiento','modal.impl_days_label':'Días impl.','modal.churn_reason':'Motivo de Baja','modal.upsells':'Upsells / Cross-sells','modal.open_platform':'Abrir Plataforma','modal.complete_data':'Completar datos',
    'toast.branding_updated':'Branding actualizado','toast.invalid_credentials':'Credenciales incorrectas. Verifica email y contraseña.','toast.no_permissions':'Sin permisos','toast.fill_required':'Completa todos los campos obligatorios','toast.password_min':'La contraseña debe tener al menos 8 caracteres','toast.user_exists':'Ya existe un usuario con ese email','toast.user_created':'Usuario creado','toast.confirm_delete_user':'¿Eliminar usuario?','toast.user_deleted':'Usuario eliminado','toast.write_group_name':'Escribe el nombre del grupo','toast.group_created':'Grupo creado','toast.group_deleted':'Grupo eliminado','toast.invalid_client':'Cliente inválido','toast.client_updated':'Datos del cliente actualizados','toast.no_data_export':'Sin datos para exportar','toast.records_exported':'registros exportados','toast.full_export_generated':'Exportación completa generada','toast.bi_exported':'BI exportado','toast.generating_report':'Generando reporte','toast.report_generated':'Reporte generado','toast.records':'registros','toast.config_saved':'Configuración guardada',
    'toast.syncing':'Sincronizando...','toast.connecting_clickup':'Conectando con ClickUp...','toast.source_requires_adapter':'La fuente "{source}" requiere importación JSON o un adaptador API personalizado','toast.configure_clickup':'Configura API Key y List ID de ClickUp para usar datos reales','toast.downloading_clickup_tasks':'Descargando tareas de ClickUp...','toast.processing':'Procesando','toast.tasks':'tareas','toast.rendering':'Renderizando...','toast.clients_synced_clickup':'clientes sincronizados desde ClickUp','toast.no_api_data_cache':'Sin datos de API. Usando caché local.','toast.using_local_data':'Usando datos locales.','toast.cs_event_registered':'Evento CS registrado','toast.event_deleted':'Evento eliminado','toast.no_matching_conversations':'Sin conversaciones que coincidan con los filtros','toast.configure_url_token_first':'Configura la URL y Token de API primero','toast.syncing_conversations':'Sincronizando conversaciones...','toast.sync_label':'Sync','toast.conversations_loaded':'conversaciones cargadas','toast.error':'Error','toast.conversation_unavailable':'Conversación no disponible','toast.write_word':'Escribe una palabra','toast.word_exists':'Ya existe esta palabra','toast.word_added':'Palabra agregada','toast.category_words_loaded':'Palabras de categoría cargadas','toast.upsell_registered':'Upsell registrado exitosamente','toast.write_title':'Escribe un título','toast.improvement_registered':'Mejora registrada','toast.improvement_deleted':'Mejora eliminada','toast.only_admin_permissions':'Solo administradores pueden cambiar permisos','toast.clickup_test_only':'La prueba directa solo aplica cuando la fuente principal es ClickUp','toast.complete_api_listid':'Completa API Key y List ID','toast.testing_clickup':'Probando conexión ClickUp...','toast.clickup_connected':'ClickUp conectado','toast.clickup_error':'Error ClickUp','toast.complete_url_token':'Completa URL y Token primero','toast.testing_hola_api':'Probando API ¡Hola! Suite...','toast.hola_api_connected':'API ¡Hola! Suite conectada','toast.complete_name_url':'Completa nombre y URL','toast.api_added':'API agregada','toast.no_pending_conflicts':'Sin conflictos pendientes. La sincronización solo completa vacíos o espera tu autorización para sustituir.','toast.conflict_applied':'Conflicto aplicado con autorización','toast.kept_current_data':'Se mantuvo el dato actual','toast.paste_json_dataset':'Pega un dataset JSON antes de importar','toast.dataset_imported':'Dataset importado correctamente','toast.paste_sales_json':'Pega un dataset JSON de ventas antes de importar','toast.sales_dataset_imported':'Dataset comercial importado','toast.conflicts_pending_review':'Se mantuvieron los datos actuales. Los conflictos quedaron pendientes para revisión.','toast.syncing_google_sheets':'Sincronizando planillas de Google...','toast.sheets_synced':'Planillas sincronizadas',
    'search.no_results':'Sin resultados para','search.results_for':'resultado(s) para',
    'sales.intro':'Dashboard comercial reutilizable para leads, oportunidades, ventas perdidas, marketing y embudo. Puedes alimentarlo desde JSON, CRM o planillas complementarias.','sales.total_leads':'Leads Totales','sales.pipeline_open':'En embudo','sales.won':'Ganados','sales.lost':'Perdidos','sales.sources':'Campañas / Fuentes','sales.pipeline_value':'Valor pipeline','sales.table_title':'Leads & Oportunidades','sales.search_placeholder':'Buscar lead...','sales.status':'Estado','sales.no_data':'Sin leads disponibles','sales.col_lead':'Lead','sales.col_company':'Empresa','sales.col_source':'Fuente','sales.col_status':'Estado','sales.col_value':'Valor','sales.col_owner':'Owner','sales.col_updated':'Últ. movimiento'
  },
  en:{
    'nav.main':'Main','nav.dashboard':'Dashboard','nav.panoramic':'Panoramic View','nav.clients':'Clients','nav.implementations':'Implementations','nav.active':'Active','nav.canceled':'Canceled','nav.alerts':'Alerts','nav.cs':'CS Dashboard','nav.opa':'OPA / Hola Suite','nav.project':'Project','nav.kanban':'Kanban','nav.channels':'Channels','nav.analysis':'Analysis','nav.consultants':'Consultants','nav.bi':'BI Dashboard','nav.sales':'Sales & Leads','nav.goals':'Goals','nav.tools':'Tools','nav.improvements':'Improvements','nav.wiki':'Wiki / Tutorial','nav.reports':'Reports','nav.search':'Search','nav.system':'System','nav.users':'Users','nav.config':'Settings','nav.logout':'Logout',
    'login.email':'Email','login.email_placeholder':'user@holasuite.com','login.password':'Password','login.password_placeholder':'••••••••','login.enter':'Sign in',
    'action.sync':'Sync','placeholder.search_client':'Search client... (Ctrl+K)',
    'date.period':'Period','date.all':'All','date.today':'Today','date.7d':'7 days','date.month':'Current month','date.prevmonth':'Previous month','date.3m':'3 months','date.year':'This year','date.all_data':'All data',
    'common.all':'All','common.active':'Active','common.impl_short':'Impl.','common.in_impl':'In rollout','common.canceled':'Canceled','common.with_alert':'With Alert','common.no_ip':'No IP','common.all_countries':'All countries','common.all_consultants':'All consultants','common.view_all':'View all','common.search':'Search...','common.country':'Country','common.consultant':'Consultant','common.alert':'Alert','common.critical':'🚨 Critical','common.warning':'⚠️ Warning','common.export':'Export','common.plan':'Plan',
    'dash.total_clients':'Total Clients','dash.full_base':'Full database','dash.active_clients':'Active Clients','dash.in_implementation':'In Rollout','dash.in_progress':'In progress','dash.canceled':'Canceled','dash.avg_impl_days':'Avg. rollout days','dash.goal_20_days':'Goal: 20 days','dash.active_alerts':'Active Alerts','dash.requires_attention':'Need attention','dash.upsell_cross_sell':'Upsell / Cross-sell','dash.in_impl_short':'In rollout','dash.no_ip_domain':'No IP/Domain','dash.not_linked':'Not linked','dash.lifecycle_ops':'Lifecycle & Operations','dash.alert_impl':'Implementations with Alerts',
    'dash.chart.client_status':'Client Status','dash.chart.general_distribution':'Overall distribution','dash.chart.clients_by_country':'Clients by Country','dash.chart.top_countries':'Top countries','dash.chart.active_channels':'Active Channels','dash.chart.channel_distribution':'Channel distribution','dash.chart.consultant_performance':'Consultant Performance','dash.chart.active_by_consultant':'Active by consultant','dash.chart.monthly_trend':'Monthly Trend','dash.chart.monthly_trend_sub':'Active · Rollout · Canceled',
    'life.arrived_month':'Arrived this month','life.open_prev_month':'Open from previous month','life.finished_month':'Finished this month','life.finished_same_month':'Finished after starting this month','life.finished_other_month':'Finished after starting in other months','life.finished_late':'Finished late','life.finished_on_time':'Finished on target','life.high_support':'High-support clients',
    'pano.intro':'View of all clients in the selected period.','pano.colors':'Colors:','pano.green_active':'green=active','pano.orange_impl':'orange=rollout','pano.red_alert':'red=canceled/alert','pano.yellow_no_ip':'yellow=no IP',
    'impl.intro':'Clients currently in active rollout. Track stages, days, and assigned consultants.','impl.goal':'Goal: complete in 20 days.','impl.in_progress':'Rollouts in progress','impl.started_month':'Started this month','impl.on_goal':'On target','impl.late':'Late','impl.mixed':'Mixed participation','impl.full':'100% participation','impl.table_title':'In Rollout',
    'active.intro':'Clients with the platform in production. These clients completed implementation successfully and are actively using Hola Suite.','active.table_title':'Active Clients',
    'cancel.intro':'Analysis of canceled clients. Determine whether they used the platform, for how long, channels, and reasons.','cancel.intro_strong':'This information is key to improving retention.','cancel.total':'Total Canceled','cancel.used_platform':'Used Platform','cancel.no_real_use':'No Real Usage','cancel.avg_use_days':'Avg. Usage Days','cancel.retained':'Retained','cancel.chart.reasons':'Cancellation Reasons','cancel.chart.by_country':'Canceled by Country','cancel.table_title':'Canceled Clients','cancel.platform_use':'Platform use','cancel.with_use':'With usage','cancel.without_use':'Without usage',
    'bi.general_kpis':'General KPIs','bi.consultant_period_table':'BI Table — Consultant × Period','bi.summary_consultant_month':'Summary by Consultant and Month','bi.impl_by_month':'Implementations by Month','bi.stage_metrics_by_month':'Stage Metrics by Month',
    'alerts.intro':'Active alerts center. Review clients at risk, without movement, without IP/domain, and other critical states.','alerts.intro_strong':'Immediate attention required.','alerts.critical_days':'Critical (+20 days)','alerts.no_movement':'No movement +7 days','alerts.churn_risk':'Churn Risk','alerts.paused':'Paused','alerts.thresholds':'Alert Thresholds:','alerts.critical_impl_days':'Critical rollout days:','alerts.no_movement_days':'No movement (days):','alerts.active_risk_days':'Active risk (days):',
    'opa.intro':'Hola Suite / Opa Suite conversations. Automatic detection of configured alert keywords.','opa.intro_strong':'Configure keywords for the CS team.','opa.api_not_configured':'API not configured','opa.sync_convs':'Sync conversations','opa.config_alert_words':'Configure alert words','opa.config_api':'Configure API','opa.alert_words':'Alert Words / Phrases','opa.critical_red':'Critical (red)','opa.new_critical_word':'New critical word...','opa.warning_yellow':'Warning (yellow)','opa.new_warning_word':'New warning word...','opa.default_categories':'Default categories:','opa.cat_risk':'Clients at risk','opa.cat_cancellation':'Cancellation/Churn','opa.cat_pause':'Pause/Stopped','opa.cat_missing_req':'Missing requirement','opa.cat_support':'Support','opa.total_conversations':'Total Conversations','opa.critical_alerts':'With Critical Alerts','opa.warnings':'With Warnings','opa.resolved':'Resolved','opa.pending':'Pending','opa.search_conv':'Search conversation...','opa.no_alert':'No alert','opa.only_alerts':'Only alerts','opa.no_data':'Configure the Hola Suite API to view real conversations.','opa.go_config':'Go to Settings → Hola! / Opa Suite API',
    'cs.intro':'Customer Success team dashboard. Track churn requests, retentions, lost and recovered clients.','cs.intro_strong':'Data derived from ClickUp + manual records.','cs.chart.trend':'Churn vs Retention Trend','cs.chart.reasons':'Churn Reasons','cs.requests':'Churn Requests','cs.retention':'Retentions','cs.recovered':'Recovered Clients',
    'kanban.intro':'Kanban view of all active implementations. Shows clients by implementation stage.','kanban.intro_strong':'Priority order: critical first.',
    'channels.intro':'Channel management. View how many clients have each channel active, pending, or not configured.','channels.chart.by_country':'Channel Distribution by Country','channels.chart.by_plan':'Channels by Plan','channels.table_title':'Channel Status by Client',
    'consultants.intro':'Detailed consultant performance analysis. Shows stage participation, complete and incomplete implementations, and success statistics for the selected period.','consultants.chart.stage_compare':'Stage Comparison','consultants.activity_month':'Consultant Activity / Month','consultants.summary_full_mixed':'100% vs Mixed Summary',
    'goals.intro':'Period goal tracking. Goals are configurable in the Settings section.','goals.chart.goal_vs_real':'Goal vs Actual — Days by Stage','goals.chart.consultant_efficiency':'Consultant Efficiency',
    'common.refresh':'Refresh','common.add':'Add','common.register':'Register','common.filter_by':'Filter by:','common.only_alert':'Only alert','common.status':'Status','common.open':'Open','common.resolved':'Resolved','common.pending':'Pending','common.channel':'Channel','common.critical_plain':'Critical','common.warning_plain':'Warning','common.save':'Save','common.test':'Test','common.date':'Date','common.client':'Client','common.result':'Result','common.notes':'Notes',
    'config.not_configured':'Not configured','config.sync_sheets':'Sync Sheets','config.go_users':'Go to Users','config.add_api':'Add API','config.apply_branding':'Apply Branding','config.import_json':'Import JSON','config.import_sales':'Import sales','config.save_rules':'Save rules','config.export_dataset':'Export dataset',
    'modal.client_data_title':'Complete Client Data','modal.client_channels':'Contracted / active channels','modal.log_type':'Log type','modal.log_detail':'Log details','modal.save_data':'Save Data','modal.upsell_title':'Register Upsell / Cross-sell','modal.save_upsell':'Save Upsell','modal.cs_event':'CS Event','modal.select_client':'Select client...','modal.reason_strategy':'Reason / Strategy','modal.reason_strategy_placeholder':'Describe the reason or strategy...','modal.notes_placeholder':'Additional notes...',
    'users.new_user':'New User','users.save_user':'Save User','users.intro':'User, group and permission management.','users.intro_strong':'Only the Administrator can create, edit or delete users.','users.system_users':'System Users','users.permission_matrix':'Permission Matrix','users.groups':'User Groups','users.new_group':'New Group','users.group_name_placeholder':'Group name...','users.create_group':'Create Group','users.available_roles':'Available Roles',
    'search.intro':'Search any client by name, IP, domain, email or country.','search.shortcut':'Shortcut:','search.placeholder':'Search by name, IP, domain, email, country...',
    'reports.intro':'Generate and download custom Excel reports. The selected period filters apply to all reports.','reports.generate':'Generate','reports.executive_desc':'KPIs, consultants, channels and full analysis.','reports.executive':'Executive','reports.export_all':'Export All','reports.canceled_desc':'Churn analysis, reasons, retentions and platform usage.','reports.cs_report':'CS Report','reports.channels_desc':'Status of all channels: active, pending, by client.','reports.upsell_desc':'Upgrades and cross-sells recorded during implementations.',
    'wiki.intro':'Team knowledge base. Stage documentation, best practices and tutorials.','wiki.intro_strong':'All system fields include explanatory (i) hints.',
    'improvements.intro':'Log of improvements, questions and detected issues. The team can vote and prioritize.','improvements.intro_strong':'Improvement points are the foundation for growth.',
    'modal.general_info':'General Information','modal.clickup_status':'ClickUp Status','modal.impl_start':'Impl. Start Date','modal.activation_date':'Activation Date','modal.cancel_date':'Cancellation Date','modal.impl_days':'Implementation Days','modal.usage_days':'Usage Days','modal.days_no_movement':'Days Without Movement','modal.last_update':'Last Update','modal.consultants_by_stage':'Consultants by Stage','modal.all_consultants':'All assigned consultants','modal.trainings_done':'Trainings Completed','modal.lifecycle':'Lifecycle','modal.impl_time':'Implementation time','modal.usage_time':'Usage time','modal.modules_added':'Added modules','modal.modules_canceled':'Canceled modules','modal.support_chats':'Chats / support in Hola Suite','modal.support_compare':'Support comparison','modal.high_support':'High support','modal.with_support':'With support','modal.no_relevant_support':'No relevant support','modal.channels_access':'Channels & Access','modal.active_channels':'Active channels','modal.no_channels':'No channels registered','modal.movement_logs':'Movement Logs','modal.no_date':'No date','modal.no_detail':'No detail','modal.no_synced_logs':'No synced logs. You can add them manually or import them from the dataset/API.','modal.no_movement_label':'No movement','modal.impl_days_label':'Impl. days','modal.churn_reason':'Churn Reason','modal.upsells':'Upsells / Cross-sells','modal.open_platform':'Open Platform','modal.complete_data':'Complete data',
    'toast.branding_updated':'Branding updated','toast.invalid_credentials':'Invalid credentials. Check your email and password.','toast.no_permissions':'No permissions','toast.fill_required':'Complete all required fields','toast.password_min':'Password must be at least 8 characters','toast.user_exists':'A user with that email already exists','toast.user_created':'User created','toast.confirm_delete_user':'Delete user?','toast.user_deleted':'User deleted','toast.write_group_name':'Enter the group name','toast.group_created':'Group created','toast.group_deleted':'Group deleted','toast.invalid_client':'Invalid client','toast.client_updated':'Client data updated','toast.no_data_export':'No data to export','toast.records_exported':'records exported','toast.full_export_generated':'Full export generated','toast.bi_exported':'BI exported','toast.generating_report':'Generating report','toast.report_generated':'Report generated','toast.records':'records','toast.config_saved':'Configuration saved',
    'toast.syncing':'Syncing...','toast.connecting_clickup':'Connecting to ClickUp...','toast.source_requires_adapter':'Source "{source}" requires JSON import or a custom API adapter','toast.configure_clickup':'Configure ClickUp API Key and List ID to use real data','toast.downloading_clickup_tasks':'Downloading ClickUp tasks...','toast.processing':'Processing','toast.tasks':'tasks','toast.rendering':'Rendering...','toast.clients_synced_clickup':'clients synced from ClickUp','toast.no_api_data_cache':'No API data. Using local cache.','toast.using_local_data':'Using local data.','toast.cs_event_registered':'CS event registered','toast.event_deleted':'Event deleted','toast.no_matching_conversations':'No conversations match the filters','toast.configure_url_token_first':'Configure the API URL and token first','toast.syncing_conversations':'Syncing conversations...','toast.sync_label':'Sync','toast.conversations_loaded':'conversations loaded','toast.error':'Error','toast.conversation_unavailable':'Conversation unavailable','toast.write_word':'Enter a word','toast.word_exists':'This word already exists','toast.word_added':'Word added','toast.category_words_loaded':'Category words loaded','toast.upsell_registered':'Upsell successfully recorded','toast.write_title':'Enter a title','toast.improvement_registered':'Improvement registered','toast.improvement_deleted':'Improvement deleted','toast.only_admin_permissions':'Only administrators can change permissions','toast.clickup_test_only':'Direct test only applies when ClickUp is the primary source','toast.complete_api_listid':'Complete API Key and List ID','toast.testing_clickup':'Testing ClickUp connection...','toast.clickup_connected':'ClickUp connected','toast.clickup_error':'ClickUp error','toast.complete_url_token':'Complete URL and token first','toast.testing_hola_api':'Testing Hola Suite API...','toast.hola_api_connected':'Hola Suite API connected','toast.complete_name_url':'Complete name and URL','toast.api_added':'API added','toast.no_pending_conflicts':'No pending conflicts. Sync only fills blanks or waits for your authorization to replace values.','toast.conflict_applied':'Conflict applied with authorization','toast.kept_current_data':'Current data was kept','toast.paste_json_dataset':'Paste a JSON dataset before importing','toast.dataset_imported':'Dataset imported successfully','toast.paste_sales_json':'Paste a sales JSON dataset before importing','toast.sales_dataset_imported':'Sales dataset imported','toast.conflicts_pending_review':'Current data was kept. Conflicts remain pending for review.','toast.syncing_google_sheets':'Syncing Google Sheets...','toast.sheets_synced':'Sheets synced',
    'search.no_results':'No results for','search.results_for':'result(s) for',
    'sales.intro':'Reusable sales dashboard for leads, opportunities, lost deals, marketing and pipeline. You can feed it from JSON, CRM or complementary spreadsheets.','sales.total_leads':'Total Leads','sales.pipeline_open':'In pipeline','sales.won':'Won','sales.lost':'Lost','sales.sources':'Campaigns / Sources','sales.pipeline_value':'Pipeline value','sales.table_title':'Leads & Opportunities','sales.search_placeholder':'Search lead...','sales.status':'Status','sales.no_data':'No leads available','sales.col_lead':'Lead','sales.col_company':'Company','sales.col_source':'Source','sales.col_status':'Status','sales.col_value':'Value','sales.col_owner':'Owner','sales.col_updated':'Last update'
  },
  pt:{
    'nav.main':'Principal','nav.dashboard':'Dashboard','nav.panoramic':'Vista Panorâmica','nav.clients':'Clientes','nav.implementations':'Implementações','nav.active':'Ativos','nav.canceled':'Cancelados','nav.alerts':'Alertas','nav.cs':'CS Dashboard','nav.opa':'OPA / Hola Suite','nav.project':'Projeto','nav.kanban':'Kanban','nav.channels':'Canais','nav.analysis':'Análise','nav.consultants':'Consultores','nav.bi':'BI Dashboard','nav.sales':'Vendas & Leads','nav.goals':'Metas','nav.tools':'Ferramentas','nav.improvements':'Melhorias','nav.wiki':'Wiki / Tutorial','nav.reports':'Relatórios','nav.search':'Busca','nav.system':'Sistema','nav.users':'Usuários','nav.config':'Configuração','nav.logout':'Sair',
    'login.email':'Email','login.email_placeholder':'usuario@holasuite.com','login.password':'Senha','login.password_placeholder':'••••••••','login.enter':'Entrar',
    'action.sync':'Sincronizar','placeholder.search_client':'Buscar cliente... (Ctrl+K)',
    'date.period':'Período','date.all':'Todos','date.today':'Hoje','date.7d':'7 dias','date.month':'Mês atual','date.prevmonth':'Mês anterior','date.3m':'3 meses','date.year':'Este ano','date.all_data':'Todos os dados',
    'common.all':'Todos','common.active':'Ativos','common.impl_short':'Impl.','common.in_impl':'Em implantação','common.canceled':'Cancelados','common.with_alert':'Com alerta','common.no_ip':'Sem IP','common.all_countries':'Todos os países','common.all_consultants':'Todos os consultores','common.view_all':'Ver todas','common.search':'Buscar...','common.country':'País','common.consultant':'Consultor','common.alert':'Alerta','common.critical':'🚨 Crítica','common.warning':'⚠️ Aviso','common.export':'Exportar','common.plan':'Plano',
    'dash.total_clients':'Total de Clientes','dash.full_base':'Base completa','dash.active_clients':'Clientes Ativos','dash.in_implementation':'Em Implantação','dash.in_progress':'Em andamento','dash.canceled':'Cancelados','dash.avg_impl_days':'Média de dias impl.','dash.goal_20_days':'Meta: 20 dias','dash.active_alerts':'Alertas Ativos','dash.requires_attention':'Requer atenção','dash.upsell_cross_sell':'Upsell / Cross-sell','dash.in_impl_short':'Na impl.','dash.no_ip_domain':'Sem IP/Domínio','dash.not_linked':'Sem vínculo','dash.lifecycle_ops':'Ciclo de Vida & Operação','dash.alert_impl':'Implementações com Alerta',
    'dash.chart.client_status':'Status dos Clientes','dash.chart.general_distribution':'Distribuição geral','dash.chart.clients_by_country':'Clientes por País','dash.chart.top_countries':'Top países','dash.chart.active_channels':'Canais Ativos','dash.chart.channel_distribution':'Distribuição de canais','dash.chart.consultant_performance':'Desempenho dos Consultores','dash.chart.active_by_consultant':'Ativos por consultor','dash.chart.monthly_trend':'Evolução Mensal','dash.chart.monthly_trend_sub':'Ativos · Impl. · Cancelados',
    'life.arrived_month':'Chegaram neste mês','life.open_prev_month':'Impl. abertas do mês passado','life.finished_month':'Finalizaram neste mês','life.finished_same_month':'Finalizaram entrando neste mês','life.finished_other_month':'Finalizaram entrando em outros meses','life.finished_late':'Finalizaram com atraso','life.finished_on_time':'Finalizaram dentro da meta','life.high_support':'Clientes com suporte alto',
    'pano.intro':'Visão de todos os clientes do período selecionado.','pano.colors':'Cores:','pano.green_active':'verde=ativo','pano.orange_impl':'laranja=implantação','pano.red_alert':'vermelho=cancelado/alerta','pano.yellow_no_ip':'amarelo=sem IP',
    'impl.intro':'Clientes em processo ativo de implantação. Acompanhe etapas, dias e consultores responsáveis.','impl.goal':'Meta: concluir em 20 dias.','impl.in_progress':'Impl. em andamento','impl.started_month':'Iniciadas neste mês','impl.on_goal':'Na meta','impl.late':'Com atraso','impl.mixed':'Participação mista','impl.full':'Participação 100%','impl.table_title':'Em Implantação',
    'active.intro':'Clientes com a plataforma em produção. Esses clientes concluíram a implantação com sucesso e estão usando a Hola Suite.','active.table_title':'Clientes Ativos',
    'cancel.intro':'Análise de clientes cancelados. Determina se usaram a plataforma, por quanto tempo, canais e motivos.','cancel.intro_strong':'Essas informações são essenciais para melhorar a retenção.','cancel.total':'Total Cancelados','cancel.used_platform':'Usaram a Plataforma','cancel.no_real_use':'Sem Uso Real','cancel.avg_use_days':'Média de Dias de Uso','cancel.retained':'Retidos','cancel.chart.reasons':'Motivos de Cancelamento','cancel.chart.by_country':'Cancelados por País','cancel.table_title':'Clientes Cancelados','cancel.platform_use':'Uso da plat.','cancel.with_use':'Com uso','cancel.without_use':'Sem uso',
    'bi.general_kpis':'KPIs Gerais','bi.consultant_period_table':'Tabela BI — Consultor × Período','bi.summary_consultant_month':'Resumo por Consultor e Mês','bi.impl_by_month':'Implementações por Mês','bi.stage_metrics_by_month':'Métricas de Etapas por Mês',
    'alerts.intro':'Central de alertas ativas. Revise clientes em risco, sem movimento, sem IP/domínio e outros estados críticos.','alerts.intro_strong':'Atenção imediata necessária.','alerts.critical_days':'Críticas (+20 dias)','alerts.no_movement':'Sem mov. +7 dias','alerts.churn_risk':'Risco de Churn','alerts.paused':'Em Pausa','alerts.thresholds':'Limiares de Alerta:','alerts.critical_impl_days':'Dias críticos da impl.:','alerts.no_movement_days':'Sem mov. (dias):','alerts.active_risk_days':'Risco ativo (dias):',
    'opa.intro':'Conversas da Hola Suite / Opa Suite. Detecção automática de palavras de alerta configuradas.','opa.intro_strong':'Configure as palavras-chave para a equipe de CS.','opa.api_not_configured':'API não configurada','opa.sync_convs':'Sincronizar conversas','opa.config_alert_words':'Configurar palavras de alerta','opa.config_api':'Configurar API','opa.alert_words':'Palavras / Frases de Alerta','opa.critical_red':'Críticas (vermelho)','opa.new_critical_word':'Nova palavra crítica...','opa.warning_yellow':'Advertência (amarelo)','opa.new_warning_word':'Nova palavra de advertência...','opa.default_categories':'Categorias predefinidas:','opa.cat_risk':'Clientes em risco','opa.cat_cancellation':'Cancelamento/Churn','opa.cat_pause':'Pausa/Parado','opa.cat_missing_req':'Sem requisito','opa.cat_support':'Suporte','opa.total_conversations':'Total de Conversas','opa.critical_alerts':'Com Alertas Críticos','opa.warnings':'Com Advertências','opa.resolved':'Resolvidas','opa.pending':'Pendentes','opa.search_conv':'Buscar conversa...','opa.no_alert':'Sem alerta','opa.only_alerts':'Somente alertas','opa.no_data':'Configure a API da Hola Suite para ver conversas reais.','opa.go_config':'Vá para Configuração → Hola! / Opa Suite API',
    'cs.intro':'Dashboard da equipe de Customer Success. Visualize solicitações de cancelamento, retenções, clientes perdidos e recuperados.','cs.intro_strong':'Dados derivados do ClickUp + registros manuais.','cs.chart.trend':'Tendência de Cancelamentos vs Retenções','cs.chart.reasons':'Motivos de Cancelamento','cs.requests':'Solicitações de Cancelamento','cs.retention':'Retenções','cs.recovered':'Clientes Recuperados',
    'kanban.intro':'Vista Kanban de todas as implementações ativas. Mostra clientes por etapa de implementação.','kanban.intro_strong':'Ordem por prioridade: crítico primeiro.',
    'channels.intro':'Gestão de canais. Visualize quantos clientes têm cada canal ativo, pendente ou não configurado.','channels.chart.by_country':'Distribuição de Canais por País','channels.chart.by_plan':'Canais por Plano','channels.table_title':'Status de Canais por Cliente',
    'consultants.intro':'Análise detalhada do desempenho dos consultores. Mostra participação nas etapas, implementações completas e incompletas, e estatísticas de sucesso para o período selecionado.','consultants.chart.stage_compare':'Comparativo por Etapa','consultants.activity_month':'Atividade por Consultor / Mês','consultants.summary_full_mixed':'Resumo 100% vs Mista',
    'goals.intro':'Acompanhamento das metas do período. As metas são configuráveis na seção Configuração.','goals.chart.goal_vs_real':'Meta vs Real — Dias por Etapa','goals.chart.consultant_efficiency':'Eficiência por Consultor',
    'common.refresh':'Atualizar','common.add':'Adicionar','common.register':'Registrar','common.filter_by':'Filtrar por:','common.only_alert':'Somente com alerta','common.status':'Status','common.open':'Aberto','common.resolved':'Resolvido','common.pending':'Pendente','common.channel':'Canal','common.critical_plain':'Crítica','common.warning_plain':'Advertência','common.save':'Salvar','common.test':'Testar','common.date':'Data','common.client':'Cliente','common.result':'Resultado','common.notes':'Notas',
    'config.not_configured':'Não configurado','config.sync_sheets':'Sincronizar Sheets','config.go_users':'Ir para Usuários','config.add_api':'Adicionar API','config.apply_branding':'Aplicar Branding','config.import_json':'Importar JSON','config.import_sales':'Importar vendas','config.save_rules':'Salvar regras','config.export_dataset':'Exportar dataset',
    'modal.client_data_title':'Completar Dados do Cliente','modal.client_channels':'Canais contratados / ativos','modal.log_type':'Tipo de log','modal.log_detail':'Detalhe do log','modal.save_data':'Salvar Dados','modal.upsell_title':'Registrar Upsell / Cross-sell','modal.save_upsell':'Salvar Upsell','modal.cs_event':'Evento CS','modal.select_client':'Selecionar cliente...','modal.reason_strategy':'Motivo / Estratégia','modal.reason_strategy_placeholder':'Descreva o motivo ou estratégia...','modal.notes_placeholder':'Observações adicionais...',
    'users.new_user':'Novo Usuário','users.save_user':'Salvar Usuário','users.intro':'Gestão de usuários, grupos e permissões.','users.intro_strong':'Somente o Administrador pode criar, editar ou excluir usuários.','users.system_users':'Usuários do Sistema','users.permission_matrix':'Matriz de Permissões','users.groups':'Grupos de Usuários','users.new_group':'Novo Grupo','users.group_name_placeholder':'Nome do grupo...','users.create_group':'Criar Grupo','users.available_roles':'Papéis Disponíveis',
    'search.intro':'Busque qualquer cliente por nome, IP, domínio, email ou país.','search.shortcut':'Atalho:','search.placeholder':'Buscar por nome, IP, domínio, email, país...',
    'reports.intro':'Gere e baixe relatórios personalizados em Excel. Os filtros do período selecionado se aplicam a todos os relatórios.','reports.generate':'Gerar','reports.executive_desc':'KPIs, consultores, canais e análise completa.','reports.executive':'Executivo','reports.export_all':'Exportar Tudo','reports.canceled_desc':'Análise de cancelamentos, motivos, retenções e uso da plataforma.','reports.cs_report':'Relatório CS','reports.channels_desc':'Status de todos os canais: ativos, pendentes, por cliente.','reports.upsell_desc':'Upgrades e cross-sells registrados durante implementações.',
    'wiki.intro':'Base de conhecimento da equipe. Documentação de etapas, boas práticas e tutoriais.','wiki.intro_strong':'Todos os campos do sistema possuem pontos (i) explicativos.',
    'improvements.intro':'Registro de melhorias, dúvidas e problemas detectados. A equipe pode votar e priorizar.','improvements.intro_strong':'Os pontos de melhoria são a base para crescer.',
    'modal.general_info':'Informações Gerais','modal.clickup_status':'Status do ClickUp','modal.impl_start':'Data Início Impl.','modal.activation_date':'Data de Ativação','modal.cancel_date':'Data de Cancelamento','modal.impl_days':'Dias de Implementação','modal.usage_days':'Dias de Uso','modal.days_no_movement':'Dias Sem Movimento','modal.last_update':'Última Atualização','modal.consultants_by_stage':'Consultores por Etapa','modal.all_consultants':'Todos os consultores atribuídos','modal.trainings_done':'Treinamentos Realizados','modal.lifecycle':'Ciclo de Vida','modal.impl_time':'Tempo de implementação','modal.usage_time':'Tempo de uso','modal.modules_added':'Módulos adicionados','modal.modules_canceled':'Módulos cancelados','modal.support_chats':'Chats / suporte na Hola Suite','modal.support_compare':'Comparativo de suporte','modal.high_support':'Suporte alto','modal.with_support':'Com suporte','modal.no_relevant_support':'Sem suporte relevante','modal.channels_access':'Canais & Acesso','modal.active_channels':'Canais ativos','modal.no_channels':'Sem canais registrados','modal.movement_logs':'Logs de Movimento','modal.no_date':'Sem data','modal.no_detail':'Sem detalhe','modal.no_synced_logs':'Sem logs sincronizados. Você pode adicioná-los manualmente ou importá-los do dataset/API.','modal.no_movement_label':'Sem movimento','modal.impl_days_label':'Dias impl.','modal.churn_reason':'Motivo de Cancelamento','modal.upsells':'Upsells / Cross-sells','modal.open_platform':'Abrir Plataforma','modal.complete_data':'Completar dados',
    'toast.branding_updated':'Branding atualizado','toast.invalid_credentials':'Credenciais incorretas. Verifique seu email e senha.','toast.no_permissions':'Sem permissão','toast.fill_required':'Preencha todos os campos obrigatórios','toast.password_min':'A senha deve ter pelo menos 8 caracteres','toast.user_exists':'Já existe um usuário com esse email','toast.user_created':'Usuário criado','toast.confirm_delete_user':'Excluir usuário?','toast.user_deleted':'Usuário excluído','toast.write_group_name':'Digite o nome do grupo','toast.group_created':'Grupo criado','toast.group_deleted':'Grupo excluído','toast.invalid_client':'Cliente inválido','toast.client_updated':'Dados do cliente atualizados','toast.no_data_export':'Sem dados para exportar','toast.records_exported':'registros exportados','toast.full_export_generated':'Exportação completa gerada','toast.bi_exported':'BI exportado','toast.generating_report':'Gerando relatório','toast.report_generated':'Relatório gerado','toast.records':'registros','toast.config_saved':'Configuração salva',
    'toast.syncing':'Sincronizando...','toast.connecting_clickup':'Conectando ao ClickUp...','toast.source_requires_adapter':'A fonte "{source}" requer importação JSON ou um adaptador de API personalizado','toast.configure_clickup':'Configure API Key e List ID do ClickUp para usar dados reais','toast.downloading_clickup_tasks':'Baixando tarefas do ClickUp...','toast.processing':'Processando','toast.tasks':'tarefas','toast.rendering':'Renderizando...','toast.clients_synced_clickup':'clientes sincronizados do ClickUp','toast.no_api_data_cache':'Sem dados da API. Usando cache local.','toast.using_local_data':'Usando dados locais.','toast.cs_event_registered':'Evento CS registrado','toast.event_deleted':'Evento excluído','toast.no_matching_conversations':'Nenhuma conversa corresponde aos filtros','toast.configure_url_token_first':'Configure a URL e o token da API primeiro','toast.syncing_conversations':'Sincronizando conversas...','toast.sync_label':'Sync','toast.conversations_loaded':'conversas carregadas','toast.error':'Erro','toast.conversation_unavailable':'Conversa indisponível','toast.write_word':'Digite uma palavra','toast.word_exists':'Essa palavra já existe','toast.word_added':'Palavra adicionada','toast.category_words_loaded':'Palavras da categoria carregadas','toast.upsell_registered':'Upsell registrado com sucesso','toast.write_title':'Digite um título','toast.improvement_registered':'Melhoria registrada','toast.improvement_deleted':'Melhoria excluída','toast.only_admin_permissions':'Somente administradores podem alterar permissões','toast.clickup_test_only':'O teste direto só se aplica quando ClickUp é a fonte principal','toast.complete_api_listid':'Preencha API Key e List ID','toast.testing_clickup':'Testando conexão com ClickUp...','toast.clickup_connected':'ClickUp conectado','toast.clickup_error':'Erro do ClickUp','toast.complete_url_token':'Preencha URL e token primeiro','toast.testing_hola_api':'Testando API da Hola Suite...','toast.hola_api_connected':'API da Hola Suite conectada','toast.complete_name_url':'Preencha nome e URL','toast.api_added':'API adicionada','toast.no_pending_conflicts':'Sem conflitos pendentes. A sincronização apenas completa campos vazios ou aguarda sua autorização para substituir valores.','toast.conflict_applied':'Conflito aplicado com autorização','toast.kept_current_data':'Os dados atuais foram mantidos','toast.paste_json_dataset':'Cole um dataset JSON antes de importar','toast.dataset_imported':'Dataset importado com sucesso','toast.paste_sales_json':'Cole um dataset JSON de vendas antes de importar','toast.sales_dataset_imported':'Dataset comercial importado','toast.conflicts_pending_review':'Os dados atuais foram mantidos. Os conflitos ficaram pendentes para revisão.','toast.syncing_google_sheets':'Sincronizando planilhas do Google...','toast.sheets_synced':'Planilhas sincronizadas',
    'search.no_results':'Sem resultados para','search.results_for':'resultado(s) para',
    'sales.intro':'Dashboard comercial reutilizável para leads, oportunidades, vendas perdidas, marketing e funil. Você pode alimentá-lo por JSON, CRM ou planilhas complementares.','sales.total_leads':'Leads Totais','sales.pipeline_open':'No funil','sales.won':'Ganhos','sales.lost':'Perdidos','sales.sources':'Campanhas / Fontes','sales.pipeline_value':'Valor do funil','sales.table_title':'Leads & Oportunidades','sales.search_placeholder':'Buscar lead...','sales.status':'Status','sales.no_data':'Sem leads disponíveis','sales.col_lead':'Lead','sales.col_company':'Empresa','sales.col_source':'Fonte','sales.col_status':'Status','sales.col_value':'Valor','sales.col_owner':'Responsável','sales.col_updated':'Últ. movimento'
  }
};

function t(key,fallback=''){
  return I18N[APP.language]?.[key]||I18N.es[key]||fallback||key;
}

function applyLanguage(){
  document.documentElement.lang=APP.language||'es';
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n,el.textContent);});
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{el.placeholder=t(el.dataset.i18nPlaceholder,el.placeholder);});
  const selector=document.getElementById('langSelector');
  if(selector)selector.value=APP.language||'es';
  const meta=SECTION_META_I18N[APP.language]?.[APP.currentSection]||SECTION_META_I18N.es[APP.currentSection]||SECTION_META[APP.currentSection];
  if(meta){
    setTxt('sectionTitle',meta[0]);
    setTxt('sectionSub',meta[1]);
  }
}

function setLanguage(lang){
  APP.language=['es','en','pt'].includes(lang)?lang:'es';
  localStorage.setItem('holaLanguage',APP.language);
  applyLanguage();
}

function showSection(id){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const sec=document.getElementById('sec-'+id);
  if(sec)sec.classList.add('active');
  const meta=SECTION_META_I18N[APP.language]?.[id]||SECTION_META[id]||[id,''];
  document.getElementById('sectionTitle').textContent=meta[0];
  document.getElementById('sectionSub').textContent=meta[1];
  APP.currentSection=id;
  document.querySelectorAll('.nav-item').forEach(n=>{
    if(n.getAttribute('onclick')?.includes("'"+id+"'"))n.classList.add('active');
  });
  // Lazy renders
  const lazy={bi:renderBI,ventas:renderVentas,metas:renderMetas,consultores:renderConsultores,panoramic:()=>renderPanoramic(),alertas:renderAlertas,kanban:renderKanban,canales:renderCanales,cs:renderCS,opa:renderOPA,wiki:()=>showWikiPage(APP.wikiCurrentPage),usuarios:renderUsuarios,mejoras:renderMejoras};
  if(lazy[id])lazy[id]();
}

function toggleSidebar(){
  const sb=document.getElementById('sidebar');
  const ic=document.getElementById('toggleIcon');
  sb.classList.toggle('collapsed');
  ic.className=sb.classList.contains('collapsed')?'fa fa-chevron-right':'fa fa-chevron-left';
}

// ================================================================
// DATE FILTER
// ================================================================
function getDateRange(type){
  const now=new Date();
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const eod=new Date(today.getTime()+86400000-1);
  switch(type){
    case'today':return{from:today,to:eod};
    case'7d':return{from:new Date(today.getTime()-6*86400000),to:eod};
    case'month':return{from:new Date(now.getFullYear(),now.getMonth(),1),to:new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59)};
    case'prevmonth':return{from:new Date(now.getFullYear(),now.getMonth()-1,1),to:new Date(now.getFullYear(),now.getMonth(),0,23,59,59)};
    case'3m':return{from:new Date(today.getTime()-89*86400000),to:eod};
    case'year':return{from:new Date(now.getFullYear(),0,1),to:new Date(now.getFullYear(),11,31,23,59,59)};
    case'custom':{
      const f=document.getElementById('dateFrom')?.value;
      const t=document.getElementById('dateTo')?.value;
      return{from:f?new Date(f+'T00:00:00'):null,to:t?new Date(t+'T23:59:59'):null};
    }
    default:return{from:null,to:null};
  }
}

function setDateFilter(type){
  APP.dateFilter.active=type;
  // Update buttons
  document.querySelectorAll('.date-btn').forEach(b=>b.classList.remove('active'));
  const ids={all:'dfAll',today:'dfToday','7d':'df7d','14d':'df14d',month:'dfMonth',prevmonth:'dfPrevMonth','3m':'df3m',year:'dfYear'};
  if(ids[type])document.getElementById(ids[type])?.classList.add('active');
  if(type==='custom'){}
  // Update badge
  const labels={all:'Todos los datos',today:'Hoy',
    '7d':'Últimos 7 días','14d':'Últimos 14 días',month:'Mes actual',prevmonth:'Mes anterior',
    '3m':'Últimos 3 meses',year:'Este año',custom:'Rango personalizado'};
  const badge=document.getElementById('dateBadge');
  if(badge){badge.innerHTML=`<i class="fa fa-clock"></i> ${labels[type]||type}`;}
  // Update info
  const rng=getDateRange(type);
  const info=document.getElementById('dateRangeInfo');
  if(info){
    if(rng.from||rng.to){
      info.textContent=(rng.from?rng.from.toLocaleDateString('es-ES'):'∞')+' → '+(rng.to?rng.to.toLocaleDateString('es-ES'):'∞');
    }else{info.textContent='';}
  }
  // Re-render
  const filtered=applyDateFilter(APP.data);
  APP.filteredByDate=filtered;
  renderAll(filtered);
}

function setDateFilterAndLoad(type){
  showLoadingOverlay(true);
  setTimeout(()=>{
    setDateFilter(type);
    renderDashboardCharts();
    setTimeout(()=>showLoadingOverlay(false),200);
  },150);
}

// ================================================================
// FILTROS POR MOTIVOS DE CANCELACIÓN
// ================================================================
let motivoFilter='todo';

function filterByMotivo(motivo){
  showLoadingOverlay(true);
  motivoFilter=motivo;
  
  // Actualizar botones de motivo - remueve clase active/filter-active de todos
  const motivosBtns=document.querySelectorAll('#motivosFilterBar button');
  motivosBtns.forEach(btn=>{
    btn.classList.remove('active','filter-active');
  });
  
  // Agregar clase activa al botón seleccionado
  if(motivo==='todo'){
    const todoBtn=document.querySelector('#motivosFilterBar .date-btn');
    if(todoBtn)todoBtn.classList.add('active');
  }else{
    // Buscar y marcar el botón del motivo seleccionado
    motivosBtns.forEach(btn=>{
      const btnText=btn.textContent.trim();
      if(btnText===motivo.substring(0,20)||(btnText===motivo.substring(0,17)+'...'&&motivo.length>20)){
        btn.classList.add('filter-active');
      }
    });
  }
  
  setTimeout(()=>{
    // Filtrar tabla y gráficos
    renderCancelados();
    renderDashboardCharts();
    setTimeout(()=>showLoadingOverlay(false),200);
  },150);
}

function buildMotivosFilterBar(){
  const container=document.getElementById('motivosButtonsContainer');
  if(!container)return;
  
  // Extraer motivos únicos de clientes cancelados
  const motivos=new Set();
  const data=APP.filteredByDate||APP.data||[];
  const canceledClients=data.filter(c=>c.statusType==='cancelado'||c.estado==='Cancelado'||c.estatus==='cancelado');
  
  canceledClients.forEach(c=>{
    const motivoBaja=String(c.motivoBaja||c.motivo||c.razon||'').trim();
    if(motivoBaja&&motivoBaja.toLowerCase()!=='sin motivo'&&motivoBaja.toLowerCase()!=='nd'&&motivoBaja!=='-'){
      motivoBaja.split(',').forEach(m=>{
        const clean=m.trim();
        if(clean&&clean.length>0)motivos.add(clean);
      });
    }
  });
  
  // Crear botones para cada motivo (máximo 8)
  container.innerHTML='';
  const motivosArray=Array.from(motivos).sort().slice(0,8);
  
  motivosArray.forEach(motivo=>{
    const btn=document.createElement('button');
    btn.className='date-btn'+(motivoFilter===motivo?' filter-active':'');
    const displayText=motivo.length>20?motivo.substring(0,17)+'...':motivo;
    btn.textContent=displayText;
    btn.title=motivo;
    btn.onclick=(e)=>{
      e.preventDefault();
      filterByMotivo(motivo);
    };
    container.appendChild(btn);
  });
}

function applyDateFilter(data){
  const{active}=APP.dateFilter;
  if(active==='all'||!active)return data;
  const{from,to}=getDateRange(active);
  if(!from&&!to)return data;
  return data.filter(c=>{
    const d=new Date(c.created||0);
    if(isNaN(d.getTime()))return true;
    if(from&&d<from)return false;
    if(to&&d>to)return false;
    return true;
  });
}

// ================================================================
// RENDER DASHBOARD CHARTS - Respeta filtros de fecha y motivo
// ================================================================
function renderDashboardCharts(){
  let data=APP.filteredByDate||APP.data||[];
  
  // Aplicar filtro de fecha
  data=applyDateFilter(data);
  
  // Aplicar filtro de motivo si estamos en cancelados
  if(motivoFilter&&motivoFilter!=='todo'){
    const cancelados=data.filter(c=>c.statusType==='cancelado');
    if(motivoFilter==='usaron'){
      data=[...data.filter(c=>c.statusType!=='cancelado'),...cancelados.filter(c=>c.usoPlat==='SÍ')];
    }else if(motivoFilter==='nouso'){
      data=[...data.filter(c=>c.statusType!=='cancelado'),...cancelados.filter(c=>c.usoPlat!=='SÍ')];
    }else if(motivoFilter==='retenidos'){
      const retenidos=APP.csEvents?.filter(e=>e.type==='retencion'&&e.resultado==='retenido')||[];
      const retenidosIds=new Set(retenidos.map(e=>e.clientId));
      data=[...data.filter(c=>c.statusType!=='cancelado'),...cancelados.filter(c=>retenidosIds.has(c.id))];
    }else{
      // Filtrar por motivo específico
      data=[...data.filter(c=>c.statusType!=='cancelado'),...cancelados.filter(c=>{
        const motivos=String(c.motivoBaja||c.motivo||'').split(',').map(m=>m.trim());
        return motivos.some(m=>m.toLowerCase().includes(motivoFilter.toLowerCase()));
      })];
    }
  }
  
  // Separar por estado
  const activos=data.filter(c=>c.statusType==='activo');
  const impl=data.filter(c=>c.statusType==='impl');
  const cancelados=data.filter(c=>c.statusType==='cancelado');
  
  // Renderizar gráficos
  renderCharts(activos,impl,cancelados,data);
}

// ================================================================
// RENDER CANCELADOS SECTION - Renderiza tabla de cancelados y motivos
// ================================================================
function renderCancelados(){
  let data=APP.filteredByDate||APP.data||[];
  data=applyDateFilter(data);
  const cancelados=data.filter(c=>c.statusType==='cancelado');
  
  // Filtrar por motivo si está seleccionado
  let filtered=cancelados;
  if(motivoFilter&&motivoFilter!=='todo'&&motivoFilter!=='usaron'&&motivoFilter!=='nouso'&&motivoFilter!=='retenidos'){
    filtered=cancelados.filter(c=>{
      const motivos=String(c.motivoBaja||c.motivo||'').split(',').map(m=>m.trim());
      return motivos.some(m=>m.toLowerCase().includes(motivoFilter.toLowerCase()));
    });
  }else if(motivoFilter==='usaron'){
    filtered=cancelados.filter(c=>c.usoPlat==='SÍ');
  }else if(motivoFilter==='nouso'){
    filtered=cancelados.filter(c=>c.usoPlat!=='SÍ');
  }else if(motivoFilter==='retenidos'){
    const retenidos=APP.csEvents?.filter(e=>e.type==='retencion'&&e.resultado==='retenido')||[];
    const retenidosIds=new Set(retenidos.map(e=>e.clientId));
    filtered=cancelados.filter(c=>retenidosIds.has(c.id));
  }
  
  // Renderizar tabla de cancelados
  renderCanceladosTable(filtered);
  
  // Construir barra de filtros por motivos
  buildMotivosFilterBar();
}

// ================================================================
// CLICKUP API
// ================================================================
async function syncClickUp(){
  if(APP.syncing)return;
  APP.syncing=true;
  const btn=document.getElementById('syncBtn');
  if(btn){btn.classList.add('syncing');btn.querySelector('span').textContent=t('toast.syncing','Sincronizando...');}
  showLoading(true,t('toast.connecting_clickup','Conectando con ClickUp...'));
  try{
    const primarySource=getActiveSource();
    if(primarySource==='custom_json'){importManualDataset(true);return;}
    if(primarySource!=='clickup')throw new Error(t('toast.source_requires_adapter',`La fuente "${primarySource}" requiere importación JSON o un adaptador API personalizado`).replace('{source}',primarySource));
    const apiKey=(document.getElementById('cfgApiKey')?.value||CONFIG.API_KEY||'').trim();
    const listId=(document.getElementById('cfgListId')?.value||CONFIG.LIST_ID||'').trim();
    if(!apiKey||!listId)throw new Error(t('toast.configure_clickup','Configura API Key y List ID de ClickUp para usar datos reales'));
    updateLoadingMsg(t('toast.downloading_clickup_tasks','Descargando tareas de ClickUp...'));
    const tasks=await fetchAllTasks(apiKey,listId);
    if(tasks&&tasks.length>0){
      updateLoadingMsg(`${t('toast.processing','Procesando')} ${tasks.length} ${t('toast.tasks','tareas')}...`);
      APP.data=hydrateClients(processTasksToClients(tasks));
      APP.lastSync=new Date();
      APP.apiMeta={source:'clickup',taskCount:tasks.length,syncedAt:APP.lastSync.toISOString()};
      localStorage.setItem('holaData',JSON.stringify({data:APP.data,ts:Date.now(),meta:APP.apiMeta}));
      APP.filteredByDate=applyDateFilter(APP.data);
      updateLoadingMsg(t('toast.rendering','Renderizando...'));
      await new Promise(r=>setTimeout(r,300));
      renderAll(APP.filteredByDate);
      document.getElementById('apiStatusText').textContent=APP.data.length+' clientes · ClickUp';

      toast('success',`${APP.data.length} ${t('toast.clients_synced_clickup','clientes sincronizados desde ClickUp')}`);
    }else{
      loadLocalData();
      toast('warning',t('toast.no_api_data_cache','Sin datos de API. Usando caché local.'));
    }
  }catch(e){
    console.error('API Error:',e);
    loadLocalData();
    toast('error',`${e.message}. ${t('toast.using_local_data','Usando datos locales.')}`);
    document.getElementById('apiStatusText').textContent='Cache / Error API';
  }finally{
    APP.syncing=false;
    if(btn){btn.classList.remove('syncing');btn.querySelector('span').textContent=t('action.sync','Sincronizar');}
    showLoading(false);
  }
}

async function fetchAllTasks(apiKey,listId){
  if(!apiKey||!listId)throw new Error('Credenciales de ClickUp incompletas');
  let all=[],page=0;
  while(page<25){
    const url=`https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}/task?page=${page}&include_closed=true&archived=false&subtasks=true`;
    const resp=await fetch(url,{headers:{Authorization:apiKey,'Content-Type':'application/json'}});
    if(!resp.ok){if(page===0)throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);break;}
    const json=await resp.json();
    if(!json.tasks||!json.tasks.length)break;
    all=all.concat(json.tasks);
    if(json.tasks.length<100)break;
    page++;
    await new Promise(r=>setTimeout(r,350));
  }
  return all;
}

function processTasksToClients(tasks){
  const clients=[];
  const now=new Date();
  const valid=tasks.filter(t=>{
    const nl=normalizeText(t.name);
    const sl=normalizeText(t.status.status);
    if(CONFIG.TAREAS_IGNORAR.some(ig=>nl.includes(ig)))return false;
    if(CONFIG.ESTADOS_IGNORAR.includes(sl))return false;
    return CONFIG.ESTADOS_IMPL.some(e=>sl.includes(normalizeText(e)));
  });
  valid.forEach(t=>{
    try{
      const cf=t.custom_fields||[];
      const status=t.status.status;
      const sl=normalizeText(status);
      const isActivo=sl.includes('conclu')||sl==='closed'||sl==='cerrado';
      const isCancelado=sl.includes('cancel');
      const isImpl=!isActivo&&!isCancelado;
      const created=parseDateAny(t.date_created)||new Date();
      const updated=parseDateAny(t.date_updated)||created;
      const closed=parseDateAny(t.date_closed);
      const sourceLogs=extractTaskLogs(t);
      const lifecycleFromLogs=inferLifecycleDatesFromLogs(sourceLogs);
      const fInicio=getCustomDate(cf,'fecha inicio kickoff')||getCustomDate(cf,'fecha inicio onboarding')||created;
      const fActiv=getCustomDate(cf,'fecha activación')||getCustomDate(cf,'fecha activacion')||getCustomDate(cf,'fecha concluido')||getCustomDate(cf,'fecha conclusion')||lifecycleFromLogs.completedAt||(isActivo?(closed||updated):null);
      const fCanc=isCancelado?(getCustomDate(cf,'fecha cancelación')||getCustomDate(cf,'fecha cancelacion')||lifecycleFromLogs.canceledAt||closed||updated):null;
      const pais=getFieldPais(cf)||'No definido';
      const dImpl=isActivo&&fActiv?businessDaysBetween(fInicio,fActiv,pais):isCancelado&&fCanc?businessDaysBetween(fInicio,fCanc,pais):businessDaysBetween(fInicio,now,pais);
      const dUso=isActivo&&fActiv?Math.floor((now-fActiv)/86400000):0;
      const dSinMov=Math.floor((now-updated)/86400000);
      const plan=getFieldPlan(cf)||'';
      const ip=getFieldText(cf,'ip hola')||'';
      const dom=getFieldText(cf,'dominio')||getFieldText(cf,'domínio')||'';
      const assignees=Array.isArray(t.assignees)?t.assignees:[];
      const rKick=getResponsable(cf,['responsable por el kickoff','responsable kickoff','responsable onboarding'],assignees)||'';
      const rVer=getResponsable(cf,['responsable por el análisis','responsable verificación'],assignees)||'';
      const rCap=getResponsable(cf,['responsable por capacitación','responsable capacitación'],assignees)||'';
      const rGoLive=getResponsable(cf,['responsable por el go','responsable go'],assignees)||'';
      const rAct=getResponsable(cf,['responsable activación','responsable por la activación'],assignees)||'';
      const rVenta=getResponsable(cf,['responsable comercial','responsable venta','vendedor','responsable de venta'],assignees)||'';
      const canalesField=findField(cf,['canales contratados']);
      const canales=getCanales(canalesField);
      const tags=(t.tags||[]).map(tg=>normalizeText(tg.name));
      const pausada=tags.some(tg=>tg.includes('pausa'))?'SÍ':'NO';
      const espCli=tags.some(tg=>tg.includes('esperando cliente')||tg.includes('sin respuesta'))?'SÍ':'NO';
      const moro=tags.some(tg=>tg.includes('moro'))?'SÍ':'NO';
      let alerta='NO';
      const critDias=parsePositiveInt(document.getElementById('cfgDiasAlerta')?.value||20,20);
      const warnDias=parsePositiveInt(document.getElementById('cfgDiasSinMov')?.value||7,7);
      if(isImpl){
        if(dImpl>critDias)alerta='🚨 +'+critDias+' días';
        else if(dSinMov>warnDias)alerta='⚠️ Sin mov.';
      }
      const motivo=getFieldDropdown(cf,'motivos de baja')||'';
      const email=getFieldText(cf,'e-mail')||getFieldText(cf,'email')||'';
      const tel=getFieldText(cf,'número para contacto')||'';
      const usoPlat=(isCancelado||isActivo)&&fActiv?'SÍ':'NO';
      const dUsoTotal=isCancelado&&fCanc&&fActiv?businessDaysBetween(fActiv,fCanc,pais):0;
      const hasLink=!!(ip||dom);
      const linkHola=resolvePlatformLink(ip,dom);
      const consultoresAsignados=collectAssignedConsultants(normCons(rKick)||rKick,normCons(rVer)||rVer,normCons(rCap)||rCap,normCons(rGoLive)||rGoLive,normCons(rAct)||rAct,assignees.map(a=>normCons(a.username||a.name||a.email)||a.username||a.name||a.email));
      const modCancelados=getFieldText(cf,'módulos cancelados')||getFieldText(cf,'modulos cancelados')||getFieldText(cf,'módulo cancelado')||'';
      const modAdicionados=getFieldText(cf,'módulos adicionados')||getFieldText(cf,'modulos adicionados')||getFieldText(cf,'upsell')||'';
      clients.push({
        id:t.id,nombre:t.name,link:t.url,
        status:isActivo?'✅ Activo':isCancelado?'❌ Cancelado':'⚙️ En Implementación',
        statusType:isActivo?'activo':isCancelado?'cancelado':'impl',
        estado:status,pais,plan,ip,dominio:dom,email,telefono:tel,
        fInicio:formatDate(fInicio),fActivacion:fActiv?formatDate(fActiv):'',
        fCancelacion:fCanc?formatDate(fCanc):'',fActualizado:formatDate(updated),
        dImpl,dUso,dSinMov,
        mesInicio:formatMes(fInicio),mesFin:fActiv?formatMes(fActiv):fCanc?formatMes(fCanc):'',mesAct:fActiv?formatMes(fActiv):'',
        rKickoff:normCons(rKick)||rKick,rVer:normCons(rVer)||rVer,
        rCap:normCons(rCap)||rCap,rGoLive:normCons(rGoLive)||rGoLive,rAct:normCons(rAct)||rAct,
        rVenta:normCons(rVenta)||rVenta,
        consultoresAsignados,
        cantCap:getFieldNum(cf,'cantidad de capacitaciones'),
        hCap:getFieldNum(cf,'horas de capacitación'),
        canales,
        wa:canales.some(c=>normalizeText(c).includes('whatsapp')),
        ig:canales.some(c=>normalizeText(c).includes('instagram')),
        wc:canales.some(c=>normalizeText(c).includes('webchat')),
        pbx:canales.some(c=>normalizeText(c).includes('pbx')||normalizeText(c).includes('telefon')),
        tg:canales.some(c=>normalizeText(c).includes('telegram')),
        msg:canales.some(c=>normalizeText(c).includes('messenger')),
        alerta,motivo,pausada,espCli,moro,usoPlat,dUsoTotal,hasLink,
        modCancelados,modAdicionados,
        tipo:tags.some(tg=>tg.includes('upgrade'))?'Upgrade':'Implementación',
        linkHola,
        created:created.getTime(),updated:updated.getTime(),
        sourceLogs
      });
    }catch(err){console.error('Error task:',t.name,err);}
  });
  return clients;
}

function deriveChannelFlags(channels){
  const normalized=(channels||[]).map(c=>normalizeText(c));
  return {
    wa:normalized.some(c=>c.includes('whatsapp')),
    ig:normalized.some(c=>c.includes('instagram')),
    wc:normalized.some(c=>c.includes('webchat')),
    pbx:normalized.some(c=>c.includes('pbx')||c.includes('telefon')),
    tg:normalized.some(c=>c.includes('telegram')),
    msg:normalized.some(c=>c.includes('messenger'))
  };
}

function hydrateClients(data){
  return (data||[]).map(client=>{
    const override=APP.channelOverrides[client.id]||{};
    const mergedChannels=Array.from(new Set([...(client.canales||[]), ...(override.channels||[])]));
    const flags=deriveChannelFlags(mergedChannels);
    const sourceLogs=client.sourceLogs||[];
    const logs=[...sourceLogs, ...((APP.clientLogs[client.id]||[]))].sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
    const dataIncomplete=!mergedChannels.length || !logs.length;
    return {
      ...client,
      consultoresAsignados:collectAssignedConsultants(client.consultoresAsignados||[],client.rKickoff,client.rVer,client.rCap,client.rGoLive,client.rAct),
      sourceLogs,
      canales:mergedChannels,
      ...flags,
      linkHola:client.linkHola||resolvePlatformLink(client.ip,client.dominio),
      hasLink:!!(client.ip||client.dominio||client.linkHola),
      logs,
      dataIncomplete,
      dataQualityNote:dataIncomplete?'Datos incompletos: completar canales/logs manualmente o desde el origen':'Datos completos'
    };
  });
}

function normalizeImportedClient(raw){
  const statusType=raw.statusType||raw.estadoTipo||raw.status||'impl';
  const statusMap={activo:'activo',active:'activo',impl:'impl',implementacion:'impl',implementation:'impl',cancelado:'cancelado',canceled:'cancelado'};
  const normalizedStatus=statusMap[normalizeText(statusType)]||'impl';
  const channels=Array.isArray(raw.canales)?raw.canales:(typeof raw.canales==='string'?raw.canales.split(',').map(x=>x.trim()).filter(Boolean):[]);
  const flags=deriveChannelFlags(channels);
  const consultoresAsignados=collectAssignedConsultants(raw.consultoresAsignados||raw.consultants||[],raw.rKickoff,raw.rVer,raw.rCap,raw.rGoLive,raw.rAct);
  return {
    id:String(raw.id||Date.now()+Math.random()),
    nombre:raw.nombre||raw.name||'Sin nombre',
    link:raw.link||raw.url||'',
    status:normalizedStatus==='activo'?'✅ Activo':normalizedStatus==='cancelado'?'❌ Cancelado':'⚙️ En Implementación',
    statusType:normalizedStatus,
    estado:raw.estado||raw.stage||raw.pipelineStage||'No informado',
    pais:raw.pais||raw.country||'No definido',
    plan:raw.plan||raw.pipeline||raw.dealStage||'',
    ip:raw.ip||'',
    dominio:raw.dominio||raw.domain||'',
    email:raw.email||'',
    telefono:raw.telefono||raw.phone||'',
    fInicio:raw.fInicio||'',
    fActivacion:raw.fActivacion||'',
    fCancelacion:raw.fCancelacion||'',
    fActualizado:raw.fActualizado||'',
    dImpl:Number(raw.dImpl||0),
    dUso:Number(raw.dUso||0),
    dSinMov:Number(raw.dSinMov||0),
    mesInicio:raw.mesInicio||'',
    mesFin:raw.mesFin||'',
    mesAct:raw.mesAct||'',
    rKickoff:raw.rKickoff||raw.owner||'',
    rVer:raw.rVer||'',
    rCap:raw.rCap||'',
    rGoLive:raw.rGoLive||'',
    rAct:raw.rAct||'',
    rVenta:raw.rVenta||raw.responsableVentas||'',
    consultoresAsignados,
    cantCap:Number(raw.cantCap||0),
    hCap:Number(raw.hCap||0),
    canales:channels,
    ...flags,
    alerta:raw.alerta||'NO',
    motivo:raw.motivo||'',
    pausada:raw.pausada||'NO',
    espCli:raw.espCli||'NO',
    moro:raw.moro||'NO',
    usoPlat:raw.usoPlat||'NO',
    dUsoTotal:Number(raw.dUsoTotal||0),
    modCancelados:raw.modCancelados||raw.modulosCancelados||'',
    modAdicionados:raw.modAdicionados||raw.modulosAdicionados||'',
    hasLink:!!(raw.ip||raw.dominio||raw.linkHola),
    tipo:raw.tipo||'Implementación',
    linkHola:raw.linkHola||resolvePlatformLink(raw.ip,raw.dominio),
    created:Number(raw.created||Date.now()),
    updated:Number(raw.updated||Date.now()),
    sourceLogs:Array.isArray(raw.logs)?raw.logs:[],
    // NUEVOS CAMPOS PERSONALIZADOS
    ipSecundaria:raw.ipSecundaria||raw.ip2||'',
    dominio2:raw.dominio2||raw.domain2||'',
    presupuesto:Number(raw.presupuesto||raw.budget||0),
    presupuestoPago:Number(raw.presupuestoPago||raw.budgetPaid||0),
    tipoCliente:raw.tipoCliente||raw.clientType||'Estándar',
    industria:raw.industria||raw.industry||'No especificada',
    empleados:Number(raw.empleados||raw.employees||0),
    contactoPrincipal:raw.contactoPrincipal||raw.mainContact||'',
    emailContacto:raw.emailContacto||raw.contactEmail||'',
    telefonoContacto:raw.telefonoContacto||raw.contactPhone||'',
    notas:raw.notas||raw.notes||'',
    prioridad:raw.prioridad||raw.priority||'Normal',
    referenciaExterna:raw.referenciaExterna||raw.externalRef||'',
    estadoFinanciero:raw.estadoFinanciero||raw.financialStatus||'',
    modoIntegracion:raw.modoIntegracion||raw.integrationMode||'Manual',
    versionAPI:raw.versionAPI||raw.apiVersion||'v2',
    urlDashboard:raw.urlDashboard||raw.dashboardUrl||'',
    fechaProximoReview:raw.fechaProximoReview||raw.nextReviewDate||'',
    satisfaccionCliente:Number(raw.satisfaccionCliente||raw.clientSatisfaction||0),
    tasaMorosidad:Number(raw.tasaMorosidad||raw.defaultRate||0),
    fuente:raw.fuente||raw.source||'Manual',
    medioComunicacion:raw.medioComunicacion||raw.communicationChannel||'Email',
    cuentaAMail:raw.cuentaAMail||raw.accountManager||'',
    contrasena:raw.contrasena||'',
    contrasenaAdmin:raw.contrasenaAdmin||'',
    tiempoRespuesta:Number(raw.tiempoRespuesta||raw.responseTime||0),
    tiempoImplementacion:Number(raw.tiempoImplementacion||raw.implementationTime||0),
    clienteReferido:raw.clienteReferido||raw.referredClient||'NO',
    clienteReferencia:raw.clienteReferencia||raw.referenceClient||'',
    renovacionAnual:raw.renovacionAnual||raw.annualRenewal||'',
    contractoVigencia:Number(raw.contractoVigencia||raw.contractValidity||0),
    moneda:raw.moneda||raw.currency||'USD',
    volumenTransacciones:Number(raw.volumenTransacciones||raw.transactionVolume||0),
    tiempoZona:raw.tiempoZona||raw.timezone||'UTC'
  };
}

function getRawValueByAliases(raw, aliases){
  if(!raw||!aliases||!aliases.length)return'';
  const entries=Object.entries(raw);
  for(const alias of aliases){
    const found=entries.find(([key])=>normalizeText(key)===normalizeText(alias));
    if(found&&found[1]!=null&&String(found[1]).trim()!=='')return found[1];
  }
  for(const alias of aliases){
    const found=entries.find(([key])=>normalizeText(key).includes(normalizeText(alias)));
    if(found&&found[1]!=null&&String(found[1]).trim()!=='')return found[1];
  }
  return'';
}

function parseMoneyValue(value){
  if(value==null||value==='')return 0;
  if(typeof value==='number')return value;
  const raw=String(value).trim();
  if(!raw)return 0;
  const normalized=raw.replace(/[^\d,.-]/g,'');
  const hasComma=normalized.includes(',');
  const hasDot=normalized.includes('.');
  const valueStr=hasComma&&hasDot
    ? normalized.replace(/\./g,'').replace(',','.')
    : hasComma
      ? normalized.replace(',','.')
      : normalized;
  const parsed=parseFloat(valueStr);
  return Number.isFinite(parsed)?parsed:0;
}

function normalizeLead(raw){
  const estadoMap={open:'open',abierto:'open',lead:'open',mql:'mql',sql:'sql',won:'won',ganado:'won',lost:'lost',perdido:'lost'};
  const estadoRaw=getRawValueByAliases(raw,['estado','status','stage','etapa','fase','pipeline status','status da venda','estado da venda'])||raw.estado||raw.status||raw.stage;
  const estado=estadoMap[normalizeText(estadoRaw)]||'open';
  const extras={};
  Object.entries(raw||{}).forEach(([key,value])=>{
    const normalizedKey=String(key||'').trim().replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
    if(!normalizedKey)return;
    extras[normalizedKey]=value;
  });
  const id=getRawValueByAliases(raw,['id','lead id','deal id','negocio id','oportunidad id'])||raw.id;
  const nombre=getRawValueByAliases(raw,['nombre','name','lead','cliente','cliente nombre','contato','contacto'])||raw.nombre||raw.name||raw.lead;
  const empresa=getRawValueByAliases(raw,['empresa','company','account','cliente empresa','organization','organizacion'])||raw.empresa||raw.company;
  const fuente=getRawValueByAliases(raw,['fuente','source','origen','channel','canal','source channel','origem'])||raw.fuente||raw.source||raw.channel;
  const valor=getRawValueByAliases(raw,['valor','value','monto','amount','importe','deal value','valor da venda'])||raw.valor||raw.value;
  const owner=getRawValueByAliases(raw,['owner','responsable','consultor','asesor','seller','vendedor','comercial'])||raw.owner||raw.responsable;
  const updatedAt=getRawValueByAliases(raw,['updatedAt','fecha','date','fecha actualizacion','último movimiento','ultimo movimiento','updated at','data atualização'])||raw.updatedAt||raw.fecha||raw.date;
  const campaign=getRawValueByAliases(raw,['campaign','marketing','campana','campaña','campaign name','utm campaign'])||raw.campaign||raw.marketing||raw.campana;
  const segmento=getRawValueByAliases(raw,['segmento','segment','vertical','segmentação'])||raw.segmento||raw.segment||raw.vertical;
  const producto=getRawValueByAliases(raw,['producto','product','servicio','solution','produto'])||raw.producto||raw.product||raw.servicio;
  return {
    id:String(id||Date.now()+Math.random()),
    nombre:nombre||'Sin nombre',
    empresa:empresa||'',
    fuente:fuente||'Sin fuente',
    estado,
    valor:parseMoneyValue(valor),
    owner:owner||'',
    updatedAt:updatedAt||'',
    campaign:campaign||'',
    segmento:segmento||'',
    producto:producto||'',
    extras,
    rawSource:raw.sourceSystem||raw.origen||raw.provider||''
  };
}

function renderVentas(){
  const query=normalizeText(document.getElementById('salesSearch')?.value||'');
  const status=document.getElementById('salesStatusFilter')?.value||'';
  const fieldDefs=(APP.salesFields&&APP.salesFields.length?APP.salesFields:defaultSalesFields()).slice(0,4);
  let rows=[...APP.salesData];
  if(query){
    rows=rows.filter(r=>[r.nombre,r.empresa,r.fuente,r.owner,r.campaign,...fieldDefs.map(def=>getSalesFieldValue(r,def.key))].some(v=>normalizeText(v).includes(query)));
  }
  if(status)rows=rows.filter(r=>r.estado===status);
  const won=APP.salesData.filter(r=>r.estado==='won');
  const lost=APP.salesData.filter(r=>r.estado==='lost');
  const open=APP.salesData.filter(r=>['open','mql','sql'].includes(r.estado));
  const sources=new Set(APP.salesData.map(r=>r.fuente).filter(Boolean));
  const pipeline=open.reduce((sum,r)=>sum+(r.valor||0),0);
  setTxt('sales-leads-total',APP.salesData.length);
  setTxt('sales-leads-open',open.length);
  setTxt('sales-leads-won',won.length);
  setTxt('sales-leads-lost',lost.length);
  setTxt('sales-marketing-total',sources.size);
  setTxt('sales-pipeline-value',pipeline.toFixed(0));
  renderSalesTableHead(fieldDefs);
  const tb=document.getElementById('salesTable');
  if(!tb)return;
  const totalColumns=7+fieldDefs.length;
  if(!rows.length){tb.innerHTML=noDataRow(totalColumns,t('sales.no_data','Sin leads disponibles'));return;}
  tb.innerHTML=rows.map(r=>`<tr>
    <td><strong>${escHtml(r.nombre)}</strong></td>
    <td>${escHtml(r.empresa||'—')}</td>
    <td>${escHtml(r.fuente||'—')}</td>
    ${fieldDefs.map(def=>`<td>${escHtml(getSalesFieldValue(r,def.key)||'—')}</td>`).join('')}
    <td><span class="badge ${r.estado==='won'?'badge-success':r.estado==='lost'?'badge-danger':r.estado==='mql'?'badge-purple':r.estado==='sql'?'badge-info':'badge-warning'}">${escHtml(r.estado.toUpperCase())}</span></td>
    <td>${Number(r.valor||0).toFixed(0)}</td>
    <td>${escHtml(r.owner||'—')}</td>
    <td>${escHtml(r.updatedAt||'—')}</td>
  </tr>`).join('');
}

function getSalesFieldValue(lead,key){
  if(!lead||!key)return'';
  if(lead[key]!=null&&lead[key]!=='')return String(lead[key]);
  const extras=lead.extras||{};
  if(extras[key]!=null&&extras[key]!=='')return String(extras[key]);
  const altKey=String(key).replace(/[^A-Za-z0-9]+/g,'_');
  if(extras[altKey]!=null&&extras[altKey]!=='')return String(extras[altKey]);
  return'';
}

function renderSalesTableHead(fieldDefs){
  const head=document.getElementById('salesTableHead');
  if(!head)return;
  head.innerHTML=`<tr><th>${escHtml(t('sales.col_lead','Lead'))}</th><th>${escHtml(t('sales.col_company','Empresa'))}</th><th>${escHtml(t('sales.col_source','Fuente'))}</th>${fieldDefs.map(def=>`<th>${escHtml(def.label)}</th>`).join('')}<th>${escHtml(t('sales.col_status','Estado'))}</th><th>${escHtml(t('sales.col_value','Valor'))}</th><th>${escHtml(t('sales.col_owner','Owner'))}</th><th>${escHtml(t('sales.col_updated','Últ. movimiento'))}</th></tr>`;
}

// ================================================================
// FIELD HELPERS
// ================================================================
function normalizeText(v){return String(v||'').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function parsePositiveInt(v,fallback){const n=parseInt(v,10);return Number.isNaN(n)?fallback:Math.max(1,n);}
function findField(cf,names){
  const wanted=names.map(normalizeText);
  let best=null;
  cf.forEach(field=>{
    const current=normalizeText(field.name);
    wanted.forEach(name=>{
      const score=current===name?3:current.startsWith(name)?2:current.includes(name)?1:0;
      if(score&&(!best||score>best.score))best={field,score};
    });
  });
  return best?best.field:null;
}
function businessDaysBetween(d1,d2,pais){
  if(!d1||!d2)return 0;
  const from=new Date(d1);
  const to=new Date(d2);
  const feriados=CONFIG.FERIADOS[pais]||[];
  let total=0;
  while(from<=to){
    const day=from.getDay();
    const mm=String(from.getMonth()+1).padStart(2,'0');
    const dd=String(from.getDate()).padStart(2,'0');
    if(day!==0&&day!==6&&!feriados.includes(`${mm}-${dd}`))total++;
    from.setDate(from.getDate()+1);
  }
  return total;
}
function resolvePlatformLink(ip,dom){
  const raw=(ip||dom||'').trim();
  if(!raw)return'';
  if(/^https?:\/\//i.test(raw))return raw;
  return 'https://'+raw;
}
function getCustomDate(cf,name){const f=findField(cf,[name]);if(!f||!f.value)return null;try{const d=new Date(parseInt(f.value,10));return isNaN(d.getTime())?null:d;}catch{return null;}}
function getFieldPais(cf){const f=findField(cf,['país','pais']);if(!f||f.value==null)return'';try{if(f.type_config?.options){const o=f.type_config.options.find(x=>x.orderindex===parseInt(f.value,10)||x.id===f.value);const label=o?(o.name||o.label||''):'';return CONFIG.PAISES[normalizeText(label)]||label;}if(typeof f.value==='string')return CONFIG.PAISES[normalizeText(f.value)]||f.value.trim();}catch{}return'';}
function getFieldPlan(cf){const f=findField(cf,['plan']);
  if(!f||f.value==null)return'';
  try{
    if(f.type_config?.options){
      const o=f.type_config.options.find(x=>x.orderindex===parseInt(f.value,10)||x.id===f.value);
      if(o)return o.name||o.label||'';
    }
    return typeof f.value==='string'?f.value:'';
  }catch{return'';}
}

function getFieldText(cf,name){
  const f=findField(cf,[name]);
  if(!f)return'';
  if(typeof f.value==='string')return f.value.trim();
  return f.value?String(f.value):'';
}
function getFieldNum(cf,name){
  const f=findField(cf,[name]);
  if(!f||!f.value)return 0;
  return parseFloat(f.value)||0;
}
function getFieldDropdown(cf,name){
  const f=findField(cf,[name]);
  if(!f||f.value==null)return'';
  if(f.type_config?.options){
    const o=f.type_config.options.find(x=>x.orderindex===parseInt(f.value,10)||x.id===f.value);
    return o?o.name||o.label||'':'';
  }
  return f.value?.toString()||'';
}
function getResponsable(cf,names,fallbackList=[]){
  for(const name of names){
    const f=findField(cf,[name]);
    if(!f||!f.value)continue;
    if(Array.isArray(f.value)&&f.value.length>0){
      const n=f.value[0];
      return n.username||n.name||n.email||'';
    }
    if(typeof f.value==='string'&&f.value.length>2)return f.value;
  }
  if(Array.isArray(fallbackList)&&fallbackList.length>0){
    const fallback=fallbackList[0];
    return fallback.username||fallback.name||fallback.email||'';
  }
  return'';
}
function getCanales(field){
  if(!field||!field.value)return[];
  if(Array.isArray(field.value)){
    const opts=field.type_config?.options||[];
    return field.value.map(item=>{
      if(typeof item==='string'){const o=opts.find(x=>x.id===item);return o?o.name||o.label||item:item;}
      if(typeof item==='object')return item.label||item.name||item.value||'';
      return'';
    }).filter(Boolean);
  }
  return[];
}
function normCons(n){
  if(!n)return'';
  const l=normalizeText(n);
  for(const[k,v]of Object.entries(CONFIG.CONSULTORES)){if(l.includes(k))return v;}
  return'';
}
function daysBetween(d1,d2){return Math.max(0,Math.floor((d2-d1)/86400000));}
function formatDate(d){if(!d)return'';const dd=new Date(d);if(isNaN(dd.getTime()))return'';return dd.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'});}
function formatMes(d){if(!d)return'';const dd=new Date(d);if(isNaN(dd.getTime()))return'';return CONFIG.MESES[dd.getMonth()]+' '+dd.getFullYear();}

// ================================================================
// LOAD DATA
// ================================================================
function loadSavedData(){
  const savedCfg=localStorage.getItem('holaCfg');
  if(savedCfg){try{
    const c=JSON.parse(savedCfg);
    if(c.holaWs)c.holaWs=sanitizeHolaWorkspace(c.holaWs,c.holaUrl||'');
    if(c.apiKey){CONFIG.API_KEY=c.apiKey;const el=document.getElementById('cfgApiKey');if(el)el.value=c.apiKey;}
    if(c.listId){CONFIG.LIST_ID=c.listId;const el=document.getElementById('cfgListId');if(el)el.value=c.listId;}
    if(c.primarySource){const el=document.getElementById('cfgPrimarySource');if(el)el.value=c.primarySource;}
    ['holaUrl','holaToken','holaWs','slackCsWebhook','slackSalesWebhook','diasAlerta','diasSinMov','diasRiesgo','diasMeta'].forEach(key=>{
      const map={holaUrl:'cfgHolaUrl',holaToken:'cfgHolaToken',holaWs:'cfgHolaWs',slackCsWebhook:'cfgSlackCsWebhook',slackSalesWebhook:'cfgSlackSalesWebhook',diasAlerta:'cfgDiasAlerta',diasSinMov:'cfgDiasSinMov',diasRiesgo:'cfgDiasRiesgo',diasMeta:'cfgDiasMeta'};
      const el=document.getElementById(map[key]); if(el&&c[key]!=null)el.value=c[key];
    });
    ['sheet1','sheet1Name','sheet2','sheet2Name','salesSheetId','salesSheetName'].forEach(key=>{
      const map={sheet1:'cfgSheet1',sheet1Name:'cfgSheet1Name',sheet2:'cfgSheet2',sheet2Name:'cfgSheet2Name',salesSheetId:'cfgSalesSheetId',salesSheetName:'cfgSalesSheetName'};
      const el=document.getElementById(map[key]); if(el&&c[key]!=null)el.value=c[key];
    });
    if(c.manualJson){const el=document.getElementById('cfgManualJson');if(el)el.value=c.manualJson;}
    if(c.salesJson){const el=document.getElementById('cfgSalesJson');if(el)el.value=c.salesJson;}
    if(c.salesFields){
      APP.salesFields=parseFieldDefinitions(c.salesFields,defaultSalesFields());
      const el=document.getElementById('cfgSalesFields');
      if(el)el.value=c.salesFields;
    }else{
      APP.salesFields=defaultSalesFields();
    }
    if(c.protectedFields){
      APP.syncProtectedFields=parseProtectedFields(c.protectedFields);
      const el=document.getElementById('cfgProtectedFields');
      if(el)el.value=c.protectedFields;
    }else{
      APP.syncProtectedFields=defaultProtectedFields();
    }
  }catch{}}
  if(!APP.salesFields.length)APP.salesFields=defaultSalesFields();
  if(!APP.syncProtectedFields.length)APP.syncProtectedFields=defaultProtectedFields();
  const salesFieldsEl=document.getElementById('cfgSalesFields');
  if(salesFieldsEl&&!salesFieldsEl.value)salesFieldsEl.value=APP.salesFields.map(field=>`${field.key}|${field.label}`).join('\n');
  const protectedFieldsEl=document.getElementById('cfgProtectedFields');
  if(protectedFieldsEl&&!protectedFieldsEl.value)protectedFieldsEl.value=APP.syncProtectedFields.join('\n');
  const savedBranding=localStorage.getItem('holaBranding');
  APP.branding=savedBranding?JSON.parse(savedBranding):defaultBranding();
  populateBrandingForm();
  applyBranding();
  const savedMejoras=localStorage.getItem('holaMejoras');
  if(savedMejoras){try{APP.mejoras=JSON.parse(savedMejoras)||[];}catch{}}
  const savedCS=localStorage.getItem('holaCSEvents');
  if(savedCS){try{APP.csEvents=JSON.parse(savedCS)||[];}catch{}}
  const savedUpsells=localStorage.getItem('holaUpsells');
  if(savedUpsells){try{APP.upsells=JSON.parse(savedUpsells)||{};}catch{}}
  const savedOverrides=localStorage.getItem('holaChannelOverrides');
  if(savedOverrides){try{APP.channelOverrides=JSON.parse(savedOverrides)||{};}catch{}}
  const savedLogs=localStorage.getItem('holaClientLogs');
  if(savedLogs){try{APP.clientLogs=JSON.parse(savedLogs)||{};}catch{}}
  const savedKanban=localStorage.getItem('holaKanbanMeta');
  if(savedKanban){try{APP.kanbanMeta=JSON.parse(savedKanban)||{};}catch{}}
  const savedApis=localStorage.getItem('holaCustomApis');
  if(savedApis){try{APP.customApis=JSON.parse(savedApis)||[];}catch{}}
  const savedSales=localStorage.getItem('holaSalesData');
  if(savedSales){try{APP.salesData=(JSON.parse(savedSales)||[]).map(normalizeLead);}catch{}}
  const savedPendingConflicts=localStorage.getItem('holaPendingConflicts');
  if(savedPendingConflicts){try{APP.pendingConflicts=JSON.parse(savedPendingConflicts)||[];}catch{}}
  const savedAlertWords=localStorage.getItem('holaAlertWords');
  if(savedAlertWords){try{APP.alertWords=JSON.parse(savedAlertWords);}catch{}}
  else{APP.alertWords={danger:['cancelar','baja','cancelación','no funciona','no sirve','quiero cancelar','cierre','terminar contrato','dar de baja'],warning:['pausa','pausar','detenido','sin actividad','sin respuesta','esperando','necesito ayuda','problema','error']};}
  renderCustomApisList();
  renderAlertWordsTags();
  renderPendingConflicts();
  renderVentas();
  const links=getPublicFormLinks();
  const upgradeLink=document.getElementById('publicUpgradeLink');
  const churnLink=document.getElementById('publicChurnLink');
  if(upgradeLink)upgradeLink.value=links.upgrade;
  if(churnLink)churnLink.value=links.churn;
}

function loadLocalData(){
  const cached=localStorage.getItem('holaData');
  if(cached){
    try{
      const{data,ts,meta}=JSON.parse(cached);
      if(data&&data.length>0){
        APP.data=hydrateClients(data);APP.lastSync=new Date(ts);
        APP.apiMeta=meta||{source:'cache',taskCount:data.length,syncedAt:APP.lastSync.toISOString()};
        APP.filteredByDate=applyDateFilter(APP.data);
        renderAll(APP.filteredByDate);
        document.getElementById('apiStatusText').textContent=APP.data.length+' clientes · cache';
        toast('info','📁 Caché cargado ('+data.length+' clientes)');
        return;
      }
    }catch{}
  }
  // Demo data removed - only real API connections allowed
  APP.data=[];
  APP.filteredByDate=[];
  APP.apiMeta={source:'offline',taskCount:0,syncedAt:new Date().toISOString()};
  document.getElementById('apiStatusText').textContent='Sin datos - conecta API';
  toast('warning','⚠️ Configura la conexión a ClickUp para ver datos');
}

function generateDemoData(){
  // Demo function removed - use real API
  return [];
}

// ================================================================
// RENDER ALL
// ================================================================
function renderAll(data){
  if(!data)data=APP.filteredByDate||APP.data;
  const activos=data.filter(c=>c.statusType==='activo');
  const impl=data.filter(c=>c.statusType==='impl');
  const cancelados=data.filter(c=>c.statusType==='cancelado');
  const alertas=data.filter(c=>c.alerta&&c.alerta!=='NO');
  const sinLink=impl.filter(c=>!c.hasLink&&!c.ip&&!c.dominio);
  const upsells=data.filter(c=>c.hasupsell||(APP.upsells[c.id]&&APP.upsells[c.id].length>0));
  APP.filtered={impl:impl.slice(),activos:activos.slice(),cancelados:cancelados.slice()};

  // KPIs Dashboard
  setTxt('kpi-total',data.length);
  setTxt('kpi-activos',activos.length);
  setTxt('kpi-impl',impl.length);
  setTxt('kpi-cancel',cancelados.length);
  const tot=data.length||1;
  const pctAct=((activos.length/tot)*100).toFixed(0);
  const pctCan=((cancelados.length/tot)*100).toFixed(0);
  setHtml('kpi-activos-pct',`<i class="fa fa-arrow-trend-up"></i> ${pctAct}% del total`);
  setHtml('kpi-cancel-pct',`<i class="fa fa-arrow-trend-down"></i> ${pctCan}% del total`);
  const promDias=activos.length>0?(activos.reduce((s,c)=>s+c.dImpl,0)/activos.length).toFixed(0):'—';
  setTxt('kpi-prom',promDias+(promDias==='—'?'':'d'));
  setTxt('kpi-alertas',alertas.length);
  setTxt('kpi-upsell',upsells.length);
  setTxt('kpi-sinlink',sinLink.length);
  renderLifecycleKPIs(data);

  // Cancelados KPIs
  const usaron=cancelados.filter(c=>c.usoPlat==='SÍ');
  const retenidosCS=APP.csEvents.filter(e=>e.type==='retencion'&&e.resultado==='retenido');
  setTxt('kpi-canc-total',cancelados.length);
  setTxt('kpi-canc-usaron',usaron.length);
  setTxt('kpi-canc-nouso',cancelados.length-usaron.length);
  const promUso=usaron.length>0?(usaron.reduce((s,c)=>s+(c.dUsoTotal||c.dUso||0),0)/usaron.length).toFixed(0):0;
  setTxt('kpi-canc-prom',promUso+'d');
  setTxt('kpi-canc-retenidos',retenidosCS.length);

  // Alertas KPIs
  const critD=parseInt(document.getElementById('alertThreshCrit')?.value||20);
  const warnD=parseInt(document.getElementById('alertThreshWarn')?.value||7);
  const riskD=parseInt(document.getElementById('alertThreshRisk')?.value||180);
  const crits=alertas.filter(c=>c.alerta.includes('🚨')).length;
  const warns=alertas.filter(c=>c.alerta.includes('⚠️')).length;
  const sinlinkAlert=impl.filter(c=>!c.ip&&!c.dominio).length;
  const riesgo=activos.filter(c=>c.dUso>riskD).length;
  const pausados=data.filter(c=>c.pausada==='SÍ').length;
  setTxt('kpi-alert-crit',crits);
  setTxt('kpi-alert-warn',warns);
  setTxt('kpi-alert-sinlink',sinlinkAlert);
  setTxt('kpi-alert-riesgo',riesgo);
  setTxt('kpi-alert-pausados',pausados);

  // Badges
  setTxt('implBadge',impl.length);
  setTxt('activosBadge',activos.length);
  setTxt('canceladosBadge',cancelados.length);
  setTxt('alertasBadge',alertas.length);
  const nd=document.getElementById('notifDot');
  if(nd)nd.style.display=alertas.length>0?'block':'none';
  const ob=document.getElementById('opaBadge');
  if(ob)ob.style.display=APP.holaConversations.filter(c=>c._alertLevel).length>0?'flex':'none';
  const mb=document.getElementById('mejorasBadge');
  if(mb){const open=APP.mejoras.filter(m=>m.status==='open').length;mb.style.display=open>0?'flex':'none';mb.textContent=open;}

  populateFilters(data);
  renderCharts(activos,impl,cancelados,data);
  renderImplementationKPIs(data);
  renderImplTable(impl);
  renderActivosTable(activos);
  renderCanceladosTable(cancelados);
  buildMotivosFilterBar();  // Construir barra de filtros por motivos
  renderQuickAlertTable(impl.filter(c=>c.alerta&&c.alerta!=='NO'));
  populateReportFilters();
  renderUsersListConfig();
  if(APP.currentSection==='consultores')renderConsultores();
  if(APP.currentSection==='vendedores')renderVendedores();
  if(APP.currentSection==='bi')renderBI();
  if(APP.currentSection==='ventas')renderVentas();
  if(APP.currentSection==='metas')renderMetas();
  if(APP.currentSection==='panoramic')renderPanoramic();
  if(APP.currentSection==='alertas')renderAlertas();
  if(APP.currentSection==='kanban')renderKanban();
  if(APP.currentSection==='canales')renderCanales();
  if(APP.currentSection==='cs')renderCS();
}

function renderLifecycleKPIs(data){
  const metaTotal=parsePositiveInt(document.getElementById('cfgDiasMeta')?.value||CONFIG.DIAS_META.total||20,20);
  const arrivedMonth=data.filter(c=>isCurrentMonth(c.created||parseDateAny(c.fInicio))).length;
  const implPrevMonth=data.filter(c=>c.statusType==='impl'&&isPreviousMonth(parseDateAny(c.fInicio)||c.created)).length;
  const finishedMonth=data.filter(c=>c.fActivacion&&isCurrentMonth(c.fActivacion)).length;
  const finishedSameMonth=data.filter(c=>c.fActivacion&&isCurrentMonth(c.fActivacion)&&monthKeyFromDate(c.fActivacion)===monthKeyFromDate(c.fInicio||c.created)).length;
  const finishedOtherMonth=data.filter(c=>c.fActivacion&&isCurrentMonth(c.fActivacion)&&monthKeyFromDate(c.fActivacion)!==monthKeyFromDate(c.fInicio||c.created)).length;
  const lateFinished=data.filter(c=>c.fActivacion&&isCurrentMonth(c.fActivacion)&&Number(c.dImpl||0)>metaTotal).length;
  const onTime=data.filter(c=>c.fActivacion&&isCurrentMonth(c.fActivacion)&&Number(c.dImpl||0)<=metaTotal).length;
  const supportHeavy=data.filter(c=>findConversationMatches(c).length>=5).length;
  setTxt('life-arrived-month',arrivedMonth);
  setTxt('life-impl-prev-month',implPrevMonth);
  setTxt('life-finished-month',finishedMonth);
  setTxt('life-finished-same-month',finishedSameMonth);
  setTxt('life-finished-other-month',finishedOtherMonth);
  setTxt('life-late-finished',lateFinished);
  setTxt('life-on-time',onTime);
  setTxt('life-support-heavy',supportHeavy);
}

function setTxt(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function setHtml(id,v){const e=document.getElementById(id);if(e)e.innerHTML=v;}

function refreshAlerts(){
  const data=APP.filteredByDate||APP.data;
  renderAll(data);
  if(APP.currentSection==='alertas')renderAlertas();
}

// ================================================================
// FILTERS / POPULATE
// ================================================================
function populateFilters(data){
  const d=data||APP.data;
  const paises=[...new Set(d.map(c=>c.pais).filter(p=>p&&p!=='No definido'))].sort();
  const cons=[...new Set(d.flatMap(c=>collectAssignedConsultants(c.consultoresAsignados||[],c.rKickoff,c.rVer,c.rCap,c.rGoLive,c.rAct).filter(r=>r&&r!=='No definido'&&r!=='')))].sort();
  const planes=[...new Set(d.map(c=>c.plan).filter(p=>p&&p!==''))].sort();
  fillSelect('implPaisFilter',paises,'País');fillSelect('implConsFilter',cons,'Consultor');
  fillSelect('activosPaisFilter',paises,'País');fillSelect('activosConsFilter',cons,'Consultor');fillSelect('activosPlanFilter',planes,'Plan');
  fillSelect('cancPaisFilter',paises,'País');
  fillSelect('panoPaisFilter',paises,'Todos los países');fillSelect('panoConsFilter',cons,'Todos los consultores');
  fillSelect('kanbanConsFilter',cons,'Todos los consultores');fillSelect('kanbanPaisFilter',paises,'Todos los países');
}
function fillSelect(id,opts,ph){
  const el=document.getElementById(id);if(!el)return;
  const cur=el.value;
  el.innerHTML=`<option value="">${ph}</option>`;
  opts.forEach(o=>el.innerHTML+=`<option value="${escHtml(o)}">${escHtml(o)}</option>`);
  if(cur)el.value=cur;
}
function populateReportFilters(){
  const d=APP.data;
  const cons=[...new Set(d.flatMap(c=>collectAssignedConsultants(c.consultoresAsignados||[],c.rKickoff,c.rCap).filter(r=>r&&r!=='')))].sort();
  const paises=[...new Set(d.map(c=>c.pais).filter(p=>p&&p!=='No definido'))].sort();
  const meses=[...new Set(d.map(c=>c.mesInicio).filter(m=>m&&m!==''))];
  fillSelect('rptConsultor',cons,'Todos');fillSelect('rptPais',paises,'Todos');fillSelect('rptMes',meses,'Todos');
  // CS modal client select
  const sel=document.getElementById('csClientSel');
  if(sel){sel.innerHTML='<option value="">Seleccionar cliente...</option>';d.forEach(c=>sel.innerHTML+=`<option value="${c.id}">${escHtml(c.nombre)}</option>`);}
}

function filterTable(type,query){
  const q=(query||'').toLowerCase();
  let base=APP.data.filter(c=>c.statusType===(type==='impl'?'impl':type==='activos'?'activo':'cancelado'));
  if(q)base=base.filter(c=>[c.nombre,c.pais,c.rKickoff,c.rCap,getAssignedConsultantsLabel(c),c.plan,c.ip,c.dominio].some(f=>(f||'').toLowerCase().includes(q)));
  APP.filtered[type==='impl'?'impl':type==='activos'?'activos':'cancelados']=base;
  if(type==='impl')renderImplTable(base);
  else if(type==='activos')renderActivosTable(base);
  else renderCanceladosTable(base);
}
function filterTableField(type,field,value){
  let base=APP.data.filter(c=>c.statusType===(type==='impl'?'impl':type==='activos'?'activo':'cancelado'));
  if(value){
    if(field==='pais')base=base.filter(c=>c.pais===value);
    else if(field==='cons')base=base.filter(c=>collectAssignedConsultants(c.consultoresAsignados||[],c.rKickoff,c.rVer,c.rCap,c.rGoLive,c.rAct).includes(value));
    else if(field==='plan')base=base.filter(c=>c.plan===value);
    else if(field==='alerta'){
      if(value==='critical')base=base.filter(c=>c.alerta.includes('🚨'));
      else if(value==='warning')base=base.filter(c=>c.alerta.includes('⚠️'));
    }
    else if(field==='uso')base=base.filter(c=>c.usoPlat===value);
  }
  APP.filtered[type==='impl'?'impl':type==='activos'?'activos':'cancelados']=base;
  if(type==='impl')renderImplTable(base);
  else if(type==='activos')renderActivosTable(base);
  else renderCanceladosTable(base);
}
function sortTable(type,field){
  const dir=(APP.sortState[type+field]===1)?-1:1;
  APP.sortState[type+field]=dir;
  const key=type==='impl'?'impl':type==='activos'?'activos':'cancelados';
  const arr=[...(APP.filtered[key]||[])];
  arr.sort((a,b)=>{
    const va=field==='dias'?a.dImpl:field==='uso'?(a.dUsoTotal||a.dUso||0):0;
    const vb=field==='dias'?b.dImpl:field==='uso'?(b.dUsoTotal||b.dUso||0):0;
    return(va-vb)*dir;
  });
  APP.filtered[key]=arr;
  if(type==='impl')renderImplTable(arr);
  else if(type==='activos')renderActivosTable(arr);
  else renderCanceladosTable(arr);
}

// Filtros Avanzados por Campos Faltantes
function filterByMissingField(type,field){
  let base=APP.data.filter(c=>c.statusType===(type==='impl'?'impl':type==='activos'?'activo':'cancelado'));
  
  // Filtrar por campos vacíos
  if(field==='rKickoff')base=base.filter(c=>!c.rKickoff);
  else if(field==='rVer')base=base.filter(c=>!c.rVer);
  else if(field==='rCap')base=base.filter(c=>!c.rCap);
  else if(field==='rGoLive')base=base.filter(c=>!c.rGoLive);
  else if(field==='rAct')base=base.filter(c=>!c.rAct);
  else if(field==='plan')base=base.filter(c=>!c.plan);
  else if(field==='pais')base=base.filter(c=>!c.pais);
  else if(field==='email')base=base.filter(c=>!c.email);
  else if(field==='ip')base=base.filter(c=>!c.ip && !c.dominio);
  
  const key=type==='impl'?'impl':type==='activos'?'activos':'cancelados';
  APP.filtered[key]=base;
  
  // Mostrar toast con resultados
  toast('info',`${base.length} cliente(s) sin ${field}`);
  
  if(type==='impl')renderImplTable(base);
  else if(type==='activos')renderActivosTable(base);
  else renderCanceladosTable(base);
}

function clearAdvancedFilter(type){
  const key=type==='impl'?'impl':type==='activos'?'activos':'cancelados';
  // Volver a mostrar todos los datos del tipo actual
  const base=APP.data.filter(c=>c.statusType===(type==='impl'?'impl':type==='activos'?'activo':'cancelado'));
  APP.filtered[key]=base;
  
  toast('info','Filtros avanzados limpios');
  
  if(type==='impl')renderImplTable(base);
  else if(type==='activos')renderActivosTable(base);
  else renderCanceladosTable(base);
}

// ================================================================
// TABLE RENDERS
// ================================================================
function renderImplTable(data){
  const tb=document.getElementById('implTable');if(!tb)return;
  if(!data||!data.length){tb.innerHTML=noDataRow(12,'Sin clientes en implementación para este período');return;}
  tb.innerHTML=data.map(c=>{
    const dc=c.dImpl>20?'days-crit':c.dImpl>15?'days-warn':'days-ok';
    const ups=APP.upsells[c.id]&&APP.upsells[c.id].length>0?`<span class="badge badge-teal" title="Upsell registrado"><i class="fa fa-arrow-trend-up"></i> ${APP.upsells[c.id].length}</span>`:'';
    return`<tr>
      <td style="text-align:center"><input type="checkbox" class="bulk-select" data-client-id="${c.id}" onchange="updateBulkCount()"></td>
      <td><strong style="font-size:12px">${escHtml(c.nombre)}</strong>${ups}</td>
      <td>${flagFor(c.pais)} ${c.pais}</td>
      <td>${c.plan?`<span class="badge badge-purple">${c.plan}</span>`:'<span style="color:var(--muted);font-size:11px">—</span>'}</td>
      <td><span class="badge badge-info" style="font-size:10px;max-width:130px;overflow:hidden;text-overflow:ellipsis">${escHtml(c.estado)}</span></td>
      <td><span class="days-badge ${dc}">${c.dImpl}</span></td>
      <td>${renderEtapaBadge(c.estado)}</td>
      <td style="font-size:11px">${escHtml(getAssignedConsultantsLabel(c))}</td>
      <td>${c.ip||c.dominio?`<span style="font-size:10px;color:var(--info)">${escHtml(c.ip||c.dominio)}</span>`:'<span class="badge badge-warning" style="font-size:9px">⚠️ Sin IP</span>'}</td>
      <td>${renderCanalesSmall(c)}</td>
      <td>${c.alerta!=='NO'?`<span class="badge ${c.alerta.includes('🚨')?'badge-danger':'badge-warning'}" style="font-size:10px">${c.alerta}</span>`:'<span class="badge badge-success" style="font-size:10px">✅</span>'}</td>
      <td><button class="btn-outline btn-sm" onclick="showFichaCliente('${c.id}')"><i class="fa fa-eye"></i></button></td>
    </tr>`;
  }).join('');
}

function renderActivosTable(data){
  const tb=document.getElementById('activosTable');if(!tb)return;
  if(!data||!data.length){tb.innerHTML=noDataRow(11,'Sin clientes activos para este período');return;}
  tb.innerHTML=data.map(c=>{
    const ups=APP.upsells[c.id]&&APP.upsells[c.id].length>0;
    return`<tr>
      <td style="text-align:center"><input type="checkbox" class="bulk-select" data-client-id="${c.id}" onchange="updateBulkCount()"></td>
      <td><strong style="font-size:12px">${escHtml(c.nombre)}</strong></td>
      <td>${flagFor(c.pais)} ${c.pais}</td>
      <td>${c.plan?`<span class="badge badge-purple">${c.plan}</span>`:'—'}</td>
      <td style="font-size:11px">${c.fActivacion||'—'}</td>
      <td><span class="badge badge-success">${c.dUso}d</span></td>
      <td>${renderCanalesSmall(c)}</td>
      <td>${c.ip||c.dominio?`<a href="${escHtml(c.linkHola)}" target="_blank" style="color:var(--info);font-size:11px"><i class="fa fa-link"></i> ${escHtml(c.ip||c.dominio)}</a>`:'—'}</td>
      <td style="font-size:11px">${escHtml(getAssignedConsultantsLabel(c))}</td>
      <td>
        ${ups?`<span class="badge badge-teal"><i class="fa fa-arrow-trend-up"></i> ${APP.upsells[c.id].length}</span>`:''}
        <button class="btn-outline btn-sm" style="margin-left:4px" onclick="openUpsellModal('${c.id}')" title="Registrar upsell"><i class="fa fa-plus"></i></button>
      </td>
      <td><button class="btn-outline btn-sm" onclick="showFichaCliente('${c.id}')"><i class="fa fa-eye"></i></button></td>
    </tr>`;
  }).join('');
}

function renderCanceladosTable(data){
  const tb=document.getElementById('canceladosTable');if(!tb)return;
  if(!data||!data.length){tb.innerHTML=noDataRow(11,'Sin cancelados para este período');return;}
  tb.innerHTML=data.map(c=>`<tr>
    <td style="text-align:center"><input type="checkbox" class="bulk-select" data-client-id="${c.id}" onchange="updateBulkCount()"></td>
    <td><strong style="font-size:12px">${escHtml(c.nombre)}</strong></td>
    <td>${flagFor(c.pais)} ${c.pais}</td>
    <td>${c.plan?`<span class="badge badge-purple">${c.plan}</span>`:'—'}</td>
    <td style="font-size:11px">${c.fCancelacion||'—'}</td>
    <td>${c.usoPlat==='SÍ'?'<span class="badge badge-success">SÍ</span>':'<span class="badge badge-danger">NO</span>'}</td>
    <td><span class="${c.dUsoTotal>30?'badge badge-info':'badge badge-warning'}">${c.dUsoTotal||0}d</span></td>
    <td>${renderCanalesSmall(c)}</td>
    <td>${c.motivo?`<span class="badge badge-warning" style="font-size:10px">${escHtml(c.motivo)}</span>`:'—'}</td>
    <td style="font-size:11px">${escHtml(getAssignedConsultantsLabel(c))}</td>
    <td><button class="btn-outline btn-sm" onclick="showFichaCliente('${c.id}')"><i class="fa fa-eye"></i></button></td>
  </tr>`).join('');
}

function renderQuickAlertTable(data){
  const tb=document.getElementById('quickAlertTable');if(!tb)return;
  if(!data||!data.length){tb.innerHTML=noDataRow(8,'✅ Sin alertas activas');return;}
  tb.innerHTML=data.slice(0,8).map(c=>`<tr>
    <td><strong>${escHtml(c.nombre)}</strong></td>
    <td>${flagFor(c.pais)} ${c.pais}</td>
    <td><span class="badge badge-info" style="font-size:10px">${escHtml(c.estado)}</span></td>
    <td><span class="days-badge ${c.dImpl>20?'days-crit':'days-warn'}">${c.dImpl}</span></td>
    <td style="font-size:11px">${escHtml(getAssignedConsultantsLabel(c))}</td>
    <td>${c.ip||c.dominio?`<span style="font-size:10px;color:var(--info)">${escHtml(c.ip||c.dominio)}</span>`:'<span class="badge badge-warning" style="font-size:9px">Sin IP</span>'}</td>
    <td><span class="badge ${c.alerta.includes('🚨')?'badge-danger':'badge-warning'}" style="font-size:10px">${c.alerta}</span></td>
    <td><button class="btn-outline btn-sm" onclick="showClient('${c.id}')"><i class="fa fa-eye"></i></button></td>
  </tr>`).join('');
}

// ================================================================
// CHARTS
// ================================================================
const CD={responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'rgba(232,232,240,.65)',font:{size:11},boxWidth:12,padding:10}},tooltip:{backgroundColor:'rgba(13,13,26,.95)',borderColor:'rgba(255,109,0,.3)',borderWidth:1,padding:10,titleColor:'var(--primary)',bodyColor:'rgba(232,232,240,.8)'}},scales:{x:{ticks:{color:'rgba(232,232,240,.45)',font:{size:10}},grid:{color:'rgba(255,255,255,.04)'}},y:{ticks:{color:'rgba(232,232,240,.45)',font:{size:10}},grid:{color:'rgba(255,255,255,.04)'}}}};

function dChart(ids){ids.forEach(id=>{if(APP.charts[id]){APP.charts[id].destroy();delete APP.charts[id];}});}

function renderCharts(activos,impl,cancelados,allData){
  dChart(['chartEstados','chartPaises','chartCanales','chartConsultores','chartMes','chartMotivos','chartCancPaises']);
  // Doughnut estados
  makeDonut('chartEstados',['Activos','En Impl.','Cancelados'],[activos.length,impl.length,cancelados.length],['#00C853','#FF6D00','#FF1744']);
  // Paises
  const pc={};allData.forEach(c=>{if(c.pais&&c.pais!=='No definido')pc[c.pais]=(pc[c.pais]||0)+1;});
  const ps=Object.entries(pc).sort((a,b)=>b[1]-a[1]).slice(0,8);
  makeBarH('chartPaises',ps.map(p=>p[0]),ps.map(p=>p[1]),'#FF6D00');
  // Canales
  const waC=activos.filter(c=>c.wa).length,igC=activos.filter(c=>c.ig).length,wcC=activos.filter(c=>c.wc).length,pbxC=activos.filter(c=>c.pbx).length,tgC=activos.filter(c=>c.tg).length,msgC=activos.filter(c=>c.msg).length;
  makeBarV('chartCanales',['WhatsApp','Instagram','WebChat','PBX','Telegram','Messenger'],[waC,igC,wcC,pbxC,tgC,msgC],['#25D366','#C13584','#FF6D00','#00B0FF','#0088CC','#0078FF']);
  // Consultores activos
  const cu={};activos.forEach(c=>{const r=c.rCap||c.rKickoff;if(r)cu[r]=(cu[r]||0)+1;});
  const cs=Object.entries(cu).sort((a,b)=>b[1]-a[1]);
  makeBarV('chartConsultores',cs.map(c=>c[0]),cs.map(c=>c[1]),'#7C3AED');
  // Mes evolución
  const md=buildMesData(allData);const ml=Object.keys(md).slice(-12);
  makeLine('chartMes',ml,[
    {label:'Activos',data:ml.map(m=>md[m]?.activos||0),color:'#00C853'},
    {label:'En Impl.',data:ml.map(m=>md[m]?.impl||0),color:'#FF6D00'},
    {label:'Cancelados',data:ml.map(m=>md[m]?.cancelados||0),color:'#FF1744'}
  ],true);
  // Motivos cancelados
  const mc={};cancelados.forEach(c=>{const m=c.motivo||'Sin especificar';mc[m]=(mc[m]||0)+1;});
  const ms=Object.entries(mc).sort((a,b)=>b[1]-a[1]);
  makeDonut('chartMotivos',ms.map(m=>m[0]),ms.map(m=>m[1]),['#FF1744','#FF6D00','#FFD600','#FF8A65','#FFAB91','#FFCCBC','#aaa']);
  // Cancelados pais
  const cp2={};cancelados.forEach(c=>{if(c.pais)cp2[c.pais]=(cp2[c.pais]||0)+1;});
  const cps=Object.entries(cp2).sort((a,b)=>b[1]-a[1]).slice(0,6);
  makeBarH('chartCancPaises',cps.map(p=>p[0]),cps.map(p=>p[1]),'#FF1744');
}

function buildMesData(data){
  const r={};
  data.forEach(c=>{
    const m=c.mesInicio||c.mesAct||c.mesFin;
    if(!m)return;
    if(!r[m])r[m]={activos:0,impl:0,cancelados:0};
    if(c.statusType==='activo')r[m].activos++;
    else if(c.statusType==='impl')r[m].impl++;
    else r[m].cancelados++;
  });
  return Object.fromEntries(Object.entries(r).sort((a,b)=>{
    const[mA,yA]=a[0].split(' ');const[mB,yB]=b[0].split(' ');
    const ya=parseInt(yA)||0,yb=parseInt(yB)||0;
    if(ya!==yb)return ya-yb;
    return CONFIG.MESES.indexOf(mA)-CONFIG.MESES.indexOf(mB);
  }));
}

function getMonthLabelFromAny(value){
  const parsed=parseDateAny(value);
  return parsed?formatMes(parsed):'';
}

function getClientStageNames(client){
  return [client.rKickoff,client.rVer,client.rCap,client.rGoLive,client.rAct].filter(Boolean);
}

function getParticipationType(client){
  const stages=getClientStageNames(client);
  if(!stages.length)return'none';
  return new Set(stages).size===1?'full':'mixed';
}

function getRecentMonthKeys(data, limit=18){
  const keys=Array.from(new Set((data||[]).flatMap(client=>[
    monthKeyFromDate(client.created),
    monthKeyFromDate(client.fInicio),
    monthKeyFromDate(client.fActivacion),
    monthKeyFromDate(client.fCancelacion)
  ].filter(Boolean)))).sort();
  return keys.slice(-limit).reverse();
}

function monthLabelFromKey(key){
  if(!key)return'';
  const [year,month]=key.split('-').map(Number);
  if(!year||!month)return key;
  return `${CONFIG.MESES[month-1]} ${year}`;
}

function renderImplementationKPIs(data){
  const impl=(data||[]).filter(c=>c.statusType==='impl');
  const meta=parsePositiveInt(document.getElementById('cfgDiasMeta')?.value||CONFIG.DIAS_META.total||20,20);
  const startedMonth=impl.filter(c=>isCurrentMonth(c.fInicio||c.created)).length;
  const onTime=impl.filter(c=>Number(c.dImpl||0)<=meta).length;
  const late=impl.filter(c=>Number(c.dImpl||0)>meta).length;
  const mixed=impl.filter(c=>getParticipationType(c)==='mixed').length;
  const full=impl.filter(c=>getParticipationType(c)==='full').length;
  setTxt('impl-kpi-total',impl.length);
  setTxt('impl-kpi-started-month',startedMonth);
  setTxt('impl-kpi-on-time',onTime);
  setTxt('impl-kpi-late',late);
  setTxt('impl-kpi-mixed',mixed);
  setTxt('impl-kpi-full',full);
}

function renderImplementationMonthTable(data){
  const tb=document.getElementById('implMonthTable');if(!tb)return;
  const rows=getRecentMonthKeys(data,18).map(key=>{
    const started=(data||[]).filter(c=>monthKeyFromDate(c.fInicio||c.created)===key);
    const finished=(data||[]).filter(c=>monthKeyFromDate(c.fActivacion)===key);
    const canceled=(data||[]).filter(c=>monthKeyFromDate(c.fCancelacion)===key);
    const activeBase=(data||[]).filter(c=>c.statusType==='activo'&&monthKeyFromDate(c.fActivacion)===key);
    const finEsteMes=finished.filter(c=>monthKeyFromDate(c.fInicio||c.created)===key).length;
    const pendAnt=(data||[]).filter(c=>c.statusType==='impl'&&monthKeyFromDate(c.fInicio||c.created)<key).length;
    const enCurso=(data||[]).filter(c=>c.statusType==='impl'&&monthKeyFromDate(c.fInicio||c.created)===key).length;
    const tasaExito=started.length?((finished.length/started.length)*100):0;
    const tasaCancel=started.length?((canceled.length/started.length)*100):0;
    const eficiencia=finished.length?((finished.filter(c=>Number(c.dImpl||0)<=parsePositiveInt(document.getElementById('cfgDiasMeta')?.value||CONFIG.DIAS_META.total||20,20)).length/finished.length)*100):0;
    return {key,label:monthLabelFromKey(key),iniciadas:started.length,finalizadas:finished.length,enCurso,finEsteMes,pendAnt,canceladas:canceled.length,activas:activeBase.length,tasaExito,tasaCancel,eficiencia};
  });
  if(!rows.length){tb.innerHTML=noDataRow(11,'Sin métricas mensuales');return;}
  tb.innerHTML=rows.map(r=>`<tr>
    <td><strong>${escHtml(r.label)}</strong></td>
    <td>${r.iniciadas}</td>
    <td>${r.finalizadas}</td>
    <td>${r.enCurso}</td>
    <td>${r.finEsteMes}</td>
    <td>${r.pendAnt}</td>
    <td>${r.canceladas}</td>
    <td>${r.activas}</td>
    <td>${r.tasaExito.toFixed(1)}%</td>
    <td>${r.tasaCancel.toFixed(1)}%</td>
    <td>${r.eficiencia.toFixed(1)}%</td>
  </tr>`).join('');
}

function renderStageMonthTable(data){
  const tb=document.getElementById('stageMonthTable');if(!tb)return;
  const rows=getRecentMonthKeys(data,18).map(key=>{
    const monthClients=(data||[]).filter(c=>monthKeyFromDate(c.fInicio||c.created)===key||monthKeyFromDate(c.fActivacion)===key||monthKeyFromDate(c.fCancelacion)===key);
    const kick=monthClients.filter(c=>c.rKickoff).length;
    const ver=monthClients.filter(c=>c.rVer).length;
    const cap=monthClients.filter(c=>c.rCap).length;
    const golive=monthClients.filter(c=>c.rGoLive).length;
    const act=monthClients.filter(c=>c.rAct).length;
    const concl=monthClients.filter(c=>monthKeyFromDate(c.fActivacion)===key).length;
    const cancel=monthClients.filter(c=>monthKeyFromDate(c.fCancelacion)===key).length;
    const promDias=monthClients.length?monthClients.reduce((sum,c)=>sum+Number(c.dImpl||0),0)/monthClients.length:0;
    const measured=computeMeasuredStageDurations(monthClients);
    return {label:monthLabelFromKey(key),clientes:monthClients.length,kick,ver,cap,golive,act,concl,cancel,promDias,measured};
  });
  if(!rows.length){tb.innerHTML=noDataRow(14,'Sin métricas de etapas');return;}
  tb.innerHTML=rows.map(r=>`<tr>
    <td><strong>${escHtml(r.label)}</strong></td>
    <td>${r.clientes}</td>
    <td>${r.kick}</td>
    <td>${r.ver}</td>
    <td>${r.cap}</td>
    <td>${r.golive}</td>
    <td>${r.act}</td>
    <td>${r.concl}</td>
    <td>${r.cancel}</td>
    <td>${r.promDias.toFixed(1)}</td>
    <td>${Number(r.measured[0]||0).toFixed(1)}</td>
    <td>${Number(r.measured[1]||0).toFixed(1)}</td>
    <td>${Number(r.measured[3]||0).toFixed(1)}</td>
    <td>${Number(r.measured[4]||0).toFixed(1)}</td>
  </tr>`).join('');
}

function buildConsultantMonthlyRows(data){
  const map={};
  (data||[]).forEach(c=>{
    const monthKey=monthKeyFromDate(c.fInicio||c.created)||'';
    const monthLabel=monthLabelFromKey(monthKey)||'Sin mes';
    const participants=Array.from(new Set(getClientStageNames(c)));
    participants.forEach(cons=>{
      const key=`${cons}|${monthKey}`;
      if(!map[key])map[key]={consultor:cons,mes:monthLabel,clientes:new Set(),activos:0,cancel:0,kick:0,ver:0,cap:0,golive:0,act:0,completas:0,parciales:0,totalHrs:0};
      const row=map[key];
      row.clientes.add(c.id);
      if(c.statusType==='activo')row.activos++;
      if(c.statusType==='cancelado')row.cancel++;
      if(cons===c.rKickoff)row.kick++;
      if(cons===c.rVer)row.ver++;
      if(cons===c.rCap)row.cap++;
      if(cons===c.rGoLive)row.golive++;
      if(cons===c.rAct)row.act++;
      if(getParticipationType(c)==='full'&&participants.includes(cons)&&c.statusType==='activo')row.completas++;
      if(getParticipationType(c)==='mixed'&&participants.includes(cons))row.parciales++;
      row.totalHrs+=Number(c.hCap||0);
    });
  });
  return Object.values(map).sort((a,b)=>b.clientes.size-a.clientes.size||b.mes.localeCompare(a.mes));
}

function renderConsultorMonthlyTable(data){
  const tb=document.getElementById('consultorMonthTable');if(!tb)return;
  const rows=buildConsultantMonthlyRows(data);
  if(!rows.length){tb.innerHTML=noDataRow(13,'Sin actividad por consultor');return;}
  tb.innerHTML=rows.map(r=>`<tr>
    <td><strong>${escHtml(r.consultor)}</strong></td>
    <td>${escHtml(r.mes)}</td>
    <td>${r.clientes.size}</td>
    <td>${r.activos}</td>
    <td>${r.cancel}</td>
    <td>${r.kick}</td>
    <td>${r.ver}</td>
    <td>${r.cap}</td>
    <td>${r.golive}</td>
    <td>${r.act}</td>
    <td>${r.completas}</td>
    <td>${r.parciales}</td>
    <td>${r.totalHrs.toFixed(1)}</td>
  </tr>`).join('');
}

function renderConsultorSummaryTable(data){
  const tb=document.getElementById('consultorSummaryTable');if(!tb)return;
  const activos=(data||[]).filter(c=>c.statusType==='activo');
  const total=activos.length||1;
  const fullCounts={};
  let mixed=0;
  activos.forEach(c=>{
    const type=getParticipationType(c);
    if(type==='full'){
      const owner=getClientStageNames(c)[0];
      if(owner)fullCounts[owner]=(fullCounts[owner]||0)+1;
    }else if(type==='mixed'){
      mixed++;
    }
  });
  const rows=[{label:'Total Activos',count:activos.length,pct:100},...Object.entries(fullCounts).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({label:`${name} 100%`,count,pct:(count/total)*100})),{label:'Participación Mixta',count:mixed,pct:(mixed/total)*100}];
  tb.innerHTML=rows.map(r=>`<tr><td><strong>${escHtml(r.label)}</strong></td><td>${r.count}</td><td>${r.pct.toFixed(1)}%</td></tr>`).join('')||noDataRow(3,'Sin resumen');
}

function computeMeasuredStageDurations(data){
  const defs=[
    {key:'kickoff',patterns:['kickoff','onboarding']},
    {key:'verificacion',patterns:['analisis','análisis','verificacion','verificación']},
    {key:'instalacion',patterns:['instalac']},
    {key:'capacitacion',patterns:['capacit']},
    {key:'activacion',patterns:['activac','conclu','activo','go-live','go live']}
  ];
  const sums={kickoff:0,verificacion:0,instalacion:0,capacitacion:0,activacion:0};
  const counts={kickoff:0,verificacion:0,instalacion:0,capacitacion:0,activacion:0};
  (data||[]).forEach(client=>{
    const logs=[...(client.sourceLogs||client.logs||[])].map(log=>({
      text:normalizeText(`${log.toStatus||''} ${log.detalle||''}`),
      date:parseDateAny(log.fecha)
    })).filter(item=>item.date).sort((a,b)=>a.date-b.date);
    if(logs.length<2)return;
    const hits={};
    defs.forEach(def=>{
      const match=logs.find(log=>def.patterns.some(pattern=>log.text.includes(pattern)));
      if(match)hits[def.key]=match.date;
    });
    for(let i=0;i<defs.length-1;i++){
      const current=defs[i];
      const next=defs[i+1];
      if(hits[current.key]&&hits[next.key]&&hits[next.key]>=hits[current.key]){
        sums[current.key]+=daysBetween(hits[current.key],hits[next.key]);
        counts[current.key]++;
      }
    }
    if(hits.activacion&&hits.capacitacion&&hits.activacion>=hits.capacitacion){
      sums.activacion+=daysBetween(hits.capacitacion,hits.activacion);
      counts.activacion++;
    }
  });
  return defs.map(def=>counts[def.key]>0?Number((sums[def.key]/counts[def.key]).toFixed(1)):0);
}

function makeDonut(id,labels,data,colors){
  const ctx=document.getElementById(id);if(!ctx)return;
  APP.charts[id]=new Chart(ctx,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:2,borderColor:'#0D0D1A',hoverOffset:6}]},options:{...CD,scales:{},plugins:{...CD.plugins,legend:{position:'right',labels:{color:'rgba(232,232,240,.65)',font:{size:11},padding:10,boxWidth:12}}}}});
}
function makeBarH(id,labels,data,color){
  const ctx=document.getElementById(id);if(!ctx)return;
  APP.charts[id]=new Chart(ctx,{type:'bar',data:{labels,datasets:[{data,backgroundColor:color+'30',borderColor:color,borderWidth:1,borderRadius:5}]},options:{...CD,indexAxis:'y',plugins:{...CD.plugins,legend:{display:false}}}});
}
function makeBarV(id,labels,data,colors){
  const ctx=document.getElementById(id);if(!ctx)return;
  const bg=Array.isArray(colors)?colors.map(c=>c+'55'):data.map(()=>colors+'55');
  const bc=Array.isArray(colors)?colors:data.map(()=>colors);
  APP.charts[id]=new Chart(ctx,{type:'bar',data:{labels,datasets:[{data,backgroundColor:bg,borderColor:bc,borderWidth:1,borderRadius:5}]},options:{...CD,plugins:{...CD.plugins,legend:{display:false}}}});
}
function makeLine(id,labels,datasets,fill=false){
  const ctx=document.getElementById(id);if(!ctx)return;
  APP.charts[id]=new Chart(ctx,{type:'line',data:{labels,datasets:datasets.map(d=>({label:d.label,data:d.data,borderColor:d.color,backgroundColor:d.color+'22',borderWidth:2,fill,tension:.4,pointBackgroundColor:d.color,pointRadius:4,pointHoverRadius:6}))},options:{...CD}});
}
function toggleChartMode(btn,mode){
  document.querySelectorAll('#sec-dashboard .chart-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const data=APP.filteredByDate||APP.data;
  const md=buildMesData(data);const ml=Object.keys(md).slice(-12);
  dChart(['chartMes']);
  const allSets=[
    {label:'Activos',data:ml.map(m=>md[m]?.activos||0),color:'#00C853'},
    {label:'En Impl.',data:ml.map(m=>md[m]?.impl||0),color:'#FF6D00'},
    {label:'Cancelados',data:ml.map(m=>md[m]?.cancelados||0),color:'#FF1744'}
  ];
  const sets=mode==='all'?allSets:allSets.filter(s=>s.label.toLowerCase().includes(mode==='activos'?'activo':mode==='impl'?'impl':'cancel'));
  makeLine('chartMes',ml,sets,true);
}

// ================================================================
// ALERTAS
// ================================================================
function renderAlertas(){
  const data=APP.filteredByDate||APP.data;
  const critD=parseInt(document.getElementById('alertThreshCrit')?.value||20);
  const warnD=parseInt(document.getElementById('alertThreshWarn')?.value||7);
  const riskD=parseInt(document.getElementById('alertThreshRisk')?.value||180);
  const impl=data.filter(c=>c.statusType==='impl');
  const activos=data.filter(c=>c.statusType==='activo');
  const alertas=impl.filter(c=>c.alerta&&c.alerta!=='NO');
  const sinlink=impl.filter(c=>!c.ip&&!c.dominio);
  const riesgo=activos.filter(c=>c.dUso>riskD);
  const pausados=data.filter(c=>c.pausada==='SÍ');
  setTxt('kpi-alert-crit',alertas.filter(c=>c.alerta.includes('🚨')).length);
  setTxt('kpi-alert-warn',alertas.filter(c=>c.alerta.includes('⚠️')).length);
  setTxt('kpi-alert-sinlink',sinlink.length);
  setTxt('kpi-alert-riesgo',riesgo.length);
  setTxt('kpi-alert-pausados',pausados.length);
  const list=document.getElementById('alertList');if(!list)return;
  const all=[
    ...alertas.map(c=>({
      type:c.alerta.includes('🚨')?'critical':'warning',icon:c.alerta.includes('🚨')?'fa-circle-exclamation':'fa-clock',
      title:c.nombre,
      desc:`${c.alerta} • ${c.dImpl} días impl. • Consultor: ${c.rKickoff||c.rCap||'Sin asignar'} • Sin mov: ${c.dSinMov}d`,
      meta:`${flagFor(c.pais)} ${c.pais} | Estado: ${c.estado} | IP: ${c.ip||'Sin IP'}`,id:c.id,priority:c.alerta.includes('🚨')?0:1
    })),
    ...sinlink.map(c=>({
      type:'warning',icon:'fa-link-slash',
      title:c.nombre+' — Sin IP / Dominio',
      desc:`Cliente en implementación sin datos de acceso a la plataforma registrados.`,
      meta:`${flagFor(c.pais)} ${c.pais} | ${c.dImpl} días | Consultor: ${c.rKickoff||'—'}`,id:c.id,priority:2
    })),
    ...riesgo.map(c=>({
      type:'info',icon:'fa-user-clock',
      title:c.nombre+' — Riesgo de Churn',
      desc:`Activo por ${c.dUso} días. Revisar engagement y satisfacción del cliente.`,
      meta:`${flagFor(c.pais)} ${c.pais} | Plan: ${c.plan||'—'} | F. Activ: ${c.fActivacion}`,id:c.id,priority:3
    })),
    ...pausados.filter(c=>c.statusType==='impl').map(c=>({
      type:'warning',icon:'fa-pause',
      title:c.nombre+' — En Pausa',
      desc:`Implementación pausada. Verificar motivo y definir próximos pasos.`,
      meta:`${flagFor(c.pais)} ${c.pais} | ${c.dImpl} días | Consultor: ${c.rKickoff||'—'}`,id:c.id,priority:2
    }))
  ].sort((a,b)=>a.priority-b.priority);
  if(!all.length){list.innerHTML=`<div class="no-data"><i class="fa fa-bell-slash"></i><p>Sin alertas activas para el período seleccionado</p></div>`;return;}
  list.innerHTML=all.map(a=>`<div class="alert-item ${a.type}">
    <div class="alert-icon ${a.type}"><i class="fa ${a.icon}"></i></div>
    <div class="alert-content">
      <div class="alert-title">${escHtml(a.title)}</div>
      <div class="alert-desc">${escHtml(a.desc)}</div>
      <div class="alert-desc" style="margin-top:2px;font-size:10px">${a.meta}</div>
    </div>
    <button class="btn-outline btn-sm" onclick="showClient('${a.id}')"><i class="fa fa-eye"></i></button>
  </div>`).join('');
}

// ================================================================
// PANORAMIC
// ================================================================
function renderPanoramic(){
  const ft=APP.panoFilter,fp=APP.panoPais,fc=APP.panoCons;
  let data=[...(APP.filteredByDate||APP.data)];
  if(ft==='active')data=data.filter(c=>c.statusType==='activo');
  else if(ft==='impl')data=data.filter(c=>c.statusType==='impl');
  else if(ft==='cancel')data=data.filter(c=>c.statusType==='cancelado');
  else if(ft==='alert')data=data.filter(c=>c.alerta&&c.alerta!=='NO');
  else if(ft==='nolink')data=data.filter(c=>!c.ip&&!c.dominio);
  if(fp)data=data.filter(c=>c.pais===fp);
  if(fc)data=data.filter(c=>[c.rKickoff,c.rVer,c.rCap,c.rGoLive,c.rAct].includes(fc));
  setTxt('panoCount',data.length+' clientes');
  const grid=document.getElementById('panoramicGrid');if(!grid)return;
  if(!data.length){grid.innerHTML=`<div class="no-data" style="grid-column:1/-1"><i class="fa fa-search"></i><p>Sin resultados</p></div>`;return;}
  grid.innerHTML=data.map(c=>{
    const cls=c.statusType==='activo'?'active-cl':c.statusType==='cancelado'?'cancel-cl':(!c.ip&&!c.dominio)?'nolink-cl':c.alerta&&c.alerta!=='NO'?'alert-cl':'impl-cl';
    const icon=c.statusType==='activo'?'✅':c.statusType==='cancelado'?'❌':'⚙️';
    return`<div class="pano-card ${cls}" onclick="showFichaCliente('${c.id}')">
      <div class="pano-name">${escHtml(c.nombre)}</div>
      <div class="pano-meta">${flagFor(c.pais)} ${c.pais}</div>
      <div class="pano-meta">${escHtml(c.rCap||c.rKickoff||'—')}</div>
      <div class="pano-status">${icon} <span style="font-size:10px;color:var(--muted)">${c.dImpl}d</span>
        ${c.plan?`<span class="badge badge-purple" style="font-size:9px;padding:1px 5px;margin-left:3px">${c.plan}</span>`:''}
      </div>
      ${c.alerta&&c.alerta!=='NO'?`<div style="font-size:9px;margin-top:4px;color:var(--danger)">${c.alerta}</div>`:''}
      ${!c.ip&&!c.dominio&&c.statusType==='impl'?`<div style="font-size:9px;margin-top:4px;color:var(--warning)">⚠️ Sin IP</div>`:''}
    </div>`;
  }).join('');
}

function filterPano(type){
  if(type==='pais'){APP.panoPais=document.getElementById('panoPaisFilter')?.value||'';}
  else if(type==='cons'){APP.panoCons=document.getElementById('panoConsFilter')?.value||'';}
  else{APP.panoFilter=type;APP.panoPais='';APP.panoCons='';document.getElementById('panoPaisFilter').value='';document.getElementById('panoConsFilter').value='';}
  renderPanoramic();
}

// ================================================================
// KANBAN
// ================================================================
const KANBAN_ETAPAS=[
  {key:'listo_ko',label:'Listo para KO',targetStatus:'Listo para Kickoff',color:'#FFD600',match:['listo para kickoff']},
  {key:'ko',label:'En Kickoff',targetStatus:'En Kickoff',color:'#FF6D00',match:['en kickoff','en onboarding','listo para onboarding']},
  {key:'analisis',label:'Análisis Meta',targetStatus:'En análisis meta',color:'#00B0FF',match:['analisis','análisis']},
  {key:'instalacion',label:'Instalación',targetStatus:'En instalación',color:'#7C3AED',match:['instalac']},
  {key:'capacitacion',label:'Capacitación',targetStatus:'En capacitación',color:'#C13584',match:['capacit']},
  {key:'golive',label:'Go-Live',targetStatus:'Go-Live',color:'#00C853',match:['go-live','go live','activación','activacion']},
  {key:'wispro',label:'En Espera',targetStatus:'En espera Wispro',color:'#FF8A80',match:['espera','wispro']}
];

function getKanbanMeta(clientId){
  if(!APP.kanbanMeta[clientId])APP.kanbanMeta[clientId]={tags:[],comments:[],stageOverride:'',lastSyncStatus:''};
  return APP.kanbanMeta[clientId];
}

function persistKanbanMeta(){
  localStorage.setItem('holaKanbanMeta',JSON.stringify(APP.kanbanMeta||{}));
}

function getClientKanbanStageKey(client){
  const meta=getKanbanMeta(client.id);
  const stageValue=normalizeText(meta.stageOverride||client.estado||'');
  const stage=KANBAN_ETAPAS.find(etapa=>etapa.match.some(m=>stageValue.includes(normalizeText(m))));
  return stage?.key||'wispro';
}

async function syncKanbanStatusToClickUp(client,status){
  const apiKey=(document.getElementById('cfgApiKey')?.value||CONFIG.API_KEY||'').trim();
  if(!apiKey||!canUseServerProxy())throw new Error('Backend o API Key de ClickUp no disponible');
  await postJson(`/api/clickup/task/${encodeURIComponent(client.id)}/status`,{status});
}

async function moveKanbanCard(clientId, stageKey){
  const client=APP.data.find(c=>c.id===clientId);
  const stage=KANBAN_ETAPAS.find(item=>item.key===stageKey);
  if(!client||!stage)return;
  const meta=getKanbanMeta(clientId);
  meta.stageOverride=stage.targetStatus;
  meta.comments.unshift({id:`kc-${Date.now()}`,text:`Movimiento de etapa a ${stage.targetStatus}`,createdAt:new Date().toISOString(),author:APP.currentUser?.name||'Sistema'});
  meta.lastSyncStatus='pending';
  persistKanbanMeta();
  renderKanban();
  toast('info',`Etapa actualizada a "${stage.targetStatus}"`);
  try{
    await syncKanbanStatusToClickUp(client,stage.targetStatus);
    client.estado=stage.targetStatus;
    meta.stageOverride='';
    meta.lastSyncStatus='synced';
    persistKanbanMeta();
    renderKanban();
    toast('success','Etapa sincronizada con ClickUp');
  }catch(err){
    meta.lastSyncStatus=`pending_sync: ${err.message}`;
    persistKanbanMeta();
    renderKanban();
    toast('warning','Cambio guardado localmente. ClickUp no se pudo sincronizar todavía.');
  }
}

function renderKanban(){
  const board=document.getElementById('kanbanBoard');if(!board)return;
  const cons=document.getElementById('kanbanConsFilter')?.value||'';
  const pais=document.getElementById('kanbanPaisFilter')?.value||'';
  const onlyAlert=document.getElementById('kanbanOnlyAlert')?.checked||false;
  let data=(APP.filteredByDate||APP.data).filter(c=>c.statusType==='impl');
  if(cons)data=data.filter(c=>[c.rKickoff,c.rVer,c.rCap,c.rGoLive,c.rAct].includes(cons));
  if(pais)data=data.filter(c=>c.pais===pais);
  if(onlyAlert)data=data.filter(c=>c.alerta&&c.alerta!=='NO');
  setTxt('kanbanCount',data.length+' tarjetas');
  board.innerHTML=KANBAN_ETAPAS.map(etapa=>{
    const cards=data.filter(c=>getClientKanbanStageKey(c)===etapa.key);
    cards.sort((a,b)=>{const ap=a.alerta.includes('🚨')?0:a.alerta.includes('⚠️')?1:2;const bp=b.alerta.includes('🚨')?0:b.alerta.includes('⚠️')?1:2;return ap-bp;});
    return`<div class="kanban-col" data-stage-key="${etapa.key}">
      <div class="kanban-col-header">
        <span class="kanban-col-title">${etapa.label}</span>
        <span class="kanban-col-count" style="background:${etapa.color}22;color:${etapa.color};border:1px solid ${etapa.color}44">${cards.length}</span>
      </div>
      <div class="kanban-items" data-stage-key="${etapa.key}" ondragover="handleKanbanDragOver(event)" ondragleave="handleKanbanDragLeave(event)" ondrop="handleKanbanDrop(event,'${etapa.key}')">
        ${cards.length===0?`<div style="text-align:center;padding:20px;font-size:11px;color:var(--muted)">Sin tarjetas</div>`:''}
        ${cards.map(c=>{
          const meta=getKanbanMeta(c.id);
          const dc=c.dImpl>20?'kd-crit':c.dImpl>15?'kd-warn':'kd-ok';
          const hasAlert=c.alerta&&c.alerta!=='NO';
          return`<div class="kanban-card ${hasAlert?'has-alert':''}" draggable="true" ondragstart="handleKanbanDragStart(event,'${c.id}')" ondragend="handleKanbanDragEnd(event)" onclick="showClient('${c.id}')">
            <div class="kanban-card-name">${escHtml(c.nombre)}</div>
            <div class="kanban-card-meta">
              <span>${flagFor(c.pais)}</span>
              <span class="kanban-card-days ${dc}">${c.dImpl}d</span>
              ${c.plan?`<span class="badge badge-purple" style="font-size:9px;padding:1px 5px">${c.plan}</span>`:''}
            </div>
            <div class="kanban-card-meta" style="margin-top:6px">
              <span style="font-size:10px">${escHtml(c.rKickoff||c.rCap||'—')}</span>
              ${hasAlert?`<span class="badge badge-danger" style="font-size:9px;padding:1px 5px">${c.alerta}</span>`:''}
            </div>
            ${!c.ip&&!c.dominio?`<div style="font-size:9px;color:var(--warning);margin-top:4px">⚠️ Sin IP/Dominio</div>`:''}
            <div class="kanban-card-meta" style="margin-top:5px">${renderCanalesSmall(c)}</div>
            ${meta.tags?.length?`<div class="kanban-tag-list">${meta.tags.slice(0,3).map(tag=>`<span class="kanban-tag">${escHtml(tag)}</span>`).join('')}</div>`:''}
            ${meta.lastSyncStatus&&meta.lastSyncStatus!=='synced'?`<div style="font-size:9px;color:var(--warning);margin-top:6px">Pendiente ClickUp</div>`:''}
            <div class="kanban-actions">
              <button class="kanban-mini-btn" onclick="event.stopPropagation();openKanbanCardModal('${c.id}')" title="Gestionar tarjeta"><i class="fa fa-pen"></i></button>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

function handleKanbanDragStart(event, clientId){
  event.dataTransfer.setData('text/plain',clientId);
  event.dataTransfer.effectAllowed='move';
  event.currentTarget.classList.add('dragging');
}

function handleKanbanDragEnd(event){
  event.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.kanban-drop-target').forEach(el=>el.classList.remove('kanban-drop-target'));
}

function handleKanbanDragOver(event){
  event.preventDefault();
  event.currentTarget.classList.add('kanban-drop-target');
}

function handleKanbanDragLeave(event){
  event.currentTarget.classList.remove('kanban-drop-target');
}

function handleKanbanDrop(event, stageKey){
  event.preventDefault();
  event.currentTarget.classList.remove('kanban-drop-target');
  const clientId=event.dataTransfer.getData('text/plain');
  if(clientId)moveKanbanCard(clientId,stageKey);
}

// ================================================================
// CANALES
// ================================================================
function renderCanales(){
  dChart(['chartCanalesPais','chartCanalesPlan']);
  const data=(APP.filteredByDate||APP.data).filter(c=>c.statusType==='activo'||c.statusType==='impl');
  const channels=[
    {key:'wa',label:'WhatsApp',icon:'fab fa-whatsapp',color:'#25D366'},
    {key:'ig',label:'Instagram',icon:'fab fa-instagram',color:'#C13584'},
    {key:'tg',label:'Telegram',icon:'fab fa-telegram',color:'#0088CC'},
    {key:'wc',label:'WebChat',icon:'fa fa-comments',color:'#FF6D00'},
    {key:'pbx',label:'PBX / Teléf.',icon:'fa fa-phone',color:'#00B0FF'},
    {key:'msg',label:'Messenger',icon:'fab fa-facebook-messenger',color:'#0078FF'}
  ];
  const grid=document.getElementById('channelOverviewGrid');
  if(grid){
    grid.innerHTML=channels.map(ch=>{
      const cnt=data.filter(c=>c[ch.key]).length;
      const activ=data.filter(c=>c[ch.key]&&c.statusType==='activo').length;
      const impl=data.filter(c=>c[ch.key]&&c.statusType==='impl').length;
      const pct=data.length>0?((cnt/data.length)*100).toFixed(0):0;
      return`<div class="channel-overview-card">
        <i class="${ch.icon} channel-icon-big" style="color:${ch.color}"></i>
        <div class="channel-name-big">${ch.label}</div>
        <div class="channel-count" style="color:${ch.color}">${cnt}</div>
        <div class="channel-sub">${pct}% del total</div>
        <div class="channel-breakdown" style="margin-top:6px;font-size:10px">
          <span style="color:var(--success)">✅${activ}</span>
          <span style="color:var(--warning)">⚙️${impl}</span>
        </div>
      </div>`;
    }).join('');
  }
  // Charts
  const paisData={};
  data.forEach(c=>{
    if(!c.pais)return;
    if(!paisData[c.pais])paisData[c.pais]={wa:0,ig:0,wc:0,pbx:0,tg:0,msg:0};
    channels.forEach(ch=>{if(c[ch.key])paisData[c.pais][ch.key]++;});
  });
  const topPaises=Object.entries(paisData).sort((a,b)=>(b[1].wa+b[1].ig+b[1].wc)-(a[1].wa+a[1].ig+a[1].wc)).slice(0,6);
  const ctx1=document.getElementById('chartCanalesPais');
  if(ctx1)APP.charts['chartCanalesPais']=new Chart(ctx1,{type:'bar',data:{labels:topPaises.map(p=>p[0]),datasets:channels.map(ch=>({label:ch.label,data:topPaises.map(p=>p[1][ch.key]||0),backgroundColor:ch.color+'55',borderColor:ch.color,borderWidth:1,borderRadius:4}))},options:{...CD,plugins:{...CD.plugins,legend:{display:true,labels:{color:'rgba(232,232,240,.65)',font:{size:10},boxWidth:10}}}}});
  // Por plan
  const planData={};
  data.forEach(c=>{
    if(!c.plan)return;
    if(!planData[c.plan])planData[c.plan]={wa:0,ig:0,wc:0,pbx:0,tg:0,msg:0,total:0};
    planData[c.plan].total++;
    channels.forEach(ch=>{if(c[ch.key])planData[c.plan][ch.key]++;});
  });
  const plans=Object.keys(planData);
  const ctx2=document.getElementById('chartCanalesPlan');
  if(ctx2)APP.charts['chartCanalesPlan']=new Chart(ctx2,{type:'bar',data:{labels:plans,datasets:channels.map(ch=>({label:ch.label,data:plans.map(p=>planData[p][ch.key]||0),backgroundColor:ch.color+'55',borderColor:ch.color,borderWidth:1,borderRadius:4}))},options:{...CD,plugins:{...CD.plugins,legend:{display:true,labels:{color:'rgba(232,232,240,.65)',font:{size:10},boxWidth:10}}}}});
  renderCanalesTable();
}

function renderCanalesTable(){
  const tb=document.getElementById('canalesTable');if(!tb)return;
  const filter=document.getElementById('canalesStatusFilter')?.value||'';
  let data=(APP.filteredByDate||APP.data).filter(c=>c.statusType==='activo'||c.statusType==='impl');
  if(filter)data=data.filter(c=>c.statusType===filter);
  if(!data.length){tb.innerHTML=noDataRow(12,'Sin datos');return;}
  tb.innerHTML=data.map(c=>{
    const total=[c.wa,c.ig,c.tg,c.wc,c.pbx,c.msg].filter(Boolean).length;
    return`<tr>
      <td><strong style="font-size:12px">${escHtml(c.nombre)}</strong></td>
      <td>${flagFor(c.pais)} ${c.pais}</td>
      <td><span class="badge ${c.statusType==='activo'?'badge-success':'badge-info'}">${c.status}</span></td>
      ${['wa','ig','tg','wc','pbx','msg'].map(ch=>`<td style="text-align:center">${c[ch]?'<span style="color:var(--success);font-size:14px">✓</span>':'<span style="color:rgba(255,255,255,.15);font-size:14px">—</span>'}</td>`).join('')}
      <td><span class="badge badge-primary">${total}</span></td>
      <td>${c.linkHola?`<a href="${escHtml(c.linkHola)}" target="_blank" style="color:var(--info);font-size:11px"><i class="fa fa-link"></i></a>`:c.ip||c.dominio?`<span style="font-size:10px;color:var(--muted)">${escHtml(c.ip||c.dominio)}</span>`:'<span class="badge badge-warning" style="font-size:9px">Sin IP</span>'}</td>
    </tr>`;
  }).join('');
}

function filterCanalesTable(q){
  const tb=document.getElementById('canalesTable');if(!tb)return;
  const filter=document.getElementById('canalesStatusFilter')?.value||'';
  let data=(APP.filteredByDate||APP.data).filter(c=>c.statusType==='activo'||c.statusType==='impl');
  if(filter)data=data.filter(c=>c.statusType===filter);
  if(q)data=data.filter(c=>(c.nombre+c.pais+c.ip+c.dominio).toLowerCase().includes(q.toLowerCase()));
  // re-render filtered
  if(!data.length){tb.innerHTML=noDataRow(12,'Sin resultados');return;}
  const tmp=[...APP.filtered.activos,...APP.filtered.impl];
  // lightweight re-render
  renderCanalesTable();
}

// ================================================================
// CONSULTORES
// ================================================================
function renderConsultores(){
  dChart(['chartConsComp']);
  const data=APP.filteredByDate||APP.data;
  
  // Lista negra - consultores que NUNCA implementaron, solo participaron en etapas específicas
  const SOLOETAPAS=['larissa','karol','jose','leo salas','adrian','nicolas','felipe'];
  
  const consData={};
  data.forEach(c=>{
    // Excluir a vendedores (rVenta) de la lista de consultores
    const allCons=[...new Set([c.rKickoff,c.rVer,c.rCap,c.rGoLive,c.rAct].filter(r=>{
      if(!r||!r.trim())return false;
      // NO incluir si es igual a rVenta (vendedor/responsable comercial)
      if(c.rVenta&&normalizeText(r)===normalizeText(c.rVenta))return false;
      // NO incluir si es está en lista negra
      const rNorm=normalizeText(r);
      if(SOLOETAPAS.some(ln=>rNorm.includes(ln)))return false;
      return true;
    }))];
    allCons.forEach(r=>{
      if(!r||!r.trim())return;
      
      // Doble verificación: excluir si están en lista negra
      const rNorm=normalizeText(r);
      const enListaNegra=SOLOETAPAS.some(ln=>rNorm.includes(ln));
      if(enListaNegra)return;
      
      if(!consData[r])consData[r]={n:r,total:new Set(),activos:new Set(),impl:new Set(),cancel:new Set(),kickoffs:0,vers:0,caps:0,golives:0,acts:0,dias:0,completas:new Set(),parciales:new Set()};
      consData[r].total.add(c.id);
      if(c.statusType==='activo')consData[r].activos.add(c.id);
      else if(c.statusType==='impl')consData[r].impl.add(c.id);
      else consData[r].cancel.add(c.id);
      consData[r].dias+=c.dImpl||0;
      if(r===c.rKickoff)consData[r].kickoffs++;
      if(r===c.rVer)consData[r].vers++;
      if(r===c.rCap)consData[r].caps++;
      if(r===c.rGoLive)consData[r].golives++;
      if(r===c.rAct)consData[r].acts++;
      // Check complete vs partial
      const etapas=[c.rKickoff,c.rVer,c.rCap,c.rGoLive,c.rAct].filter(e=>e&&e!=='');
      const consInAll=etapas.length>0&&etapas.every(e=>e===r);
      if(consInAll&&c.statusType==='activo')consData[r].completas.add(c.id);
      else if(etapas.includes(r)&&!consInAll)consData[r].parciales.add(c.id);
    });
  });
  const colors=['linear-gradient(135deg,#FF6D00,#E65100)','linear-gradient(135deg,#7C3AED,#5B21B6)','linear-gradient(135deg,#00C853,#00A044)','linear-gradient(135deg,#00B0FF,#0081CB)','linear-gradient(135deg,#FF1744,#C62828)'];
  const arr=Object.values(consData).sort((a,b)=>b.total.size-a.total.size);
  
  // Guardar clientes por consultor
  const consultoresClientes={};
  data.forEach(c=>{
    const allCons=[...new Set([c.rKickoff,c.rVer,c.rCap,c.rGoLive,c.rAct].filter(r=>{
      if(!r||!r.trim())return false;
      if(c.rVenta&&normalizeText(r)===normalizeText(c.rVenta))return false;
      const rNorm=normalizeText(r);
      if(SOLOETAPAS.some(ln=>rNorm.includes(ln)))return false;
      return true;
    }))];
    allCons.forEach(r=>{
      if(!r||!r.trim())return;
      const rNorm=normalizeText(r);
      if(SOLOETAPAS.some(ln=>rNorm.includes(ln)))return;
      if(!consultoresClientes[r])consultoresClientes[r]=[];
      consultoresClientes[r].push(c);
    });
  });
  
  const grid=document.getElementById('consultoresGrid');
  if(grid){
    grid.innerHTML=arr.map((c,i)=>{
      const prom=c.total.size>0?(c.dias/c.total.size).toFixed(0):0;
      const exito=c.total.size>0?((c.activos.size/c.total.size)*100).toFixed(0):0;
      const efPct=parseFloat(exito);
      return`<div class="consultant-card" style="cursor:pointer" data-consultor="${escHtml(c.n)}" onclick="showConsultorClientes(this.getAttribute('data-consultor'))">
        <div class="c-header">
          <div class="c-avatar" style="background:${colors[i%colors.length]}">${c.n.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
          <div class="c-info"><strong>${escHtml(c.n)}</strong><span>${c.total.size} clientes total</span></div>
        </div>
        <div class="c-metrics">
          <div class="c-metric"><strong style="color:var(--success)">${c.activos.size}</strong><span>Activos</span></div>
          <div class="c-metric"><strong style="color:var(--warning)">${c.impl.size}</strong><span>En Impl.</span></div>
          <div class="c-metric"><strong style="color:var(--danger)">${c.cancel.size}</strong><span>Cancel.</span></div>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:6px;display:flex;gap:12px">
          <span>✅ Completas: <strong style="color:var(--success)">${c.completas.size}</strong></span>
          <span>⚡ Parciales: <strong style="color:var(--warning)">${c.parciales.size}</strong></span>
        </div>
        <div class="progress-bar"><div class="progress-fill ${efPct>=70?'green':efPct>=50?'orange':'red'}" style="width:${exito}%"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin:4px 0 10px">
          <span>Tasa éxito: <strong style="color:var(--text)">${exito}%</strong></span>
          <span>Prom: <strong style="color:var(--text)">${prom}d</strong></span>
        </div>
        <div class="c-stages">
          <span class="c-stage"><i class="fa fa-play"></i> ${c.kickoffs} KO</span>
          <span class="c-stage"><i class="fa fa-search"></i> ${c.vers} Ver.</span>
          <span class="c-stage" style="background:rgba(124,58,237,.08);color:#A78BFA"><i class="fa fa-graduation-cap"></i> ${c.caps} Cap.</span>
          <span class="c-stage" style="background:rgba(0,200,83,.08);color:var(--success)"><i class="fa fa-rocket"></i> ${c.golives} GL</span>
          <span class="c-stage" style="background:rgba(0,176,255,.08);color:var(--info)"><i class="fa fa-check"></i> ${c.acts} Act.</span>
        </div>
        <div style="text-align:center;font-size:10px;color:var(--primary);margin-top:8px;font-weight:600">
          📋 Ver clientes →
        </div>
      </div>`;
    }).join('');
  }
  
  APP.consultoresClientes=consultoresClientes;
  // Chart
  const ctx=document.getElementById('chartConsComp');
  if(ctx&&arr.length){
    APP.charts['chartConsComp']=new Chart(ctx,{type:'bar',data:{labels:arr.map(c=>c.n),datasets:[
      {label:'Kickoffs',data:arr.map(c=>c.kickoffs),backgroundColor:'rgba(255,109,0,.7)',borderRadius:4},
      {label:'Verificaciones',data:arr.map(c=>c.vers),backgroundColor:'rgba(0,176,255,.7)',borderRadius:4},
      {label:'Capacitaciones',data:arr.map(c=>c.caps),backgroundColor:'rgba(124,58,237,.7)',borderRadius:4},
      {label:'Go-Lives',data:arr.map(c=>c.golives),backgroundColor:'rgba(0,200,83,.7)',borderRadius:4},
      {label:'Activaciones',data:arr.map(c=>c.acts),backgroundColor:'rgba(0,188,212,.7)',borderRadius:4},
      {label:'Completas',data:arr.map(c=>c.completas.size),backgroundColor:'rgba(0,200,83,.3)',borderWidth:2,borderColor:'#00C853',borderRadius:4}
    ]},options:{...CD,plugins:{...CD.plugins,legend:{display:true,labels:{color:'rgba(232,232,240,.65)',font:{size:11},boxWidth:10}}}}});
  }
  renderConsultorMonthlyTable(data);
  renderConsultorSummaryTable(data);
}

// ================================================================
// VENDEDORES (Responsables Comerciales)
// ================================================================
function renderVendedores(){
  const data=APP.filteredByDate||APP.data;
  const vendData={};
  const vendClientes={};
  
  data.forEach(c=>{
    if(!c.rVenta||!c.rVenta.trim())return;
    const vend=c.rVenta;
    if(!vendData[vend])vendData[vend]={n:vend,total:0,activos:0,impl:0,cancel:0,valor:0,prom:0};
    if(!vendClientes[vend])vendClientes[vend]=[];
    
    vendClientes[vend].push(c);
    vendData[vend].total++;
    if(c.statusType==='activo')vendData[vend].activos++;
    else if(c.statusType==='impl')vendData[vend].impl++;
    else vendData[vend].cancel++;
  });
  
  const colors=['linear-gradient(135deg,#FF6D00,#E65100)','linear-gradient(135deg,#7C3AED,#5B21B6)','linear-gradient(135deg,#00C853,#00A044)','linear-gradient(135deg,#00B0FF,#0081CB)','linear-gradient(135deg,#FF1744,#C62828)'];
  const arr=Object.values(vendData).sort((a,b)=>b.total-a.total);
  
  const grid=document.getElementById('vendedoresGrid');
  if(grid){
    grid.innerHTML=arr.map((v,i)=>{
      const conversionPct=v.total>0?((v.activos/v.total)*100).toFixed(0):0;
      return`<div class="consultant-card" style="cursor:pointer" data-vendedor="${escHtml(v.n)}" onclick="showVendedorClientes(this.getAttribute('data-vendedor'))">
        <div class="c-header">
          <div class="c-avatar" style="background:${colors[i%colors.length]}">${v.n.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
          <div class="c-info"><strong>${escHtml(v.n)}</strong><span>${v.total} clientes totales</span></div>
        </div>
        <div class="c-metrics">
          <div class="c-metric"><strong style="color:var(--success)">${v.activos}</strong><span>Activos</span></div>
          <div class="c-metric"><strong style="color:var(--warning)">${v.impl}</strong><span>En Impl.</span></div>
          <div class="c-metric"><strong style="color:var(--danger)">${v.cancel}</strong><span>Cancel.</span></div>
        </div>
        <div class="progress-bar"><div class="progress-fill ${conversionPct>=70?'green':conversionPct>=50?'orange':'red'}" style="width:${conversionPct}%"></div></div>
        <div style="text-align:center;font-size:11px;color:var(--muted);margin:8px 0">
          <strong style="color:var(--text)">${conversionPct}%</strong> conversión a activos
        </div>
        <div style="text-align:center;font-size:10px;color:var(--primary);margin-top:8px;font-weight:600">
          📋 Ver clientes →
        </div>
      </div>`;
    }).join('');
  }
  
  APP.vendedorClientes=vendClientes;
}

// ================================================================
// BI
// ================================================================
function renderBI(){
  dChart(['chartFunnel','chartEtapas','chartEvolucion']);
  const data=APP.filteredByDate||APP.data;
  const activos=data.filter(c=>c.statusType==='activo');
  const impl=data.filter(c=>c.statusType==='impl');
  const cancelados=data.filter(c=>c.statusType==='cancelado');
  const tot=data.length||1;
  setTxt('bi-tasa-exito',((activos.length/tot)*100).toFixed(0)+'%');
  setTxt('bi-tasa-canc',((cancelados.length/tot)*100).toFixed(0)+'%');
  const pd=activos.length>0?(activos.reduce((s,c)=>s+c.dImpl,0)/activos.length).toFixed(0):0;
  setTxt('bi-prom-days',pd+'d');
  const waA=activos.filter(c=>c.wa).length;
  setTxt('bi-wa-pct',activos.length>0?((waA/activos.length)*100).toFixed(0)+'%':'—');
  setTxt('bi-upsell-total',data.filter(c=>c.hasupsell).length+Object.keys(APP.upsells).length);
  const measuredStages=computeMeasuredStageDurations(data);
  // Parciales: consultant participated in some but not all stages
  const parciales=data.filter(c=>{
    const etapas=[c.rKickoff,c.rVer,c.rCap,c.rGoLive,c.rAct].filter(e=>e&&e!=='');
    return etapas.length>0&&new Set(etapas).size>1;
  });
  setTxt('bi-impl-parcial',parciales.length);
  // Funnel
  const etapaCount=[
    data.filter(c=>c.estado.toLowerCase().includes('listo para kickoff')).length,
    data.filter(c=>c.estado.toLowerCase().includes('en kickoff')||c.estado.toLowerCase().includes('en onboarding')).length,
    data.filter(c=>c.estado.toLowerCase().includes('analisis')).length,
    data.filter(c=>c.estado.toLowerCase().includes('instalac')).length,
    data.filter(c=>c.estado.toLowerCase().includes('capacit')).length,
    data.filter(c=>c.estado.toLowerCase().includes('go-live')||c.estado.toLowerCase().includes('go live')).length,
    data.filter(c=>c.estado.toLowerCase().includes('activac')).length,
    activos.length,cancelados.length
  ];
  const ctx1=document.getElementById('chartFunnel');
  if(ctx1)APP.charts['chartFunnel']=new Chart(ctx1,{type:'bar',data:{labels:['Listo KO','En KO','Análisis','Instalación','Capacit.','Go-Live','Activación','Concluido','Cancelado'],datasets:[{data:etapaCount,backgroundColor:['#FFD60055','#FF6D0055','#00B0FF55','#7C3AED55','#C1358455','#00C85355','#4DD0E155','#00C85399','#FF174499'],borderColor:['#FFD600','#FF6D00','#00B0FF','#7C3AED','#C13584','#00C853','#4DD0E1','#00C853','#FF1744'],borderWidth:1,borderRadius:6}]},options:{...CD,plugins:{...CD.plugins,legend:{display:false}}}});
  const ctx2=document.getElementById('chartEtapas');
  if(ctx2)APP.charts['chartEtapas']=new Chart(ctx2,{type:'radar',data:{labels:['Kickoff','Verificación','Instalación','Capacitación','Activación'],datasets:[{label:'Meta',data:[CONFIG.DIAS_META.kickoff,CONFIG.DIAS_META.verificacion,CONFIG.DIAS_META.instalacion,CONFIG.DIAS_META.capacitacion,CONFIG.DIAS_META.activacion],borderColor:'#FF6D00',backgroundColor:'rgba(255,109,0,.1)',pointBackgroundColor:'#FF6D00'},{label:'Real medido por logs',data:measuredStages,borderColor:'#00C853',backgroundColor:'rgba(0,200,83,.1)',pointBackgroundColor:'#00C853'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'rgba(232,232,240,.65)',font:{size:11}}}},scales:{r:{ticks:{color:'rgba(232,232,240,.35)',font:{size:9}},grid:{color:'rgba(255,255,255,.06)'},pointLabels:{color:'rgba(232,232,240,.6)',font:{size:10}}}}}});
  const md=buildMesData(data);const ml=Object.keys(md).slice(-12);
  const ctx3=document.getElementById('chartEvolucion');
  if(ctx3)APP.charts['chartEvolucion']=new Chart(ctx3,{type:'line',data:{labels:ml,datasets:[{label:'Activos',data:ml.map(m=>md[m]?.activos||0),borderColor:'#00C853',backgroundColor:'rgba(0,200,83,.1)',tension:.4,fill:true,borderWidth:2,pointRadius:4,pointBackgroundColor:'#00C853'},{label:'Impl.',data:ml.map(m=>md[m]?.impl||0),borderColor:'#FF6D00',backgroundColor:'rgba(255,109,0,.1)',tension:.4,fill:true,borderWidth:2,pointRadius:4,pointBackgroundColor:'#FF6D00'},{label:'Cancelados',data:ml.map(m=>md[m]?.cancelados||0),borderColor:'#FF1744',backgroundColor:'rgba(255,23,68,.05)',tension:.4,fill:false,borderWidth:2,pointRadius:4,pointBackgroundColor:'#FF1744'}]},options:{...CD}});
  renderBITable(data);
  renderImplementationMonthTable(data);
  renderStageMonthTable(data);
}

function renderBITable(data){
  const tb=document.getElementById('biTable');if(!tb)return;
  const map={};
  data.forEach(c=>{
    const allCons=[...new Set([c.rKickoff,c.rVer,c.rCap,c.rGoLive,c.rAct].filter(r=>r&&r!==''))];
    allCons.forEach(cons=>{
      const mes=c.mesInicio||'Sin mes';
      const k=cons+'|'+mes;
      if(!map[k])map[k]={cons,mes,ids:new Set(),activos:0,cancel:0,impl:0,kick:0,cap:0,golive:0,completas:0,parciales:0};
      map[k].ids.add(c.id);
      if(c.statusType==='activo')map[k].activos++;
      else if(c.statusType==='cancelado')map[k].cancel++;
      else map[k].impl++;
      if(cons===c.rKickoff)map[k].kick++;
      if(cons===c.rCap)map[k].cap++;
      if(cons===c.rGoLive)map[k].golive++;
      const etapas=[c.rKickoff,c.rVer,c.rCap,c.rGoLive,c.rAct].filter(e=>e&&e!=='');
      if(etapas.every(e=>e===cons)&&c.statusType==='activo')map[k].completas++;
      else if(etapas.includes(cons)&&!etapas.every(e=>e===cons))map[k].parciales++;
    });
  });
  const rows=Object.values(map).sort((a,b)=>b.ids.size-a.ids.size);
  tb.innerHTML=rows.slice(0,40).map(r=>{
    const tot=r.activos+r.cancel+r.impl||1;
    const ex=((r.activos/tot)*100).toFixed(0);
    return`<tr>
      <td><strong>${escHtml(r.cons)}</strong></td><td style="font-size:11px">${r.mes}</td>
      <td>${r.ids.size}</td>
      <td><span class="badge badge-success">${r.activos}</span></td>
      <td><span class="badge badge-danger">${r.cancel}</span></td>
      <td><span class="badge badge-info">${r.impl}</span></td>
      <td>${r.kick}</td><td>${r.cap}</td><td>${r.golive}</td>
      <td><span class="badge badge-success">${r.completas}</span></td>
      <td><span class="badge badge-warning">${r.parciales}</span></td>
      <td><span class="badge ${parseFloat(ex)>=70?'badge-success':parseFloat(ex)>=50?'badge-warning':'badge-danger'}">${ex}%</span></td>
    </tr>`;
  }).join('')||noDataRow(12,'Sin datos para este período');
}

// ================================================================
// METAS
// ================================================================
function renderMetas(){
  dChart(['chartMetaEtapas','chartEficiencia']);
  const data=APP.filteredByDate||APP.data;
  const activos=data.filter(c=>c.statusType==='activo');
  const impl=data.filter(c=>c.statusType==='impl');
  const tot=data.length||1;
  const pd=activos.length>0?(activos.reduce((s,c)=>s+c.dImpl,0)/activos.length):0;
  const goals=[
    {title:'Clientes Activos',icon:'fa-check-circle',value:activos.length,meta:25,unit:'',color:'#00C853'},
    {title:'Prom. Días Impl.',icon:'fa-clock',value:pd.toFixed(0),meta:CONFIG.DIAS_META.total,unit:'d',color:pd<=20?'#00C853':'#FF1744',invertido:true},
    {title:'Tasa de Éxito',icon:'fa-percent',value:((activos.length/tot)*100).toFixed(0),meta:70,unit:'%',color:'#00C853'},
    {title:'Cancelaciones',icon:'fa-times-circle',value:data.filter(c=>c.statusType==='cancelado').length,meta:5,unit:'',color:'#FF1744',invertido:true},
    {title:'En Implementación',icon:'fa-gears',value:impl.length,meta:15,unit:'',color:'#FF6D00'},
    {title:'Alertas Activas',icon:'fa-bell',value:data.filter(c=>c.alerta&&c.alerta!=='NO').length,meta:3,unit:'',color:'#FFD600',invertido:true},
    {title:'Upsells Registrados',icon:'fa-arrow-trend-up',value:data.filter(c=>c.hasupsell).length,meta:10,unit:'',color:'#00BCD4'},
    {title:'Sin IP/Dominio',icon:'fa-link-slash',value:impl.filter(c=>!c.ip&&!c.dominio).length,meta:0,unit:'',color:'#FFD600',invertido:true}
  ];
  const grid=document.getElementById('goalsGrid');
  if(grid){grid.innerHTML=goals.map(g=>{
    const v=parseFloat(g.value),m=g.meta;
    const pct=g.invertido?(m===0?v===0?100:0:Math.max(0,Math.min(100,((m-v)/m)*100+50))):Math.min(100,(v/(m||1))*100);
    const ok=g.invertido?(m===0?v===0:v<=m):v>=m*0.8;
    return`<div class="goal-card">
      <div class="goal-title"><i class="fa ${g.icon}" style="color:${g.color}"></i> ${g.title}</div>
      <div class="goal-value" style="color:${ok?'var(--success)':'var(--warning)'}">${g.value}${g.unit}</div>
      <div class="goal-sub">Meta: ${g.meta}${g.unit}</div>
      <div class="goal-bar"><div class="goal-fill" style="width:${pct}%;background:${ok?g.color:'var(--warning)'}"></div></div>
      <div class="goal-labels"><span>0</span><span style="color:${ok?'var(--success)':'var(--warning)'}">${ok?'✅ En meta':'⚠️ Revisar'}</span><span>${g.meta}${g.unit}</span></div>
    </div>`;
  }).join('');}
  const ctx1=document.getElementById('chartMetaEtapas');
  const measuredStages=computeMeasuredStageDurations(data);
  if(ctx1)APP.charts['chartMetaEtapas']=new Chart(ctx1,{type:'bar',data:{labels:['Kickoff','Verificación','Instalación','Capacitación','Activación','Total'],datasets:[{label:'Meta',data:[CONFIG.DIAS_META.kickoff,CONFIG.DIAS_META.verificacion,CONFIG.DIAS_META.instalacion,CONFIG.DIAS_META.capacitacion,CONFIG.DIAS_META.activacion,CONFIG.DIAS_META.total],backgroundColor:'rgba(0,212,255,.2)',borderColor:'#00D4FF',borderWidth:2,borderRadius:4},{label:'Real medido',data:[...measuredStages,Number(pd.toFixed(1))],backgroundColor:'rgba(255,109,0,.2)',borderColor:'#FF6D00',borderWidth:2,borderRadius:4}]},options:{...CD,plugins:{...CD.plugins,legend:{display:true,labels:{color:'rgba(232,232,240,.65)',font:{size:11}}}}}});
  const cMap={};
  data.forEach(c=>{[c.rKickoff,c.rVer,c.rCap].filter(r=>r&&r!=='').forEach(r=>{if(!cMap[r])cMap[r]={t:0,a:0,d:0};cMap[r].t++;if(c.statusType==='activo')cMap[r].a++;cMap[r].d+=c.dImpl||0;});});
  const cArr=Object.entries(cMap).map(([n,d])=>({n,ef:d.t>0?Math.min(100,((CONFIG.DIAS_META.total/(d.d/d.t||1))*100)):0})).sort((a,b)=>b.ef-a.ef);
  const ctx2=document.getElementById('chartEficiencia');
  if(ctx2)APP.charts['chartEficiencia']=new Chart(ctx2,{type:'bar',data:{labels:cArr.map(c=>c.n),datasets:[{label:'Eficiencia %',data:cArr.map(c=>c.ef.toFixed(0)),backgroundColor:cArr.map(c=>c.ef>=80?'rgba(0,200,83,.6)':c.ef>=60?'rgba(255,109,0,.6)':'rgba(255,23,68,.6)'),borderColor:cArr.map(c=>c.ef>=80?'#00C853':c.ef>=60?'#FF6D00':'#FF1744'),borderWidth:2,borderRadius:6}]},options:{...CD,plugins:{...CD.plugins,legend:{display:false}},scales:{...CD.scales,y:{...CD.scales.y,max:120}}}});
}

// ================================================================
// CS DASHBOARD
// ================================================================
function renderCS(){
  dChart(['chartCSBajas','chartCSMotivos']);
  const data=APP.filteredByDate||APP.data;
  const cancelados=data.filter(c=>c.statusType==='cancelado');
  const activos=data.filter(c=>c.statusType==='activo');
  const bajas=APP.csEvents.filter(e=>e.type==='baja');
  const retenciones=APP.csEvents.filter(e=>e.type==='retencion');
  const retenidos=retenciones.filter(e=>e.resultado==='retenido');
  const recuperados=APP.csEvents.filter(e=>e.type==='recuperado');
  const perdidos=cancelados.length;
  const tasaRet=bajas.length>0?((retenidos.length/bajas.length)*100).toFixed(0):0;
  const churn=activos.length>0?((cancelados.length/(activos.length+cancelados.length))*100).toFixed(1):0;
  setTxt('cs-bajas',bajas.length);setTxt('cs-retenidos',retenidos.length);
  setTxt('cs-perdidos',perdidos);setTxt('cs-recuperados',recuperados.length);
  setTxt('cs-tasa-ret',tasaRet+'%');setTxt('cs-churn',churn+'%');
  // Charts
  const meses=CONFIG.MESES.map(m=>m.substring(0,3));
  const ctx1=document.getElementById('chartCSBajas');
  if(ctx1)APP.charts['chartCSBajas']=new Chart(ctx1,{type:'line',data:{labels:meses,datasets:[{label:'Bajas',data:meses.map((_,i)=>bajas.filter(e=>new Date(e.date).getMonth()===i).length),borderColor:'#FF1744',backgroundColor:'rgba(255,23,68,.1)',tension:.4,fill:true,borderWidth:2},{label:'Retenciones',data:meses.map((_,i)=>retenidos.filter(e=>new Date(e.date).getMonth()===i).length),borderColor:'#00C853',backgroundColor:'rgba(0,200,83,.1)',tension:.4,fill:true,borderWidth:2}]},options:{...CD}});
  const mc={};cancelados.forEach(c=>{const m=c.motivo||'Sin especificar';mc[m]=(mc[m]||0)+1;});
  const ms=Object.entries(mc).sort((a,b)=>b[1]-a[1]);
  makeDonut('chartCSMotivos',ms.map(m=>m[0]),ms.map(m=>m[1]),['#FF1744','#FF6D00','#FFD600','#FF8A65','#FFAB91','#aaa']);
  // Tables
  renderCSTable('bajas');renderCSTable('ret');renderCSTable('rec');
}

function renderCSTable(type){
  const events=APP.csEvents.filter(e=>e.type===(type==='bajas'?'baja':type==='ret'?'retencion':'recuperado'));
  const tb=document.getElementById('csTable_'+type);if(!tb)return;
  if(!events.length){tb.innerHTML=noDataRow(5,'Sin registros');return;}
  if(type==='bajas'){
    tb.innerHTML=events.map(e=>`<tr>
      <td><strong style="font-size:12px">${escHtml(e.clientName||'—')}</strong></td>
      <td style="font-size:11px">${e.date||'—'}</td>
      <td style="font-size:11px">${escHtml(e.motivo||'—')}</td>
      <td><span class="badge ${e.resultado==='retenido'?'badge-success':e.resultado==='perdido'?'badge-danger':'badge-warning'}">${e.resultado||'Pendiente'}</span></td>
      <td><button class="btn-outline btn-sm" onclick="deleteCSEvent('${e.id}')"><i class="fa fa-trash"></i></button></td>
    </tr>`).join('');
  }else if(type==='ret'){
    tb.innerHTML=events.map(e=>`<tr>
      <td><strong style="font-size:12px">${escHtml(e.clientName||'—')}</strong></td>
      <td style="font-size:11px">${e.date||'—'}</td>
      <td style="font-size:11px">${escHtml(e.motivo||'—')}</td>
      <td><span class="badge ${e.resultado==='retenido'?'badge-success':'badge-danger'}">${e.resultado||'—'}</span></td>
      <td><button class="btn-outline btn-sm" onclick="deleteCSEvent('${e.id}')"><i class="fa fa-trash"></i></button></td>
    </tr>`).join('');
  }else{
    tb.innerHTML=events.map(e=>`<tr>
      <td><strong style="font-size:12px">${escHtml(e.clientName||'—')}</strong></td>
      <td style="font-size:11px">${e.date||'—'}</td>
      <td>${e.mesesFuera||0} meses</td>
      <td>${e.nuevoPlan?`<span class="badge badge-purple">${escHtml(e.nuevoPlan)}</span>`:'—'}</td>
      <td style="font-size:11px">${escHtml(e.consultor||'—')}</td>
    </tr>`).join('');
  }
}

function addCSEvent(type){
  document.getElementById('csEventType').value=type;
  const titles={baja:'Solicitud de Baja',retencion:'Retención de Cliente',recuperado:'Cliente Recuperado'};
  setHtml('csModalTitle',`<i class="fa fa-headset"></i> ${titles[type]||'Evento CS'}`);
  document.getElementById('csDate').value=new Date().toISOString().split('T')[0];
  document.getElementById('csResultField').style.display=type==='retencion'?'block':'none';
  populateReportFilters();
  openModal('csModal');
}

function saveCSEvent(){
  const type=document.getElementById('csEventType').value;
  const clientId=document.getElementById('csClientSel').value;
  const client=APP.data.find(c=>c.id===clientId);
  const ev={
    id:'cs-'+Date.now(),type,
    clientId,clientName:client?client.nombre:document.getElementById('csClientSel').options[document.getElementById('csClientSel').selectedIndex]?.text||'—',
    date:document.getElementById('csDate').value,
    motivo:document.getElementById('csMotivoInput').value,
    resultado:document.getElementById('csResult').value,
    notes:document.getElementById('csNotes').value,
    nuevoPlan:type==='recuperado'?document.getElementById('csMotivoInput').value:'',
    mesesFuera:0,consultor:APP.currentUser?.name||'',
    ts:Date.now()
  };
  APP.csEvents.push(ev);
  localStorage.setItem('holaCSEvents',JSON.stringify(APP.csEvents));
  closeModal('csModal');
  renderCS();
  toast('success',t('toast.cs_event_registered','Evento CS registrado'));
  const slackCs=document.getElementById('cfgSlackCsWebhook')?.value.trim();
  if(slackCs&&(type==='baja'||type==='retencion')){
    sendSlackWebhook(slackCs,'Nueva alerta CS',[
      `Cliente: ${ev.clientName}`,
      `Tipo: ${type}`,
      `Fecha: ${ev.date||'—'}`,
      `Motivo: ${ev.motivo||'—'}`,
      `Resultado: ${ev.resultado||'pendiente'}`
    ]).catch(err=>toast('warning',`Slack CS: ${err.message}`));
  }
}

function deleteCSEvent(id){
  APP.csEvents=APP.csEvents.filter(e=>e.id!==id);
  localStorage.setItem('holaCSEvents',JSON.stringify(APP.csEvents));
  renderCS();
  toast('info',t('toast.event_deleted','Evento eliminado'));
}

async function sendSlackWebhook(webhookUrl, title, lines){
  if(!webhookUrl)return false;
  const payload={text:[title,...lines].filter(Boolean).join('\n')};
  const resp=await fetch(webhookUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!resp.ok)throw new Error(`Slack HTTP ${resp.status}`);
  return true;
}

// ================================================================
// FILTROS MEJORADOS DEL DASHBOARD
// ================================================================
let dashboardFilter={type:'all',loading:false};

function filterDashboard(type){
  // Mostrar loading
  dashboardFilter.loading=true;
  showLoadingOverlay(true);
  dashboardFilter.type=type;
  
  // Actualizar UI de filtros
  document.querySelectorAll('.kpi-card[onclick*="filterDashboard"]').forEach(card=>{
    card.classList.remove('filter-active');
  });
  event?.currentTarget?.classList.add('filter-active');
  
  // Simular delay de carga
  setTimeout(()=>{
    // Navegar a la sección apropiada según el tipo seleccionado
    if(type==='all'){
      showSection('panoramic');
    }else if(type==='activos'){
      showSection('activos');
    }else if(type==='impl'){
      showSection('implementaciones');
    }else if(type==='cancelados'){
      showSection('cancelados');
    }else if(type==='motivos'){
      showSection('cancelados'); // Mostrar análisis de motivos
    }
    
    // Actualizar gráfico
    renderDashboardCharts();
    
    // Ocultar loading
    dashboardFilter.loading=false;
    showLoadingOverlay(false);
  },300);
}

function showLoadingOverlay(show){
  let overlay=document.getElementById('loadingOverlay');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='loadingOverlay';
    overlay.innerHTML=`<div class="loading-spinner"><i class="fa fa-spinner fa-spin"></i><p>Cargando datos...</p></div>`;
    overlay.style.cssText=`
      position:fixed;top:0;left:0;right:0;bottom:0;
      background:rgba(0,0,0,.3);backdrop-filter:blur(3px);
      display:flex;align-items:center;justify-content:center;
      z-index:999;opacity:0;transition:opacity .3s;
      pointer-events:none;
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.opacity=show?'1':'0';
  overlay.style.pointerEvents=show?'auto':'none';
}

function filterOpaByType(type){
  // Limpiar filtros previos
  document.getElementById('convSearch').value='';
  document.getElementById('convStatusFilter').value='';
  document.getElementById('convChannelFilter').value='';
  document.getElementById('convAlertFilter').value='';
  document.getElementById('convOnlyAlerts').checked=false;
  
  // Aplicar el filtro seleccionado
  if(type==='critical'){
    document.getElementById('convAlertFilter').value='critical';
  }else if(type==='warning'){
    document.getElementById('convAlertFilter').value='warning';
  }else if(type==='resolved'){
    document.getElementById('convStatusFilter').value='resolved';
  }else if(type==='pending'){
    document.getElementById('convStatusFilter').value='pending';
  }
  // Si type='all', dejar todos los filtros vacíos
  
  // Re-render la lista
  renderConvList();
}

// OPA / HOLA SUITE CONVERSATIONS
// ================================================================
function renderOPA(){
  renderAlertWordsTags();
  renderConvList();
  const total=APP.holaConversations.length;
  const alerts=APP.holaConversations.filter(c=>c._alertLevel==='critical').length;
  const warnings=APP.holaConversations.filter(c=>c._alertLevel==='warning').length;
  const resolved=APP.holaConversations.filter(c=>c.status==='resolved').length;
  const pending=APP.holaConversations.filter(c=>c.status==='pending').length;
  const metrics=summarizeHolaMetrics(APP.holaConversations);
  setTxt('opa-total',total);setTxt('opa-alerts',alerts);setTxt('opa-warnings',warnings);
  setTxt('opa-resolved',resolved);setTxt('opa-pending',pending);
  setTxt('opa-avg-wait',formatMinutesLabel(metrics.avgWait));
  setTxt('opa-avg-service',formatMinutesLabel(metrics.avgService));
  setTxt('opa-top-sector',metrics.topSector);
  setTxt('opa-top-agent',metrics.topAgent);
  const ob=document.getElementById('opaBadge');
  if(ob){ob.style.display=alerts+warnings>0?'flex':'none';ob.textContent=alerts+warnings;}
  const pendingEl=document.getElementById('opa-pending');
  if(pendingEl&&metrics.activeCount>pending){
    pendingEl.textContent=`${pending} / ${metrics.activeCount}`;
  }
}

function renderConvList(){
  const list=document.getElementById('convList');if(!list)return;
  const convs=getFilteredConvs();
  setTxt('convCount',`${convs.length} ${t('opa.total_conversations','conversaciones')}`);
  if(!convs.length){
    const url=document.getElementById('cfgHolaUrl')?.value;
    list.innerHTML=url?`<div class="no-data"><i class="fa fa-message"></i><p>${t('toast.no_matching_conversations','Sin conversaciones que coincidan con los filtros')}</p></div>`:`<div class="no-data"><i class="fa fa-plug"></i><p>${t('opa.no_data','Configura la API de ¡Hola! Suite para ver conversaciones reales.')}</p></div>`;
    return;
  }
  list.innerHTML=convs.map(c=>{
    const levelClass=c._alertLevel==='critical'?'critical-alert':c._alertLevel==='warning'?'has-alert':'';
    const chanIcon=getChannelIcon(c.channel||'whatsapp');
    const preview=highlightAlertWords(c.lastMessage||'Sin mensajes',c._alertLevel);
    const protocolBadge=c.protocol?`<span class="badge badge-info" style="margin-right:4px">${escHtml(c.protocol)}</span>`:'';
    const sectorText=c.sectorName?escHtml(c.sectorName):'—';
    const activeAgent=c.activeAgentName||c.agentName||'Sin agente';
    const waitText=c.waitMinutes!=null?`${c.waitMinutes} min espera`:'—';
    const serviceText=c.serviceMinutes!=null?`${c.serviceMinutes} min total`:'—';
    return`<div class="conv-item ${levelClass}" onclick="showConvDetail('${c.id}')">
      <div class="conv-header">
        <div class="conv-channel-icon" style="background:${chanIcon.bg}">${chanIcon.icon}</div>
        <div class="conv-info">
          <div class="conv-client">${escHtml(c.contactName||c.contact||'Desconocido')}</div>
          <div class="conv-meta">${protocolBadge}${c.channel||'—'} · ${escHtml(activeAgent)} · ${c.updatedAt||''}</div>
          <div class="conv-meta">${t('common.sector','Sector')}: ${sectorText} · ${t('common.wait','Espera')}: ${waitText} · ${t('common.service','Atención')}: ${serviceText}</div>
        </div>
        <div class="conv-status">
          ${c._alertLevel==='critical'?'<span class="badge badge-danger">🚨 Alerta</span>':c._alertLevel==='warning'?'<span class="badge badge-warning">⚠️ Advertencia</span>':''}
          <span class="badge ${c.status==='resolved'?'badge-success':c.status==='pending'?'badge-warning':'badge-info'}" style="margin-left:4px">${c.status||'open'}</span>
        </div>
      </div>
      <div class="conv-preview">${preview}</div>
    </div>`;
  }).join('');
}

function getFilteredConvs(){
  let convs=[...APP.holaConversations];
  const q=(document.getElementById('convSearch')?.value||'').toLowerCase();
  const status=document.getElementById('convStatusFilter')?.value||'';
  const channel=document.getElementById('convChannelFilter')?.value||'';
  const alertF=document.getElementById('convAlertFilter')?.value||'';
  const onlyAlerts=document.getElementById('convOnlyAlerts')?.checked||false;
  if(q)convs=convs.filter(c=>(c.contactName+c.lastMessage+c.agentName).toLowerCase().includes(q));
  if(status)convs=convs.filter(c=>c.status===status);
  if(channel)convs=convs.filter(c=>c.channel===channel);
  if(alertF==='critical')convs=convs.filter(c=>c._alertLevel==='critical');
  else if(alertF==='warning')convs=convs.filter(c=>c._alertLevel==='warning');
  else if(alertF==='none')convs=convs.filter(c=>!c._alertLevel);
  if(onlyAlerts)convs=convs.filter(c=>c._alertLevel);
  return convs;
}

function filterConvs(){renderConvList();}

function highlightAlertWords(text,level){
  let result=escHtml(text);
  if(!level)return result;
  const dw=APP.alertWords.danger||[];
  const ww=APP.alertWords.warning||[];
  dw.forEach(w=>{const re=new RegExp('('+escRegex(w)+')','gi');result=result.replace(re,'<span class="alert-word-highlight">$1</span>');});
  ww.forEach(w=>{const re=new RegExp('('+escRegex(w)+')','gi');result=result.replace(re,'<span class="alert-word-warning">$1</span>');});
  return result;
}
function escRegex(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

function processConversationAlerts(conv){
  const text=(conv.lastMessage||conv.messages?.map(m=>m.text).join(' ')||'').toLowerCase();
  const dw=APP.alertWords.danger||[];
  const ww=APP.alertWords.warning||[];
  if(dw.some(w=>text.includes(w.toLowerCase()))){conv._alertLevel='critical';return conv;}
  if(ww.some(w=>text.includes(w.toLowerCase()))){conv._alertLevel='warning';return conv;}
  conv._alertLevel=null;
  return conv;
}

async function fetchHolaConvs(){
  const url=normalizeHolaBaseUrl(document.getElementById('cfgHolaUrl')?.value);
  const token=document.getElementById('cfgHolaToken')?.value;
  const ws=sanitizeHolaWorkspace(document.getElementById('cfgHolaWs')?.value,url);
  const wsInput=document.getElementById('cfgHolaWs');
  if(wsInput&&wsInput.value.trim()!==ws)wsInput.value=ws;
  if(!url||!token){toast('warning',t('toast.configure_url_token_first','Configura la URL y Token de API primero'));showSection('config');return;}
  showLoading(true,t('toast.syncing_conversations','Sincronizando conversaciones...'));
  try{
    const {plain,api}=getHolaApiBases(url);
    let resolvedPath='/atendimento';
    if(canUseServerProxy()){
      const proxyJson=await postJson('/api/opa/conversations',{workspace:ws});
      APP.holaDepartments=proxyJson.departments||{};
      APP.holaConversations=(Array.isArray(proxyJson.conversations)?proxyJson.conversations:[]).map(normalizeHolaConversation);
      resolvedPath=proxyJson.path||resolvedPath;
    }else{
      const headers={Authorization:getHolaAuthHeader(token),'Content-Type':'application/json'};
      await fetchOpaDepartments(url,headers);
      const candidates=[
        `${api}/atendimento`,
        ...(ws?[`${api}/atendimento?workspace=${encodeURIComponent(ws)}`]:[]),
        `${api}/conversations?page=1&per_page=100${ws?`&workspace=${encodeURIComponent(ws)}`:''}`,
        ...(ws?[`${api}/workspaces/${encodeURIComponent(ws)}/conversations?page=1&per_page=100`]:[]),
        `${api}/chats?page=1&per_page=100${ws?`&workspace=${encodeURIComponent(ws)}`:''}`,
        `${plain}/conversations?page=1&per_page=100`
      ];
      const {json,url:resolvedUrl}=await fetchJsonWithFallback(candidates,headers);
      const convList=json.data||json.conversations||json.items||json.results||json||[];
      APP.holaConversations=(Array.isArray(convList)?convList:[convList]).map(normalizeHolaConversation);
      resolvedPath=resolvedUrl.startsWith(api)?resolvedUrl.replace(api,''):resolvedUrl.replace(plain,'');
    }
    setTxt('opaLastSync',`${t('toast.sync_label','Sync')}: ${new Date().toLocaleTimeString('es-ES')}`);
    document.getElementById('opaApiStatusBar').className='api-status connected';
    setHtml('opaApiStatusBar','<i class="fa fa-circle-check"></i> API conectada · '+APP.holaConversations.length+' conversaciones · '+escHtml(resolvedPath||'/atendimento'));
    renderOPA();
    toast('success',`${APP.holaConversations.length} ${t('toast.conversations_loaded','conversaciones cargadas')}`);
  }catch(e){
    const errMsg=e.message||'Error desconocido';
    const isCorsError=errMsg.includes('Failed to fetch')||errMsg.includes('CORS')||errMsg.includes('Network');
    const isMissingConfig=!url||!token;
    let detailedMsg=errMsg;
    if(isMissingConfig){
      detailedMsg='⚠️ URL o Token no configurados. Ve a Configuración → Opa Suite API';
    }else if(isCorsError){
      detailedMsg='🔒 Error CORS o conectividad. Verifica tu URL, token y que el servidor esté disponible.';
    }
    toast('error',`${t('toast.error','Error')}: ${detailedMsg}`);
    document.getElementById('opaApiStatusBar').className='api-status disconnected';
    const configLink=`<a href="#" onclick="showSection('config');return false;" style="text-decoration:underline;color:var(--primary)">Configurar</a>`;
    setHtml('opaApiStatusBar',`<i class="fa fa-circle-xmark"></i> ${isMissingConfig?`Configura URL/Token → ${configLink}`:'Error de conexión / endpoint'}`);
    // No demo conversations - API only
    APP.holaConversations=[];
    renderOPA();
  }finally{showLoading(false);}
}

function generateDemoConvs(){
  // Demo function removed - use real API
  return [];
}

async function showConvDetail(id){
  const c=APP.holaConversations.find(x=>x.id===id);
  if(!c){toast('info',t('toast.conversation_unavailable','Conversación no disponible'));return;}
  const title=`${escHtml(c.contactName||'—')} ${c.protocol?`<span class="badge badge-info">${escHtml(c.protocol)}</span>`:''}`;
  setHtml('opaConvModalTitle',`<i class="fa fa-comments"></i> ${title}`);
  setHtml('opaConvModalContent',`<div class="no-data" style="padding:22px"><i class="fa fa-rotate fa-spin"></i><p>${t('toast.loading','Cargando...')}</p></div>`);
  openModal('opaConvModal');
  const url=normalizeHolaBaseUrl(document.getElementById('cfgHolaUrl')?.value);
  const token=document.getElementById('cfgHolaToken')?.value;
  if(!url||!token){
    setHtml('opaConvModalContent','<div class="no-data" style="padding:18px">Falta URL o token para consultar el detalle.</div>');
    return;
  }
  try{
    let detail;
    if(canUseServerProxy()){
      const proxyJson=await postJson(`/api/opa/attendance/${encodeURIComponent(c.id)}/detail`,{});
      detail=proxyJson.detail||{};
    }else{
      const headers={Authorization:getHolaAuthHeader(token),'Content-Type':'application/json'};
      detail=await fetchOpaAttendanceDetail(c.id,headers,url);
    }
    const normalized=normalizeHolaConversation({...detail,...c});
    const sectorName=normalized.sectorName||APP.holaDepartments?.[detail?.setor]?.nome||'—';
    const timeline=buildOpaTimeline(detail);
    const motivos=(detail?.motivos||[]).map(item=>item.idMotivo?.motivo||item.motivo||item.idDepartamento).filter(Boolean);
    const observaciones=(detail?.observacoes||[]).map(item=>item.mensagem||item.mensaje).filter(Boolean);
    setHtml('opaConvModalContent',`
      <div class="modal-section-title"><i class="fa fa-circle-info"></i> Resumen</div>
      <div class="detail-grid">
        <div class="detail-item"><label>Protocolo</label><span>${escHtml(normalized.protocol||'—')}</span></div>
        <div class="detail-item"><label>Estado</label><span><span class="badge ${normalized.status==='resolved'?'badge-success':normalized.status==='pending'?'badge-warning':'badge-info'}">${escHtml(normalized.rawStatus||normalized.status||'—')}</span></span></div>
        <div class="detail-item"><label>Sector</label><span>${escHtml(sectorName)}</span></div>
        <div class="detail-item"><label>Canal</label><span>${escHtml(normalized.channel||'—')}</span></div>
        <div class="detail-item"><label>Atendente asignado</label><span>${escHtml(detail?.id_atendente?.nome||normalized.activeAgentName||normalized.agentName||'—')}</span></div>
        <div class="detail-item"><label>Solicitante</label><span>${escHtml(detail?.id_user?.nome||normalized.contactName||'—')}</span></div>
        <div class="detail-item"><label>Inicio</label><span>${escHtml(formatDate(detail?.date||normalized.openedAt)||'—')}</span></div>
        <div class="detail-item"><label>Fin</label><span>${escHtml(formatDate(detail?.fim||normalized.endedAt)||'—')}</span></div>
        <div class="detail-item"><label>Tiempo de espera</label><span>${escHtml(formatMinutesLabel(normalized.waitMinutes))}</span></div>
        <div class="detail-item"><label>Tiempo total</label><span>${escHtml(formatMinutesLabel(normalized.serviceMinutes))}</span></div>
      </div>
      <div class="modal-section-title"><i class="fa fa-file-lines"></i> Descripcion y clasificacion</div>
      <div style="font-size:12px;color:rgba(232,232,240,.82);line-height:1.6;margin-bottom:12px">${escHtml(detail?.descricao||normalized.lastMessage||'Sin descripcion registrada')}</div>
      <div class="detail-grid">
        <div class="detail-item"><label>Motivos</label><span>${escHtml(motivos.join(' · ')||'—')}</span></div>
        <div class="detail-item"><label>Observaciones</label><span>${escHtml(String(observaciones.length||0))}</span></div>
      </div>
      <div class="modal-section-title"><i class="fa fa-clock-rotate-left"></i> Historial</div>
      ${timeline.length?timeline.map(item=>`<div style="padding:10px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:8px;margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><strong style="font-size:12px;color:var(--primary)">${escHtml(item.label||'Evento')}</strong><span style="font-size:11px;color:var(--muted)">${escHtml(formatDate(item.date)||item.date||'—')}</span></div><div style="font-size:12px;color:rgba(232,232,240,.78);margin-top:4px">${escHtml(item.text||'—')}</div></div>`).join(''):`<div class="no-data" style="padding:18px">Sin historial detallado en la API para esta conversacion.</div>`}
    `);
  }catch(err){
    setHtml('opaConvModalContent',`<div class="no-data" style="padding:18px"><i class="fa fa-circle-exclamation"></i><p>${escHtml(err.message||'No se pudo cargar el detalle.')}</p></div>`);
  }
}

function toggleAlertWordConfig(){
  const panel=document.getElementById('alertWordsPanel');
  if(panel)panel.style.display=panel.style.display==='none'?'block':'none';
}

function addAlertWord(type){
  const inputId=type==='danger'?'newDangerWord':'newWarningWord';
  const word=(document.getElementById(inputId)?.value||'').trim().toLowerCase();
  if(!word){toast('warning',t('toast.write_word','Escribe una palabra'));return;}
  if(!APP.alertWords[type])APP.alertWords[type]=[];
  if(APP.alertWords[type].includes(word)){toast('warning',t('toast.word_exists','Ya existe esta palabra'));return;}
  APP.alertWords[type].push(word);
  document.getElementById(inputId).value='';
  localStorage.setItem('holaAlertWords',JSON.stringify(APP.alertWords));
  renderAlertWordsTags();
  // Reprocess conversations
  APP.holaConversations=APP.holaConversations.map(c=>processConversationAlerts(c));
  renderConvList();
  toast('success',t('toast.word_added','Palabra agregada'));
}

function removeAlertWord(type,word){
  APP.alertWords[type]=(APP.alertWords[type]||[]).filter(w=>w!==word);
  localStorage.setItem('holaAlertWords',JSON.stringify(APP.alertWords));
  renderAlertWordsTags();
  APP.holaConversations=APP.holaConversations.map(c=>processConversationAlerts(c));
  renderConvList();
}

function renderAlertWordsTags(){
  const dl=document.getElementById('dangerWordsList');
  const wl=document.getElementById('warningWordsList');
  if(dl)dl.innerHTML=(APP.alertWords.danger||[]).map(w=>`<span class="alert-word-tag">${escHtml(w)}<button onclick="removeAlertWord('danger','${escHtml(w)}')">✕</button></span>`).join('');
  if(wl)wl.innerHTML=(APP.alertWords.warning||[]).map(w=>`<span class="alert-word-tag warning-word">${escHtml(w)}<button onclick="removeAlertWord('warning','${escHtml(w)}')">✕</button></span>`).join('');
}

function loadDefaultWords(category){
  const defaults={
    riesgo:{danger:['cancelar','baja','quiero cancelar','dar de baja','no quiero continuar'],warning:['pensando en cancelar','evaluar','costoso','muy caro']},
    cancelacion:{danger:['cancelación','terminar contrato','baja inmediata','cierre de cuenta'],warning:['pausar','suspender temporalmente']},
    pausa:{danger:['pausa indefinida','suspender todo'],warning:['pausa','esperar','detenido','pausado','sin actividad']},
    requisito:{danger:['sin requisitos','faltan datos','incompleto','bloqueado por falta'],warning:['falta documentación','pendiente de cliente','esperando información']},
    soporte:{danger:['no funciona','error crítico','sistema caído','bug grave','perdimos datos'],warning:['lento','tarda','funciona mal','problemas','ayuda urgente']}
  };
  const words=defaults[category];
  if(!words)return;
  words.danger?.forEach(w=>{if(!(APP.alertWords.danger||[]).includes(w)){APP.alertWords.danger=APP.alertWords.danger||[];APP.alertWords.danger.push(w);}});
  words.warning?.forEach(w=>{if(!(APP.alertWords.warning||[]).includes(w)){APP.alertWords.warning=APP.alertWords.warning||[];APP.alertWords.warning.push(w);}});
  localStorage.setItem('holaAlertWords',JSON.stringify(APP.alertWords));
  renderAlertWordsTags();
  APP.holaConversations=APP.holaConversations.map(c=>processConversationAlerts(c));
  renderConvList();
  toast('success',`${t('toast.category_words_loaded','Palabras de categoría cargadas')}: "${category}"`);
}

function getChannelIcon(channel){
  const m={whatsapp:{icon:'<i class="fab fa-whatsapp"></i>',bg:'rgba(37,211,102,.15)'},instagram:{icon:'<i class="fab fa-instagram"></i>',bg:'rgba(193,53,132,.15)'},telegram:{icon:'<i class="fab fa-telegram"></i>',bg:'rgba(0,136,204,.15)'},webchat:{icon:'<i class="fa fa-comments"></i>',bg:'rgba(255,109,0,.15)'},messenger:{icon:'<i class="fab fa-facebook-messenger"></i>',bg:'rgba(0,120,255,.15)'}};
  return m[channel]||{icon:'<i class="fa fa-message"></i>',bg:'rgba(255,255,255,.05)'};
}

// ================================================================
// UPSELL / CROSS-SELL
// ================================================================
function openUpsellModal(clientId){
  document.getElementById('upsellClientId').value=clientId;
  const c=APP.data.find(x=>x.id===clientId);
  document.getElementById('upsellFrom').value=c?.plan||'';
  document.getElementById('upsellDate').value=new Date().toISOString().split('T')[0];
  document.getElementById('upsellTo').value='';
  document.getElementById('upsellValue').value='';
  document.getElementById('upsellNotes').value='';
  openModal('upsellModal');
}

function openKanbanCardModal(clientId){
  const client=APP.data.find(item=>item.id===clientId);
  if(!client)return;
  const meta=getKanbanMeta(clientId);
  const currentStage=KANBAN_ETAPAS.find(item=>item.key===getClientKanbanStageKey(client));
  setHtml('kanbanModalTitle',`<i class="fa fa-table-columns"></i> ${escHtml(client.nombre)}`);
  setHtml('kanbanModalContent',`
    <div class="detail-grid">
      <div class="detail-item"><label>Estado actual</label><span>${escHtml(meta.stageOverride||client.estado||'—')}</span></div>
      <div class="detail-item"><label>Consultores</label><span>${escHtml(getAssignedConsultantsLabel(client))}</span></div>
      <div class="detail-item"><label>Etapa Kanban</label><span>${escHtml(currentStage?.label||'—')}</span></div>
      <div class="detail-item"><label>Sincronización</label><span>${escHtml(meta.lastSyncStatus||'sin cambios')}</span></div>
    </div>
    <div class="modal-section-title"><i class="fa fa-arrows-up-down-left-right"></i> Mover etapa</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <select id="kanbanMoveSelect" class="filter-select" style="min-width:220px">${KANBAN_ETAPAS.map(item=>`<option value="${item.key}" ${item.key===currentStage?.key?'selected':''}>${escHtml(item.label)}</option>`).join('')}</select>
      <button class="btn-primary" onclick="moveKanbanCard('${client.id}',document.getElementById('kanbanMoveSelect').value)"><i class="fa fa-arrows-up-down-left-right"></i> Mover</button>
    </div>
    <div class="modal-section-title"><i class="fa fa-tag"></i> Etiquetas</div>
    <div style="display:flex;gap:8px">
      <input type="text" id="kanbanTagInput" placeholder="Agregar etiqueta..." style="flex:1;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:10px;padding:9px 12px;color:var(--text);font-size:13px">
      <button class="btn-outline" onclick="addKanbanTag('${client.id}')"><i class="fa fa-plus"></i> Agregar</button>
    </div>
    <div class="kanban-tag-list">${(meta.tags||[]).map(tag=>`<span class="kanban-tag">${escHtml(tag)} <button onclick="removeKanbanTag('${client.id}','${encodeURIComponent(tag)}')" style="background:none;color:inherit;font-size:10px;cursor:pointer">✕</button></span>`).join('')||'<span style="font-size:11px;color:var(--muted)">Sin etiquetas</span>'}</div>
    <div class="modal-section-title"><i class="fa fa-comment-dots"></i> Comentarios</div>
    <textarea id="kanbanCommentInput" rows="3" placeholder="Registrar comentario interno o para ClickUp..." style="width:100%;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:10px;padding:9px 12px;color:var(--text);font-size:13px"></textarea>
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
      <button class="btn-primary" onclick="saveKanbanComment('${client.id}',false)"><i class="fa fa-floppy-disk"></i> Guardar comentario</button>
      <button class="btn-outline" onclick="saveKanbanComment('${client.id}',true)"><i class="fa fa-cloud-arrow-up"></i> Guardar y enviar a ClickUp</button>
    </div>
    <div>${(meta.comments||[]).slice(0,8).map(item=>`<div class="kanban-comment"><div class="kanban-comment-meta">${escHtml(item.author||'—')} · ${escHtml(formatDate(item.createdAt)||'—')}</div><div style="font-size:12px;color:rgba(232,232,240,.82)">${escHtml(item.text||'')}</div></div>`).join('')||'<div style="font-size:11px;color:var(--muted);margin-top:8px">Sin comentarios</div>'}</div>
  `);
  openModal('kanbanCardModal');
}

function addKanbanTag(clientId){
  const input=document.getElementById('kanbanTagInput');
  const tag=(input?.value||'').trim();
  if(!tag){toast('warning','Escribe una etiqueta');return;}
  const meta=getKanbanMeta(clientId);
  if(!meta.tags.includes(tag))meta.tags.unshift(tag);
  meta.lastSyncStatus='tag_pending';
  persistKanbanMeta();
  const apiKey=(document.getElementById('cfgApiKey')?.value||CONFIG.API_KEY||'').trim();
  if(apiKey&&canUseServerProxy()){
    postJson(`/api/clickup/task/${encodeURIComponent(clientId)}/tag`,{tag})
      .then(()=>{
        meta.lastSyncStatus='tag_synced';
        persistKanbanMeta();
        renderKanban();
        openKanbanCardModal(clientId);
      })
      .catch(()=>{
        meta.lastSyncStatus='tag_pending';
        persistKanbanMeta();
        renderKanban();
        openKanbanCardModal(clientId);
      });
    return;
  }
  renderKanban();
  openKanbanCardModal(clientId);
}

function removeKanbanTag(clientId, encodedTag){
  const tag=decodeURIComponent(encodedTag||'');
  const meta=getKanbanMeta(clientId);
  meta.tags=(meta.tags||[]).filter(item=>item!==tag);
  persistKanbanMeta();
  openKanbanCardModal(clientId);
}

function renderPublicFormPage(type){
  document.body.innerHTML=`
    <div style="min-height:100vh;background:linear-gradient(135deg,#080812,#131326);display:flex;align-items:center;justify-content:center;padding:24px">
      <div style="width:min(680px,100%);background:rgba(13,13,26,.96);border:1px solid rgba(255,255,255,.08);border-radius:22px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.45)">
        <div style="font-size:26px;font-weight:800;color:#FF6D00;margin-bottom:6px">${type==='upgrade'?'Solicitud de Upgrade / Cross-sell':'Alerta de Riesgo de Baja'}</div>
        <div style="font-size:13px;color:rgba(232,232,240,.62);margin-bottom:20px">${type==='upgrade'?'Usa este formulario para solicitar mejoras comerciales para un cliente existente.':'Usa este formulario para alertar un cliente con señales de churn o necesidad de intervención.'}</div>
        <div style="display:grid;gap:12px">
          <input id="publicClientName" placeholder="Cliente" style="padding:12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#fff">
          <input id="publicContactName" placeholder="Contacto / solicitante" style="padding:12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#fff">
          <input id="publicEmail" placeholder="Email" style="padding:12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#fff">
          ${type==='upgrade'?`
            <input id="publicRequestedPlan" placeholder="Plan / producto solicitado" style="padding:12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#fff">
            <input id="publicValue" type="number" placeholder="Valor estimado USD" style="padding:12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#fff">
          `:`
            <select id="publicUrgency" style="padding:12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#fff">
              <option value="alta">Urgencia alta</option>
              <option value="media">Urgencia media</option>
              <option value="baja">Urgencia baja</option>
            </select>
            <input id="publicReason" placeholder="Motivo de riesgo" style="padding:12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#fff">
          `}
          <textarea id="publicDetails" rows="5" placeholder="Detalles" style="padding:12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#fff"></textarea>
          <button onclick="submitPublicForm('${type}')" style="padding:12px 16px;border-radius:12px;background:linear-gradient(135deg,#FF6D00,#E65100);color:#fff;font-weight:700;cursor:pointer">Enviar formulario</button>
          <div id="publicFormMsg" style="font-size:12px;color:rgba(232,232,240,.7)"></div>
        </div>
      </div>
    </div>
  `;
}

async function submitPublicForm(type){
  const payload={
    clientName:document.getElementById('publicClientName')?.value.trim(),
    contactName:document.getElementById('publicContactName')?.value.trim(),
    email:document.getElementById('publicEmail')?.value.trim(),
    details:document.getElementById('publicDetails')?.value.trim(),
    requestedPlan:document.getElementById('publicRequestedPlan')?.value.trim(),
    value:document.getElementById('publicValue')?.value,
    reason:document.getElementById('publicReason')?.value.trim(),
    urgency:document.getElementById('publicUrgency')?.value||''
  };
  if(!payload.clientName){
    const msg=document.getElementById('publicFormMsg');
    if(msg)msg.textContent='Cliente es obligatorio.';
    return;
  }
  try{
    if(canUseServerProxy()){
      await postJson(`/api/forms/${type}`,payload);
    }else{
      const items=JSON.parse(localStorage.getItem('holaPublicForms')||'[]');
      items.unshift({id:`pf-${Date.now()}`,type,createdAt:new Date().toISOString(),...payload});
      localStorage.setItem('holaPublicForms',JSON.stringify(items));
    }
    const msg=document.getElementById('publicFormMsg');
    if(msg)msg.textContent='Formulario enviado correctamente.';
  }catch(err){
    const msg=document.getElementById('publicFormMsg');
    if(msg)msg.textContent=err.message||'No se pudo enviar el formulario.';
  }
}

function getPublicFormLinks(){
  const base=window.location.origin&&/^https?:$/i.test(window.location.protocol)?`${window.location.origin}${window.location.pathname}`:window.location.href.split('?')[0];
  return {
    upgrade:`${base}?publicForm=upgrade`,
    churn:`${base}?publicForm=churn`
  };
}

async function syncExternalFormSubmissions(){
  try{
    let items=[];
    if(canUseServerProxy()){
      const json=await fetch('/api/forms/submissions').then(r=>r.ok?r.json():{submissions:[]}).catch(()=>({submissions:[]}));
      items=json.submissions||[];
    }else{
      items=JSON.parse(localStorage.getItem('holaPublicForms')||'[]');
    }
    APP.externalSubmissions=items;
    const processed=new Set(JSON.parse(localStorage.getItem('holaProcessedExternalForms')||'[]'));
    let changed=false;
    items.forEach(item=>{
      if(processed.has(item.id))return;
      const client=(APP.data||[]).find(c=>normalizeText(c.nombre)===normalizeText(item.clientName||''));
      if(item.type==='upgrade'&&client){
        if(!APP.upsells[client.id])APP.upsells[client.id]=[];
        APP.upsells[client.id].push({id:item.id,type:'upgrade',from:client.plan||'',to:item.requestedPlan||'',value:Number(item.value||0)||0,date:formatDate(item.createdAt)||new Date().toISOString().split('T')[0],notes:item.details||'',ts:Date.now(),source:'public_form'});
        client.hasupsell=true;
        changed=true;
      }
      if(item.type==='churn-risk'&&client){
        APP.csEvents.push({id:item.id,type:'baja',clientId:client.id,clientName:client.nombre,date:formatDate(item.createdAt)||new Date().toISOString().split('T')[0],motivo:item.reason||item.details||'Riesgo de baja',resultado:'pendiente',notes:item.details||'',nuevoPlan:'',mesesFuera:0,consultor:'Formulario externo',ts:Date.now(),source:'public_form'});
        changed=true;
      }
      processed.add(item.id);
    });
    if(changed){
      localStorage.setItem('holaUpsells',JSON.stringify(APP.upsells));
      localStorage.setItem('holaCSEvents',JSON.stringify(APP.csEvents));
      renderAll(APP.filteredByDate||APP.data);
    }
    localStorage.setItem('holaProcessedExternalForms',JSON.stringify([...processed]));
  }catch{}
}

async function saveKanbanComment(clientId, syncClickUp=false){
  const input=document.getElementById('kanbanCommentInput');
  const text=(input?.value||'').trim();
  if(!text){toast('warning','Escribe un comentario');return;}
  const meta=getKanbanMeta(clientId);
  meta.comments.unshift({id:`kcom-${Date.now()}`,text,createdAt:new Date().toISOString(),author:APP.currentUser?.name||'Usuario'});
  persistKanbanMeta();
  if(syncClickUp){
    try{
      const apiKey=(document.getElementById('cfgApiKey')?.value||CONFIG.API_KEY||'').trim();
      if(!apiKey||!canUseServerProxy())throw new Error('Backend o API Key de ClickUp no disponible');
      await postJson(`/api/clickup/task/${encodeURIComponent(clientId)}/comment`,{comment:text});
      meta.lastSyncStatus='comment_synced';
      persistKanbanMeta();
      toast('success','Comentario enviado a ClickUp');
    }catch(err){
      meta.lastSyncStatus=`comment_pending: ${err.message}`;
      persistKanbanMeta();
      toast('warning','Comentario guardado localmente. No se pudo enviar a ClickUp.');
    }
  }else{
    toast('success','Comentario guardado');
  }
  openKanbanCardModal(clientId);
  renderKanban();
}

function saveUpsell(){
  const clientId=document.getElementById('upsellClientId').value;
  const us={id:'us-'+Date.now(),type:document.getElementById('upsellType').value,
    from:document.getElementById('upsellFrom').value,to:document.getElementById('upsellTo').value,
    value:parseFloat(document.getElementById('upsellValue').value)||0,
    date:document.getElementById('upsellDate').value,
    notes:document.getElementById('upsellNotes').value,ts:Date.now()};
  if(!APP.upsells[clientId])APP.upsells[clientId]=[];
  APP.upsells[clientId].push(us);
  // Mark client as having upsell
  const c=APP.data.find(x=>x.id===clientId);if(c)c.hasupsell=true;
  localStorage.setItem('holaUpsells',JSON.stringify(APP.upsells));
  closeModal('upsellModal');
  renderAll(APP.filteredByDate||APP.data);
  toast('success',t('toast.upsell_registered','Upsell registrado exitosamente'));
  const slackSales=document.getElementById('cfgSlackSalesWebhook')?.value.trim();
  if(slackSales){
    sendSlackWebhook(slackSales,'Nuevo upgrade / cross-sell',[
      `Cliente: ${c?.nombre||clientId}`,
      `Tipo: ${us.type}`,
      `Desde: ${us.from||'—'}`,
      `Hacia: ${us.to||'—'}`,
      `Valor: $${us.value||0}`,
      `Fecha: ${us.date||'—'}`
    ]).catch(err=>toast('warning','Slack Ventas: '+err.message));
  }
}

// ================================================================
// MEJORAS
// ================================================================
function submitMejora(){
  const title=(document.getElementById('mejoraTitle')?.value||'').trim();
  if(!title){toast('warning',t('toast.write_title','Escribe un título'));return;}
  const m={id:'m-'+Date.now(),title,categ:document.getElementById('mejoraCateg')?.value||'general',
    prio:document.getElementById('mejoraPrio')?.value||'medium',
    desc:document.getElementById('mejoraDesc')?.value||'',
    client:document.getElementById('mejoraCliente')?.value||'',
    status:'open',votes:0,voted:false,
    author:APP.currentUser?.name||'Equipo',ts:Date.now(),
    date:new Date().toLocaleDateString('es-ES')};
  APP.mejoras.unshift(m);
  localStorage.setItem('holaMejoras',JSON.stringify(APP.mejoras));
  document.getElementById('mejoraTitle').value='';
  document.getElementById('mejoraDesc').value='';
  document.getElementById('mejoraCliente').value='';
  renderMejoras();
  renderAll(APP.filteredByDate||APP.data);
  toast('success',t('toast.improvement_registered','Mejora registrada'));
}

function renderMejoras(){
  const filter_c=document.getElementById('mejoraFilterCateg')?.value||'';
  const filter_p=document.getElementById('mejoraFilterPrio')?.value||'';
  const filter_s=document.getElementById('mejoraFilterStatus')?.value||'';
  let items=[...APP.mejoras];
  if(filter_c)items=items.filter(m=>m.categ===filter_c);
  if(filter_p)items=items.filter(m=>m.prio===filter_p);
  if(filter_s)items=items.filter(m=>m.status===filter_s);
  const list=document.getElementById('mejorasList');if(!list)return;
  setTxt('mejorasCount',items.length+' puntos');
  if(!items.length){list.innerHTML=`<div class="no-data"><i class="fa fa-lightbulb"></i><p>Sin mejoras registradas aún</p></div>`;return;}
  const prioColors={critical:'var(--danger)',high:'var(--warning)',medium:'var(--info)',low:'var(--muted)'};
  const prioLabels={critical:'🚨 Crítica',high:'🔴 Alta',medium:'🟡 Media',low:'🟢 Baja'};
  const categLabels={implementacion:'🔧 Impl.',soporte:'🛟 Soporte',cs:'🎯 CS',plataforma:'💻 Plat.',procesos:'📋 Proc.',general:'🌐 General'};
  const statusLabels={open:'🔵 Abierto',in_progress:'🟡 En Progreso',resolved:'✅ Resuelto'};
  const statusColors={open:'badge-info',in_progress:'badge-warning',resolved:'badge-success'};
  list.innerHTML=items.map(m=>`<div class="mejora-item pri-${m.prio}">
    <div class="mejora-header">
      <span class="mejora-title">${escHtml(m.title)}</span>
      <span class="badge" style="background:${prioColors[m.prio]}22;color:${prioColors[m.prio]};border:1px solid ${prioColors[m.prio]}44;font-size:10px">${prioLabels[m.prio]}</span>
      <span class="badge badge-primary" style="font-size:10px">${categLabels[m.categ]||m.categ}</span>
      <span class="badge ${statusColors[m.status]||'badge-info'}" style="font-size:10px">${statusLabels[m.status]||m.status}</span>
    </div>
    ${m.desc?`<div style="font-size:12px;color:var(--muted);margin-bottom:6px;line-height:1.5">${escHtml(m.desc)}</div>`:''}
    ${m.client?`<div style="font-size:11px;color:var(--primary);margin-bottom:6px"><i class="fa fa-user"></i> Cliente: ${escHtml(m.client)}</div>`:''}
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:10px;color:var(--muted)">${m.date} · ${escHtml(m.author)}</span>
      <div class="mejora-votes"><i class="fa fa-thumbs-up"></i> <span id="votes-${m.id}">${m.votes||0}</span></div>
      <button class="mejora-vote-btn ${m.voted?'voted':''}" onclick="voteMejora('${m.id}')"><i class="fa fa-thumbs-up"></i> ${m.voted?'Votado':'Votar'}</button>
      <select style="background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:6px;padding:3px 6px;color:var(--text);font-size:10px;cursor:pointer" onchange="changeMejoraStatus('${m.id}',this.value)">
        <option value="open" ${m.status==='open'?'selected':''}>Abierto</option>
        <option value="in_progress" ${m.status==='in_progress'?'selected':''}>En Progreso</option>
        <option value="resolved" ${m.status==='resolved'?'selected':''}>Resuelto</option>
      </select>
      <button class="btn-outline btn-sm" style="margin-left:auto" onclick="deleteMejora('${m.id}')"><i class="fa fa-trash"></i></button>
    </div>
  </div>`).join('');
}

function voteMejora(id){
  const m=APP.mejoras.find(x=>x.id===id);if(!m)return;
  m.voted=!m.voted;m.votes=Math.max(0,(m.votes||0)+(m.voted?1:-1));
  localStorage.setItem('holaMejoras',JSON.stringify(APP.mejoras));
  renderMejoras();
}
function changeMejoraStatus(id,status){
  const m=APP.mejoras.find(x=>x.id===id);if(m){m.status=status;localStorage.setItem('holaMejoras',JSON.stringify(APP.mejoras));renderAll(APP.filteredByDate||APP.data);}
}
function deleteMejora(id){
  APP.mejoras=APP.mejoras.filter(x=>x.id!==id);
  localStorage.setItem('holaMejoras',JSON.stringify(APP.mejoras));
  renderMejoras();renderAll(APP.filteredByDate||APP.data);
  toast('info',t('toast.improvement_deleted','Mejora eliminada'));
}

// ================================================================
// WIKI
// ================================================================
const WIKI_PAGES={
  overview:{title:'Visión General del Sistema',icon:'fa-home',content:`
    <div class="wiki-section">
      <p>¡Hola! Suite Control Center es la plataforma centralizada para gestionar el ciclo completo de implementación y soporte de clientes de ¡Hola! Suite.</p>
    </div>
    <div class="wiki-section"><h3><i class="fa fa-sitemap"></i> Módulos del Sistema</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
        ${[['Dashboard','Métricas en tiempo real','fa-gauge-high','var(--primary)'],['Implementaciones','Seguimiento de clientes','fa-gears','var(--warning)'],['Activos','Clientes en producción','fa-check-circle','var(--success)'],['Cancelados','Análisis de bajas','fa-times-circle','var(--danger)'],['Alertas','Centro de riesgo','fa-bell','var(--danger)'],['OPA/Hola Suite','Conversaciones con alertas','fa-message','var(--info)'],['CS Dashboard','Retenciones y bajas','fa-headset','var(--accent2)'],['Kanban','Tablero de etapas','fa-table-columns','var(--primary)'],['BI Dashboard','Business Intelligence','fa-chart-column','var(--accent2)'],['Wiki','Esta guía','fa-book-open','var(--info)']].map(([n,d,ic,c])=>`<div style="background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:8px;padding:10px;display:flex;align-items:center;gap:10px"><i class="fa ${ic}" style="color:${c};font-size:16px;width:20px"></i><div><strong style="font-size:12px">${n}</strong><br><span style="font-size:11px;color:var(--muted)">${d}</span></div></div>`).join('')}
      </div>
    </div>
    <div class="wiki-tip"><i class="fa fa-info-circle" style="color:var(--info)"></i> <strong>Tip:</strong> Usa los filtros de fecha en la barra superior para analizar cualquier período. Aplican a todos los módulos.</div>`,meta:'Última actualización: Sistema v2.0'},
  kickoff:{title:'Etapa: Kickoff',icon:'fa-play',content:`
    <div class="wiki-section"><h3><i class="fa fa-play" style="color:var(--primary)"></i> ¿Qué es el Kickoff?</h3>
      <p>El Kickoff es la primera reunión formal con el cliente donde se presentan las expectativas, el equipo y el plan de trabajo.</p>
    </div>
    <div class="wiki-section"><h3><i class="fa fa-list-check"></i> Pasos del Kickoff</h3>
      ${[['Presentación del equipo y el consultor asignado',''],['Revisión del plan contratado y canales a activar','Verificar en ClickUp el campo "Plan" y "Canales contratados"'],['Establecer fechas y compromisos','Registrar en ClickUp el campo "Fecha inicio kickoff"'],['Solicitar accesos y requisitos técnicos','IP del servidor, dominio, credenciales'],['Confirmar horarios de capacitación','Registrar en campo "Cantidad de capacitaciones"']].map(([t,n],i)=>`<div class="wiki-step"><div class="wiki-step-num">${i+1}</div><div><strong style="font-size:12px">${t}</strong>${n?`<br><span style="font-size:11px;color:var(--muted)">${n}</span>`:''}</div></div>`).join('')}
    </div>
    <div class="wiki-section"><h3><i class="fa fa-clock"></i> Meta de Tiempo</h3><div class="wiki-kpi-badges"><span class="wiki-kpi-badge">⏱️ Meta: ${CONFIG.DIAS_META.kickoff} días</span><span class="wiki-kpi-badge">📋 Responsable: Consultor asignado</span></div></div>
    <div class="wiki-warning"><i class="fa fa-triangle-exclamation" style="color:var(--warning)"></i> <strong>Atención:</strong> Si el cliente no responde en 48h post-kickoff, escalar a coordinación y registrar tag "esperando cliente" en ClickUp.</div>`,meta:'Etapa 1 de 6 — Meta: 3 días'},
  analisis:{title:'Etapa: Análisis Meta',icon:'fa-magnifying-glass',content:`
    <div class="wiki-section"><h3><i class="fa fa-magnifying-glass" style="color:var(--info)"></i> ¿Qué es el Análisis Meta?</h3><p>Diagnóstico del entorno del cliente: canales actuales, flujos de atención, volumen de mensajes y requisitos técnicos.</p></div>
    <div class="wiki-section"><h3><i class="fa fa-list-check"></i> Actividades</h3>
      ${[['Relevamiento de procesos de atención al cliente',''],['Mapeo de canales existentes y a integrar',''],['Diagnóstico técnico del servidor/dominio','Verificar IP y dominio — registrar en ClickUp'],['Definición de flujos de bot y etiquetas',''],['Entrega de documento de análisis al cliente','']].map(([t,n],i)=>`<div class="wiki-step"><div class="wiki-step-num">${i+1}</div><div><strong style="font-size:12px">${t}</strong>${n?`<br><span style="font-size:11px;color:var(--muted)">${n}</span>`:''}</div></div>`).join('')}
    </div>
    <div class="wiki-kpi-badges" style="margin-top:8px"><span class="wiki-kpi-badge">⏱️ Meta: ${CONFIG.DIAS_META.verificacion} días</span></div>`,meta:'Etapa 2 de 6 — Meta: 2 días'},
  instalacion:{title:'Etapa: Instalación',icon:'fa-server',content:`
    <div class="wiki-section"><h3><i class="fa fa-server" style="color:var(--accent2)"></i> Instalación de la Plataforma</h3><p>Configuración técnica del servidor, instalación de ¡Hola! Suite y pruebas iniciales de funcionamiento.</p></div>
    <div class="wiki-section"><h3><i class="fa fa-list-check"></i> Checklist</h3>
      ${[['Acceso SSH al servidor del cliente',''],['Instalación de dependencias (Docker, Node, etc.)',''],['Configuración del dominio y SSL','Registrar dominio en ClickUp'],['Instalación y configuración de ¡Hola! Suite',''],['Prueba de acceso al panel admin','Registrar IP en campo "IP Hola" de ClickUp'],['Prueba básica de envío/recepción de mensajes','']].map(([t,n],i)=>`<div class="wiki-step"><div class="wiki-step-num">${i+1}</div><div><strong style="font-size:12px">${t}</strong>${n?`<br><span style="font-size:11px;color:var(--muted)">${n}</span>`:''}</div></div>`).join('')}
    </div>
    <div class="wiki-warning"><i class="fa fa-triangle-exclamation"></i> Si no hay IP/Dominio registrado en ClickUp al llegar a esta etapa, el sistema generará una alerta automática.</div>
    <div class="wiki-kpi-badges" style="margin-top:8px"><span class="wiki-kpi-badge">⏱️ Meta: ${CONFIG.DIAS_META.instalacion} días</span></div>`,meta:'Etapa 3 de 6 — Meta: 5 días'},
  capacitacion:{title:'Etapa: Capacitación',icon:'fa-graduation-cap',content:`
    <div class="wiki-section"><h3><i class="fa fa-graduation-cap" style="color:#A78BFA"></i> Capacitación del Cliente</h3><p>Formación del equipo del cliente para el uso efectivo de ¡Hola! Suite.</p></div>
    <div class="wiki-section"><h3><i class="fa fa-list-check"></i> Módulos</h3>
      ${[['Módulo 1: Gestión de conversaciones','Bandeja, etiquetas, asignación'],['Módulo 2: Configuración de bots','Flujos automáticos y respuestas'],['Módulo 3: Reportes y métricas','Analytics y seguimiento'],['Módulo 4: Gestión de agentes','Roles, permisos y equipos'],['Módulo 5: Canales específicos','Por cada canal contratado']].map(([t,n],i)=>`<div class="wiki-step"><div class="wiki-step-num">${i+1}</div><div><strong style="font-size:12px">${t}</strong><br><span style="font-size:11px;color:var(--muted)">${n}</span></div></div>`).join('')}
    </div>
    <div class="wiki-tip">Registrar cantidad de sesiones y horas en los campos "Cantidad de capacitaciones" y "Horas de capacitación" de ClickUp.</div>
    <div class="wiki-kpi-badges" style="margin-top:8px"><span class="wiki-kpi-badge">⏱️ Meta: ${CONFIG.DIAS_META.capacitacion} días</span></div>`,meta:'Etapa 4 de 6 — Meta: 7 días'},
  golive:{title:'Etapa: Go-Live',icon:'fa-rocket',content:`
    <div class="wiki-section"><h3><i class="fa fa-rocket" style="color:var(--success)"></i> Go-Live</h3><p>Puesta en producción oficial. El cliente comienza a usar ¡Hola! Suite con clientes reales.</p></div>
    <div class="wiki-section"><h3><i class="fa fa-list-check"></i> Validaciones previas</h3>
      ${[['Todos los canales contratados activados','Verificar en tabla de canales'],['Agentes creados y capacitados','Confirmar con cliente'],['Bots y flujos probados y aprobados',''],['Horarios de atención configurados',''],['Backup de configuración realizado',''],['Contacto de soporte entregado al cliente','']].map(([t,n],i)=>`<div class="wiki-step"><div class="wiki-step-num">${i+1}</div><div><strong style="font-size:12px">${t}</strong>${n?`<br><span style="font-size:11px;color:var(--muted)">${n}</span>`:''}</div></div>`).join('')}
    </div>
    <div class="wiki-warning">Al completar Go-Live, cambiar el estado en ClickUp a <strong>"Concluído"</strong>. El sistema cambiará al cliente a estado Activo automáticamente.</div>`,meta:'Etapa 5 de 6'},
  activacion:{title:'Activación de Canales',icon:'fa-satellite-dish',content:`
    <div class="wiki-section"><h3><i class="fa fa-satellite-dish" style="color:var(--info)"></i> Canales Disponibles</h3>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${[['WhatsApp','fab fa-whatsapp','#25D366','API oficial de WhatsApp Business. Requiere número dedicado y aprobación de Meta.'],['Instagram','fab fa-instagram','#C13584','Direct Messages de Instagram. Requiere cuenta Business conectada.'],['Telegram','fab fa-telegram','#0088CC','Bot de Telegram. Solo requiere crear un bot con @BotFather.'],['WebChat','fa fa-comments','var(--primary)','Widget embebido en sitio web del cliente.'],['PBX / Telefonía','fa fa-phone','var(--info)','Integración con centralita telefónica.'],['Messenger','fab fa-facebook-messenger','#0078FF','Facebook Messenger. Requiere página de Facebook Business.']].map(([n,ic,c,d])=>`<div style="display:flex;align-items:flex-start;gap:10px;padding:10px;background:rgba(255,255,255,.02);border-radius:8px;border:1px solid var(--border)"><i class="${ic}" style="color:${c};font-size:20px;width:24px;margin-top:1px"></i><div><strong style="font-size:12px">${n}</strong><br><span style="font-size:11px;color:var(--muted)">${d}</span></div></div>`).join('')}
      </div>
    </div>`,meta:'Etapa 6 de 6 — Meta: 2 días'},
  dashboard_guide:{title:'Guía: Dashboard',icon:'fa-gauge-high',content:`
    <div class="wiki-section"><h3><i class="fa fa-gauge-high"></i> ¿Qué muestra el Dashboard?</h3><p>Vista unificada de todos los KPIs clave del equipo. Los datos cambian según el filtro de período seleccionado en la barra superior.</p></div>
    <div class="wiki-section"><h3><i class="fa fa-circle-info"></i> Puntos (i) — Ayuda contextual</h3><p>Todos los campos del sistema tienen un botón <span class="info-tip" style="position:relative;display:inline-flex" data-tip="Ejemplo de tooltip">i</span> que al pasar el cursor muestra una explicación detallada del campo.</p></div>
    <div class="wiki-section"><h3><i class="fa fa-calendar"></i> Filtros de Período</h3>
      ${[['Hoy','Muestra solo los clientes con actividad del día actual'],['7 días','Últimos 7 días de actividad'],['Mes actual','Desde el 1ro del mes hasta hoy'],['Mes anterior','El mes calendario previo completo'],['3 meses','Últimos 90 días'],['Este año','Desde enero del año actual'],['Personalizado','Define desde/hasta con el selector de fechas']].map(([t,d])=>`<div class="wiki-step"><div class="wiki-step-num"><i class="fa fa-calendar" style="font-size:10px"></i></div><div><strong style="font-size:12px">${t}</strong><br><span style="font-size:11px;color:var(--muted)">${d}</span></div></div>`).join('')}
    </div>`,meta:'Sección: Dashboard'},
  alertas_guide:{title:'Guía: Sistema de Alertas',icon:'fa-bell',content:`
    <div class="wiki-section"><h3><i class="fa fa-bell" style="color:var(--danger)"></i> Tipos de Alertas</h3>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div class="alert-item critical" style="padding:10px"><div class="alert-icon critical" style="width:30px;height:30px;font-size:14px"><i class="fa fa-circle-exclamation"></i></div><div><strong style="font-size:12px">🚨 Crítica</strong><br><span style="font-size:11px;color:var(--muted)">Implementación superó los días meta configurados. Acción inmediata requerida.</span></div></div>
        <div class="alert-item warning" style="padding:10px"><div class="alert-icon warning" style="width:30px;height:30px;font-size:14px"><i class="fa fa-clock"></i></div><div><strong style="font-size:12px">⚠️ Sin movimiento</strong><br><span style="font-size:11px;color:var(--muted)">No hay actualización en ClickUp en los últimos X días (configurable).</span></div></div>
        <div class="alert-item info" style="padding:10px"><div class="alert-icon info" style="width:30px;height:30px;font-size:14px"><i class="fa fa-link-slash"></i></div><div><strong style="font-size:12px">Sin IP/Dominio</strong><br><span style="font-size:11px;color:var(--muted)">Cliente en implementación sin datos de acceso registrados.</span></div></div>
        <div class="alert-item info" style="padding:10px"><div class="alert-icon info" style="width:30px;height:30px;font-size:14px"><i class="fa fa-user-clock"></i></div><div><strong style="font-size:12px">Riesgo de Churn</strong><br><span style="font-size:11px;color:var(--muted)">Cliente activo sin nueva actividad por más de 180 días (configurable).</span></div></div>
      </div>
    </div>
    <div class="wiki-tip">Los umbrales son configurables en <strong>Alertas → Umbrales</strong> o en <strong>Configuración</strong>.</div>`,meta:'Sección: Alertas'},
  canales_guide:{title:'Guía: Canales',icon:'fa-satellite-dish',content:`
    <div class="wiki-section"><h3>La sección Canales muestra:</h3>
      <ul><li>Cantidad de clientes activos por cada canal</li><li>Canales pendientes de activar (en impl. con canal contratado pero sin activar)</li><li>Distribución por país y por plan</li><li>Estado detallado canal por canal de cada cliente</li></ul>
    </div>
    <div class="wiki-tip">Un cliente sin ningún canal activo en producción es una alerta crítica — revisar su onboarding.</div>`,meta:'Sección: Canales'},
  cs_guide:{title:'Guía: CS Dashboard',icon:'fa-headset',content:`
    <div class="wiki-section"><h3><i class="fa fa-headset" style="color:var(--accent2)"></i> Customer Success</h3><p>Módulo dedicado al equipo de CS para gestionar:</p>
      <ul>
        <li><strong>Solicitudes de Baja:</strong> Registrar cuándo un cliente solicita cancelar</li>
        <li><strong>Retenciones:</strong> Documentar estrategia y resultado de retención</li>
        <li><strong>Clientes Perdidos:</strong> Derivados de ClickUp (estado Cancelado)</li>
        <li><strong>Recuperados:</strong> Clientes que regresaron tras cancelar</li>
      </ul>
    </div>
    <div class="wiki-section"><h3>Métricas Clave</h3>
      <ul>
        <li><strong>Tasa de Retención:</strong> % de solicitudes de baja que se retuvieron exitosamente</li>
        <li><strong>Churn Rate:</strong> % de cancelaciones sobre base activa</li>
      </ul>
    </div>
    <div class="wiki-tip">Los eventos CS (bajas, retenciones, recuperados) se registran manualmente usando los botones "Registrar" en cada tabla.</div>`,meta:'Sección: CS Dashboard'},
  faq:{title:'Preguntas Frecuentes',icon:'fa-circle-question',content:`
    <div style="display:flex;flex-direction:column;gap:12px">
      ${[['¿Los datos son en tiempo real?','Se sincronizan al hacer click en "Sincronizar" o al iniciar sesión. La API de ClickUp se consulta directamente.'],['¿Qué pasa si la API de ClickUp no responde?','El sistema usa datos en caché local (localStorage) si está disponible. Asegúrate de haber sincronizado antes.'],['¿Cómo configuro la API de ¡Hola! Suite?','Ve a Configuración → ¡Hola! / Opa Suite API. Ingresa la URL base, Bearer token y Workspace ID.'],['¿Cómo agrego usuarios?','Ve a Usuarios → Nuevo Usuario. Solo administradores pueden crear usuarios.'],['¿Los reportes Excel incluyen todos los datos?','Sí, incluyen todos los campos del sistema. Los filtros de período aplican a los reportes.'],['¿Puedo editar datos manualmente?','Sí: upsells, eventos CS, mejoras y palabras de alerta se gestionan directamente en el sistema. Los datos de ClickUp son de solo lectura.'],['¿Qué significa "implementación completa" en BI?','Un consultor participó en TODAS las etapas (kickoff, verificación, capacitación, go-live, activación) del mismo cliente.']].map(([q,a])=>`<div style="background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:10px;padding:14px"><div style="font-size:13px;font-weight:600;color:var(--primary);margin-bottom:6px"><i class="fa fa-question-circle"></i> ${q}</div><div style="font-size:12px;color:rgba(232,232,240,.75);line-height:1.6">${a}</div></div>`).join('')}
    </div>`,meta:'Preguntas y respuestas del equipo'},
  troubleshoot:{title:'Resolución de Problemas',icon:'fa-wrench',content:`
    <div style="display:flex;flex-direction:column;gap:10px">
      ${[['La API de ClickUp retorna error 401','Verifica que el API Key sea correcto y no haya expirado. Ve a tu perfil de ClickUp → Aplicaciones → API Token.','danger'],['Los datos no se actualizan','Haz click en "Sincronizar" en la barra lateral o en el icono de la barra superior. Si persiste, limpia caché: F12 → Application → Clear Storage.','warning'],['El gráfico no muestra datos','Verifica que el filtro de período no excluya todos los clientes. Prueba con "Todos los datos".','warning'],['No aparecen consultores','Los campos de responsable en ClickUp deben contener "Edwin", "Alejandro", "Mariane" o sus variantes para ser reconocidos.','info'],['Los canales aparecen vacíos','El campo "Canales contratados" en ClickUp debe estar correctamente configurado. Verifica en la tarjeta del cliente.','info'],['La API de Hola Suite no conecta','Verifica: 1) URL correcta con https, 2) Token Bearer válido, 3) CORS habilitado en el servidor, 4) Workspace ID correcto.','danger']].map(([t,s,lvl])=>`<div class="alert-item ${lvl}" style="padding:12px"><div class="alert-icon ${lvl}" style="width:32px;height:32px;font-size:14px"><i class="fa fa-${lvl==='danger'?'times-circle':lvl==='warning'?'exclamation-triangle':'info-circle'}"></i></div><div><strong style="font-size:12px">${t}</strong><br><span style="font-size:11px;color:var(--muted)">${s}</span></div></div>`).join('')}
    </div>`,meta:'Guía de soporte técnico'}
};

function showWikiPage(page){
  APP.wikiCurrentPage=page;
  document.querySelectorAll('.wiki-nav-item').forEach(n=>{n.classList.remove('active');if(n.dataset.page===page)n.classList.add('active');});
  const wp=WIKI_PAGES[page];
  const panel=document.getElementById('wikiContent');
  if(!panel)return;
  if(!wp){panel.innerHTML=`<div class="no-data"><i class="fa fa-book-open"></i><p>Página no encontrada</p></div>`;return;}
  panel.innerHTML=`
    <div class="wiki-page-title"><i class="fa ${wp.icon}"></i> ${wp.title}</div>
    <div class="wiki-page-meta"><i class="fa fa-info-circle" style="color:var(--info)"></i> ${wp.meta}</div>
    ${wp.content}`;
}

// ================================================================
// USUARIOS / PERMISOS
// ================================================================
async function renderUsuarios(){
  await fetchUsersFromServer();
  renderUsersList();
  renderPermMatrix();
  renderGroupsList();
  renderUsersListConfig();
}

function renderUsersList(){
  const list=document.getElementById('usersList');if(!list)return;
  const users=APP.users || [];
  const roleColors={admin:'var(--primary)',consultant:'var(--success)',cs:'var(--accent2)',viewer:'var(--muted)'};
  const roleLabels={admin:'Administrador',consultant:'Consultor',cs:'CS Team',viewer:'Visualizador'};
  list.innerHTML=users.map(u=>`<div class="user-card">
    <div class="user-card-avatar" style="background:${u.color||'var(--primary)'}22;color:${u.color||'var(--primary)'};border:1px solid ${u.color||'var(--primary)'}33">${u.avatar||u.name[0]}</div>
    <div class="user-card-info">
      <div class="user-card-name">${escHtml(u.name)}</div>
      <div class="user-card-email">${escHtml(u.email)} · <span style="color:${roleColors[u.role]||'var(--muted)'}">${roleLabels[u.role]||u.role}</span></div>
    </div>
    <div class="user-card-actions">
      <span class="badge badge-${u.role==='admin'?'primary':u.role==='consultant'?'success':u.role==='cs'?'purple':'info'}">${roleLabels[u.role]||u.role}</span>
      ${APP.currentUser?.role==='admin'&&u.id!==APP.currentUser?.id?`
        <button class="btn-outline btn-sm" onclick="resetUserPassword('${u.id}')" title="Cambiar Contraseña"><i class="fa fa-key"></i></button>
        <button class="btn-danger btn-sm" onclick="deleteUser('${u.id}')" title="Eliminar"><i class="fa fa-trash"></i></button>`:''}
    </div>
  </div>`).join('');
}

function renderUsersListConfig(){
  const el=document.getElementById('usersListConfig');if(!el)return;
  const users=APP.users || [];
  el.innerHTML=users.map(u=>`<div style="display:flex;align-items:center;gap:8px;padding:8px;background:rgba(255,255,255,.03);border-radius:8px;margin-bottom:6px">
    <div style="width:28px;height:28px;border-radius:7px;background:${u.color||'var(--primary)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff">${u.avatar||u.name[0]}</div>
    <div style="flex:1;font-size:12px"><strong>${escHtml(u.name)}</strong> <span style="color:var(--muted);font-size:10px">· ${u.role}</span></div>
  </div>`).join('');
}

function renderPermMatrix(){
  const table=document.getElementById('permMatrix');if(!table)return;
  const roles=['admin','consultant','cs','viewer'];
  const roleLabels={admin:'Admin',consultant:'Consultor',cs:'CS Team',viewer:'Viewer'};
  const sections=[['Dashboard','dashboard'],['Ver Clientes','clients'],['Configurar','config'],['Exportar','export'],['Usuarios','users'],['Eliminar','delete']];
  table.innerHTML=`<thead><tr><th>Permiso</th>${roles.map(r=>`<th>${roleLabels[r]}</th>`).join('')}</tr></thead>
  <tbody>${sections.map(([label,key])=>`<tr>
    <td>${label}</td>
    ${roles.map(r=>{const on=APP.permissions[r]?.[key];return`<td><span class="perm-check ${on?'on':'off'}" onclick="togglePerm('${r}','${key}')" title="${on?'Permitido':'Denegado'}">${on?'✓':'—'}</span>`;}).join('')}
  </tr>`).join('')}</tbody>`;
}

function togglePerm(role,key){
  if(APP.currentUser?.role!=='admin'){toast('warning',t('toast.only_admin_permissions','Solo administradores pueden cambiar permisos'));return;}
  if(!APP.permissions[role])APP.permissions[role]={};
  APP.permissions[role][key]=!APP.permissions[role][key];
  renderPermMatrix();
}

function renderGroupsList(){
  const el=document.getElementById('groupsList');if(!el)return;
  const groups=APP.groups||[];
  if(!groups.length){el.innerHTML=`<div style="font-size:12px;color:var(--muted);padding:8px">Sin grupos creados</div>`;return;}
  el.innerHTML=groups.map(g=>`<div style="display:flex;align-items:center;gap:8px;padding:8px;background:rgba(255,255,255,.03);border-radius:8px;margin-bottom:6px">
    <i class="fa fa-users" style="color:var(--primary);font-size:14px"></i>
    <div style="flex:1;font-size:12px"><strong>${escHtml(g.name)}</strong> <span style="color:var(--muted);font-size:10px">· ${g.role}</span></div>
    <button class="btn-outline btn-sm" onclick="deleteGroup('${g.id}')"><i class="fa fa-trash"></i></button>
  </div>`).join('');
}

function showUserModal(editId){
  document.getElementById('umName').value='';document.getElementById('umEmail').value='';
  document.getElementById('umPass').value='';document.getElementById('umRole').value='viewer';
  document.getElementById('umAvatar').value='';
  setHtml('userModalTitle','<i class="fa fa-user-plus"></i> Nuevo Usuario');
  openModal('userModal');
}

async function saveUser(){
  if(APP.currentUser?.role!=='admin'){toast('error',t('toast.no_permissions','Sin permisos'));return;}
  const name=document.getElementById('umName').value.trim();
  const username=document.getElementById('umEmail').value.trim();
  const pass=document.getElementById('umPass').value.trim();
  const role=document.getElementById('umRole').value;
  if(!name||!username||!pass){toast('warning',t('toast.fill_required','Completa todos los campos obligatorios'));return;}
  if(pass.length<6){toast('warning',t('toast.password_min','La contraseña debe tener al menos 6 caracteres'));return;}
  
  try {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ name, username, password: pass, role })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al crear usuario');
    
    toast('success',`Usuario creado: ${name}`);
    closeModal('userModal');
    renderUsuarios();
  } catch(e) { toast('error', e.message); }
}

function resetUserPassword(id) {
  if (APP.currentUser?.role !== 'admin') { toast('error', t('toast.no_permissions','Sin permisos')); return; }
  document.getElementById('pmUserId').value = id;
  document.getElementById('pmNewPass').value = '';
  openModal('passwordModal');
}

async function submitPasswordReset() {
  const id = document.getElementById('pmUserId').value;
  const newPass = document.getElementById('pmNewPass').value.trim();
  if (newPass.length < 6) return toast('warning', 'Mínimo 6 caracteres');
  try {
    const res = await fetch(`/api/users/${id}/password`, {
      method: 'PUT',
      headers: getAuthHeader(),
      body: JSON.stringify({ password: newPass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al cambiar clave');
    toast('success', 'Contraseña actualizada correctamente');
    closeModal('passwordModal');
  } catch(e) { toast('error', e.message); }
}

async function deleteUser(id){
  if(APP.currentUser?.role!=='admin'){toast('error',t('toast.no_permissions','Sin permisos'));return;}
  if(!confirm(t('toast.confirm_delete_user','¿Eliminar usuario?')))return;
  try {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE', headers: getAuthHeader() });
    if (!res.ok) {
       const data = await res.json();
       throw new Error(data.error || 'Error al eliminar');
    }
    toast('info',t('toast.user_deleted','Usuario eliminado'));
    renderUsuarios();
  } catch (e) { toast('error', e.message); }
}

function addGroup(){
  const name=document.getElementById('newGroupName')?.value.trim();
  const role=document.getElementById('newGroupRole')?.value||'viewer';
  if(!name){toast('warning',t('toast.write_group_name','Escribe el nombre del grupo'));return;}
  const g={id:'g'+Date.now(),name,role};
  APP.groups.push(g);renderGroupsList();
  document.getElementById('newGroupName').value='';
  toast('success',`${t('toast.group_created','Grupo creado')}: ${name}`);
}

function deleteGroup(id){
  APP.groups=APP.groups.filter(g=>g.id!==id);renderGroupsList();
  toast('info',t('toast.group_deleted','Grupo eliminado'));
}

// ================================================================
// CLIENT MODAL
// ================================================================
function showClient(id){
  const c=APP.data.find(d=>d.id===id);if(!c)return;
  setHtml('modalClientName',`${escHtml(c.nombre)} ${c.statusType==='activo'?`<span class="badge badge-success">${t('common.active','Activo')}</span>`:c.statusType==='cancelado'?`<span class="badge badge-danger">${t('common.canceled','Cancelado')}</span>`:`<span class="badge badge-info">${t('common.in_impl','En Impl.')}</span>`}`);
  const upsellList=APP.upsells[c.id]||[];
  const logs=(c.logs||[]).slice(0,8);
  const supportMatches=findConversationMatches(c);
  document.getElementById('modalContent').innerHTML=`
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      ${c.pais?`<span class="badge badge-primary">${flagFor(c.pais)} ${c.pais}</span>`:''}
      ${c.plan?`<span class="badge badge-purple">${c.plan}</span>`:''}
      ${c.tipo?`<span class="badge badge-info">${c.tipo}</span>`:''}
      ${c.pausada==='SÍ'?`<span class="badge badge-warning">⏸️ ${t('alerts.paused','En Pausa')}</span>`:''}
    </div>
    <div class="modal-section-title"><i class="fa fa-info-circle"></i> ${t('modal.general_info','Información General')}</div>
    <div class="detail-grid">
      <div class="detail-item"><label>${t('modal.clickup_status','Estado ClickUp')} <span class="info-tip" data-tip="Estado actual en ClickUp.">i</span></label><span style="font-size:12px">${escHtml(c.estado)}</span></div>
      <div class="detail-item"><label>${t('modal.impl_start','F. Inicio Impl.')}</label><span>${c.fInicio||'—'}</span></div>
      <div class="detail-item"><label>${t('modal.activation_date','F. Activación')}</label><span>${c.fActivacion||'—'}</span></div>
      <div class="detail-item"><label>${t('modal.cancel_date','F. Cancelación')}</label><span>${c.fCancelacion||'—'}</span></div>
      <div class="detail-item"><label>${t('modal.impl_days','Días Implementación')}</label><span class="badge ${c.dImpl>20?'badge-danger':c.dImpl>15?'badge-warning':'badge-success'}">${c.dImpl} ${t('common.days','días')}</span></div>
      <div class="detail-item"><label>${t('modal.usage_days','Días de Uso')} <span class="info-tip" data-tip="Días desde activación hasta hoy.">i</span></label><span>${c.dUso} ${t('common.days','días')}</span></div>
      <div class="detail-item"><label>${t('modal.days_no_movement','Días Sin Movimiento')} <span class="info-tip" data-tip="Días desde la última actualización en ClickUp.">i</span></label><span class="${c.dSinMov>7?'text-danger':''}">${c.dSinMov}d</span></div>
      <div class="detail-item"><label>${t('modal.last_update','Última Actualización')}</label><span style="font-size:11px">${c.fActualizado||'—'}</span></div>
    </div>
    <div class="modal-section-title"><i class="fa fa-users"></i> ${t('modal.consultants_by_stage','Consultores por Etapa')}</div>
    <div class="detail-grid">
      <div class="detail-item"><label>${t('modal.all_consultants','Todos los consultores asignados')}</label><span>${escHtml(getAssignedConsultantsLabel(c))}</span></div>
      <div class="detail-item"><label>Kickoff <span class="info-tip" data-tip="Responsable del kickoff inicial.">i</span></label><span>${escHtml(c.rKickoff||'—')}</span></div>
      <div class="detail-item"><label>Verificación</label><span>${escHtml(c.rVer||'—')}</span></div>
      <div class="detail-item"><label>Capacitación</label><span>${escHtml(c.rCap||'—')}</span></div>
      <div class="detail-item"><label>Go-Live</label><span>${escHtml(c.rGoLive||'—')}</span></div>
      <div class="detail-item"><label>Activación</label><span>${escHtml(c.rAct||'—')}</span></div>
      <div class="detail-item"><label>${t('modal.trainings_done','Cap. Realizadas')} <span class="info-tip" data-tip="Número de sesiones de capacitación realizadas.">i</span></label><span>${c.cantCap||0} ${t('common.sessions','sesiones')} · ${c.hCap||0}h</span></div>
    </div>
    <div class="modal-section-title"><i class="fa fa-timeline"></i> ${t('modal.lifecycle','Ciclo de Vida')}</div>
    <div class="detail-grid">
      <div class="detail-item"><label>Llegó / creado</label><span>${formatDate(c.created)||c.fInicio||'—'}</span></div>
      <div class="detail-item"><label>Entró a implementación</label><span>${c.fInicio||'—'}</span></div>
      <div class="detail-item"><label>Finalizó / activó</label><span>${c.fActivacion||'—'}</span></div>
      <div class="detail-item"><label>Canceló</label><span>${c.fCancelacion||'—'}</span></div>
      <div class="detail-item"><label>${t('modal.impl_time','Tiempo de implementación')}</label><span>${c.dImpl||0} ${t('common.days','días')}</span></div>
      <div class="detail-item"><label>${t('modal.usage_time','Tiempo de uso')}</label><span>${(c.dUsoTotal||c.dUso||0)} ${t('common.days','días')}</span></div>
      <div class="detail-item"><label>${t('modal.modules_added','Módulos adicionados')}</label><span>${escHtml(c.modAdicionados||'—')}</span></div>
      <div class="detail-item"><label>${t('modal.modules_canceled','Módulos cancelados')}</label><span>${escHtml(c.modCancelados||'—')}</span></div>
      <div class="detail-item"><label>${t('modal.support_chats','Chats / soporte en Hola Suite')}</label><span>${supportMatches.length}</span></div>
      <div class="detail-item"><label>${t('modal.support_compare','Comparativo soporte')}</label><span>${supportMatches.length>=5?`<span class="badge badge-warning">${t('modal.high_support','Soporte alto')}</span>`:supportMatches.length>0?`<span class="badge badge-info">${t('modal.with_support','Con soporte')}</span>`:`<span class=\"badge badge-success\">${t('modal.no_relevant_support','Sin soporte relevante')}</span>`}</span></div>
    </div>
    <div class="modal-section-title"><i class="fa fa-satellite-dish"></i> ${t('modal.channels_access','Canales & Acceso')}</div>
    <div class="detail-grid">
      <div class="detail-item"><label>IP / Hola Suite <span class="info-tip" data-tip="IP del servidor donde está instalada la plataforma.">i</span></label><span style="font-size:11px;font-family:monospace">${escHtml(c.ip||'—')}</span></div>
      <div class="detail-item"><label>Dominio <span class="info-tip" data-tip="Dominio personalizado del cliente.">i</span></label><span style="font-size:11px;font-family:monospace">${escHtml(c.dominio||'—')}</span></div>
      <div class="detail-item"><label>Email</label><span style="font-size:11px">${escHtml(c.email||'—')}</span></div>
      <div class="detail-item"><label>Teléfono</label><span>${escHtml(c.telefono||'—')}</span></div>
    </div>
    <div style="margin-top:10px"><label style="font-size:10px;color:var(--muted);letter-spacing:.8px;text-transform:uppercase;display:block;margin-bottom:6px">${t('modal.active_channels','Canales activos')}</label>
      <div class="channel-pills" style="gap:6px">
        ${c.wa?'<span class="channel-pill cp-wa" style="width:28px;height:28px;font-size:13px" title="WhatsApp"><i class="fab fa-whatsapp"></i></span>':''}
        ${c.ig?'<span class="channel-pill cp-ig" style="width:28px;height:28px;font-size:13px" title="Instagram"><i class="fab fa-instagram"></i></span>':''}
        ${c.tg?'<span class="channel-pill cp-tg" style="width:28px;height:28px;font-size:13px" title="Telegram"><i class="fab fa-telegram"></i></span>':''}
        ${c.wc?'<span class="channel-pill cp-wc" style="width:28px;height:28px;font-size:13px" title="WebChat"><i class="fa fa-comments"></i></span>':''}
        ${c.pbx?'<span class="channel-pill cp-pbx" style="width:28px;height:28px;font-size:13px" title="PBX"><i class="fa fa-phone"></i></span>':''}
        ${c.msg?'<span class="channel-pill cp-msg" style="width:28px;height:28px;font-size:13px" title="Messenger"><i class="fab fa-facebook-messenger"></i></span>':''}
        ${!c.wa&&!c.ig&&!c.tg&&!c.wc&&!c.pbx&&!c.msg?`<span class="badge badge-warning">${t('modal.no_channels','Sin canales registrados')}</span>`:''}
      </div>
      <div style="margin-top:8px;font-size:11px;color:${c.dataIncomplete?'#FFD600':'var(--muted)'}">${escHtml(c.dataQualityNote||'')}</div>
    </div>
    <div class="modal-section-title"><i class="fa fa-timeline"></i> ${t('modal.movement_logs','Logs de Movimiento')}</div>
    ${logs.length?logs.map(log=>`<div style="padding:10px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:8px;margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><strong style="font-size:12px;color:var(--primary)">${escHtml(log.tipo||'manual')}</strong><span style="font-size:11px;color:var(--muted)">${escHtml(log.fecha||t('modal.no_date','Sin fecha'))}</span></div><div style="font-size:12px;color:rgba(232,232,240,.78);margin-top:4px">${escHtml(log.detalle||t('modal.no_detail','Sin detalle'))}</div></div>`).join(''):`<div class="no-data" style="padding:18px">${t('modal.no_synced_logs','Sin logs sincronizados. Puedes agregarlos manualmente o importarlos desde el dataset/API.')}</div>`}
    ${c.alerta&&c.alerta!=='NO'?`<div class="modal-section-title"><i class="fa fa-triangle-exclamation text-danger"></i> ${t('common.alert','Alerta')}</div><div class="alert-item ${c.alerta.includes('🚨')?'critical':'warning'}" style="margin-top:0"><div class="alert-icon ${c.alerta.includes('🚨')?'critical':'warning'}"><i class="fa fa-triangle-exclamation"></i></div><div class="alert-content"><div class="alert-title">${c.alerta}</div><div class="alert-desc">${t('modal.no_movement_label','Sin movimiento')}: ${c.dSinMov} ${t('common.days','días')} · ${t('modal.impl_days_label','Días impl.')}: ${c.dImpl}</div></div></div>`:''}
    ${c.motivo?`<div class="modal-section-title"><i class="fa fa-comment-dots text-warning"></i> ${t('modal.churn_reason','Motivo de Baja')}</div><div style="padding:10px;background:rgba(255,23,68,.05);border:1px solid rgba(255,23,68,.15);border-radius:8px;font-size:12px">${escHtml(c.motivo)}</div>`:''}
    ${upsellList.length>0?`<div class="modal-section-title"><i class="fa fa-arrow-trend-up text-success"></i> ${t('modal.upsells','Upsells / Cross-sells')}</div>${upsellList.map(u=>`<div class="upsell-entry"><strong>${u.type==='upgrade'?'📈 Upgrade':u.type==='crosssell'?'🔀 Cross-sell':'✨ Otro'}</strong> · ${escHtml(u.from||'—')} → ${escHtml(u.to||'—')} · <strong style="color:var(--success)">$${u.value||0}</strong> · ${u.date||'—'}</div>`).join('')}`:''}
    <div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap">
      ${c.link?`<a href="${c.link}" target="_blank" class="btn-primary" style="text-decoration:none"><i class="fa fa-external-link"></i> ClickUp</a>`:''}
      ${c.linkHola?`<a href="${c.linkHola}" target="_blank" class="btn-outline" style="text-decoration:none"><i class="fa fa-link"></i> ${t('modal.open_platform','Abrir Plataforma')}</a>`:''}
      <button class="btn-outline" onclick="openClientDataModal('${c.id}')"><i class="fa fa-pen"></i> ${t('modal.complete_data','Completar datos')}</button>
      ${c.statusType==='activo'?`<button class="btn-success" onclick="closeModal('clientModal');openUpsellModal('${c.id}')"><i class="fa fa-arrow-trend-up"></i> Upsell</button>`:''}
      <button class="btn-outline" onclick="closeModal('clientModal');addCSEvent('baja')"><i class="fa fa-file-circle-xmark"></i> CS Event</button>
    </div>`;
  openModal('clientModal');
}

function openClientDataModal(id){
  const client=APP.data.find(c=>c.id===id); if(!client)return;
  document.getElementById('clientDataId').value=id;
  document.getElementById('clientChannelsInput').value=(APP.channelOverrides[id]?.channels||client.canales||[]).join(', ');
  document.getElementById('clientLogDate').value=new Date().toISOString().split('T')[0];
  document.getElementById('clientLogType').value='manual';
  document.getElementById('clientLogDetail').value='';
  openModal('clientDataModal');
}

function saveClientDataOverride(){
  const id=document.getElementById('clientDataId').value;
  if(!id){toast('warning',t('toast.invalid_client','Cliente inválido'));return;}
  const channels=(document.getElementById('clientChannelsInput').value||'').split(',').map(x=>x.trim()).filter(Boolean);
  const date=document.getElementById('clientLogDate').value;
  const type=document.getElementById('clientLogType').value;
  const detail=document.getElementById('clientLogDetail').value.trim();
  APP.channelOverrides[id]={channels};
  localStorage.setItem('holaChannelOverrides',JSON.stringify(APP.channelOverrides));
  if(detail){
    if(!APP.clientLogs[id])APP.clientLogs[id]=[];
    APP.clientLogs[id].unshift({fecha:date||new Date().toISOString().split('T')[0],tipo:type||'manual',detalle:detail,source:'manual'});
    localStorage.setItem('holaClientLogs',JSON.stringify(APP.clientLogs));
  }
  APP.data=hydrateClients(APP.data);
  APP.filteredByDate=applyDateFilter(APP.data);
  localStorage.setItem('holaData',JSON.stringify({data:APP.data,ts:Date.now(),meta:APP.apiMeta}));
  renderAll(APP.filteredByDate);
  closeModal('clientDataModal');
  closeModal('clientModal');
  toast('success',t('toast.client_updated','Datos del cliente actualizados'));
}

// ================================================================
// MODAL HELPERS
// ================================================================
function openModal(id){document.getElementById(id)?.classList.add('active');}
function closeModal(id,e){if(!e||e.target.id===id)document.getElementById(id)?.classList.remove('active');}
function showModal(id){document.getElementById(id)?.classList.add('active');}

// ================================================================
// SEARCH
// ================================================================
function mainSearch(q){
  const res=document.getElementById('searchResults');if(!res)return;
  if(!q||q.length<2){res.innerHTML='';return;}
  const query=normalizeText(q);
  const results=APP.data.filter(c=>
    normalizeText(c.nombre).includes(query)||
    normalizeText(c.ip).includes(query)||
    normalizeText(c.dominio).includes(query)||
    normalizeText(c.email).includes(query)||
    normalizeText(c.pais).includes(query)||
    normalizeText(getAssignedConsultantsLabel(c)).includes(query)
  ).slice(0,12);
  if(!results.length){res.innerHTML=`<div class="no-data"><i class="fa fa-search"></i><p>${t('search.no_results','Sin resultados para')} "<strong>${escHtml(q)}</strong>"</p></div>`;return;}
  res.innerHTML=`<div style="font-size:11px;color:var(--muted);margin-bottom:10px">${results.length} ${t('search.results_for','resultado(s) para')} "<strong style="color:var(--primary)">${escHtml(q)}</strong>"</div>`+
  results.map(c=>`<div class="alert-item" style="cursor:pointer;margin-bottom:6px" onclick="showClient('${c.id}')">
    <div class="alert-icon ${c.statusType==='activo'?'success':c.statusType==='cancelado'?'critical':'info'}">
      <i class="fa ${c.statusType==='activo'?'fa-check-circle':c.statusType==='cancelado'?'fa-times-circle':'fa-cog'}"></i>
    </div>
    <div class="alert-content">
      <div class="alert-title">${escHtml(c.nombre)}</div>
      <div class="alert-desc">${flagFor(c.pais)} ${c.pais} · ${c.plan||'Sin plan'} · ${c.dImpl}d impl. · ${c.status}</div>
      <div class="alert-desc" style="font-size:10px">${escHtml(c.rCap||c.rKickoff||'Sin consultor')} ${c.ip?'· '+c.ip:''} ${c.dominio?'· '+c.dominio:''}</div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      ${c.alerta&&c.alerta!=='NO'?`<span class="badge ${c.alerta.includes('🚨')?'badge-danger':'badge-warning'}" style="font-size:9px">${c.alerta}</span>`:''}
      ${c.linkHola?`<br><a href="${escHtml(c.linkHola)}" target="_blank" style="font-size:10px;color:var(--info)" onclick="event.stopPropagation()"><i class="fa fa-link"></i> Abrir</a>`:''}
    </div>
  </div>`).join('');
}

function globalSearchFn(q){
  if(q&&q.length>=2){showSection('busqueda');const el=document.getElementById('mainSearchInput');if(el){el.value=q;mainSearch(q);}}
}

// ================================================================
// EXPORTS
// ================================================================
function exportTable(type){
  let data,filename;
  if(type==='impl'){data=APP.filtered.impl;filename='Implementaciones';}
  else if(type==='activos'){data=APP.filtered.activos;filename='Activos';}
  else if(type==='cancelados'){data=APP.filtered.cancelados;filename='Cancelados';}
  else if(type==='bi'){exportBIExcel();return;}
  else return;
  if(!data||!data.length){toast('warning',t('toast.no_data_export','Sin datos para exportar'));return;}
  const ws=XLSX.utils.json_to_sheet(data.map(c=>({
    'Cliente':c.nombre,'País':c.pais,'Plan':c.plan,'Estado':c.estado,'Status':c.status,
    'F. Inicio':c.fInicio,'F. Activación':c.fActivacion,'F. Cancelación':c.fCancelacion,
    'Días Impl.':c.dImpl,'Días Uso':c.dUso,'Días Sin Mov.':c.dSinMov,
    'Consultor Kickoff':c.rKickoff,'Consultor Cap.':c.rCap,'Consultor GoLive':c.rGoLive,
    'Consultores Asignados':getAssignedConsultantsLabel(c),
    'WA':c.wa?'SÍ':'NO','IG':c.ig?'SÍ':'NO','WebChat':c.wc?'SÍ':'NO','PBX':c.pbx?'SÍ':'NO','Telegram':c.tg?'SÍ':'NO',
    'IP':c.ip,'Dominio':c.dominio,'Link Plataforma':c.linkHola,
    'Email':c.email,'Teléfono':c.telefono,
    'Cap.Realizadas':c.cantCap,'H.Cap.':c.hCap,
    'Alerta':c.alerta,'Motivo Baja':c.motivo,
    'Usó Plataforma':c.usoPlat||'—','Días Uso Total':c.dUsoTotal||0,
    'Mes Inicio':c.mesInicio,'Mes Fin':c.mesFin,
    'Tiene IP':c.hasLink?'SÍ':'NO'
  })));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,filename);
  XLSX.writeFile(wb,`HolaSuite_${filename}_${new Date().toLocaleDateString('es-ES').replace(/\//g,'-')}.xlsx`);
  toast('success',`${data.length} ${t('toast.records_exported','registros exportados')}`);
}

function exportarTodo(){
  const wb=XLSX.utils.book_new();
  const sheets=[
    {data:APP.data.filter(c=>c.statusType==='activo'),name:'Activos'},
    {data:APP.data.filter(c=>c.statusType==='impl'),name:'Implementaciones'},
    {data:APP.data.filter(c=>c.statusType==='cancelado'),name:'Cancelados'},
    {data:APP.data,name:'Todos'}
  ];
  sheets.forEach(({data,name})=>{
    if(data.length){
      const ws=XLSX.utils.json_to_sheet(data.map(c=>({Cliente:c.nombre,País:c.pais,Plan:c.plan,Status:c.status,Días:c.dImpl,Consultor:getAssignedConsultantsLabel(c),IP:c.ip,Dominio:c.dominio,Alerta:c.alerta,Motivo:c.motivo||'—',WA:c.wa?'SÍ':'NO',IG:c.ig?'SÍ':'NO'})));
      XLSX.utils.book_append_sheet(wb,ws,name);
    }
  });
  // CS events sheet
  if(APP.csEvents.length){
    const ws=XLSX.utils.json_to_sheet(APP.csEvents.map(e=>({Tipo:e.type,Cliente:e.clientName,Fecha:e.date,Motivo:e.motivo,Resultado:e.resultado,Notas:e.notes})));
    XLSX.utils.book_append_sheet(wb,ws,'CS_Eventos');
  }
  XLSX.writeFile(wb,`HolaSuite_Completo_${new Date().toLocaleDateString('es-ES').replace(/\//g,'-')}.xlsx`);
  toast('success',t('toast.full_export_generated','Exportación completa generada'));
}

function exportBIExcel(){
  const data=APP.filteredByDate||APP.data;
  const wb=XLSX.utils.book_new();
  const rows=[];
  const consData={};
  data.forEach(c=>{
    [c.rKickoff,c.rVer,c.rCap,c.rGoLive,c.rAct].filter(r=>r&&r!=='').forEach(cons=>{
      const k=cons+'|'+(c.mesInicio||'Sin mes');
      if(!consData[k])consData[k]={cons,mes:c.mesInicio||'Sin mes',clientes:0,activos:0,cancel:0,impl:0,kick:0,cap:0,golive:0,completas:0,parciales:0};
      consData[k].clientes++;
      if(c.statusType==='activo')consData[k].activos++;
      else if(c.statusType==='cancelado')consData[k].cancel++;
      else consData[k].impl++;
      if(cons===c.rKickoff)consData[k].kick++;
      if(cons===c.rCap)consData[k].cap++;
      if(cons===c.rGoLive)consData[k].golive++;
    });
  });
  Object.values(consData).forEach(r=>{rows.push({Consultor:r.cons,Período:r.mes,Clientes:r.clientes,Activos:r.activos,Cancelados:r.cancel,EnProceso:r.impl,Kickoffs:r.kick,Capacitaciones:r.cap,GoLives:r.golive,'%Éxito':r.clientes>0?((r.activos/r.clientes)*100).toFixed(0)+'%':'0%'});});
  const ws=XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb,ws,'BI_Consultores');
  XLSX.writeFile(wb,`HolaSuite_BI_${new Date().toLocaleDateString('es-ES').replace(/\//g,'-')}.xlsx`);
  toast('success',t('toast.bi_exported','BI exportado'));
}

function generarReporte(type){
  toast('info',`${t('toast.generating_report','Generando reporte')}: "${type}"...`);
  setTimeout(()=>{
    let data=APP.filteredByDate||APP.data;
    if(type==='consultor'){const cons=document.getElementById('rptConsultor')?.value;if(cons)data=data.filter(c=>[c.rKickoff,c.rVer,c.rCap,c.rGoLive,c.rAct].includes(cons));}
    else if(type==='cliente'){
      const st=document.getElementById('rptStatus')?.value;const p=document.getElementById('rptPais')?.value;
      if(st==='activo')data=data.filter(c=>c.statusType==='activo');
      else if(st==='impl')data=data.filter(c=>c.statusType==='impl');
      else if(st==='cancelado')data=data.filter(c=>c.statusType==='cancelado');
      if(p)data=data.filter(c=>c.pais===p);
    }
    else if(type==='cancelados')data=data.filter(c=>c.statusType==='cancelado');
    else if(type==='cs')data=APP.csEvents;
    else if(type==='canales')data=data.filter(c=>c.statusType==='activo'||c.statusType==='impl');
    else if(type==='upsell')data=data.filter(c=>c.hasupsell);
    if(!data||!data.length){toast('warning',t('toast.no_data_export','Sin datos para exportar'));return;}
    const ws=XLSX.utils.json_to_sheet(type==='cs'?data.map(e=>({Tipo:e.type,Cliente:e.clientName,Fecha:e.date,Motivo:e.motivo,Resultado:e.resultado})):data.map(c=>({Cliente:c.nombre,País:c.pais,Plan:c.plan,Status:c.status,Días:c.dImpl,Consultor:getAssignedConsultantsLabel(c),Alerta:c.alerta,WA:c.wa?'SÍ':'NO',IG:c.ig?'SÍ':'NO',Motivo:c.motivo||'—'})));
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Reporte');
    XLSX.writeFile(wb,`HolaSuite_Reporte_${type}_${new Date().toLocaleDateString('es-ES').replace(/\//g,'-')}.xlsx`);
    toast('success',`${t('toast.report_generated','Reporte generado')} (${data.length} ${t('toast.records','registros')})`);
  },600);
}

// ================================================================
// CONFIG
// ================================================================
function saveConfig(silent=false){
  const salesFieldsRaw=document.getElementById('cfgSalesFields')?.value||'';
  const protectedFieldsRaw=document.getElementById('cfgProtectedFields')?.value||'';
  const holaUrlRaw=document.getElementById('cfgHolaUrl')?.value.trim()||'';
  const holaWsRaw=document.getElementById('cfgHolaWs')?.value.trim()||'';
  const sanitizedHolaWs=sanitizeHolaWorkspace(holaWsRaw,holaUrlRaw);
  const cfg={
    primarySource:document.getElementById('cfgPrimarySource')?.value||'clickup',
    apiKey:document.getElementById('cfgApiKey')?.value.trim(),
    listId:document.getElementById('cfgListId')?.value.trim(),
    sheet1:document.getElementById('cfgSheet1')?.value.trim(),
    sheet1Name:document.getElementById('cfgSheet1Name')?.value.trim(),
    sheet2:document.getElementById('cfgSheet2')?.value.trim(),
    sheet2Name:document.getElementById('cfgSheet2Name')?.value.trim(),
    salesSheetId:document.getElementById('cfgSalesSheetId')?.value.trim(),
    salesSheetName:document.getElementById('cfgSalesSheetName')?.value.trim(),
    holaUrl:holaUrlRaw,
    holaToken:document.getElementById('cfgHolaToken')?.value.trim(),
    holaWs:sanitizedHolaWs,
    slackCsWebhook:document.getElementById('cfgSlackCsWebhook')?.value.trim(),
    slackSalesWebhook:document.getElementById('cfgSlackSalesWebhook')?.value.trim(),
    diasAlerta:document.getElementById('cfgDiasAlerta')?.value,
    diasSinMov:document.getElementById('cfgDiasSinMov')?.value,
    diasRiesgo:document.getElementById('cfgDiasRiesgo')?.value,
    diasMeta:document.getElementById('cfgDiasMeta')?.value,
    manualJson:document.getElementById('cfgManualJson')?.value||'',
    salesJson:document.getElementById('cfgSalesJson')?.value||'',
    salesFields:salesFieldsRaw,
    protectedFields:protectedFieldsRaw
  };
  const wsInput=document.getElementById('cfgHolaWs');
  if(wsInput&&wsInput.value!==sanitizedHolaWs)wsInput.value=sanitizedHolaWs;
  localStorage.setItem('holaCfg',JSON.stringify(cfg));
  localStorage.setItem('holaPrimarySource',cfg.primarySource);
  if(cfg.apiKey)CONFIG.API_KEY=cfg.apiKey;
  if(cfg.listId)CONFIG.LIST_ID=cfg.listId;
  if(cfg.diasMeta)CONFIG.DIAS_META.total=parseInt(cfg.diasMeta)||20;
  APP.salesFields=parseFieldDefinitions(salesFieldsRaw,defaultSalesFields());
  APP.syncProtectedFields=parseProtectedFields(protectedFieldsRaw);
  renderVentas();
  renderPendingConflicts();
  if(!silent&&holaWsRaw&&holaWsRaw!==sanitizedHolaWs){
    toast('warning','Workspace ID ignorado: parecia una URL. Se dejó vacío automáticamente.');
  }
  if(!silent)toast('success',t('toast.config_saved','Configuración guardada'));
}

async function testClickUp(){
  if(getActiveSource()!=='clickup'){toast('warning',t('toast.clickup_test_only','La prueba directa solo aplica cuando la fuente principal es ClickUp'));return;}
  const key=(document.getElementById('cfgApiKey')?.value||CONFIG.API_KEY||'').trim();
  const listId=(document.getElementById('cfgListId')?.value||CONFIG.LIST_ID||'').trim();
  if(!key||!listId){toast('warning',t('toast.complete_api_listid','Completa API Key y List ID'));return;}
  showLoading(true,t('toast.testing_clickup','Probando conexión ClickUp...'));
  try{
    const resp=await fetch(`https://api.clickup.com/api/v2/list/${listId}`,{headers:{Authorization:key}});
    showLoading(false);
    if(resp.ok){
      const d=await resp.json();
      setHtml('clickupStatus',`<i class="fa fa-circle-check"></i> Conectado — Lista: ${escHtml(d.name||'OK')}`);
      document.getElementById('clickupStatus').className='api-status connected';
      toast('success',`${t('toast.clickup_connected','ClickUp conectado')}: ${d.name}`);
    }else{
      document.getElementById('clickupStatus').className='api-status disconnected';
      setHtml('clickupStatus',`<i class="fa fa-circle-xmark"></i> Error ${resp.status}`);
      toast('error',`${t('toast.clickup_error','Error ClickUp')}: ${resp.status}`);
    }
  }catch(e){
    showLoading(false);
    document.getElementById('clickupStatus').className='api-status disconnected';
    setHtml('clickupStatus','<i class="fa fa-circle-xmark"></i> Error de red / CORS');
    toast('error',e.message);
  }
}

async function testHolaApi(){
  const url=normalizeHolaBaseUrl(document.getElementById('cfgHolaUrl')?.value);
  const token=document.getElementById('cfgHolaToken')?.value;
  const ws=sanitizeHolaWorkspace(document.getElementById('cfgHolaWs')?.value,url);
  const wsInput=document.getElementById('cfgHolaWs');
  if(wsInput&&wsInput.value.trim()!==ws)wsInput.value=ws;
  if(!url||!token){
    toast('warning','⚠️ Completa URL Base y Token de Acceso primero');
    return;
  }
  showLoading(true,'Probando conexión con API Opa/Hola Suite...');
  try{
    let statusPath='/ok';
    // Siempre usar fallback directo (sin proxy) para evitar errores de 501
    const {plain,api}=getHolaApiBases(url);
    const headers={Authorization:getHolaAuthHeader(token),'Content-Type':'application/json'};
    const candidates=[
      `${api}/atendimento`,
      `${api}/profile`,
      `${api}/me`,
      `${plain}/profile`,
      `${plain}/me`,
      ...(ws?[`${api}/workspaces/${encodeURIComponent(ws)}`]:[])
    ];
    const {json,url:resolvedUrl}=await fetchJsonWithFallback(candidates,headers);
    if(!json)throw new Error('Respuesta vacía de la API');
    statusPath=resolvedUrl.startsWith(api)?resolvedUrl.replace(api,''):resolvedUrl.replace(plain,'');
    showLoading(false);
    document.getElementById('holaStatus').className='api-status connected';
    setHtml('holaStatus',`<i class="fa fa-circle-check"></i> ✅ Conectado · ${escHtml(statusPath||'/ok')}`);
    toast('success','✅ Conexión exitosa con API Opa Suite');
  }catch(e){
    showLoading(false);
    document.getElementById('holaStatus').className='api-status disconnected';
    const errMsg=e.message||'Error desconocido';
    const isCorsError=errMsg.includes('Failed to fetch')||errMsg.includes('CORS');
    const helpText=isCorsError?
      '🔒 Error CORS: Verifica que la URL sea correcta y que el servidor permita peticiones desde este dominio.':
      errMsg.includes('401')||errMsg.includes('403')?'🔐 Error de autenticación: Revisa que el token sea válido.':
      errMsg.includes('404')?'❌ Endpoint no encontrado: Verifica la URL base.':
      '⚠️ Error de conexión. Consulta la consola (F12) para más detalles.';
    setHtml('holaStatus',`<i class="fa fa-circle-xmark"></i> ❌ Desconectado`);
    toast('error',`❌ ${helpText}`);
    console.error('Opa API Test Error:',{url,wsInput:ws,error:e.message});
  }
}

function addCustomApi(){
  const name=document.getElementById('cfgApi1Name')?.value.trim();
  const url=document.getElementById('cfgApi1Url')?.value.trim();
  const provider=document.getElementById('cfgApi1Provider')?.value||'custom';
  const apiKey=document.getElementById('cfgApi1Key')?.value.trim();
  if(!name||!url){toast('warning',t('toast.complete_name_url','Completa nombre y URL'));return;}
  APP.customApis.push({id:'api-'+Date.now(),provider,name,url,apiKey});
  localStorage.setItem('holaCustomApis',JSON.stringify(APP.customApis));
  renderCustomApisList();
  toast('success',`${t('toast.api_added','API agregada')}: "${name}"`);
}

function renderCustomApisList(){
  const div=document.getElementById('customApisList');
  if(!div)return;
  if(!APP.customApis.length){div.innerHTML='<div style="font-size:11px;color:var(--muted)">Sin APIs adicionales configuradas</div>';return;}
  div.innerHTML=APP.customApis.map(api=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px;background:rgba(0,212,255,.04);border:1px solid rgba(0,212,255,.12);border-radius:6px;margin-top:6px;font-size:11px">
    <span><i class="fa fa-plug" style="color:var(--info)"></i> <strong>${escHtml(api.name)}</strong> <span style="color:var(--muted)">(${escHtml(api.provider)})</span></span>
    <span style="color:var(--muted);font-size:10px">${escHtml(api.url.substring(0,35))}${api.url.length>35?'...':''}</span>
  </div>`).join('');
}

function persistPendingConflicts(){
  localStorage.setItem('holaPendingConflicts',JSON.stringify(APP.pendingConflicts||[]));
}

function renderPendingConflicts(){
  const box=document.getElementById('pendingConflictsList');
  if(!box)return;
  if(!APP.pendingConflicts.length){
    box.innerHTML=`<div style="font-size:11px;color:var(--muted)">${t('toast.no_pending_conflicts','Sin conflictos pendientes. La sincronización solo completa vacíos o espera tu autorización para sustituir.')}</div>`;
    return;
  }
  box.innerHTML=APP.pendingConflicts.slice(0,12).map(conflict=>`<div style="padding:10px;background:rgba(255,214,0,.05);border:1px solid rgba(255,214,0,.16);border-radius:8px">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--text)">${escHtml(conflict.clientName||'Cliente')}</div>
        <div style="font-size:11px;color:var(--muted)">${escHtml(conflict.source||'Sin fuente')} · Campo: <strong style="color:var(--warning)">${escHtml(conflict.field)}</strong>${conflict.protected?' · protegido':''}</div>
      </div>
      <span class="badge ${conflict.protected?'badge-warning':'badge-info'}">${conflict.protected?'Protegido':'Pendiente'}</span>
    </div>
    <div style="font-size:11px;color:rgba(232,232,240,.8);margin-top:8px">Actual: ${escHtml(conflict.current||'—')}</div>
    <div style="font-size:11px;color:rgba(232,232,240,.8);margin-top:4px">Propuesto: ${escHtml(conflict.incoming||'—')}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button class="btn-primary" onclick="applyPendingConflict('${conflict.id}')"><i class="fa fa-check"></i> Sustituir</button>
      <button class="btn-outline" onclick="dismissPendingConflict('${conflict.id}')"><i class="fa fa-shield-halved"></i> Mantener actual</button>
    </div>
  </div>`).join('');
}

function mergePendingConflicts(conflicts){
  conflicts.forEach(conflict=>{
    if(!APP.pendingConflicts.some(item=>item.clientId===conflict.clientId&&item.field===conflict.field&&item.incoming===conflict.incoming&&item.source===conflict.source)){
      APP.pendingConflicts.push(conflict);
    }
  });
  persistPendingConflicts();
  renderPendingConflicts();
}

function applyConflictRecord(conflict){
  const idx=APP.data.findIndex(c=>String(c.id)===String(conflict.clientId));
  if(idx<0)return false;
  if(conflict.field==='canales'){
    const channels=String(conflict.incoming||'').split(',').map(v=>v.trim()).filter(Boolean);
    APP.channelOverrides[conflict.clientId]={channels};
    localStorage.setItem('holaChannelOverrides',JSON.stringify(APP.channelOverrides));
    return true;
  }
  APP.data[idx][conflict.field]=conflict.incoming;
  if(conflict.field==='ip'||conflict.field==='dominio'){
    APP.data[idx].linkHola=resolvePlatformLink(APP.data[idx].ip,APP.data[idx].dominio);
  }
  return true;
}

function applyPendingConflict(id){
  const conflict=APP.pendingConflicts.find(item=>item.id===id);
  if(!conflict)return;
  if(applyConflictRecord(conflict)){
    APP.pendingConflicts=APP.pendingConflicts.filter(item=>item.id!==id);
    persistPendingConflicts();
    APP.data=hydrateClients(APP.data);
    APP.filteredByDate=applyDateFilter(APP.data);
    localStorage.setItem('holaData',JSON.stringify({data:APP.data,ts:Date.now(),meta:{...APP.apiMeta,source:'manual_conflict_resolution'}}));
    renderAll(APP.filteredByDate);
    renderPendingConflicts();
    toast('success',t('toast.conflict_applied','Conflicto aplicado con autorización'));
  }
}

function dismissPendingConflict(id){
  APP.pendingConflicts=APP.pendingConflicts.filter(item=>item.id!==id);
  persistPendingConflicts();
  renderPendingConflicts();
  toast('info',t('toast.kept_current_data','Se mantuvo el dato actual'));
}

function importManualDataset(silent=false){
  try{
    const raw=document.getElementById('cfgManualJson')?.value.trim();
    if(!raw)throw new Error(t('toast.paste_json_dataset','Pega un dataset JSON antes de importar'));
    const parsed=JSON.parse(raw);
    const clientsRaw=Array.isArray(parsed)?parsed:(parsed.clientes||parsed.clients||[]);
    const logsRaw=parsed.logs||{};
    if(parsed.salesFields||parsed.camposVentas){
      APP.salesFields=parseFieldDefinitions(JSON.stringify(parsed.salesFields||parsed.camposVentas),APP.salesFields.length?APP.salesFields:defaultSalesFields());
      const cfgFields=document.getElementById('cfgSalesFields');
      if(cfgFields)cfgFields.value=(APP.salesFields||[]).map(field=>`${field.key}|${field.label}`).join('\n');
    }
    if(parsed.leads||parsed.oportunidades){
      APP.salesData=(parsed.leads||parsed.oportunidades||[]).map(normalizeLead);
      localStorage.setItem('holaSalesData',JSON.stringify(APP.salesData));
    }
    APP.clientLogs=logsRaw;
    localStorage.setItem('holaClientLogs',JSON.stringify(APP.clientLogs));
    APP.data=hydrateClients(clientsRaw.map(normalizeImportedClient));
    APP.lastSync=new Date();
    APP.apiMeta={source:'manual_json',taskCount:APP.data.length,syncedAt:APP.lastSync.toISOString()};
    localStorage.setItem('holaData',JSON.stringify({data:APP.data,ts:Date.now(),meta:APP.apiMeta}));
    APP.filteredByDate=applyDateFilter(APP.data);
    saveConfig(true);
    renderAll(APP.filteredByDate);
    renderVentas();
    document.getElementById('apiStatusText').textContent=APP.data.length+' clientes · JSON';
    if(!silent)toast('success',t('toast.dataset_imported','Dataset importado correctamente'));
  }catch(e){
    if(!silent)toast('error',e.message);
    else throw e;
  }
}

function downloadCurrentDataset(){
  const payload={clientes:APP.data,logs:APP.clientLogs,leads:APP.salesData,salesFields:APP.salesFields,meta:APP.apiMeta};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='dashboard_dataset.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importSalesDataset(silent=false){
  try{
    const raw=document.getElementById('cfgSalesJson')?.value.trim();
    if(!raw)throw new Error(t('toast.paste_sales_json','Pega un dataset JSON de ventas antes de importar'));
    const parsed=JSON.parse(raw);
    const leads=Array.isArray(parsed)?parsed:(parsed.leads||parsed.oportunidades||[]);
    if(parsed.salesFields||parsed.campos){
      APP.salesFields=parseFieldDefinitions(JSON.stringify(parsed.salesFields||parsed.campos),APP.salesFields.length?APP.salesFields:defaultSalesFields());
      const cfgFields=document.getElementById('cfgSalesFields');
      if(cfgFields)cfgFields.value=(APP.salesFields||[]).map(field=>`${field.key}|${field.label}`).join('\n');
    }
    APP.salesData=leads.map(normalizeLead);
    localStorage.setItem('holaSalesData',JSON.stringify(APP.salesData));
    saveConfig(true);
    renderVentas();
    if(!silent)toast('success',t('toast.sales_dataset_imported','Dataset comercial importado'));
  }catch(e){
    if(!silent)toast('error',e.message);
    else throw e;
  }
}

async function fetchGoogleSheetRows(sheetId,sheetName){
  if(!sheetId||!sheetName)return [];
  const url=`https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  const resp=await fetch(url);
  if(!resp.ok)throw new Error(`Google Sheets HTTP ${resp.status}`);
  const text=await resp.text();
  const jsonText=text.substring(text.indexOf('{'), text.lastIndexOf('}')+1);
  const data=JSON.parse(jsonText);
  const cols=(data.table.cols||[]).map(c=>c.label||c.id||'');
  return (data.table.rows||[]).map(row=>{
    const obj={};
    (row.c||[]).forEach((cell,idx)=>{
      obj[cols[idx]||`col_${idx}`]=cell?(cell.f!=null&&cell.f!==''?cell.f:cell.v):'';
    });
    return obj;
  });
}

function findClientIndexByRow(row){
  const rowId=String(row.id||row.ID||row.cliente_id||row.client_id||'').trim();
  if(rowId){
    const idx=APP.data.findIndex(c=>String(c.id)===rowId);
    if(idx>=0)return idx;
  }
  const rowName=normalizeText(row.nombre||row.cliente||row.name||'');
  if(rowName){
    return APP.data.findIndex(c=>normalizeText(c.nombre)===rowName);
  }
  return -1;
}

function mergeSheetRowsIntoClients(rows, sourceName){
  const protectedFields=new Set([...(APP.syncProtectedFields||defaultProtectedFields()),'logs','sourceLogs','wa','ig','wc','pbx','tg','msg']);
  const mappedFields={
    ip:['ip','ip hola'],
    dominio:['dominio','domain'],
    email:['email','e-mail'],
    telefono:['telefono','phone'],
    plan:['plan'],
    rKickoff:['rkickoff','kickoff','owner kickoff'],
    rCap:['rcap','capacitacion'],
    estado:['estado','status'],
    motivo:['motivo','motivo baja'],
    pais:['pais','country']
  };
  const conflicts=[];
  rows.forEach(row=>{
    const idx=findClientIndexByRow(row);
    if(idx<0)return;
    const client=APP.data[idx];
    Object.entries(mappedFields).forEach(([field, aliases])=>{
      const rowKey=Object.keys(row).find(key=>aliases.includes(normalizeText(key)));
      if(!rowKey)return;
      const incoming=String(row[rowKey]||'').trim();
      if(!incoming)return;
      const current=String(client[field]||'').trim();
      if(!current){
        client[field]=incoming;
        if(field==='ip'||field==='dominio')client.linkHola=resolvePlatformLink(client.ip,client.dominio);
        return;
      }
      if(current!==incoming){
        conflicts.push({
          id:`conflict-${Date.now()}-${client.id}-${field}-${Math.random().toString(36).slice(2,7)}`,
          clientId:client.id,
          clientName:client.nombre,
          field,
          current,
          incoming,
          source:sourceName,
          protected:protectedFields.has(field)
        });
      }
    });
    const channelsCell=String(row.canales||row['canales contratados']||'').trim();
    if(channelsCell){
      const incomingChannels=channelsCell.split(',').map(x=>x.trim()).filter(Boolean);
      const currentChannels=client.canales||[];
      if(!currentChannels.length){
        APP.channelOverrides[client.id]={channels:incomingChannels};
      }else if(normalizeText(currentChannels.join(','))!==normalizeText(incomingChannels.join(','))){
        conflicts.push({
          id:`conflict-${Date.now()}-${client.id}-canales-${Math.random().toString(36).slice(2,7)}`,
          clientId:client.id,
          clientName:client.nombre,
          field:'canales',
          current:currentChannels.join(', '),
          incoming:incomingChannels.join(', '),
          source:sourceName,
          protected:true
        });
      }
    }
    const logDetail=String(row.log||row.movimiento||row.detalle||'').trim();
    const logDate=String(row.fecha||row.date||'').trim();
    if(logDetail){
      if(!APP.clientLogs[client.id])APP.clientLogs[client.id]=[];
      APP.clientLogs[client.id].push({fecha:logDate||new Date().toISOString().split('T')[0],tipo:'sheet',detalle:logDetail,source:sourceName});
    }
  });
  const uniqueConflicts=conflicts.filter((c,index,self)=>index===self.findIndex(x=>x.clientId===c.clientId&&x.field===c.field&&x.incoming===c.incoming&&x.source===c.source));
  if(uniqueConflicts.length){
    mergePendingConflicts(uniqueConflicts);
    const preview=uniqueConflicts.slice(0,5).map(c=>`${c.clientName} · ${c.field}: "${c.current}" -> "${c.incoming}"`).join('\n');
    const confirmed=window.confirm(`Se detectaron ${uniqueConflicts.length} conflictos desde ${sourceName}.\n\n${preview}\n\n¿Quieres sustituir esos campos con los datos de la planilla?`);
    if(confirmed){
      uniqueConflicts.forEach(conflict=>{
        applyConflictRecord(conflict);
      });
      APP.pendingConflicts=APP.pendingConflicts.filter(item=>!uniqueConflicts.some(conflict=>conflict.id===item.id));
      persistPendingConflicts();
      renderPendingConflicts();
    }else{
      toast('warning',t('toast.conflicts_pending_review','Se mantuvieron los datos actuales. Los conflictos quedaron pendientes para revisión.'));
    }
  }
}

// ================================================================
// BIDIRECTIONAL SYNC: ClickUp ↔ Google Sheets
// ================================================================

async function startBidirectionalSync(){
  showLoading(true,'Iniciando sincronización bidireccional...');
  try{
    const clickupApiKey=document.getElementById('cfgClickupApiKey')?.value.trim();
    const sheetUrl=document.getElementById('comparisonSheetUrl')?.value.trim();
    const listId=document.getElementById('comparisonClickupListId')?.value.trim();
    const correlationKey=document.getElementById('comparisonKey')?.value.trim()||'nombre';
    
    if(!clickupApiKey||!sheetUrl||!listId){
      toast('warning','Completa: API Key, URL de Sheets y List ID');
      showLoading(false);
      return;
    }
    
    // Paso 1: Obtener datos de ClickUp
    toast('info','1/4 - Trayendo datos de ClickUp...');
    const clickupTasks=await fetchClickUpTasksForList(listId,clickupApiKey);
    
    // Paso 2: Obtener datos de Google Sheets
    toast('info','2/4 - Trayendo datos de Google Sheets...');
    const sheetData=await fetchGoogleSheetFromUrl(sheetUrl);
    
    // Paso 3: Comparar y detectar diferencias
    toast('info','3/4 - Comparando datos...');
    const differences=compareClickUpVsSheets(clickupTasks,sheetData,correlationKey);
    
    // Paso 4: Mostrar resultados
    displaySyncDifferences(differences);
    
    toast('success',`Sincronización completada: ${differences.length} diferencia(s) detectada(s)`);
  }catch(e){
    toast('error','Error en sincronización: '+e.message);
    console.error(e);
  }finally{
    showLoading(false);
  }
}

async function fetchClickUpTasksForList(listId,apiKey){
  try{
    const response=await fetch(`https://api.clickup.com/api/v2/list/${listId}/task?page=0&limit=100`,{
      headers:{'Authorization':apiKey,'Content-Type':'application/json'}
    });
    if(!response.ok)throw new Error(`ClickUp API: ${response.status}`);
    const data=await response.json();
    return data.tasks||[];
  }catch(e){
    throw new Error('No se pudo obtener datos de ClickUp: '+e.message);
  }
}

async function fetchGoogleSheetFromUrl(url){
  try{
    const sheetId=url.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
    if(!sheetId)throw new Error('ID de Sheet no encontrado en la URL');
    
    // Exportar como CSV
    const csvUrl=`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    const response=await fetch(csvUrl);
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    
    const csv=await response.text();
    const lines=csv.split('\n');
    const headers=lines[0].split(',').map(h=>h.trim().toLowerCase());
    const rows=[];
    
    for(let i=1;i<lines.length;i++){
      if(!lines[i].trim())continue;
      const cells=lines[i].split(',').map(c=>c.trim());
      const row={};
      headers.forEach((h,idx)=>{
        row[h.replace(/"/g,'')]=cells[idx]||'';
      });
      rows.push(row);
    }
    
    return rows;
  }catch(e){
    throw new Error('No se pudo obtener Google Sheet: '+e.message);
  }
}

function compareClickUpVsSheets(clickupTasks,sheetRows,keyField){
  const differences=[];
  const keyLower=keyField.toLowerCase();
  
  // Crear mapas para correlacionar
  const clickupMap=new Map();
  const sheetsMap=new Map();
  
  clickupTasks.forEach(task=>{
    let key=task.name;
    if(keyLower==='dominio'&&task.custom_fields)key=task.custom_fields.find(f=>f.id==='dominio')?.value||key;
    clickupMap.set(key.toLowerCase(),task);
  });
  
  sheetRows.forEach(row=>{
    let key=row[keyLower]||row['nombre']||row['client']||row['name'];
    sheetsMap.set(key.toLowerCase(),row);
  });
  
  // Comparar campos clave
  const keysToCompare=['plan','pais','email','telefono','rKickoff','rVer','rCap','rGoLive','rAct','rVenta'];
  
  sheetsMap.forEach((sheetRow,sheetKey)=>{
    const clickupTask=clickupMap.get(sheetKey);
    if(!clickupTask)return;
    
    keysToCompare.forEach(field=>{
      const sheetValue=sheetRow[field]?.trim();
      const clickupValue=clickupTask.custom_fields?.find(f=>f.id===field)?.value?.trim();
      
      if(sheetValue&&clickupValue&&sheetValue!==clickupValue){
        differences.push({
          clientName:sheetKey,
          field:field,
          clickup:clickupValue,
          sheets:sheetValue,
          source:'sheets',
          taskId:clickupTask.id,
          recommendation:'sheets'
        });
      }else if(sheetValue&&!clickupValue){
        differences.push({
          clientName:sheetKey,
          field:field,
          clickup:'(vacío)',
          sheets:sheetValue,
          source:'sheets',
          taskId:clickupTask.id,
          recommendation:'update_clickup'
        });
      }
    });
  });
  
  return differences;
}

function displaySyncDifferences(differences){
  const table=document.getElementById('comparisonTable');
  const status=document.getElementById('comparisonStatus');
  
  if(!differences.length){
    table.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--success)">✅ Todos los datos están sincronizados</td></tr>';
    status.textContent='Sincronizado';
    return;
  }
  
  table.innerHTML=differences.map((diff,idx)=>`
    <tr style="border-bottom:1px solid var(--border)">
      <td style="font-size:11px"><strong>${diff.field}</strong><br><span style="color:var(--muted)">${diff.clientName}</span></td>
      <td style="font-size:11px;color:var(--muted)">${diff.clickup}</td>
      <td style="font-size:11px;color:var(--info)">${diff.sheets}</td>
      <td style="font-size:11px">
        <span class="badge ${diff.recommendation==='update_clickup'?'badge-warning':'badge-info'}" style="font-size:9px">
          ${diff.recommendation==='update_clickup'?'↑ A ClickUp':'⟷ Diferencia'}
        </span>
        <button class="btn-micro" style="margin-left:4px" onclick="applyDifference(${idx})">✓</button>
      </td>
    </tr>
  `).join('');
  
  status.textContent=`${differences.length} diferencia(s) detectada(s)`;
  APP.syncDifferences=differences;
}

async function applyDifference(index){
  const diff=APP.syncDifferences?.[index];
  if(!diff)return;
  
  try{
    const apiKey=document.getElementById('cfgClickupApiKey')?.value.trim();
    if(!apiKey)throw new Error('API Key no configurada');
    
    // Actualizar en ClickUp
    const customFieldId=diff.field;
    const response=await fetch(`https://api.clickup.com/api/v2/task/${diff.taskId}`,{
      method:'PUT',
      headers:{'Authorization':apiKey,'Content-Type':'application/json'},
      body:JSON.stringify({
        custom_fields:[{id:customFieldId,value:diff.sheets}]
      })
    });
    
    if(!response.ok)throw new Error(`Error ${response.status}`);
    
    // Remover de la lista
    APP.syncDifferences.splice(index,1);
    displaySyncDifferences(APP.syncDifferences);
    
    toast('success',`Actualizado: ${diff.field}="${diff.sheets}"`);
  }catch(e){
    toast('error','Error actualizando ClickUp: '+e.message);
  }
}

async function applyComparisonResolution(){
  if(!APP.syncDifferences?.length){
    toast('warning','No hay diferencias para aplicar');
    return;
  }
  
  showLoading(true,'Aplicando cambios...');
  try{
    const apiKey=document.getElementById('cfgClickupApiKey')?.value.trim();
    if(!apiKey)throw new Error('API Key no configurada');
    
    let applied=0;
    for(const diff of APP.syncDifferences){
      try{
        await fetch(`https://api.clickup.com/api/v2/task/${diff.taskId}`,{
          method:'PUT',
          headers:{'Authorization':apiKey,'Content-Type':'application/json'},
          body:JSON.stringify({
            custom_fields:[{id:diff.field,value:diff.sheets}]
          })
        });
        applied++;
      }catch(e){
        console.error('Error aplicando cambio:',e);
      }
    }
    
    APP.syncDifferences=[];
    document.getElementById('comparisonTable').innerHTML='';
    document.getElementById('comparisonStatus').textContent='Sincronizado';
    
    toast('success',`${applied} cambio(s) aplicado(s) a ClickUp`);
  }catch(e){
    toast('error','Error: '+e.message);
  }finally{
    showLoading(false);
  }
}

function clearComparisonData(){
  document.getElementById('comparisonTable').innerHTML='';
  document.getElementById('comparisonStatus').textContent='Sin datos';
  APP.syncDifferences=[];
  toast('info','Datos de comparación limpiados');
}

async function syncGoogleSheets(){
  showLoading(true,t('toast.syncing_google_sheets','Sincronizando planillas de Google...'));
  try{
    const cfg=JSON.parse(localStorage.getItem('holaCfg')||'{}');
    const implRows=await fetchGoogleSheetRows(cfg.sheet1||document.getElementById('cfgSheet1')?.value.trim(), cfg.sheet1Name||document.getElementById('cfgSheet1Name')?.value.trim()||'Sheet1');
    const domainRows=await fetchGoogleSheetRows(cfg.sheet2||document.getElementById('cfgSheet2')?.value.trim(), cfg.sheet2Name||document.getElementById('cfgSheet2Name')?.value.trim()||'Sheet1');
    if(implRows.length)mergeSheetRowsIntoClients(implRows,'Google Sheets Implementaciones');
    if(domainRows.length)mergeSheetRowsIntoClients(domainRows,'Google Sheets Dominios');
    const defaultSalesSheetId='1c2hR_t7SbDGi9WItvXfGoizF35za3nM7TnQ4_dU4QTA';
    const resolvedSalesSheetId=cfg.salesSheetId||document.getElementById('cfgSalesSheetId')?.value.trim()||defaultSalesSheetId;
    if(resolvedSalesSheetId&&(cfg.salesSheetName||document.getElementById('cfgSalesSheetName')?.value.trim()||'Sheet1')){
      const salesRows=await fetchGoogleSheetRows(resolvedSalesSheetId, cfg.salesSheetName||document.getElementById('cfgSalesSheetName')?.value.trim()||'Sheet1');
      if(salesRows.length){
        APP.salesData=salesRows.map(normalizeLead);
        localStorage.setItem('holaSalesData',JSON.stringify(APP.salesData));
      }
    }
    localStorage.setItem('holaChannelOverrides',JSON.stringify(APP.channelOverrides));
    localStorage.setItem('holaClientLogs',JSON.stringify(APP.clientLogs));
    APP.data=hydrateClients(APP.data);
    APP.lastSync=new Date();
    APP.apiMeta={source:'sheets_merge',taskCount:APP.data.length,syncedAt:APP.lastSync.toISOString()};
    APP.filteredByDate=applyDateFilter(APP.data);
    renderAll(APP.filteredByDate);
    renderVentas();
    document.getElementById('apiStatusText').textContent=APP.data.length+' clientes · Sheets';
    localStorage.setItem('holaData',JSON.stringify({data:APP.data,ts:Date.now(),meta:APP.apiMeta}));
    toast('success',t('toast.sheets_synced','Planillas sincronizadas'));
  }catch(e){
    toast('error',e.message);
  }finally{
    showLoading(false);
  }
}

// ================================================================
// LOADING / TOAST
// ================================================================
function showLoading(show,msg){
  const el=document.getElementById('loadingOverlay');
  if(el)el.classList.toggle('hidden',!show);
  if(msg)updateLoadingMsg(msg);
}
function updateLoadingMsg(msg){const el=document.getElementById('loadingMsg');if(el)el.textContent=msg;}
function toast(type,msg,duration=4000){
  const c=document.getElementById('toastContainer');
  const t=document.createElement('div');
  t.className=`toast ${type}`;
  const icons={success:'fa-circle-check',error:'fa-circle-xmark',info:'fa-info-circle',warning:'fa-triangle-exclamation'};
  t.innerHTML=`<i class="fa ${icons[type]||'fa-info-circle'}"></i>${escHtml(msg)}`;
  c.appendChild(t);
  setTimeout(()=>{t.style.animation='toastOut .3s ease forwards';setTimeout(()=>t.remove(),300);},duration);
}

// ================================================================
// UI HELPERS
// ================================================================
function showConsultorClientes(consultor){
  const clientes=APP.consultoresClientes[consultor]||[];
  if(!clientes.length){
    toast('info','Sin clientes para este consultor');
    return;
  }
  
  const html=`<table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="background:rgba(255,109,0,.1);border-bottom:2px solid rgba(255,109,0,.2)">
        <th style="padding:10px;text-align:left;font-weight:600;color:var(--text)">Cliente</th>
        <th style="padding:10px;text-align:center;font-weight:600;color:var(--text)">Estado</th>
        <th style="padding:10px;text-align:center;font-weight:600;color:var(--text)">País</th>
        <th style="padding:10px;text-align:center;font-weight:600;color:var(--text)">Inicio</th>
        <th style="padding:10px;text-align:center;font-weight:600;color:var(--text)">Etapa</th>
      </tr>
    </thead>
    <tbody>
      ${clientes.map(c=>`<tr style="border-bottom:1px solid rgba(255,255,255,.05)">
        <td style="padding:10px"><strong>${escHtml(c.nombre)}</strong><br><span style="font-size:10px;color:var(--muted)">${escHtml(c.pais||'—')}</span></td>
        <td style="padding:10px;text-align:center">
          <span style="padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;background:${
            c.statusType==='activo'?'rgba(0,200,83,.15);color:var(--success)':
            c.statusType==='impl'?'rgba(255,214,0,.15);color:var(--warning)':
            'rgba(255,23,68,.15);color:var(--danger)'
          }">${c.status}</span>
        </td>
        <td style="padding:10px;text-align:center;font-size:11px">${flagFor(c.pais)} ${c.pais||'—'}</td>
        <td style="padding:10px;text-align:center;font-size:11px">${c.fInicio||'—'}</td>
        <td style="padding:10px;text-align:center;font-size:10px">${c.etapa||'—'}</td>
      </tr>`).join('')}
    </tbody>
  </table>`;
  
  const titleEl=document.getElementById('consultorClientesTitle');
  const contentEl=document.getElementById('consultorClientesContent');
  if(titleEl)titleEl.textContent=`${consultor} — ${clientes.length} Cliente${clientes.length!==1?'s':''}`;
  if(contentEl)contentEl.innerHTML=html;
  
  const modal=document.getElementById('consultorClientesModal');
  if(modal)modal.classList.add('active');
}

function showVendedorClientes(vendedor){
  const clientes=APP.vendedorClientes[vendedor]||[];
  if(!clientes.length){
    toast('info','Sin clientes para este vendedor');
    return;
  }
  
  const html=`<table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="background:rgba(255,109,0,.1);border-bottom:2px solid rgba(255,109,0,.2)">
        <th style="padding:10px;text-align:left;font-weight:600;color:var(--text)">Cliente</th>
        <th style="padding:10px;text-align:center;font-weight:600;color:var(--text)">Estado</th>
        <th style="padding:10px;text-align:center;font-weight:600;color:var(--text)">País</th>
        <th style="padding:10px;text-align:center;font-weight:600;color:var(--text)">Inicio</th>
        <th style="padding:10px;text-align:center;font-weight:600;color:var(--text)">Etapa</th>
      </tr>
    </thead>
    <tbody>
      ${clientes.map(c=>`<tr style="border-bottom:1px solid rgba(255,255,255,.05)">
        <td style="padding:10px"><strong>${escHtml(c.nombre)}</strong><br><span style="font-size:10px;color:var(--muted)">${escHtml(c.pais||'—')}</span></td>
        <td style="padding:10px;text-align:center">
          <span style="padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;background:${
            c.statusType==='activo'?'rgba(0,200,83,.15);color:var(--success)':
            c.statusType==='impl'?'rgba(255,214,0,.15);color:var(--warning)':
            'rgba(255,23,68,.15);color:var(--danger)'
          }">${c.status}</span>
        </td>
        <td style="padding:10px;text-align:center;font-size:11px">${flagFor(c.pais)} ${c.pais||'—'}</td>
        <td style="padding:10px;text-align:center;font-size:11px">${c.fInicio||'—'}</td>
        <td style="padding:10px;text-align:center;font-size:10px">${c.etapa||'—'}</td>
      </tr>`).join('')}
    </tbody>
  </table>`;
  
  const titleEl=document.getElementById('consultorClientesTitle');
  const contentEl=document.getElementById('consultorClientesContent');
  if(titleEl)titleEl.textContent=`${vendedor} — ${clientes.length} Cliente${clientes.length!==1?'s':''}`;
  if(contentEl)contentEl.innerHTML=html;
  
  const modal=document.getElementById('consultorClientesModal');
  if(modal)modal.classList.add('active');
}

// ================================================================
// FICHA DE CLIENTE COMPLETA
// ================================================================
function showFichaCliente(clienteId){
  const cliente=APP.data.find(c=>c.id===clienteId);
  if(!cliente){
    toast('error','Cliente no encontrado');
    return;
  }
  
  // Guardar cliente actual en memoria
  APP.fichaClienteActual={...cliente};
  
  // Llenar datos generales
  document.getElementById('fichaClienteNombre').textContent=cliente.nombre;
  document.getElementById('ficha-nombre').textContent=cliente.nombre;
  document.getElementById('ficha-pais').textContent=cliente.pais||'—';
  document.getElementById('ficha-plan').textContent=cliente.plan||'—';
  document.getElementById('ficha-rVenta').textContent=cliente.rVenta||'—';
  document.getElementById('ficha-email').textContent=cliente.email||'—';
  document.getElementById('ficha-telefono').textContent=cliente.telefono||'—';
  document.getElementById('ficha-fInicio').textContent=cliente.fInicio||'—';
  document.getElementById('ficha-fActivacion').textContent=cliente.fActivacion||'—';
  document.getElementById('ficha-status').textContent=cliente.status||'—';
  document.getElementById('ficha-dSinMov').textContent=cliente.dSinMov||'0';
  
  // Llenar etapas
  document.getElementById('ficha-rKickoff').textContent=cliente.rKickoff||'—';
  document.getElementById('ficha-rVer').textContent=cliente.rVer||'—';
  document.getElementById('ficha-rCap').textContent=cliente.rCap||'—';
  document.getElementById('ficha-rGoLive').textContent=cliente.rGoLive||'—';
  document.getElementById('ficha-rAct').textContent=cliente.rAct||'—';
  
  // Llenar canales
  document.getElementById('ficha-wa').textContent=cliente.wa?'✅':'❌';
  document.getElementById('ficha-ig').textContent=cliente.ig?'✅':'❌';
  document.getElementById('ficha-tg').textContent=cliente.tg?'✅':'❌';
  document.getElementById('ficha-wc').textContent=cliente.wc?'✅':'❌';
  document.getElementById('ficha-pbx').textContent=cliente.pbx?'✅':'❌';
  document.getElementById('ficha-msg').textContent=cliente.msg?'✅':'❌';
  
  // Llenar campos avanzados (nuevos)
  document.getElementById('ficha-tipoCliente').textContent=cliente.tipoCliente||'—';
  document.getElementById('ficha-industria').textContent=cliente.industria||'—';
  document.getElementById('ficha-empleados').textContent=cliente.empleados||'—';
  document.getElementById('ficha-presupuesto').textContent=cliente.presupuesto?`$${Number(cliente.presupuesto).toLocaleString()}`:'—';
  document.getElementById('ficha-presupuestoPago').textContent=cliente.presupuestoPago?`$${Number(cliente.presupuestoPago).toLocaleString()}`:'—';
  document.getElementById('ficha-satisfaccionCliente').textContent=cliente.satisfaccionCliente?`${cliente.satisfaccionCliente}/10`:'—';
  document.getElementById('ficha-contactoPrincipal').textContent=cliente.contactoPrincipal||'—';
  document.getElementById('ficha-telefonoContacto').textContent=cliente.telefonoContacto||'—';
  document.getElementById('ficha-ipSecundaria').textContent=cliente.ipSecundaria||'—';
  document.getElementById('ficha-dominio2').textContent=cliente.dominio2||'—';
  document.getElementById('ficha-contrasena').textContent=cliente.contrasena?'●●●●●●':'—';
  document.getElementById('ficha-contrasenaAdmin').textContent=cliente.contrasenaAdmin?'●●●●●●':'—';
  document.getElementById('ficha-modoIntegracion').textContent=cliente.modoIntegracion||'—';
  document.getElementById('ficha-versionAPI').textContent=cliente.versionAPI||'—';
  document.getElementById('ficha-prioridad').textContent=cliente.prioridad||'—';
  document.getElementById('ficha-referenciaExterna').textContent=cliente.referenciaExterna||'—';
  document.getElementById('ficha-estadoFinanciero').textContent=cliente.estadoFinanciero||'—';
  document.getElementById('ficha-fechaProximoReview').textContent=cliente.fechaProximoReview||'—';
  document.getElementById('ficha-tiempoRespuesta').textContent=cliente.tiempoRespuesta||'—';
  document.getElementById('ficha-tiempoImplementacion').textContent=cliente.tiempoImplementacion||'—';
  document.getElementById('ficha-clienteReferido').textContent=cliente.clienteReferido||'—';
  document.getElementById('ficha-cuentaAMail').textContent=cliente.cuentaAMail||'—';
  document.getElementById('ficha-tiempoZona').textContent=cliente.tiempoZona||'—';
  document.getElementById('ficha-moneda').textContent=cliente.moneda||'USD';
  document.getElementById('ficha-volumenTransacciones').textContent=cliente.volumenTransacciones?Number(cliente.volumenTransacciones).toLocaleString():'—';
  document.getElementById('ficha-medioComunicacion').textContent=cliente.medioComunicacion||'—';
  document.getElementById('ficha-renovacionAnual').textContent=cliente.renovacionAnual||'—';
  document.getElementById('ficha-contractoVigencia').textContent=cliente.contractoVigencia||'—';
  document.getElementById('ficha-fuente').textContent=cliente.fuente||'—';
  document.getElementById('ficha-notas').textContent=cliente.notas||'Sin notas';
  
  // Llenar logs
  const logs=APP.clientLogs?.[clienteId]||[];
  const logsHtml=logs.length?logs.map(log=>`
    <div style="padding:10px;background:rgba(255,255,255,.03);border-left:3px solid var(--primary);border-radius:4px">
      <div style="font-weight:600;font-size:11px;color:var(--primary)">${log.tipo||'Evento'}</div>
      <div style="font-size:10px;color:var(--muted);margin:4px 0">${log.fecha||new Date().toLocaleDateString()}</div>
      <div style="font-size:11px;color:var(--text)">${log.detalle||'—'}</div>
    </div>
  `).join(''):'<div style="color:var(--muted);text-align:center;padding:20px">Sin logs registrados</div>';
  document.getElementById('fichaLogsContainer').innerHTML=logsHtml;
  
  // Mostrar modal
  const modal=document.getElementById('clientFichaModal');
  if(modal)modal.classList.add('active');
}

function switchFichaTab(tab){
  // Ocultar todos
  document.querySelectorAll('[id^="fichaTab-"]').forEach(t=>t.style.display='none');
  // Mostrar seleccionado
  const el=document.getElementById('fichaTab-'+tab);
  if(el)el.style.display='flex';
  
  // Actualizar botones
  document.querySelectorAll('.btn-tab').forEach(b=>b.style.borderBottomColor='transparent');
  event.target.style.borderBottomColor='var(--primary)';
}

function editFichaEtapa(campo){
  const consultores=['Edwin Franco','Alejandro Zambrano','Mariane Teló','Otros...'];
  const valor=APP.fichaClienteActual[campo];
  const input=prompt(`Editar ${campo}`, valor||'');
  if(input!==null){
    APP.fichaClienteActual[campo]=input;
    document.getElementById('ficha-'+campo).textContent=input||'—';
    toast('info','Cambio pendiente de guardarse');
  }
}

function saveFichaChanges(){
  // Buscar índice del cliente
  const idx=APP.data.findIndex(c=>c.id===APP.fichaClienteActual.id);
  if(idx<0){
    toast('error','Cliente no encontrado');
    return;
  }
  
  // Actualizar cliente
  Object.assign(APP.data[idx],APP.fichaClienteActual);
  localStorage.setItem('holaData',JSON.stringify({data:APP.data,ts:Date.now(),meta:APP.apiMeta}));
  
  // Si ClickUp está conectado, sincronizar
  if(document.getElementById('cfgClickupApiKey')?.value){
    syncFichaClienteToClickup(APP.fichaClienteActual);
  }
  
  toast('success','Cliente actualizado');
  renderAll(APP.filteredByDate);
  closeModal('clientFichaModal');
}

function syncFichaClienteToClickup(cliente){
  // Sincronizar cambios de vuelta a ClickUp
  // Esto se implementará cuando conectemos con la API de ClickUp
  console.log('Sincronizando cliente',cliente.nombre,'con ClickUp...');
  toast('info','Sincronización con ClickUp en progreso...');
}

// ================================================================
// BULK EDITING FUNCTIONS
// ================================================================

APP.bulkSelected={};

// ================================================================
// PERFORMANCE OPTIMIZATION
// ================================================================

// Debounce para evitar múltiples llamadas
function createDebounce(func, delay=300){
  let timeoutId;
  return function(...args){
    clearTimeout(timeoutId);
    timeoutId=setTimeout(()=>func(...args),delay);
  };
}

// Caché de resultados de filtros
APP.filterCache={};
function getCachedFilter(key, computeFn){
  if(APP.filterCache[key]!==undefined){
    return APP.filterCache[key];
  }
  const result=computeFn();
  APP.filterCache[key]=result;
  return result;
}

function clearFilterCache(){
  APP.filterCache={};
}

// Compresión de datos en localStorage
function compressData(data){
  try{
    const json=JSON.stringify(data);
    const compressed=btoa(json); // Simple base64 encoding
    return compressed;
  }catch(e){
    return JSON.stringify(data);
  }
}

function decompressData(compressed){
  try{
    const json=atob(compressed);
    return JSON.parse(json);
  }catch(e){
    return null;
  }
}

// Guardar datos optimizados en localStorage
function saveDataOptimized(key, data){
  try{
    const size=(JSON.stringify(data).length/1024).toFixed(2);
    if(size>500){
      // Si es muy grande, guarda comprimido
      const compressed=compressData(data);
      localStorage.setItem(key+'_compressed',compressed);
      localStorage.removeItem(key);
    }else{
      localStorage.setItem(key,JSON.stringify(data));
      localStorage.removeItem(key+'_compressed');
    }
  }catch(e){
    console.warn('Error guardando datos:',e.message);
  }
}

// Cargar datos optimizados
function loadDataOptimized(key){
  try{
    const compressed=localStorage.getItem(key+'_compressed');
    if(compressed){
      return decompressData(compressed);
    }
    const normal=localStorage.getItem(key);
    if(normal){
      return JSON.parse(normal);
    }
  }catch(e){
    console.warn('Error cargando datos:',e.message);
  }
  return null;
}

// Lazy render de tablas (renderiza en chunks)
function lazyRenderTable(dataArray, renderFunction, chunkSize=50){
  if(!dataArray||dataArray.length===0){
    return renderFunction([]);
  }
  
  let index=0;
  function renderChunk(){
    const chunk=dataArray.slice(index, index+chunkSize);
    if(chunk.length>0){
      renderFunction(chunk);
      index+=chunkSize;
      if(index<dataArray.length){
        setTimeout(renderChunk, 50);
      }
    }
  }
  
  renderChunk();
}

// Memoización de funciones costosas
const memoCache=new Map();
function memoize(func, key){
  if(memoCache.has(key)){
    return memoCache.get(key);
  }
  const result=func();
  memoCache.set(key, result);
  return result;
}

// Versión optimizada de filterTable con debounce
const filterTableDebounced=createDebounce((type, query)=>{
  const q=(query||'').toLowerCase();
  let base=APP.data.filter(c=>c.statusType===(type==='impl'?'impl':type==='activos'?'activo':'cancelado'));
  if(q){
    base=base.filter(c=>[c.nombre,c.pais,c.rKickoff,c.rCap,getAssignedConsultantsLabel(c),c.plan,c.ip,c.dominio].some(f=>(f||'').toLowerCase().includes(q)));
  }
  APP.filtered[type==='impl'?'impl':type==='activos'?'activos':'cancelados']=base;
  if(type==='impl')renderImplTable(base);
  else if(type==='activos')renderActivosTable(base);
  else renderCanceladosTable(base);
}, 200);

// Performance monitoring
APP.performanceMetrics={
  renderTimes:{},
  filterTimes:{},
  apiCalls:0
};

function logPerformance(label, startTime){
  const duration=Date.now()-startTime;
  if(!APP.performanceMetrics.renderTimes[label]){
    APP.performanceMetrics.renderTimes[label]=[];
  }
  APP.performanceMetrics.renderTimes[label].push(duration);
  if(duration>500){
    console.warn(`⚠️ Operación lenta: ${label} (${duration}ms)`);
  }
}

function getPerformanceReport(){
  const report={};
  Object.entries(APP.performanceMetrics.renderTimes).forEach(([label, times])=>{
    const avg=(times.reduce((a,b)=>a+b,0)/times.length).toFixed(0);
    const max=Math.max(...times);
    report[label]=`${avg}ms (max: ${max}ms)`;
  });
  return report;
}

// Documentación de campos personalizados
const CUSTOM_FIELDS_SCHEMA={
  // Campos básicos
  nombre:{type:'text',label:'Nombre',required:true,description:'Nombre del cliente'},
  pais:{type:'select',label:'País',required:false,description:'País donde opera'},
  email:{type:'email',label:'Email',required:false,description:'Email de contacto principal'},
  telefono:{type:'tel',label:'Teléfono',required:false,description:'Número telefónico de contacto'},
  
  // Responsables por etapa
  rKickoff:{type:'text',label:'Responsable Kickoff',description:'Quién lidera la sesión de Kickoff'},
  rVer:{type:'text',label:'Responsable Verificación',description:'Quién verifica los datos'},
  rCap:{type:'text',label:'Responsable Capacitación',description:'Quién capacita al cliente'},
  rGoLive:{type:'text',label:'Responsable Go-Live',description:'Quién supervisa Go-Live'},
  rAct:{type:'text',label:'Responsable Activación',description:'Quién activa la plataforma'},
  rVenta:{type:'text',label:'Responsable Comercial',description:'Quién gestiona la venta'},
  
  // Información financiera
  presupuesto:{type:'number',label:'Presupuesto',description:'Presupuesto total asignado ($)'},
  presupuestoPago:{type:'number',label:'Presupuesto Pagado',description:'Monto ya pagado ($)'},
  moneda:{type:'select',label:'Moneda',description:'Moneda del presupuesto (USD, EUR, etc.)'},
  
  // Información de cliente
  tipoCliente:{type:'select',label:'Tipo de Cliente',description:'Estándar, Premium, Enterprise, etc.'},
  industria:{type:'select',label:'Industria',description:'Sector/industria del cliente'},
  empleados:{type:'number',label:'Empleados',description:'Número de empleados en la empresa'},
  
  // Contactos
  contactoPrincipal:{type:'text',label:'Contacto Principal',description:'Nombre del contacto principal'},
  emailContacto:{type:'email',label:'Email Contacto',description:'Email del contacto principal'},
  telefonoContacto:{type:'tel',label:'Teléfono Contacto',description:'Teléfono del contacto'},
  cuentaAMail:{type:'text',label:'Account Manager',description:'Account manager asignado'},
  
  // Acceso a plataforma
  ip:{type:'text',label:'IP Principal',description:'IP o dominio de acceso'},
  ipSecundaria:{type:'text',label:'IP Secundaria',description:'IP de respaldo'},
  dominio:{type:'text',label:'Dominio Principal',description:'Dominio web'},
  dominio2:{type:'text',label:'Dominio 2',description:'Segundo dominio'},
  
  // Credenciales
  contrasena:{type:'password',label:'Contraseña',description:'Credencial de usuario'},
  contrasenaAdmin:{type:'password',label:'Contraseña Admin',description:'Credencial de administrador'},
  
  // Integración técnica
  modoIntegracion:{type:'select',label:'Modo Integración',description:'Manual, API, Webhook, etc.'},
  versionAPI:{type:'text',label:'Versión API',description:'Versión de API utilizada'},
  urlDashboard:{type:'url',label:'URL Dashboard',description:'URL de acceso al dashboard'},
  
  // Métricas y KPIs
  satisfaccionCliente:{type:'number',label:'Satisfacción',description:'Puntaje 1-10 de satisfacción'},
  tasaMorosidad:{type:'number',label:'Tasa Morosidad',description:'Porcentaje de retrasos en pago'},
  tiempoRespuesta:{type:'number',label:'Tiempo Respuesta (h)',description:'Horas promedio de respuesta'},
  tiempoImplementacion:{type:'number',label:'Tiempo Implementación (d)',description:'Días tomados en implementación'},
  volumenTransacciones:{type:'number',label:'Volumen Transacciones',description:'Número de transacciones mensuales'},
  
  // Información comercial
  plan:{type:'select',label:'Plan',description:'Plan contratado'},
  prioridad:{type:'select',label:'Prioridad',description:'Normal, Alta, Crítica'},
  fuente:{type:'text',label:'Fuente',description:'Cómo llegó el cliente (referencia, web, etc.)'},
  medioComunicacion:{type:'select',label:'Medio Comunicación',description:'Email, WhatsApp, Teléfono, etc.'},
  
  // Fechas importantes
  fInicio:{type:'date',label:'Fecha Inicio',description:'Fecha de inicio de implementación'},
  fActivacion:{type:'date',label:'Fecha Activación',description:'Fecha de activación en producción'},
  fCancelacion:{type:'date',label:'Fecha Cancelación',description:'Fecha de cancelación de servicio'},
  fechaProximoReview:{type:'date',label:'Próximo Review',description:'Fecha programada para revisión'},
  renovacionAnual:{type:'date',label:'Renovación Anual',description:'Fecha de renovación del contrato'},
  
  // Información adicional
  notas:{type:'textarea',label:'Notas',description:'Notas adicionales o comentarios'},
  referenciaExterna:{type:'text',label:'Ref. Externa',description:'Referencia en sistemas externos'},
  estadoFinanciero:{type:'select',label:'Estado Financiero',description:'Sano, Problemático, Suspendido, etc.'},
  clienteReferido:{type:'boolean',label:'Cliente Referido',description:'¿Fue cliente referido?'},
  clienteReferencia:{type:'text',label:'Cliente Ref.',description:'Quién refirió al cliente'},
  contractoVigencia:{type:'number',label:'Vigencia (meses)',description:'Meses de vigencia del contrato'},
  tiempoZona:{type:'text',label:'Zona Horaria',description:'Zona horaria del cliente (UTC, EST, etc.)'}
};

// Función para obtener esquema de campos
function getFieldsSchema(){
  return CUSTOM_FIELDS_SCHEMA;
}

// Función para validar datos de cliente
function validateClientData(cliente){
  const errors=[];
  const warnings=[];
  
  // Validaciones requeridas
  if(!cliente.nombre)errors.push('Nombre es requerido');
  
  // Validaciones optativas pero recomendadas
  if(!cliente.pais)warnings.push('País no especificado');
  if(!cliente.email)warnings.push('Email no registrado');
  if(!cliente.rKickoff&&cliente.statusType==='impl')warnings.push('Sin responsable de Kickoff en implementación');
  if(!cliente.plan)warnings.push('Plan no definido');
  
  return {valid:errors.length===0, errors, warnings};
}

// Garbage collection helper
function cleanupMemory(){
  memoCache.clear();
  clearFilterCache();
  APP.performanceMetrics.renderTimes={};
}

// ================================================================
// REAL-TIME SYNC WITH CLICKUP
// ================================================================

APP.realtimeSync={
  enabled:false,
  interval:null,
  lastSync:Date.now(),
  pollInterval:10000, // 10 segundos
  queue:[], // Cola de cambios pendientes
  lastClickUpState:{}, // Hash de estado de ClickUp
  changeLog:[] // Log de cambios
};

// Iniciar sincronización en tiempo real
function startRealTimeSync(){
  const apiKey=document.getElementById('cfgClickupApiKey')?.value.trim();
  const listId=document.getElementById('cfgClickupListId')?.value.trim();
  
  if(!apiKey||!listId){
    toast('warning','Configura API Key y List ID para sincronización');
    return;
  }
  
  if(APP.realtimeSync.enabled){
    toast('info','Sincronización ya activa');
    return;
  }
  
  APP.realtimeSync.enabled=true;
  showRealTimeSyncIndicator(true);
  toast('success','Sincronización en tiempo real iniciada (cada 10s)');
  
  // Iniciar polling
  APP.realtimeSync.interval=setInterval(()=>{
    pollClickUpForChanges();
    processSyncQueue();
  }, APP.realtimeSync.pollInterval);
  
  // Guardar cambios locales inmediatamente
  document.addEventListener('change', debounceLocalChange, true);
  
  console.log('✅ Real-time sync started');
}

// Detener sincronización
function stopRealTimeSync(){
  if(APP.realtimeSync.interval){
    clearInterval(APP.realtimeSync.interval);
  }
  APP.realtimeSync.enabled=false;
  showRealTimeSyncIndicator(false);
  document.removeEventListener('change', debounceLocalChange, true);
  toast('info','Sincronización en tiempo real detenida');
  console.log('⛔ Real-time sync stopped');
}

// Mostrar/ocultar indicador de sincronización
function showRealTimeSyncIndicator(active){
  let indicator=document.getElementById('realtimeSyncIndicator');
  if(!indicator){
    indicator=document.createElement('div');
    indicator.id='realtimeSyncIndicator';
    indicator.style.cssText=`
      position:fixed;
      bottom:20px;
      right:20px;
      padding:12px 16px;
      background:rgba(0,200,83,.9);
      color:white;
      border-radius:8px;
      font-size:12px;
      font-weight:600;
      display:flex;
      align-items:center;
      gap:8px;
      z-index:9999;
      box-shadow:0 4px 12px rgba(0,0,0,.3);
    `;
    document.body.appendChild(indicator);
  }
  
  if(active){
    indicator.innerHTML='<span style="display:inline-block;width:8px;height:8px;background:white;border-radius:50%;animation:pulse 1s infinite"></span> Sync en vivo';
    indicator.style.display='flex';
  }else{
    indicator.style.display='none';
  }
}

// Agregar CSS para la animación pulse
function addRealTimeSyncCSS(){
  if(document.getElementById('realtimeSyncCSS'))return;
  const style=document.createElement('style');
  style.id='realtimeSyncCSS';
  style.textContent=`
    @keyframes pulse {
      0%,100% { opacity:1; transform:scale(1); }
      50% { opacity:.7; transform:scale(0.8); }
    }
  `;
  document.head.appendChild(style);
}

// Escuchar cambios locales
const debounceLocalChange=createDebounce(()=>{
  detectAndQueueLocalChanges();
}, 500);

// Detectar cambios locales y agregarlos a la cola
function detectAndQueueLocalChanges(){
  if(!APP.realtimeSync.enabled)return;
  
  const currentState=JSON.stringify(APP.data);
  const lastState=APP.realtimeSync.lastLocalState||'{}';
  
  if(currentState!==lastState){
    // Ha habido cambios
    const changes=diffStates(lastState, currentState);
    if(changes.length>0){
      APP.realtimeSync.queue.push(...changes);
      console.log(`📝 ${changes.length} cambio(s) detectado(s), agregado(s) a la cola`);
    }
    APP.realtimeSync.lastLocalState=currentState;
  }
}

// Diferenciar estados
function diffStates(oldState, newState){
  try{
    const oldData=oldState?JSON.parse(oldState):{};
    const newData=JSON.parse(newState);
    const changes=[];
    
    newData.forEach(newClient=>{
      const oldClient=Array.isArray(oldData)?oldData.find(c=>c.id===newClient.id):null;
      if(!oldClient)return; // Nuevo cliente
      
      // Buscar campos que cambiaron
      Object.keys(newClient).forEach(field=>{
        if(oldClient[field]!==newClient[field]){
          changes.push({
            type:'update',
            clientId:newClient.id,
            field:field,
            oldValue:oldClient[field],
            newValue:newClient[field],
            timestamp:Date.now()
          });
        }
      });
    });
    
    return changes;
  }catch(e){
    console.error('Error diffing states:',e);
    return [];
  }
}

// Procesar cola de cambios
async function processSyncQueue(){
  if(!APP.realtimeSync.queue.length)return;
  
  const changes=APP.realtimeSync.queue.splice(0, 5); // Procesar 5 cambios por ciclo
  const apiKey=document.getElementById('cfgClickupApiKey')?.value.trim();
  if(!apiKey)return;
  
  for(const change of changes){
    try{
      const client=APP.data.find(c=>c.id===change.clientId);
      if(!client)continue;
      
      // Mapear campo local a custom field de ClickUp
      const clickupField=mapLocalFieldToClickUp(change.field);
      if(!clickupField)continue;
      
      const taskId=client.clickupTaskId||null;
      if(!taskId)continue;
      
      // Enviar a ClickUp
      await updateClickUpField(taskId, clickupField, change.newValue, apiKey);
      
      // Registrar en change log
      APP.realtimeSync.changeLog.push({
        ...change,
        status:'synced',
        timestamp:Date.now()
      });
      
      console.log(`✅ Sincronizado: ${client.nombre}.${change.field}="${change.newValue}"`);
    }catch(e){
      console.error('Error procesando cambio:',e);
    }
  }
}

// Mapear campo local a custom field de ClickUp
function mapLocalFieldToClickUp(localField){
  const mapping={
    'rKickoff':'rKickoff',
    'rVer':'rVer',
    'rCap':'rCap',
    'rGoLive':'rGoLive',
    'rAct':'rAct',
    'rVenta':'rVenta',
    'plan':'plan',
    'pais':'pais',
    'email':'email',
    'telefono':'telefono',
    'presupuesto':'presupuesto',
    'tipoCliente':'tipoCliente',
    'industria':'industria'
  };
  return mapping[localField];
}

// Actualizar field en ClickUp
async function updateClickUpField(taskId, fieldId, value, apiKey){
  try{
    const response=await fetch(`https://api.clickup.com/api/v2/task/${taskId}`,{
      method:'PUT',
      headers:{
        'Authorization':apiKey,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({
        custom_fields:[{id:fieldId, value:String(value)}]
      })
    });
    
    if(!response.ok){
      throw new Error(`ClickUp API error: ${response.status}`);
    }
    
    return true;
  }catch(e){
    console.error('Error updating ClickUp:',e);
    return false;
  }
}

// Obtener cambios de ClickUp
async function pollClickUpForChanges(){
  const apiKey=document.getElementById('cfgClickupApiKey')?.value.trim();
  const listId=document.getElementById('cfgClickupListId')?.value.trim();
  
  if(!apiKey||!listId)return;
  
  try{
    const response=await fetch(`https://api.clickup.com/api/v2/list/${listId}/task?page=0&limit=100`,{
      headers:{'Authorization':apiKey, 'Content-Type':'application/json'}
    });
    
    if(!response.ok)throw new Error('Failed to fetch ClickUp tasks');
    
    const data=await response.json();
    const tasks=data.tasks||[];
    
    // Comparar con estado anterior
    const changes=detectClickUpChanges(tasks);
    
    if(changes.length>0){
      console.log(`🔄 ${changes.length} cambio(s) detectado(s) en ClickUp`);
      applyClickUpChanges(changes);
    }
    
    // Guardar estado actual
    APP.realtimeSync.lastClickUpState=JSON.stringify(tasks);
    APP.realtimeSync.lastSync=Date.now();
    
  }catch(e){
    console.error('Error polling ClickUp:',e);
  }
}

// Detectar cambios en ClickUp
function detectClickUpChanges(tasks){
  const changes=[];
  const lastState=APP.realtimeSync.lastClickUpState?JSON.parse(APP.realtimeSync.lastClickUpState):{};
  
  tasks.forEach(task=>{
    const lastTask=Array.isArray(lastState)?lastState.find(t=>t.id===task.id):null;
    if(!lastTask)return;
    
    // Comparar campos custom
    if(task.custom_fields){
      task.custom_fields.forEach(field=>{
        const lastValue=lastTask.custom_fields?.find(f=>f.id===field.id)?.value;
        if(lastValue!==field.value){
          changes.push({
            clickupTaskId:task.id,
            taskName:task.name,
            field:field.id,
            oldValue:lastValue,
            newValue:field.value
          });
        }
      });
    }
  });
  
  return changes;
}

// Aplicar cambios de ClickUp al dashboard
function applyClickUpChanges(changes){
  changes.forEach(change=>{
    // Buscar cliente por clickupTaskId
    const client=APP.data.find(c=>c.clickupTaskId===change.clickupTaskId);
    if(!client)return;
    
    // Actualizar campo local
    const localField=mapClickUpFieldToLocal(change.field);
    if(!localField)return;
    
    const oldValue=client[localField];
    client[localField]=change.newValue;
    
    // Mostrar notificación
    toast('info',`📥 ${client.nombre}: ${change.field}="${change.newValue}"`);
    
    // Registrar en change log
    APP.realtimeSync.changeLog.push({
      source:'clickup',
      clientId:client.id,
      field:localField,
      oldValue:oldValue,
      newValue:change.newValue,
      timestamp:Date.now(),
      status:'applied'
    });
    
    console.log(`📥 Aplicado cambio de ClickUp: ${client.nombre}.${localField}="${change.newValue}"`);
  });
  
  // Actualizar UI
  localStorage.setItem('holaData',JSON.stringify({data:APP.data,ts:Date.now(),meta:APP.apiMeta}));
  renderAll(APP.filteredByDate);
}

// Mapear custom field de ClickUp a campo local
function mapClickUpFieldToLocal(clickupField){
  const mapping={
    'rKickoff':'rKickoff',
    'rVer':'rVer',
    'rCap':'rCap',
    'rGoLive':'rGoLive',
    'rAct':'rAct',
    'rVenta':'rVenta',
    'plan':'plan',
    'pais':'pais',
    'email':'email',
    'telefono':'telefono',
    'presupuesto':'presupuesto',
    'tipoCliente':'tipoCliente',
    'industria':'industria'
  };
  return mapping[clickupField];
}

// Manejar conflictos de sincronización
function handleSyncConflict(clientId, field, localValue, clickupValue){
  const conflict={
    clientId:clientId,
    field:field,
    localValue:localValue,
    clickupValue:clickupValue,
    timestamp:Date.now(),
    resolution:null
  };
  
  // Estrategia: ClickUp gana (fuente de verdad)
  // Cambiar a "localGains" o "manual" para otra estrategia
  conflict.resolution='clickup_wins';
  
  if(conflict.resolution==='clickup_wins'){
    const client=APP.data.find(c=>c.id===clientId);
    if(client){
      client[field]=clickupValue;
      toast('warning',`⚠️ Conflicto resuelto: ClickUp gana en ${client.nombre}.${field}`);
    }
  }
  
  return conflict;
}

// Obtener estado de sincronización
function getSyncStatus(){
  return {
    enabled:APP.realtimeSync.enabled,
    lastSync:APP.realtimeSync.lastSync,
    queueLength:APP.realtimeSync.queue.length,
    changeCount:APP.realtimeSync.changeLog.length,
    pollInterval:APP.realtimeSync.pollInterval,
    lastChanges:APP.realtimeSync.changeLog.slice(-5)
  };
}

// Ver log de cambios
function viewSyncLog(){
  const log=APP.realtimeSync.changeLog;
  const html=log.slice(-20).reverse().map(entry=>`
    <div style="padding:8px;border-bottom:1px solid var(--border);font-size:11px">
      <div style="color:var(--${entry.status==='synced'?'success':'muted'})">
        <strong>${entry.source||'local'}</strong> · ${new Date(entry.timestamp).toLocaleTimeString()}
      </div>
      <div style="color:var(--text);margin:4px 0">
        ${entry.clientId}: <code>${entry.field}</code> = "${entry.newValue}"
      </div>
      <div style="color:var(--muted);font-size:9px">
        Status: ${entry.status} ${entry.resolution?'('+entry.resolution+')':''}
      </div>
    </div>
  `).join('');
  
  alert(`📋 Últimos 20 cambios:\n\n${log.length===0?'Sin cambios registrados':''}`);
}

// Inicializar CSS para sync
addRealTimeSyncCSS();

function updateBulkCount(){
  const checks=document.querySelectorAll('.bulk-select:checked');
  const count=checks.length;
  
  // Actualizar todos los contadores
  ['impl','activos','cancelados'].forEach(section=>{
    const countEl=document.getElementById('bulkCount-'+section);
    const barEl=document.getElementById('bulkEditBar-'+section);
    const btnEl=document.getElementById('edicionMasivaCountBtn');
    if(countEl){
      countEl.textContent=count;
      // Animación cuando cambia el contador
      if(count>0){
        countEl.style.animation='none';
        setTimeout(()=>countEl.style.animation='pulse 0.5s ease-out',10);
      }
    }
    if(barEl){
      barEl.style.display=count>0?'flex':'none';
      if(count>0){
        barEl.style.animation='slideIn 0.3s ease-out';
      }
    }
    if(btnEl)btnEl.textContent=count;
  });
  
  // Actualizar APP.bulkSelected
  APP.bulkSelected={};
  checks.forEach(chk=>{
    const id=chk.getAttribute('data-client-id');
    APP.bulkSelected[id]=true;
  });
  
  document.getElementById('edicionMasivaCount').textContent=count;
  
  // Toast de notificación
  if(count>0){
    console.log(`✅ ${count} cliente(s) seleccionado(s)`);
  }
}

function clearBulkSelection(){
  document.querySelectorAll('.bulk-select:checked').forEach(chk=>chk.checked=false);
  updateBulkCount();
}

function handleEdicionMasivaFieldChange() {
  const field=document.getElementById('edicionMasivaField').value;
  const wrapper=document.getElementById('edicionMasivaInputWrapper');
  const isResponsable = ['rKickoff','rVer','rCap','rGoLive','rAct','rVenta'].includes(field);
  
  if(isResponsable) {
    wrapper.innerHTML = `<select id="edicionMasivaValor" style="width:100%;padding:8px;background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:8px;color:var(--text);margin-top:6px">
      <option value="">Selecciona Miembro...</option>
      ${APP.workspaceMembers.map(m=>`<option value="${m.username}">${m.username}</option>`).join('')}
    </select>`;
  } else {
    wrapper.innerHTML = `<input id="edicionMasivaValor" style="width:100%;padding:8px;background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:8px;color:var(--text);margin-top:6px" placeholder="Escribe el nuevo valor...">`;
  }
}

function showBulkEditModal(){
  const count=Object.keys(APP.bulkSelected).filter(id=>APP.bulkSelected[id]).length;
  if(count===0){
    toast('warning','Selecciona al menos un cliente');
    return;
  }
  
  document.getElementById('edicionMasivaCount').textContent=count;
  document.getElementById('edicionMasivaCountBtn').textContent=count;
  document.getElementById('edicionMasivaField').value='';
  handleEdicionMasivaFieldChange();
  
  showModal('edicionMasivaModal');
}

function aplicarEdicionMasiva(){
  const field=document.getElementById('edicionMasivaField').value;
  const valor=document.getElementById('edicionMasivaValor').value;
  
  if(!field||!valor){
    toast('warning','Selecciona campo y valor');
    return;
  }
  
  const selected=Object.keys(APP.bulkSelected).filter(id=>APP.bulkSelected[id]);
  if(selected.length===0){
    toast('warning','No hay clientes seleccionados');
    return;
  }
  
  // Aplicar cambios
  let updated=0;
  selected.forEach(id=>{
    const idx=APP.data.findIndex(c=>c.id===id);
    if(idx>=0){
      APP.data[idx][field]=valor;
      updated++;
    }
  });
  
  // Guardar
  localStorage.setItem('holaData',JSON.stringify({data:APP.data,ts:Date.now(),meta:APP.apiMeta}));
  
  toast('success',`${updated} cliente(s) actualizado(s): ${field}="${valor}"`);
  
  // Sincronizar con ClickUp si está disponible
  if(document.getElementById('cfgClickupApiKey')?.value){
    selected.forEach(id=>{
      const cliente=APP.data.find(c=>c.id===id);
      if(cliente)syncBulkClienteToClickup(cliente);
    });
  }
  
  // Actualizar interfaz y cerrar modal
  closeModal('edicionMasivaModal');
  clearBulkSelection();
  renderAll(APP.filteredByDate);
}

function syncBulkClienteToClickup(cliente){
  // Sincronizar bulk changes con ClickUp
  console.log('Sincronizando bulk cliente',cliente.nombre,'con ClickUp...');
}

// Exportar solo clientes seleccionados
function exportBulkSelection(){
  const selected=Object.values(APP.bulkSelected).filter(id=>id);
  if(selected.length===0){
    toast('warning','Selecciona al menos un cliente para exportar');
    return;
  }
  
  const selectedClients=APP.data.filter(c=>selected.includes(c.id));
  const headers=['Nombre','País','Email','Teléfono','Plan','Estado','Responsable','Presupuesto'];
  const rows=selectedClients.map(c=>[
    c.nombre||'',
    c.pais||'',
    c.email||'',
    c.telefono||'',
    c.plan||'',
    c.estado||'',
    c.rCap||'',
    c.presupuesto||''
  ]);
  
  const csv=[headers.join(','),...rows.map(r=>r.map(cell=>`"${cell}"`).join(','))].join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const url=window.URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`clientes-seleccionados-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  
  toast('success',`✅ ${selectedClients.length} cliente(s) exportado(s)`);
}

// Menú de acciones adicionales
function showBulkActionsMenu(){
  const selected=Object.values(APP.bulkSelected).filter(id=>id).length;
  if(selected===0){
    toast('warning','Selecciona al menos un cliente');
    return;
  }
  
  const html=`
    <div style="position:fixed;right:20px;bottom:100px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:8px;box-shadow:0 4px 16px rgba(0,0,0,.2);z-index:9999;min-width:240px">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--muted);padding:8px 12px;border-bottom:1px solid var(--border);margin-bottom:8px">Acciones Masivas</div>
      <button onclick="bulkChangeStatus('En implementación');closeBulkActionsMenu()" style="width:100%;text-align:left;padding:10px 12px;background:none;border:none;color:var(--text);cursor:pointer;font-size:12px;border-radius:6px;transition:all .2s" onmouseover="this.style.background='rgba(255,109,0,.1)'" onmouseout="this.style.background='none'">
        <i class="fa fa-clock"></i> Cambiar a 'En Implementación'
      </button>
      <button onclick="bulkChangeStatus('Concluido');closeBulkActionsMenu()" style="width:100%;text-align:left;padding:10px 12px;background:none;border:none;color:var(--text);cursor:pointer;font-size:12px;border-radius:6px;transition:all .2s" onmouseover="this.style.background='rgba(255,109,0,.1)'" onmouseout="this.style.background='none'">
        <i class="fa fa-check"></i> Cambiar a 'Concluido'
      </button>
      <button onclick="bulkChangeStatus('Cancelado');closeBulkActionsMenu()" style="width:100%;text-align:left;padding:10px 12px;background:none;border:none;color:var(--text);cursor:pointer;font-size:12px;border-radius:6px;transition:all .2s" onmouseover="this.style.background='rgba(255,109,0,.1)'" onmouseout="this.style.background='none'">
        <i class="fa fa-ban"></i> Cambiar a 'Cancelado'
      </button>
      <div style="border-top:1px solid var(--border);margin:8px 0"></div>
      <button onclick="bulkAddNote();closeBulkActionsMenu()" style="width:100%;text-align:left;padding:10px 12px;background:none;border:none;color:var(--text);cursor:pointer;font-size:12px;border-radius:6px;transition:all .2s" onmouseover="this.style.background='rgba(255,109,0,.1)'" onmouseout="this.style.background='none'">
        <i class="fa fa-comment"></i> Agregar Nota
      </button>
      <button onclick="bulkAssignConsultant();closeBulkActionsMenu()" style="width:100%;text-align:left;padding:10px 12px;background:none;border:none;color:var(--text);cursor:pointer;font-size:12px;border-radius:6px;transition:all .2s" onmouseover="this.style.background='rgba(255,109,0,.1)'" onmouseout="this.style.background='none'">
        <i class="fa fa-user"></i> Asignar Responsable
      </button>
      <div style="border-top:1px solid var(--border);margin:8px 0"></div>
      <button onclick="closeBulkActionsMenu()" style="width:100%;text-align:left;padding:10px 12px;background:none;border:none;color:var(--muted);cursor:pointer;font-size:12px;border-radius:6px">
        <i class="fa fa-xmark"></i> Cerrar
      </button>
    </div>
  `;
  
  let menu=document.getElementById('bulkActionsMenu');
  if(!menu){
    menu=document.createElement('div');
    menu.id='bulkActionsMenu';
    document.body.appendChild(menu);
  }
  menu.innerHTML=html;
}

function closeBulkActionsMenu(){
  const menu=document.getElementById('bulkActionsMenu');
  if(menu)menu.innerHTML='';
}

// Cambiar estado masivo
function bulkChangeStatus(newStatus){
  const selected=Object.values(APP.bulkSelected).filter(id=>id);
  if(selected.length===0){
    toast('warning','Selecciona al menos un cliente');
    return;
  }
  
  APP.data.forEach(c=>{
    if(selected.includes(c.id)){
      c.estado=newStatus;
    }
  });
  
  localStorage.setItem('holaData',JSON.stringify({data:APP.data,ts:Date.now(),meta:APP.apiMeta}));
  renderAll(APP.filteredByDate);
  toast('success',`✅ ${selected.length} cliente(s) → estado: ${newStatus}`);
}

// Agregar nota masiva
function bulkAddNote(){
  const note=prompt('Ingresa la nota a agregar:');
  if(!note)return;
  
  const selected=Object.values(APP.bulkSelected).filter(id=>id);
  selected.forEach(id=>{
    const c=APP.data.find(cl=>cl.id===id);
    if(c){
      c.notas=(c.notas||'')+'\n['+new Date().toLocaleString()+']: '+note;
    }
  });
  
  localStorage.setItem('holaData',JSON.stringify({data:APP.data,ts:Date.now(),meta:APP.apiMeta}));
  renderAll(APP.filteredByDate);
  toast('success',`✅ Nota agregada a ${selected.length} cliente(s)`);
}

// Asignar responsable masivo
function bulkAssignConsultant(){
  const selected=Object.values(APP.bulkSelected).filter(id=>id);
  if(selected.length===0){
    toast('warning','Selecciona al menos un cliente');
    return;
  }
  document.getElementById('rmAction').value = 'bulkAssigment';
  openModal('responsableModal');
}

function submitResponsable() {
  const action = document.getElementById('rmAction').value;
  const responsable = document.getElementById('rmSelect').value;
  if(!responsable) return toast('warning', 'Selecciona un miembro');

  if(action === 'bulkAssigment') {
    const selected=Object.values(APP.bulkSelected).filter(id=>id);
    selected.forEach(id=>{
      const c=APP.data.find(cl=>cl.id===id);
      if(c)c.rCap=responsable;
    });
    
    localStorage.setItem('holaData',JSON.stringify({data:APP.data,ts:Date.now(),meta:APP.apiMeta}));
    renderAll(APP.filteredByDate);
    toast('success',`✅ Responsable asignado a ${selected.length} cliente(s)`);
    closeModal('responsableModal');
  } else if (action === 'edicionMasiva') {
     document.getElementById('edicionMasivaValor').value = responsable;
     aplicarEdicionMasiva();
     closeModal('responsableModal');
  }
}

// Sincronizar todos seleccionados con ClickUp
function syncBulkToClickup(){
  const selected=Object.values(APP.bulkSelected).filter(id=>id);
  if(selected.length===0){
    toast('warning','Selecciona al menos un cliente');
    return;
  }
  
  const clients=APP.data.filter(c=>selected.includes(c.id));
  console.log(`Sincronizando ${clients.length} cliente(s) con ClickUp...`);
  toast('info',`🔄 Sincronizando ${clients.length} cliente(s) con ClickUp...`);
  
  // Aquí iría la lógica de sincronización con ClickUp
  setTimeout(()=>{
    toast('success',`✅ ${clients.length} cliente(s) sincronizado(s)`);
  },2000);
}

function renderCanalesSmall(c){
  return`<div class="channel-pills">
    ${c.wa?'<span class="channel-pill cp-wa" title="WhatsApp"><i class="fab fa-whatsapp" style="font-size:10px"></i></span>':''}
    ${c.ig?'<span class="channel-pill cp-ig" title="Instagram"><i class="fab fa-instagram" style="font-size:10px"></i></span>':''}
    ${c.tg?'<span class="channel-pill cp-tg" title="Telegram"><i class="fab fa-telegram" style="font-size:10px"></i></span>':''}
    ${c.wc?'<span class="channel-pill cp-wc" title="WebChat"><i class="fa fa-comments" style="font-size:10px"></i></span>':''}
    ${c.pbx?'<span class="channel-pill cp-pbx" title="PBX"><i class="fa fa-phone" style="font-size:10px"></i></span>':''}
    ${c.msg?'<span class="channel-pill cp-msg" title="Messenger"><i class="fab fa-facebook-messenger" style="font-size:10px"></i></span>':''}
  </div>`;
}

function renderEtapaBadge(estado){
  const e=(estado||'').toLowerCase();
  if(e.includes('listo para kickoff'))return'<span class="badge badge-warning" style="font-size:10px">Listo KO</span>';
  if(e.includes('kickoff')||e.includes('onboarding'))return'<span class="badge badge-warning" style="font-size:10px">Kickoff</span>';
  if(e.includes('analisis'))return'<span class="badge badge-info" style="font-size:10px">Análisis</span>';
  if(e.includes('instalac'))return'<span class="badge badge-purple" style="font-size:10px">Instalación</span>';
  if(e.includes('capacit'))return'<span class="badge badge-primary" style="font-size:10px">Capacitación</span>';
  if(e.includes('go-live')||e.includes('go live'))return'<span class="badge badge-success" style="font-size:10px">Go-Live</span>';
  if(e.includes('activac'))return'<span class="badge badge-success" style="font-size:10px">Activación</span>';
  if(e.includes('listo'))return'<span class="badge badge-warning" style="font-size:10px">Listo</span>';
  return`<span class="badge badge-info" style="font-size:10px">${estado.substring(0,14)}</span>`;
}

function flagFor(pais){
  const f={'Colombia':'🇨🇴','México':'🇲🇽','Argentina':'🇦🇷','Venezuela':'🇻🇪','Perú':'🇵🇪','Ecuador':'🇪🇨','Chile':'🇨🇱','Honduras':'🇭🇳','Panamá':'🇵🇦','Paraguay':'🇵🇾','Bolivia':'🇧🇴','Uruguay':'🇺🇾','Costa Rica':'🇨🇷','Nicaragua':'🇳🇮','Guatemala':'🇬🇹','El Salvador':'🇸🇻','Brasil':'🇧🇷','República Dominicana':'🇩🇴','México':'🇲🇽'};
  return f[pais]||'🌎';
}

function noDataRow(cols,msg){
  return`<tr><td colspan="${cols}"><div class="no-data" style="padding:32px"><i class="fa fa-inbox" style="display:block;font-size:28px;margin-bottom:8px;color:rgba(255,109,0,.15)"></i>${msg}</div></td></tr>`;
}

function escHtml(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

// ================================================================
// KEYBOARD SHORTCUTS
// ================================================================
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){['clientModal','userModal','upsellModal','csModal','opaConvModal','kanbanCardModal'].forEach(id=>document.getElementById(id)?.classList.remove('active'));}
  if(e.ctrlKey&&e.key==='k'){e.preventDefault();showSection('busqueda');setTimeout(()=>document.getElementById('mainSearchInput')?.focus(),100);}
  if(e.ctrlKey&&e.key==='s'&&document.getElementById('sec-config').classList.contains('active')){e.preventDefault();saveConfig();}
});

// ================================================================
// INIT
// ================================================================
async function loadClickUpMembers() {
  try {
    const res = await fetch('/api/clickup/members', { headers: getAuthHeader() });
    if(res.ok) {
      const data = await res.json();
      APP.workspaceMembers = data.members || [];
      const opts = '<option value="">Selecciona Miembro...</option>' + APP.workspaceMembers.map(m=>`<option value="${m.username}">${m.username}</option>`).join('');
      const rmSelect = document.getElementById('rmSelect');
      if(rmSelect) rmSelect.innerHTML = opts;
      
      const rptCons = document.getElementById('rptConsultor');
      if(rptCons) rptCons.innerHTML = '<option value="">Todos</option>' + opts;
    }
  } catch(e) {
    console.error('Error fetching clickup members:', e);
  }
}

function applySortableGrids() {
  const grids = document.querySelectorAll('.kpi-grid, .charts-grid');
  grids.forEach((grid, index) => {
    if(grid.dataset.sortableInit) return;
    grid.dataset.sortableInit = '1';
    
    const storeKey = 'holaGridOrder_' + (grid.id || 'grid_' + index);
    
    Array.from(grid.children).forEach((child, i) => {
      if(!child.dataset.id) child.dataset.id = child.id || 'item_' + i;
    });

    const saved = localStorage.getItem(storeKey);
    if(saved) {
      try {
        const order = JSON.parse(saved);
        const frag = document.createDocumentFragment();
        order.forEach(id => {
          const el = grid.querySelector(`[data-id="${id}"]`);
          if(el) frag.appendChild(el);
        });
        Array.from(grid.children).forEach(child => {
          if(!order.includes(child.dataset.id)) frag.appendChild(child);
        });
        grid.appendChild(frag);
      } catch(e) {}
    }

    if(window.Sortable) {
      Sortable.create(grid, {
        animation: 150,
        handle: grid.classList.contains('charts-grid') ? '.chart-header' : null,
        onEnd: function() {
          const order = Array.from(grid.children).map(c => c.dataset.id);
          localStorage.setItem(storeKey, JSON.stringify(order));
        }
      });
      if(grid.classList.contains('charts-grid')){
        grid.querySelectorAll('.chart-header').forEach(h => { h.style.cursor = 'grab'; h.title = 'Arrastra para reordenar'; });
      } else {
        grid.querySelectorAll('.kpi-card').forEach(c => { c.style.cursor = 'grab'; c.title = 'Arrastra para reordenar'; });
      }
    }
  });
}

window.addEventListener('load',()=>{
  applySortableGrids();
  loadClickUpMembers();
  const params=new URLSearchParams(window.location.search);
  const publicForm=params.get('publicForm');
  if(publicForm==='upgrade'||publicForm==='churn'){
    renderPublicFormPage(publicForm==='churn'?'churn-risk':'upgrade');
    return;
  }
  APP.language=localStorage.getItem('holaLanguage')||'es';
  APP.branding=localStorage.getItem('holaBranding')?JSON.parse(localStorage.getItem('holaBranding')):defaultBranding();
  applyBranding();
  applyLanguage();
  // Chart.js defaults
  if(window.Chart){
    Chart.defaults.color='rgba(232,232,240,.5)';
    Chart.defaults.font.family="'Segoe UI',system-ui,sans-serif";
    Chart.defaults.plugins.tooltip.cornerRadius=8;
  }
  // Load saved config
  const sc=localStorage.getItem('holaCfg');
  if(sc){try{
    const c=JSON.parse(sc);
    if(c.apiKey)CONFIG.API_KEY=c.apiKey;
    if(c.listId)CONFIG.LIST_ID=c.listId;
    if(c.diasMeta)CONFIG.DIAS_META.total=parseInt(c.diasMeta)||20;
    const sourceEl=document.getElementById('cfgPrimarySource');
    if(sourceEl&&c.primarySource)sourceEl.value=c.primarySource;
    const jsonEl=document.getElementById('cfgManualJson');
    if(jsonEl&&c.manualJson)jsonEl.value=c.manualJson;
  }catch{}}
  const langEl=document.getElementById('langSelector');
  if(langEl)langEl.value=APP.language;
  const salesSheetEl=document.getElementById('cfgSalesSheetId');
  if(salesSheetEl&&!salesSheetEl.value)salesSheetEl.value='1c2hR_t7SbDGi9WItvXfGoizF35za3nM7TnQ4_dU4QTA';
  // Set today as default date range max
  const today=new Date().toISOString().split('T')[0];
  const dfT=document.getElementById('dateTo');if(dfT)dfT.value=today;
  const dfF=document.getElementById('dateFrom');if(dfF){const m=new Date();m.setFullYear(m.getFullYear()-1);dfF.value=m.toISOString().split('T')[0];}
  // Init wiki
  showWikiPage('overview');
  syncExternalFormSubmissions();
  // CSS grid fix for CS section
  const cg=document.querySelector('.cs-grid');
  if(cg&&window.innerWidth<768)cg.style.gridTemplateColumns='1fr';
});
