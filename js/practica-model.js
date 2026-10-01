// =====================================================================
//  Prácticas empresariales · modelo de datos y estructura de los formatos
//  - Propuesta de práctica (formato institucional fijo)
//  - Informe final (estructura flexible basada en la plantilla institucional)
//  - Acta de control de visita empresarial (solo docente)
//  Módulo puro (sin DOM): lo usan las vistas, la vista previa y la exportación a Word.
// =====================================================================

export const PRACTICE_STATUS = {
  activa: { label: 'En curso', cls: 'b-info', icon: 'briefcase' },
  finalizada: { label: 'Finalizada', cls: 'b-success', icon: 'check' },
  cancelada: { label: 'Cancelada', cls: 'b-danger', icon: 'x' }
};

export const DOC_STATUS = {
  borrador: { label: 'En elaboración', cls: '', icon: 'pen' },
  enviado: { label: 'Enviado a revisión', cls: 'b-info', icon: 'send' },
  correcciones: { label: 'Con correcciones', cls: 'b-warning', icon: 'undo' },
  aprobado: { label: 'Aprobado', cls: 'b-success', icon: 'fileCheck' }
};

export const VISIT_MODES = {
  presencial: { label: 'Presencial (en la empresa)', short: 'Presencial', icon: 'building' },
  virtual: { label: 'Virtual (videollamada)', short: 'Virtual', icon: 'video' }
};
export const VISIT_STATUS = {
  programada: { label: 'Programada', cls: 'b-info' },
  realizada: { label: 'Realizada', cls: 'b-success' },
  cancelada: { label: 'Cancelada', cls: 'b-danger' }
};

export const DOC_NAMES = { proposal: 'Propuesta de práctica', final: 'Informe final', acta: 'Acta de control de visita empresarial' };

// Periodo académico actual: 2026 - 1 (enero–junio) o 2026 - 2 (julio–diciembre)
export function currentPeriod(d = new Date()) { return `${d.getFullYear()} - ${d.getMonth() < 6 ? 1 : 2}`; }

const uidLocal = () => Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------------
//  Empresa (la diligencia el estudiante; alimenta la propuesta y el informe)
// ---------------------------------------------------------------------
export function emptyCompany() {
  return {
    name: '', nit: '', sector: '', city: 'Manizales', address: '', phone: '', website: '', area: '',
    contactName: '', contactRole: '', contactPhone: '', contactEmail: '',
    startDate: '', endDate: '', paid: null, hours: '', modality: 'presencial', schedule: ''
  };
}
export const COMPANY_FIELDS = [
  ['name', 'Razón social de la empresa', true], ['nit', 'NIT', false], ['sector', 'Sector económico', false],
  ['city', 'Ciudad', true], ['address', 'Dirección', false], ['phone', 'Teléfono de la empresa', false], ['website', 'Sitio web', false],
  ['area', 'Área o dependencia de la práctica', true],
  ['contactName', 'Funcionario responsable (jefe inmediato)', true], ['contactRole', 'Cargo del funcionario', true],
  ['contactPhone', 'Teléfono del funcionario', true], ['contactEmail', 'Correo del funcionario', true],
  ['startDate', 'Fecha de inicio', true], ['endDate', 'Fecha de terminación', true], ['paid', '¿La práctica es remunerada?', true]
];
export function companyProgress(c = {}) {
  const req = COMPANY_FIELDS.filter((f) => f[2]);
  const ok = req.filter(([k]) => (k === 'paid' ? c.paid === true || c.paid === false : String(c[k] || '').trim())).length;
  return Math.round((ok / req.length) * 100);
}

