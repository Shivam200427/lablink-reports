// Analyte directory: name matching + SAMPLE critical thresholds.
// IMPORTANT: the critical thresholds below are SAMPLE values chosen for the
// demo so the critical-value flow can be exercised. They are NOT clinically
// approved - the lab's pathologist must review and sign off every threshold
// before real use. Flags always come from rules (server/flags.js), never from
// generated text.
export const KB = [
  {key:"haemoglobin",names:["haemoglobin","hemoglobin","hb","hgb"],unit:"g/dL",criticalLow:7,criticalHigh:18},
  {key:"rbc",names:["rbc count","rbc","red blood cell count","erythrocyte count"],unit:"mill/µL"},
  {key:"wbc",names:["wbc count","wbc","total wbc","total leucocyte count","tlc","white blood cell count"],unit:"/µL",criticalLow:2000,criticalHigh:30000},
  {key:"platelets",names:["platelet count","platelets","plt"],unit:"lakh/µL",criticalLow:50000,criticalHigh:1000000},
  {key:"pcv",names:["pcv","hematocrit","haematocrit","packed cell volume"],unit:"%"},
  {key:"mcv",names:["mcv","mean corpuscular volume"],unit:"fL"},
  {key:"esr",names:["esr","erythrocyte sedimentation rate"],unit:"mm/hr"},
  {key:"fasting_glucose",names:["fasting blood sugar","fasting glucose","fbs","glucose fasting","blood sugar fasting"],unit:"mg/dL",criticalLow:50,criticalHigh:400},
  {key:"pp_glucose",names:["post prandial blood sugar","ppbs","pp glucose","postprandial glucose","blood sugar pp"],unit:"mg/dL",criticalLow:50,criticalHigh:450},
  {key:"hba1c",names:["hba1c","glycated haemoglobin","glycosylated hemoglobin"],unit:"%",criticalHigh:12},
  {key:"total_cholesterol",names:["total cholesterol","cholesterol total","cholesterol"],unit:"mg/dL"},
  {key:"ldl",names:["ldl cholesterol","ldl","ldl-c"],unit:"mg/dL"},
  {key:"hdl",names:["hdl cholesterol","hdl","hdl-c"],unit:"mg/dL"},
  {key:"triglycerides",names:["triglycerides","tg"],unit:"mg/dL"},
  {key:"creatinine",names:["creatinine","serum creatinine"],unit:"mg/dL",criticalHigh:5},
  {key:"urea",names:["blood urea","urea","bun","blood urea nitrogen"],unit:"mg/dL"},
  {key:"uric_acid",names:["uric acid","serum uric acid"],unit:"mg/dL"},
  {key:"sodium",names:["sodium","serum sodium","na"],unit:"mmol/L",criticalLow:120,criticalHigh:160},
  {key:"potassium",names:["potassium","serum potassium","k"],unit:"mmol/L",criticalLow:2.5,criticalHigh:6},
  {key:"chloride",names:["chloride","serum chloride","cl"],unit:"mmol/L"},
  {key:"calcium",names:["calcium","serum calcium","ca"],unit:"mg/dL",criticalLow:6,criticalHigh:13},
  {key:"bilirubin",names:["bilirubin total","total bilirubin","bilirubin"],unit:"mg/dL",criticalHigh:12},
  {key:"sgot",names:["sgot","ast","sgot (ast)"],unit:"U/L"},
  {key:"sgpt",names:["sgpt","alt","sgpt (alt)"],unit:"U/L"},
  {key:"alp",names:["alp","alkaline phosphatase"],unit:"U/L"},
  {key:"total_protein",names:["total protein","serum total protein"],unit:"g/dL"},
  {key:"albumin",names:["albumin","serum albumin"],unit:"g/dL"},
  {key:"tsh",names:["tsh","thyroid stimulating hormone"],unit:"µIU/mL",criticalLow:0.01,criticalHigh:100},
  {key:"vitamin_d",names:["vitamin d","vitamin d 25 hydroxy","25-oh vitamin d","25 hydroxy vitamin d"],unit:"ng/mL"},
  {key:"vitamin_b12",names:["vitamin b12","b12","cyanocobalamin"],unit:"pg/mL"},
  {key:"crp",names:["crp","c reactive protein","c-reactive protein"],unit:"mg/L"},
];

const alias = new Map();
// longer names first so 'rbc count' wins over 'rbc' in substring matching
for (const e of [...KB].sort((a, b) => Math.max(...b.names.map((n) => n.length)) - Math.max(...a.names.map((n) => n.length)))) {
  for (const n of e.names) if (!alias.has(n)) alias.set(n, e);
}

export function findKBEntry(parameter) {
  const p = String(parameter || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (alias.has(p)) return alias.get(p);
  for (const [name, entry] of alias) {
    if (p === name || p.startsWith(name + ' ') || p.endsWith(' ' + name) || p.includes('(' + name + ')')) return entry;
  }
  return null;
}
