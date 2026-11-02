// Per-test locked template wording for the 31 analytes in server/kb.js.
// DRAFT for pathologist review: plain-language, non-diagnostic patient
// education in the style of public sources such as MedlinePlus. Every string
// says what the test is, what a high/low value can commonly be seen with, and
// never diagnoses, advises treatment, or replaces the doctor. Telugu and Hindi
// drafts need a fluent reviewer before real use. Flags still come from rules
// (server/flags.js), never from this text.
const D = {
  en: 'This result alone does not confirm any illness - please discuss it with your doctor.',
  te: 'ఈ ఫలితం ఒక్కటే ఏ వ్యాధినీ నిర్ధారించదు - దయచేసి మీ డాక్టర్‌తో చర్చించండి.',
  hi: 'यह परिणाम अकेले किसी बीमारी की पुष्टि नहीं करता - कृपया अपने डॉक्टर से चर्चा करें।',
};
export const TEMPLATE_DISCLAIMER = D;

// key (kb.js) -> { high: {en,te,hi}, low: {en,te,hi} }
export const TEST_TEMPLATES = {
  haemoglobin: {
    low: { en: 'Haemoglobin carries oxygen in the blood; a lower value can be seen with low iron, blood loss, or some long-term illnesses.', te: 'హీమోగ్లోబిన్ రక్తంలో ఆక్సిజన్‌ను మోస్తుంది; తక్కువ విలువ ఐరన్ లోపం, రక్తస్రావం లేదా కొన్ని దీర్ఘకాలిక అనారోగ్యాలతో కనిపించవచ్చు.', hi: 'हीमोग्लोबिन रक्त में ऑक्सीजन पहुँचाता है; कम मान आयरन की कमी, रक्तस्राव या कुछ दीर्घकालिक बीमारियों में दिख सकता है।' },
    high: { en: 'Haemoglobin carries oxygen in the blood; a higher value can be seen with dehydration, smoking, or living at high altitude.', te: 'హీమోగ్లోబిన్ రక్తంలో ఆక్సిజన్‌ను మోస్తుంది; అధిక విలువ నిర్జలీకరణం, పొగతాకడం లేదా ఎత్తైన ప్రాంతాల్లో నివసించడంతో కనిపించవచ్చు.', hi: 'हीमोग्लोबिन रक्त में ऑक्सीजन पहुँचाता है; अधिक मान निर्जलीकरण, धूम्रपान या ऊँचाई वाले क्षेत्र में रहने से दिख सकता है।' },
  },
  rbc: {
    low: { en: 'Red blood cells carry oxygen; a lower count can be seen with low iron, blood loss, or some long-term illnesses.', te: 'ఎర్ర రక్త కణాలు ఆక్సిజన్‌ను మోస్తాయి; తక్కువ సంఖ్య ఐరన్ లోపం, రక్తస్రావం లేదా కొన్ని దీర్ఘకాలిక అనారోగ్యాలతో కనిపించవచ్చు.', hi: 'लाल रक्त कोशिकाएँ ऑक्सीजन पहुँचाती हैं; कम संख्या आयरन की कमी, रक्तस्राव या कुछ दीर्घकालिक बीमारियों में दिख सकती है।' },
    high: { en: 'Red blood cells carry oxygen; a higher count can be seen with dehydration or low oxygen over time.', te: 'ఎర్ర రక్త కణాలు ఆక్సిజన్‌ను మోస్తాయి; అధిక సంఖ్య నిర్జలీకరణం లేదా కొంతకాలంగా ఆక్సిజన్ తగ్గడంతో కనిపించవచ్చు.', hi: 'लाल रक्त कोशिकाएँ ऑक्सीजन पहुँचाती हैं; अधिक संख्या निर्जलीकरण या लंबे समय तक ऑक्सीजन कम होने से दिख सकती है।' },
  },
  wbc: {
    low: { en: 'White blood cells fight infection; a lower count can be seen with some infections, some medicines, or bone-marrow conditions.', te: 'తెల్ల రక్త కణాలు ఇన్ఫెక్షన్‌తో పోరాడతాయి; తక్కువ సంఖ్య కొన్ని ఇన్ఫెక్షన్లు, కొన్ని మందులు లేదా ఎముక మజ్జ పరిస్థితులతో కనిపించవచ్చు.', hi: 'सफेद रक्त कोशिकाएँ संक्रमण से लड़ती हैं; कम संख्या कुछ संक्रमणों, कुछ दवाओं या अस्थि-मज्जा की स्थितियों में दिख सकती है।' },
    high: { en: 'White blood cells fight infection; a higher count is commonly seen with an infection or inflammation.', te: 'తెల్ల రక్త కణాలు ఇన్ఫెక్షన్‌తో పోరాడతాయి; అధిక సంఖ్య సాధారణంగా ఇన్ఫెక్షన్ లేదా వాపుతో కనిపిస్తుంది.', hi: 'सफेद रक्त कोशिकाएँ संक्रमण से लड़ती हैं; अधिक संख्या आमतौर पर संक्रमण या सूजन में दिखती है।' },
  },
  platelets: {
    low: { en: 'Platelets help the blood clot; a lower count can be seen with some infections, medicines, or immune conditions.', te: 'ప్లేట్లెట్లు రక్తం గడ్డకట్టడానికి సహాయపడతాయి; తక్కువ సంఖ్య కొన్ని ఇన్ఫెక్షన్లు, మందులు లేదా రోగనిరోధక పరిస్థితులతో కనిపించవచ్చు.', hi: 'प्लेटलेट्स रक्त का थक्का बनने में मदद करते हैं; कम संख्या कुछ संक्रमणों, दवाओं या प्रतिरक्षा स्थितियों में दिख सकती है।' },
    high: { en: 'Platelets help the blood clot; a higher count can be seen after an infection, with inflammation, or with low iron.', te: 'ప్లేట్లెట్లు రక్తం గడ్డకట్టడానికి సహాయపడతాయి; అధిక సంఖ్య ఇన్ఫెక్షన్ తర్వాత, వాపుతో లేదా ఐరన్ లోపంతో కనిపించవచ్చు.', hi: 'प्लेटलेट्स रक्त का थक्का बनने में मदद करते हैं; अधिक संख्या संक्रमण के बाद, सूजन या आयरन की कमी में दिख सकती है।' },
  },
  pcv: {
    low: { en: 'PCV shows what share of the blood is red cells; a lower value can be seen with low iron or blood loss.', te: 'PCV రక్తంలో ఎర్ర కణాల వాటాను చూపిస్తుంది; తక్కువ విలువ ఐరన్ లోపం లేదా రక్తస్రావంతో కనిపించవచ్చు.', hi: 'PCV रक्त में लाल कोशिकाओं का हिस्सा दिखाता है; कम मान आयरन की कमी या रक्तस्राव में दिख सकता है।' },
    high: { en: 'PCV shows what share of the blood is red cells; a higher value can be seen with dehydration.', te: 'PCV రక్తంలో ఎర్ర కణాల వాటాను చూపిస్తుంది; అధిక విలువ నిర్జలీకరణంతో కనిపించవచ్చు.', hi: 'PCV रक्त में लाल कोशिकाओं का हिस्सा दिखाता है; अधिक मान निर्जलीकरण में दिख सकता है।' },
  },
  mcv: {
    low: { en: 'MCV shows the size of red blood cells; smaller cells are commonly seen with low iron.', te: 'MCV ఎర్ర రక్త కణాల పరిమాణాన్ని చూపిస్తుంది; చిన్న కణాలు సాధారణంగా ఐరన్ లోపంతో కనిపిస్తాయి.', hi: 'MCV लाल रक्त कोशिकाओं का आकार दिखाता है; छोटी कोशिकाएँ आमतौर पर आयरन की कमी में दिखती हैं।' },
    high: { en: 'MCV shows the size of red blood cells; larger cells can be seen with low vitamin B12 or folate, liver conditions, or some medicines.', te: 'MCV ఎర్ర రక్త కణాల పరిమాణాన్ని చూపిస్తుంది; పెద్ద కణాలు విటమిన్ B12 లేదా ఫోలేట్ లోపం, లివర్ పరిస్థితులు లేదా కొన్ని మందులతో కనిపించవచ్చు.', hi: 'MCV लाल रक्त कोशिकाओं का आकार दिखाता है; बड़ी कोशिकाएँ विटामिन B12 या फोलेट की कमी, लिवर की स्थितियों या कुछ दवाओं में दिख सकती हैं।' },
  },
  esr: {
    low: { en: 'ESR is a general inflammation marker; a lower value is usually not a concern by itself.', te: 'ESR ఒక సాధారణ వాపు సూచిక; తక్కువ విలువ సాధారణంగా ఆందోళన కలిగించదు.', hi: 'ESR सूजन का एक सामान्य सूचक है; कम मान आमतौर पर चिंता की बात नहीं है।' },
    high: { en: 'ESR is a general inflammation marker; a higher value can be seen with infection, inflammation, or some long-term conditions.', te: 'ESR ఒక సాధారణ వాపు సూచిక; అధిక విలువ ఇన్ఫెక్షన్, వాపు లేదా కొన్ని దీర్ఘకాలిక పరిస్థితులతో కనిపించవచ్చు.', hi: 'ESR सूजन का एक सामान्य सूचक है; अधिक मान संक्रमण, सूजन या कुछ दीर्घकालिक स्थितियों में दिख सकता है।' },
  },
  fasting_glucose: {
    low: { en: 'This is your blood sugar after fasting; a lower value can be seen with long gaps between meals or some medicines.', te: 'ఇది ఉపవాసం తర్వాత మీ రక్తంలో చక్కెర స్థాయి; తక్కువ విలువ భోజనాల మధ్య ఎక్కువ విరామం లేదా కొన్ని మందులతో కనిపించవచ్చు.', hi: 'यह उपवास के बाद का रक्त शर्करा है; कम मान भोजन में लंबे अंतर या कुछ दवाओं से दिख सकता है।' },
    high: { en: 'This is your blood sugar after fasting; a higher value can be seen with diabetes or prediabetes, stress, or some medicines.', te: 'ఇది ఉపవాసం తర్వాత మీ రక్తంలో చక్కెర స్థాయి; అధిక విలువ డయాబెటిస్ లేదా ప్రీ-డయాబెటిస్, ఒత్తిడి లేదా కొన్ని మందులతో కనిపించవచ్చు.', hi: 'यह उपवास के बाद का रक्त शर्करा है; अधिक मान मधुमेह या प्री-डायबिटीज, तनाव या कुछ दवाओं में दिख सकता है।' },
  },
  pp_glucose: {
    low: { en: 'This is your blood sugar after a meal; a lower value is usually not a concern by itself.', te: 'ఇది భోజనం తర్వాత మీ రక్తంలో చక్కెర స్థాయి; తక్కువ విలువ సాధారణంగా ఆందోళన కలిగించదు.', hi: 'यह भोजन के बाद का रक्त शर्करा है; कम मान आमतौर पर चिंता की बात नहीं है।' },
    high: { en: 'This is your blood sugar after a meal; a higher value can be seen with diabetes or prediabetes.', te: 'ఇది భోజనం తర్వాత మీ రక్తంలో చక్కెర స్థాయి; అధిక విలువ డయాబెటిస్ లేదా ప్రీ-డయాబెటిస్‌తో కనిపించవచ్చు.', hi: 'यह भोजन के बाद का रक्त शर्करा है; अधिक मान मधुमेह या प्री-डायबिटीज में दिख सकता है।' },
  },
  hba1c: {
    low: { en: 'HbA1c shows your average blood sugar over about three months; a lower value is usually not a concern by itself.', te: 'HbA1c సుమారు మూడు నెలల సగటు రక్త చక్కెరను చూపిస్తుంది; తక్కువ విలువ సాధారణంగా ఆందోళన కలిగించదు.', hi: 'HbA1c लगभग तीन महीने की औसत रक्त शर्करा दिखाता है; कम मान आमतौर पर चिंता की बात नहीं है।' },
    high: { en: 'HbA1c shows your average blood sugar over about three months; a higher value suggests blood sugar has been running high.', te: 'HbA1c సుమారు మూడు నెలల సగటు రక్త చక్కెరను చూపిస్తుంది; అధిక విలువ రక్తంలో చక్కెర ఎక్కువగా ఉందని సూచిస్తుంది.', hi: 'HbA1c लगभग तीन महीने की औसत रक्त शर्करा दिखाता है; अधिक मान बताता है कि रक्त शर्करा बढ़ी हुई है।' },
  },
  total_cholesterol: {
    low: { en: 'Total cholesterol is a fat-like substance in the blood; a lower value is usually not a concern by itself.', te: 'మొత్తం కొలెస్ట్రాల్ రక్తంలోని కొవ్వు వంటి పదార్థం; తక్కువ విలువ సాధారణంగా ఆందోళన కలిగించదు.', hi: 'कुल कोलेस्ट्रॉल रक्त में वसा जैसा पदार्थ है; कम मान आमतौर पर चिंता की बात नहीं है।' },
    high: { en: 'Total cholesterol is a fat-like substance in the blood; a higher value raises long-term heart risk and is often linked to diet, weight, or family tendency.', te: 'మొత్తం కొలెస్ట్రాల్ రక్తంలోని కొవ్వు వంటి పదార్థం; అధిక విలువ దీర్ఘకాలిక గుండె ప్రమాదాన్ని పెంచుతుంది, తరచుగా ఆహారం, బరువు లేదా కుటుంబ కారణాలతో ముడిపడి ఉంటుంది.', hi: 'कुल कोलेस्ट्रॉल रक्त में वसा जैसा पदार्थ है; अधिक मान दीर्घकालिक हृदय जोखिम बढ़ाता है और अक्सर आहार, वज़न या पारिवारिक प्रवृत्ति से जुड़ा होता है।' },
  },
  ldl: {
    low: { en: 'LDL is often called "bad" cholesterol; a lower value is usually not a concern by itself.', te: 'LDLను తరచుగా "చెడు" కొలెస్ట్రాల్ అంటారు; తక్కువ విలువ సాధారణంగా ఆందోళన కలిగించదు.', hi: 'LDL को अक्सर "खराब" कोलेस्ट्रॉल कहा जाता है; कम मान आमतौर पर चिंता की बात नहीं है।' },
    high: { en: 'LDL is often called "bad" cholesterol; a higher value raises long-term heart risk.', te: 'LDLను తరచుగా "చెడు" కొలెస్ట్రాల్ అంటారు; అధిక విలువ దీర్ఘకాలిక గుండె ప్రమాదాన్ని పెంచుతుంది.', hi: 'LDL को अक्सर "खराब" कोलेस्ट्रॉल कहा जाता है; अधिक मान दीर्घकालिक हृदय जोखिम बढ़ाता है।' },
  },
  hdl: {
    low: { en: 'HDL is often called "good" cholesterol; a lower value gives the heart less protection.', te: 'HDLను తరచుగా "మంచి" కొలెస్ట్రాల్ అంటారు; తక్కువ విలువ గుండెకు తక్కువ రక్షణ ఇస్తుంది.', hi: 'HDL को अक्सर "अच्छा" कोलेस्ट्रॉल कहा जाता है; कम मान हृदय को कम सुरक्षा देता है।' },
    high: { en: 'HDL is often called "good" cholesterol; a higher value is generally protective.', te: 'HDLను తరచుగా "మంచి" కొలెస్ట్రాల్ అంటారు; అధిక విలువ సాధారణంగా రక్షణాత్మకం.', hi: 'HDL को अक्सर "अच्छा" कोलेस्ट्रॉल कहा जाता है; अधिक मान आमतौर पर सुरक्षात्मक होता है।' },
  },
  triglycerides: {
    low: { en: 'Triglycerides are fats in the blood; a lower value is usually not a concern by itself.', te: 'ట్రైగ్లిసరైడ్స్ రక్తంలోని కొవ్వులు; తక్కువ విలువ సాధారణంగా ఆందోళన కలిగించదు.', hi: 'ट्राइग्लिसराइड्स रक्त में वसा हैं; कम मान आमतौर पर चिंता की बात नहीं है।' },
    high: { en: 'Triglycerides are fats in the blood; a higher value can be seen with rich or sugary food, alcohol, or diabetes.', te: 'ట్రైగ్లిసరైడ్స్ రక్తంలోని కొవ్వులు; అధిక విలువ కొవ్వు లేదా చక్కెర ఎక్కువగా ఉన్న ఆహారం, మద్యం లేదా డయాబెటిస్‌తో కనిపించవచ్చు.', hi: 'ट्राइग्लिसराइड्स रक्त में वसा हैं; अधिक मान अधिक वसा या शर्करा युक्त भोजन, शराब या मधुमेह में दिख सकता है।' },
  },
  creatinine: {
    low: { en: 'Creatinine is a waste product the kidneys filter out; a lower value is usually not a concern by itself.', te: 'క్రియేటినిన్ మూత్రపిండాలు వడపోసే వ్యర్థ పదార్థం; తక్కువ విలువ సాధారణంగా ఆందోళన కలిగించదు.', hi: 'क्रिएटिनिन एक अपशिष्ट पदार्थ है जिसे गुर्दे छानते हैं; कम मान आमतौर पर चिंता की बात नहीं है।' },
    high: { en: 'Creatinine is a waste product the kidneys filter out; a higher value can suggest the kidneys are not filtering well, or dehydration.', te: 'క్రియేటినిన్ మూత్రపిండాలు వడపోసే వ్యర్థ పదార్థం; అధిక విలువ మూత్రపిండాలు సరిగ్గా వడపోయడం లేదు లేదా నిర్జలీకరణం ఉందని సూచించవచ్చు.', hi: 'क्रिएटिनिन एक अपशिष्ट पदार्थ है जिसे गुर्दे छानते हैं; अधिक मान बता सकता है कि गुर्दे ठीक से नहीं छान रहे या निर्जलीकरण है।' },
  },
  urea: {
    low: { en: 'Blood urea is a protein waste product; a lower value can be seen with low protein intake or liver conditions.', te: 'రక్త యూరియా ఒక ప్రోటీన్ వ్యర్థ పదార్థం; తక్కువ విలువ తక్కువ ప్రోటీన్ తీసుకోవడం లేదా లివర్ పరిస్థితులతో కనిపించవచ్చు.', hi: 'रक्त यूरिया एक प्रोटीन अपशिष्ट है; कम मान कम प्रोटीन सेवन या लिवर की स्थितियों में दिख सकता है।' },
    high: { en: 'Blood urea is a protein waste product; a higher value can be seen with kidney conditions or dehydration.', te: 'రక్త యూరియా ఒక ప్రోటీన్ వ్యర్థ పదార్థం; అధిక విలువ మూత్రపిండాల పరిస్థితులు లేదా నిర్జలీకరణంతో కనిపించవచ్చు.', hi: 'रक्त यूरिया एक प्रोटीन अपशिष्ट है; अधिक मान गुर्दे की स्थितियों या निर्जलीकरण में दिख सकता है।' },
  },
  uric_acid: {
    low: { en: 'Uric acid is a normal body waste; a lower value is usually not a concern by itself.', te: 'యూరిక్ ఆమ్లం ఒక సాధారణ శరీర వ్యర్థం; తక్కువ విలువ సాధారణంగా ఆందోళన కలిగించదు.', hi: 'यूरिक अम्ल शरीर का सामान्य अपशिष्ट है; कम मान आमतौर पर चिंता की बात नहीं है।' },
    high: { en: 'Uric acid is a normal body waste; a higher value can be seen with gout tendency or kidney conditions.', te: 'యూరిక్ ఆమ్లం ఒక సాధారణ శరీర వ్యర్థం; అధిక విలువ గౌట్ ధోరణి లేదా మూత్రపిండాల పరిస్థితులతో కనిపించవచ్చు.', hi: 'यूरिक अम्ल शरीर का सामान्य अपशिष्ट है; अधिक मान गाउट की प्रवृत्ति या गुर्दे की स्थितियों में दिख सकता है।' },
  },
  sodium: {
    low: { en: 'Sodium keeps the body\'s salt and water balance; a lower value can be seen with vomiting, diarrhoea, some medicines, or heart, kidney or liver conditions.', te: 'సోడియం శరీర ఉప్పు-నీటి సమతుల్యతను కాపాడుతుంది; తక్కువ విలువ వాంతులు, విరేచనాలు, కొన్ని మందులు లేదా గుండె, మూత్రపిండాలు లేదా లివర్ పరిస్థితులతో కనిపించవచ్చు.', hi: 'सोडियम शरीर का नमक-पानी संतुलन रखता है; कम मान उल्टी, दस्त, कुछ दवाओं या हृदय, गुर्दे या लिवर की स्थितियों में दिख सकता है।' },
    high: { en: 'Sodium keeps the body\'s salt and water balance; a higher value is commonly seen with dehydration.', te: 'సోడియం శరీర ఉప్పు-నీటి సమతుల్యతను కాపాడుతుంది; అధిక విలువ సాధారణంగా నిర్జలీకరణంతో కనిపిస్తుంది.', hi: 'सोडियम शरीर का नमक-पानी संतुलन रखता है; अधिक मान आमतौर पर निर्जलीकरण में दिखता है।' },
  },
  potassium: {
    low: { en: 'Potassium helps the heart and muscles work; a lower value can be seen with vomiting, diarrhoea, or some water pills.', te: 'పొటాషియం గుండె మరియు కండరాలు పనిచేయడానికి సహాయపడుతుంది; తక్కువ విలువ వాంతులు, విరేచనాలు లేదా కొన్ని మూత్ర మందులతో కనిపించవచ్చు.', hi: 'पोटैशियम हृदय और मांसपेशियों के काम में मदद करता है; कम मान उल्टी, दस्त या कुछ मूत्र दवाओं में दिख सकता है।' },
    high: { en: 'Potassium helps the heart and muscles work; a higher value can affect the heart and is seen with kidney conditions or some medicines.', te: 'పొటాషియం గుండె మరియు కండరాలు పనిచేయడానికి సహాయపడుతుంది; అధిక విలువ గుండెను ప్రభావితం చేయవచ్చు, ఇది మూత్రపిండాల పరిస్థితులు లేదా కొన్ని మందులతో కనిపిస్తుంది.', hi: 'पोटैशियम हृदय और मांसपेशियों के काम में मदद करता है; अधिक मान हृदय को प्रभावित कर सकता है और गुर्दे की स्थितियों या कुछ दवाओं में दिखता है।' },
  },
  chloride: {
    low: { en: 'Chloride usually moves together with sodium; a lower value can be seen with vomiting or dehydration changes.', te: 'క్లోరైడ్ సాధారణంగా సోడియంతో పాటు కదుతుంది; తక్కువ విలువ వాంతులు లేదా నిర్జలీకరణ మార్పులతో కనిపించవచ్చు.', hi: 'क्लोराइड आमतौर पर सोडियम के साथ बदलता है; कम मान उल्टी या निर्जलीकरण के बदलाव में दिख सकता है।' },
    high: { en: 'Chloride usually moves together with sodium; a higher value can be seen with dehydration or kidney conditions.', te: 'క్లోరైడ్ సాధారణంగా సోడియంతో పాటు కదుతుంది; అధిక విలువ నిర్జలీకరణం లేదా మూత్రపిండాల పరిస్థితులతో కనిపించవచ్చు.', hi: 'क्लोराइड आमतौर पर सोडियम के साथ बदलता है; अधिक मान निर्जलीकरण या गुर्दे की स्थितियों में दिख सकता है।' },
  },
  calcium: {
    low: { en: 'Calcium keeps bones, nerves and muscles working; a lower value can be seen with low vitamin D or parathyroid conditions.', te: 'కాల్షియం ఎముకలు, నరాలు మరియు కండరాలు పనిచేయడానికి సహాయపడుతుంది; తక్కువ విలువ విటమిన్ D లోపం లేదా పారాథైరాయిడ్ పరిస్థితులతో కనిపించవచ్చు.', hi: 'कैल्शियम हड्डियों, नसों और मांसपेशियों के काम में मदद करता है; कम मान विटामिन D की कमी या पैराथायरॉइड स्थितियों में दिख सकता है।' },
    high: { en: 'Calcium keeps bones, nerves and muscles working; a higher value can be seen with parathyroid or some other conditions.', te: 'కాల్షియం ఎముకలు, నరాలు మరియు కండరాలు పనిచేయడానికి సహాయపడుతుంది; అధిక విలువ పారాథైరాయిడ్ లేదా కొన్ని ఇతర పరిస్థితులతో కనిపించవచ్చు.', hi: 'कैल्शियम हड्डियों, नसों और मांसपेशियों के काम में मदद करता है; अधिक मान पैराथायरॉइड या कुछ अन्य स्थितियों में दिख सकता है।' },
  },
  bilirubin: {
    low: { en: 'Bilirubin is made when old red blood cells break down; a lower value is usually not a concern by itself.', te: 'పాత ఎర్ర రక్త కణాలు విచ్ఛిన్నమైనప్పుడు బిలిరూబిన్ ఏర్పడుతుంది; తక్కువ విలువ సాధారణంగా ఆందోళన కలిగించదు.', hi: 'बिलिरूबिन पुरानी लाल रक्त कोशिकाओं के टूटने से बनता है; कम मान आमतौर पर चिंता की बात नहीं है।' },
    high: { en: 'Bilirubin is made when old red blood cells break down; a higher value can yellow the skin or eyes and is seen with liver, bile-duct, or blood-breakdown conditions.', te: 'పాత ఎర్ర రక్త కణాలు విచ్ఛిన్నమైనప్పుడు బిలిరూబిన్ ఏర్పడుతుంది; అధిక విలువ చర్మం లేదా కళ్ళు పసుపు రంగులోకి మార్చవచ్చు, ఇది లివర్, పిత్త నాళాలు లేదా రక్త కణాల విచ్ఛిన్న పరిస్థితులతో కనిపిస్తుంది.', hi: 'बिलिरूबिन पुरानी लाल रक्त कोशिकाओं के टूटने से बनता है; अधिक मान त्वचा या आँखें पीली कर सकता है और लिवर, पित्त नली या रक्त-क्षय की स्थितियों में दिखता है।' },
  },
  sgot: {
    low: { en: 'SGOT (AST) is an enzyme from the liver and muscles; a lower value is usually not a concern by itself.', te: 'SGOT (AST) లివర్ మరియు కండరాల నుండి వచ్చే ఎంజైమ్; తక్కువ విలువ సాధారణంగా ఆందోళన కలిగించదు.', hi: 'SGOT (AST) लिवर और मांसपेशियों का एंज़ाइम है; कम मान आमतौर पर चिंता की बात नहीं है।' },
    high: { en: 'SGOT (AST) is an enzyme from the liver and muscles; a higher value can be seen with liver irritation or muscle strain.', te: 'SGOT (AST) లివర్ మరియు కండరాల నుండి వచ్చే ఎంజైమ్; అధిక విలువ లివర్ ఇబ్బంది లేదా కండరాల ఒత్తిడితో కనిపించవచ్చు.', hi: 'SGOT (AST) लिवर और मांसपेशियों का एंज़ाइम है; अधिक मान लिवर की जलन या मांसपेशी के खिंचाव में दिख सकता है।' },
  },
  sgpt: {
    low: { en: 'SGPT (ALT) is an enzyme from the liver; a lower value is usually not a concern by itself.', te: 'SGPT (ALT) లివర్ నుండి వచ్చే ఎంజైమ్; తక్కువ విలువ సాధారణంగా ఆందోళన కలిగించదు.', hi: 'SGPT (ALT) लिवर का एंज़ाइम है; कम मान आमतौर पर चिंता की बात नहीं है।' },
    high: { en: 'SGPT (ALT) is an enzyme from the liver; a higher value can be seen with liver irritation, fatty liver, or some medicines.', te: 'SGPT (ALT) లివర్ నుండి వచ్చే ఎంజైమ్; అధిక విలువ లివర్ ఇబ్బంది, ఫ్యాటీ లివర్ లేదా కొన్ని మందులతో కనిపించవచ్చు.', hi: 'SGPT (ALT) लिवर का एंज़ाइम है; अधिक मान लिवर की जलन, फैटी लिवर या कुछ दवाओं में दिख सकता है।' },
  },
  alp: {
    low: { en: 'ALP is an enzyme linked to the liver, bile ducts and bones; a lower value is usually not a concern by itself.', te: 'ALP లివర్, పిత్త నాళాలు మరియు ఎముకలతో ముడిపడిన ఎంజైమ్; తక్కువ విలువ సాధారణంగా ఆందోళన కలిగించదు.', hi: 'ALP लिवर, पित्त नली और हड्डियों से जुड़ा एंज़ाइम है; कम मान आमतौर पर चिंता की बात नहीं है।' },
    high: { en: 'ALP is an enzyme linked to the liver, bile ducts and bones; a higher value can be seen with bile-duct or bone conditions, and in growing children.', te: 'ALP లివర్, పిత్త నాళాలు మరియు ఎముకలతో ముడిపడిన ఎంజైమ్; అధిక విలువ పిత్త నాళాలు లేదా ఎముకల పరిస్థితులతో మరియు ఎదుగుతున్న పిల్లల్లో కనిపించవచ్చు.', hi: 'ALP लिवर, पित्त नली और हड्डियों से जुड़ा एंज़ाइम है; अधिक मान पित्त नली या हड्डियों की स्थितियों में और बढ़ते बच्चों में दिख सकता है।' },
  },
  total_protein: {
    low: { en: 'Total protein measures proteins in the blood; a lower value can be seen with liver or kidney conditions or poor nutrition.', te: 'మొత్తం ప్రోటీన్ రక్తంలోని ప్రోటీన్లను కొలుస్తుంది; తక్కువ విలువ లివర్ లేదా మూత్రపిండాల పరిస్థితులు లేదా పోషకాహార లోపంతో కనిపించవచ్చు.', hi: 'कुल प्रोटीन रक्त में प्रोटीन मापता है; कम मान लिवर या गुर्दे की स्थितियों या कम पोषण में दिख सकता है।' },
    high: { en: 'Total protein measures proteins in the blood; a higher value can be seen with dehydration or some long-term conditions.', te: 'మొత్తం ప్రోటీన్ రక్తంలోని ప్రోటీన్లను కొలుస్తుంది; అధిక విలువ నిర్జలీకరణం లేదా కొన్ని దీర్ఘకాలిక పరిస్థితులతో కనిపించవచ్చు.', hi: 'कुल प्रोटीन रक्त में प्रोटीन मापता है; अधिक मान निर्जलीकरण या कुछ दीर्घकालिक स्थितियों में दिख सकता है।' },
  },
  albumin: {
    low: { en: 'Albumin is the main protein made by the liver; a lower value can be seen with liver or kidney conditions or poor nutrition.', te: 'ఆల్బ్యూమిన్ లివర్ తయారుచేసే ప్రధాన ప్రోటీన్; తక్కువ విలువ లివర్ లేదా మూత్రపిండాల పరిస్థితులు లేదా పోషకాహార లోపంతో కనిపించవచ్చు.', hi: 'एल्ब्यूमिन लिवर द्वारा बना मुख्य प्रोटीन है; कम मान लिवर या गुर्दे की स्थितियों या कम पोषण में दिख सकता है।' },
    high: { en: 'Albumin is the main protein made by the liver; a higher value is commonly seen with dehydration.', te: 'ఆల్బ్యూమిన్ లివర్ తయారుచేసే ప్రధాన ప్రోటీన్; అధిక విలువ సాధారణంగా నిర్జలీకరణంతో కనిపిస్తుంది.', hi: 'एल्ब्यूमिन लिवर द्वारा बना मुख्य प्रोटीन है; अधिक मान आमतौर पर निर्जलीकरण में दिखता है।' },
  },
  tsh: {
    low: { en: 'TSH is the signal that drives the thyroid gland; a lower value can be seen with an overactive thyroid.', te: 'TSH థైరాయిడ్ గ్రంథిని నడిపే సంకేతం; తక్కువ విలువ థైరాయిడ్ అధికంగా పనిచేస్తున్నప్పుడు కనిపించవచ్చు.', hi: 'TSH थायरॉइड ग्रंथि को चलाने वाला संकेत है; कम मान थायरॉइड के अधिक सक्रिय होने में दिख सकता है।' },
    high: { en: 'TSH is the signal that drives the thyroid gland; a higher value can be seen with an underactive thyroid.', te: 'TSH థైరాయిడ్ గ్రంథిని నడిపే సంకేతం; అధిక విలువ థైరాయిడ్ తక్కువగా పనిచేస్తున్నప్పుడు కనిపించవచ్చు.', hi: 'TSH थायरॉइड ग्रंथि को चलाने वाला संकेत है; अधिक मान थायरॉइड के कम सक्रिय होने में दिख सकता है।' },
  },
  vitamin_d: {
    low: { en: 'Vitamin D keeps bones and muscles healthy; a lower value is common with little sunlight exposure.', te: 'విటమిన్ D ఎముకలు మరియు కండరాలను ఆరోగ్యంగా ఉంచుతుంది; తక్కువ విలువ సూర్యకాంతి తక్కువగా ఉన్నప్పుడు సాధారణం.', hi: 'विटामिन D हड्डियों और मांसपेशियों को स्वस्थ रखता है; कम मान धूप कम मिलने पर आम है।' },
    high: { en: 'Vitamin D keeps bones and muscles healthy; a higher value is usually seen with supplements.', te: 'విటమిన్ D ఎముకలు మరియు కండరాలను ఆరోగ్యంగా ఉంచుతుంది; అధిక విలువ సాధారణంగా సప్లిమెంట్లతో కనిపిస్తుంది.', hi: 'विटामिन D हड्डियों और मांसपेशियों को स्वस्थ रखता है; अधिक मान आमतौर पर सप्लीमेंट्स से दिखता है।' },
  },
  vitamin_b12: {
    low: { en: 'Vitamin B12 supports blood and nerves; a lower value can cause tiredness and is common with vegetarian diets or absorption problems.', te: 'విటమిన్ B12 రక్తం మరియు నరాలకు తోడ్పడుతుంది; తక్కువ విలువ అలసట కలిగించవచ్చు, శాకాహారం లేదా శోషణ సమస్యల్లో సాధారణం.', hi: 'विटामिन B12 रक्त और नसों के लिए ज़रूरी है; कम मान से थकान हो सकती है और शाकाहारी आहार या अवशोषण की समस्या में आम है।' },
    high: { en: 'Vitamin B12 supports blood and nerves; a higher value is usually not a concern by itself.', te: 'విటమిన్ B12 రక్తం మరియు నరాలకు తోడ్పడుతుంది; అధిక విలువ సాధారణంగా ఆందోళన కలిగించదు.', hi: 'विटामिन B12 रक्त और नसों के लिए ज़रूरी है; अधिक मान आमतौर पर चिंता की बात नहीं है।' },
  },
  crp: {
    low: { en: 'CRP is a general inflammation marker; a lower value is not a concern.', te: 'CRP ఒక సాధారణ వాపు సూచిక; తక్కువ విలువ ఆందోళన కలిగించదు.', hi: 'CRP सूजन का एक सामान्य सूचक है; कम मान चिंता की बात नहीं है।' },
    high: { en: 'CRP is a general inflammation marker; a higher value can be seen with infection or inflammation somewhere in the body.', te: 'CRP ఒక సాధారణ వాపు సూచిక; అధిక విలువ శరీరంలో ఎక్కడైనా ఇన్ఫెక్షన్ లేదా వాపుతో కనిపించవచ్చు.', hi: 'CRP सूजन का एक सामान्य सूचक है; अधिक मान शरीर में कहीं संक्रमण या सूजन में दिख सकता है।' },
  },
};

export function testTemplate(key, direction, lang) {
  const t = TEST_TEMPLATES[key];
  if (!t || !t[direction]) return null;
  return `${t[direction][lang] || t[direction].en} ${D[lang] || D.en}`;
}