// ---------------------------------------------------------------------
//  Propuesta de práctica (formato fijo)
// ---------------------------------------------------------------------
export function emptyProposal() {
  return {
    status: 'borrador', fillDate: '',
    description: '',
    needs: [{ a: '', b: '', c: '' }],
    expected: '', objective: '',
    specific: ['', '', ''],
    methodIntro: '',
    phases: [{ title: '', oes: '', text: '' }],
    activities: [{ oe: '', act: '', ent: '', ini: '', fin: '' }]
  };
}
export const PROPOSAL_GUIDE = {
  description: 'Describa el área de la empresa donde se desarrollará la práctica, su función y las actividades en las que participará. Use **texto** para resaltar en negrita.',
  needs: 'Relacione las necesidades actuales del área, cómo se manifiestan en la operación y cómo se atenderán desde la práctica.',
  expected: 'Qué se espera tener al finalizar la práctica (productos o resultados verificables).',
  objective: 'Una oración que inicie con un verbo en infinitivo: qué se logrará y para qué.',
  specific: 'Entre tres y cinco objetivos verificables (verbo en infinitivo + qué + para qué). Se numeran OE1, OE2…',
  method: 'Enfoque de trabajo y fases. Indique en cada fase las semanas y el objetivo específico que atiende (p. ej. "OE1").',
  activities: 'Actividades o etapas del proyecto, con el objetivo que atienden, sus entregables y fechas.'
};
export function proposalProgress(p = {}) {
  const checks = [
    !!(p.description || '').trim(),
    (p.needs || []).some((n) => n.a && n.c),
    !!(p.expected || '').trim(),
    !!(p.objective || '').trim(),
    (p.specific || []).filter((x) => String(x).trim()).length >= 3,
    !!(p.methodIntro || '').trim() || (p.phases || []).some((f) => f.title && f.text),
    (p.activities || []).filter((a) => a.act && a.ini && a.fin).length >= 1
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

// ---------------------------------------------------------------------
//  Informe final (estructura flexible)
//  Bloques: p · h2 · h3 · ul · ol · table · figure · code · formula
// ---------------------------------------------------------------------
export const BLOCK_TYPES = {
  p: { label: 'Párrafo', icon: 'fileText' },
  h2: { label: 'Subtítulo (nivel 2)', icon: 'heading' },
  h3: { label: 'Subtítulo (nivel 3)', icon: 'heading' },
  ul: { label: 'Lista con viñetas', icon: 'list' },
  ol: { label: 'Lista numerada', icon: 'listOrdered' },
  table: { label: 'Tabla', icon: 'table' },
  figure: { label: 'Figura (imagen)', icon: 'image' },
  code: { label: 'Fragmento de código', icon: 'code' },
  formula: { label: 'Fórmula o ecuación', icon: 'sigma' }
};

export const GUIDES = {
  dedication: 'Sección opcional. Texto breve (máximo cinco líneas), alineado a la derecha y en cursiva, dirigido a las personas que desee reconocer en el plano personal.',
  thanks: 'Reconozca de forma sobria y específica a las personas e instituciones que contribuyeron al desarrollo de la práctica: asesores, organización, equipo de trabajo y usuarios que participaron en validaciones. Extensión: uno a tres párrafos.',
  declaration: 'Indique explícitamente si utilizó herramientas de inteligencia artificial generativa, con qué propósito y cómo verificó los resultados. La transparencia en este punto es hoy un criterio de integridad académica.',
  abstractEs: 'Síntesis autocontenida en un solo párrafo de 250 a 300 palabras, en tiempo pasado y tercera persona. Orden: contexto (organización y área) → problema (con un dato cuantitativo) → objetivo → metodología → resultados (productos e indicadores) → conclusión (aporte principal).',
  keywords: 'Entre cuatro y seis palabras clave. Prefiera términos normalizados de tesauros como el IEEE Thesaurus o el ACM Computing Classification System.',
  abstractEn: 'Traducción fiel del resumen al inglés. No use traductores automáticos sin revisión: verifique la terminología técnica.',
  acronyms: 'Relacione en orden alfabético todas las siglas usadas. La primera vez que aparezca cada sigla en el texto, escriba su significado completo seguido de la sigla entre paréntesis.',
  glossary: 'Defina los términos técnicos o propios de la organización que un lector externo podría no conocer. Use definiciones breves y, cuando provengan de una fuente, cítela.',
  intro: 'Presenta el trabajo como un todo y orienta la lectura (se recomienda redactarla al final). Contenido: contexto; problema y justificación en síntesis; propósito; enfoque metodológico; estructura del documento. Extensión: dos a tres páginas.',
  context: 'Sitúe al lector en el entorno donde se desarrolló la práctica. Todo dato institucional (misión, cifras, fecha de fundación) debe provenir de una fuente verificable y citarse.',
  problem: 'Núcleo lógico del informe: objetivos, metodología y resultados deben responder a este problema. Describa la situación con evidencia (datos, observaciones, entrevistas). Estructura: situación actual → causas → consecuencias → pregunta de trabajo. Un diagrama de causa-efecto fortalece el análisis.',
  objectives: 'El objetivo general expresa el efecto esperado y el aporte a la organización. Los específicos (tres a cinco) inician con un verbo en infinitivo observable y medible, incluyen el qué y el para qué, y deben cubrir totalmente el general. Evite verbos no verificables (conocer, entender, aprender, apoyar) y formular actividades en lugar de logros.',
  framework: 'Sustente teórica, conceptual y normativamente las decisiones tomadas. Cada concepto debe conectarse explícitamente con el proyecto. Use fuentes académicas preferiblemente de los últimos diez años y cierre cada subsección explicando cómo se aplicó el concepto.',
  method: 'Describa cómo se realizó el trabajo con detalle suficiente para replicarlo y justifique cada elección: enfoque, marco de trabajo, fases, técnicas e instrumentos, herramientas, cronograma y gestión de riesgos.',
  results: 'Organice por fases o por resultados (uno por objetivo específico). Presente evidencias concretas (diagramas, fragmentos de código, capturas, actas), respete la confidencialidad y remita a anexos el material extenso. Muestre solo fragmentos de código significativos y nunca credenciales o direcciones reales.',
  discussion: 'Interprete los resultados: contrástelos con los objetivos, la línea base y los antecedentes; explique las desviaciones y reconozca las limitaciones. ¿Qué significan?, ¿cómo se relacionan con la literatura?, ¿qué limitaciones condicionan su interpretación?',
  contributions: 'Aportes concretos a la organización, relación de las asignaturas del programa con su aplicación en la práctica y lecciones aprendidas.',
  conclusions: 'Responden al problema planteado y a cada objetivo específico, apoyadas en los resultados. No introduzca información nueva ni repita el resumen. Redacte entre cinco y ocho conclusiones que inicien con la idea principal.',
  recommendations: 'Recomendaciones concretas, viables y derivadas de su experiencia, dirigidas a la organización, al programa académico y a futuros trabajos.',
  references: 'Una referencia por línea, en orden alfabético y con norma APA 7.ª edición. Libro: Apellido, A. A. (Año). *Título* (ed.). Editorial. · Artículo: Apellido, A. A. (Año). Título. *Revista, vol*(núm.), pp. https://doi.org/… · Norma: Organización. (Año). *Código y título*. · Página web: Autor. (Año, día de mes). *Título*. Sitio. URL',
  annexes: 'Material de soporte extenso (certificado de práctica, SRS, manuales, informes de pruebas). Cada anexo se identifica con una letra y debe mencionarse en el texto. Solicite autorización de la organización antes de incluir documentos internos.',
  custom: 'Capítulo agregado por el estudiante o el docente. Ajuste el título y el contenido a las necesidades de la práctica.',
  norms: 'Formato institucional: carta; márgenes 3 cm (superior, inferior, izquierdo) y 2 cm (derecho); Arial 12; interlineado 1,5; texto justificado; citación APA 7.ª edición; tablas y figuras numeradas con título encima y nota de fuente debajo. Extensión recomendada: 40 a 70 páginas de cuerpo.'
};

// Utilidades para construir la estructura sugerida
const P = (text = '') => ({ id: uidLocal(), t: 'p', text });
const H2 = (text) => ({ id: uidLocal(), t: 'h2', text });
const H3 = (text) => ({ id: uidLocal(), t: 'h3', text });
const UL = (items = ['']) => ({ id: uidLocal(), t: 'ul', items });
const OL = (items = [''], style) => ({ id: uidLocal(), t: 'ol', items, ...(style ? { style } : {}) });
const TABLE = (caption, cols, first = [], rows = 3, note = 'Elaboración propia.') => ({
  id: uidLocal(), t: 'table', caption, note, cols,
  rows: (first.length ? first : Array.from({ length: rows }, () => '')).map((v) => [v, ...cols.slice(1).map(() => '')])
});
const FIG = (caption, note = 'Elaboración propia.') => ({ id: uidLocal(), t: 'figure', caption, note, fileId: '' });
const CH = (title, guide, blocks, numbered = true) => ({ id: uidLocal(), title, guide, numbered, blocks });

export function defaultFinal({ teacher = '', company = {}, proposal = {} } = {}) {
  const oes = (proposal.specific || []).filter((x) => String(x).trim());
  return {
    status: 'borrador',
    cover: {
      title: '', academicAdvisor: teacher,
      companyAdvisor: [company.contactName, company.contactRole].filter(Boolean).join(', '),
      city: 'Manizales, Caldas, Colombia', year: String(new Date().getFullYear())
    },
    front: {
      dedication: '', thanks: '',
      declaration: { include: true, aiUsed: false, aiTools: '', aiUse: '', confidentiality: '' },
      abstractEs: '', keywordsEs: '', abstractEn: '', keywordsEn: '',
      acronyms: [['', '']], glossary: [['', '']]
    },
    chapters: [
      CH('INTRODUCCIÓN', 'intro', [P()], false),
      CH('CONTEXTO ORGANIZACIONAL', 'context', [
        H2('Descripción de la organización'), P(company.name ? `${company.name} ` : ''),
        TABLE('Ficha técnica de la organización', ['Aspecto', 'Descripción'], ['Razón social', 'Sector económico', 'Ubicación', 'Tamaño', 'Misión', 'Visión', 'Sitio web']),
        H2('Estructura organizacional y área de desempeño'), P(), FIG('Organigrama de la organización y ubicación del área de práctica'),
        H2('Rol del practicante y funciones asignadas'), P(), TABLE('Funciones asignadas durante la práctica', ['Función', 'Descripción', 'Dedicación']),
        H2('Modalidad de trabajo e interacción con los interesados'), P(), TABLE('Matriz de interesados del proyecto', ['Interesado', 'Rol en el proyecto', 'Interés principal', 'Interacción'])
      ]),
      CH('PLANTEAMIENTO DEL PROBLEMA', 'problem', [
        H2('Descripción de la situación problemática'), P(), UL(['']),
        H2('Formulación del problema'), P(),
        H2('Justificación'), P(),
        H2('Alcance y delimitaciones'), P(), TABLE('Alcance del proyecto', ['Incluido en el alcance', 'Excluido del alcance'])
      ]),
      CH('OBJETIVOS', 'objectives', [
        H2('Objetivo general'), P(proposal.objective || ''),
        H2('Objetivos específicos'), OL(oes.length ? oes : ['', '', ''], 'oe'),
        H2('Matriz de trazabilidad de objetivos'), P(),
        TABLE('Matriz de trazabilidad de objetivos específicos', ['Objetivo', 'Actividades principales', 'Entregable', 'Indicador de logro'], (oes.length ? oes : ['', '', '']).map((_, i) => `OE${i + 1}`))
      ]),
      CH('MARCO REFERENCIAL', 'framework', [
        H2('Marco teórico'), H3(''), P(),
        H2('Antecedentes y estado del arte'), P(), TABLE('Análisis comparativo de soluciones existentes', ['Criterio', 'Alternativa 1', 'Alternativa 2', 'Solución propuesta']),
        H2('Marco normativo y legal'), P(), TABLE('Normatividad aplicable al proyecto', ['Norma', 'Descripción', 'Aplicación en el proyecto'])
      ]),
      CH('METODOLOGÍA', 'method', [
        H2('Enfoque del trabajo'), P(),
        H2('Marco de trabajo'), P(),
        H2('Fases del proyecto'), P(), TABLE('Fases, técnicas y entregables del proyecto', ['Fase', 'Actividades y técnicas', 'Entregables']),
        H2('Herramientas y tecnologías'), P(), TABLE('Herramientas y tecnologías seleccionadas', ['Categoría', 'Herramienta', 'Justificación']),
        H2('Cronograma'), P(), FIG('Cronograma de actividades de la práctica'),
        H2('Gestión de riesgos'), P(), TABLE('Matriz de riesgos del proyecto', ['Riesgo', 'Probabilidad', 'Impacto', 'Estrategia de mitigación'])
      ]),
      CH('DESARROLLO Y RESULTADOS', 'results', [
        H2('Fase de análisis'), P(),
        H2('Fase de diseño'), P(),
        H2('Fase de construcción'), P(),
        H2('Fase de validación y pruebas'), P(),
        H2('Despliegue y transferencia de conocimiento'), P(),
        H2('Otras actividades'), UL([''])
      ]),
      CH('ANÁLISIS Y DISCUSIÓN DE RESULTADOS', 'discussion', [
        H2('Cumplimiento de los objetivos'), P(),
        TABLE('Evaluación del cumplimiento de los objetivos específicos', ['Objetivo', 'Resultado obtenido', 'Evidencia', 'Cumplimiento'], (oes.length ? oes : ['', '', '']).map((_, i) => `OE${i + 1}`)),
        H2('Indicadores de impacto'), P(), TABLE('Variación de los indicadores del proceso', ['Indicador', 'Línea base', 'Después', 'Variación']),
        H2('Discusión'), P()
      ]),
      CH('APORTES Y COMPETENCIAS DESARROLLADAS', 'contributions', [
        H2('Aportes a la organización'), UL(['']),
        H2('Relación con el plan de estudios'), P(), TABLE('Aplicación de las competencias del programa en la práctica', ['Asignatura del programa', 'Aplicación en la práctica']),
        H2('Lecciones aprendidas'), P()
      ]),
      CH('CONCLUSIONES', 'conclusions', [OL(['', '', '', '', ''])]),
      CH('RECOMENDACIONES', 'recommendations', [
        H2('Para la organización'), UL(['']),
        H2('Para el programa académico'), UL(['']),
        H2('Trabajos futuros'), UL([''])
      ])
    ],
    references: '',
    annexes: [{ id: uidLocal(), title: 'Certificado de práctica y carta de aceptación', text: '' }]
  };
}

export const newBlock = (t) => {
  if (t === 'table') return TABLE('', ['Columna 1', 'Columna 2'], [], 2);
  if (t === 'figure') return FIG('');
  if (t === 'ul') return UL(['']);
  if (t === 'ol') return OL(['']);
  if (t === 'h2') return H2('');
  if (t === 'h3') return H3('');
  if (t === 'code') return { id: uidLocal(), t: 'code', caption: '', note: 'Elaboración propia.', text: '' };
  if (t === 'formula') return { id: uidLocal(), t: 'formula', text: '' };
  return P();
};
export const newChapter = (title = 'NUEVO CAPÍTULO') => CH(title, 'custom', [P()]);
export const newId = uidLocal;

// Bloques vacíos que no se imprimen (subtítulos sin texto, tablas sin diligenciar, listas vacías)
export function blockIsEmpty(b) {
  const f = (s) => !!String(s || '').trim();
  if (b.t === 'p' || b.t === 'h2' || b.t === 'h3' || b.t === 'formula' || b.t === 'code') return !f(b.text);
  if (b.t === 'ul' || b.t === 'ol') return !(b.items || []).some(f);
  if (b.t === 'table') return !(b.rows || []).some((r) => r.slice((b.cols || []).length > 1 ? 1 : 0).some(f));
  return false; // las figuras sin imagen se muestran como pendientes
}

// Numeración automática: capítulos (1.), subtítulos (1.1), (1.1.1), tablas y figuras
export function numberFinal(f, { prune = true } = {}) {
  let ch = 0, tbl = 0, fig = 0;
  const out = [];
  for (const c0 of f.chapters || []) {
    const c = prune ? { ...c0, blocks: c0.blocks.filter((b) => !blockIsEmpty(b)) } : c0;
    const num = c.numbered === false ? '' : String(++ch);
    let h2 = 0, h3 = 0;
    const blocks = c.blocks.map((b) => {
      if (b.t === 'h2') { h2++; h3 = 0; return { ...b, num: num ? `${num}.${h2}` : `${h2}` }; }
      if (b.t === 'h3') { h3++; return { ...b, num: num ? `${num}.${h2}.${h3}` : `${h2}.${h3}` }; }
      if (b.t === 'table') return { ...b, num: ++tbl };
      if (b.t === 'figure' || b.t === 'code') return { ...b, num: ++fig };
      return b;
    });
    out.push({ ...c, num, blocks });
  }
  return { chapters: out, tables: tbl, figures: fig };
}

const filled = (s) => !!String(s || '').trim();
export function finalProgress(f = {}) {
  if (!f.chapters) return 0;
  const checks = [filled(f.cover?.title), filled(f.front?.abstractEs), filled(f.front?.abstractEn), filled(f.references)];
  for (const c of f.chapters) checks.push(c.blocks.some((b) => (b.t === 'p' && filled(b.text)) || ((b.t === 'ul' || b.t === 'ol') && b.items.some(filled))));
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

// Conteo aproximado de palabras del cuerpo (para orientar la extensión)
export function finalWords(f = {}) {
  let n = 0;
  const w = (s) => (String(s || '').trim().match(/\S+/g) || []).length;
  for (const c of f.chapters || []) for (const b of c.blocks) {
    if (b.t === 'p' || b.t === 'formula') n += w(b.text);
    if (b.t === 'ul' || b.t === 'ol') b.items.forEach((i) => { n += w(i); });
    if (b.t === 'table') b.rows.forEach((r) => r.forEach((x) => { n += w(x); }));
  }
  return n;
}

// ---------------------------------------------------------------------
//  Acta de control de visita (solo docente)
// ---------------------------------------------------------------------
export function emptyActa() { return { responsible: '', development: '', done: false, completedAt: null }; }

// ---------------------------------------------------------------------
//  Fechas en español
// ---------------------------------------------------------------------
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function parseISODate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? { y: m[1], m: m[2], d: m[3] } : null;
}
export const dmy = (s) => { const p = parseISODate(s); return p ? `${p.d}/${p.m}/${p.y}` : ''; };
export function longDate(s) {
  const p = typeof s === 'number' ? (() => { const d = new Date(s); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }; })() : parseISODate(s);
  if (!p) return '';
  return `${Number(p.d)} de ${MONTHS[Number(p.m) - 1]} de ${p.y}`;
}
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Texto con **negrita** y *cursiva* → segmentos [{ text, b, i }]
export function inlineRuns(s = '') {
  const out = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    if (m[2] !== undefined) out.push({ text: m[2], b: true }); else out.push({ text: m[3], i: true });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}
export const paragraphs = (s = '') => String(s).split(/\n\s*\n|\n/).map((x) => x.trim()).filter(Boolean);
