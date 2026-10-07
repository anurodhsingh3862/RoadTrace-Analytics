// Minimal client-side i18n for the on-device page, mirroring
// dashboard/i18n.py's shape (same 4 languages, same "fall back to English,
// then to the key itself" behavior) so the two tools feel consistent even
// though this one has no build step and ships as plain JS.
//
// Language choice is remembered in localStorage only (a per-visitor
// convenience, like the unit toggle) — nothing is sent anywhere.

export const DEFAULT_LANGUAGE = "en";

export const SUPPORTED_LANGUAGES = {
  en: "English",
  hi: "हिन्दी",
  es: "Español",
  zh: "中文",
};

const STRINGS = {
  en: {
    doc_title: "RoadTrace Analytics — on-device",
    subtitle: "Point your camera at a road. It counts vehicles and guesses their speed — all on this device. Nothing is uploaded anywhere.",
    language_label: "Language",

    status_loading: "Loading...",
    status_model_loading: "Getting the vehicle-spotting brain ready...",
    status_ready: "Ready! Use your camera or upload a video to start.",
    status_playing_file: "Playing your video. Vehicles will get a box once they're spotted.",
    status_camera_on: "Camera on. Vehicles will get a box once they're spotted.",
    status_camera_error: "Couldn't open the camera — check that you allowed camera access for this page.",
    status_model_error: "Something went wrong loading the model. Try reloading the page.",

    card1_title: "Start watching traffic",
    card1_desc: "Use your camera, or upload a video you already have.",

    home_tag: "Free camera speed analytics",
    home_hero_title: "Every vehicle, measured as it passes.",
    home_hero_desc: "RoadTrace counts vehicles and estimates their speed from any camera — a phone, a laptop webcam, or a video you already have. It all runs on your own device, free, with no account and no identity data collected.",
    home_cta_camera: "Open live camera",
    home_cta_dashboard: "View the dashboard",
    home_demo_label: "Example output",
    home_demo_sub: "from a calibrated camera",
    home_steps_title: "From camera frame to a clear snapshot, in three steps",
    home_step1_title: "Point a camera",
    home_step1_body: "Use your phone or laptop camera, or upload a video you already have. Nothing leaves your device.",
    home_step2_title: "Measure every pass",
    home_step2_body: "Each vehicle is detected, tracked across frames, and given a speed once you do a quick 2-point calibration.",
    home_step3_title: "See the full picture",
    home_step3_body: "Counts, speeds, and direction split, next to free public road-safety, weather, and crash-history data for where you are.",
    home_footer_note: "No accounts, no identity data, no cost — a portfolio/research project, not a commercial product.",
    camera_button: "📷 Use my camera",
    file_button: "🎬 Upload a video",

    hud_vehicles_title: "Vehicles now",
    hud_stats_title: "Live stats",
    hud_avg_speed_label: "Average speed (estimated)",
    hud_speed_disclaimer: "Speeds are an automatic estimate based on typical vehicle size, not a calibrated measurement.",
    tip_speed_accuracy: "Tip: for the best accuracy, hold the phone steady (or rest it on something) facing across the road rather than down it.",
    hud_hold_steady: "Camera is moving — speed estimates are paused until it's steady.",
    hud_pct_below_limit: "{pct}% below the speed limit",
    hud_pct_above_limit: "{pct}% above the speed limit",
    hud_at_speed_limit: "At the speed limit",
    hud_speedlimit_label: "Posted speed limit",
    hud_speedlimit_unavailable: "Not available",
    hud_speedlimit_no_data: "No data for this road",
    hud_speedlimit_denied: "Location permission denied",
    hud_calibration_geometry: "Calibrated from lane geometry",
    hud_calibration_heuristic: "Estimated from vehicle size",
    hud_flow_label: "Flow",
    hud_flow_format: "{count} veh/min",
    hud_confidence_label: "Detection confidence",
    hud_no_vehicles: "No vehicles in view right now.",

    card3_title: "🌍 Road safety near you",
    card3_desc: "See official road-safety numbers for your area: your country's road death rate, the posted speed limit nearby, and current weather and air quality. Your browser asks these public sources directly — nothing goes through us, same as everything else on this page.",
    context_button: "📍 Show info for my location",

    note_no_geo: "Your browser doesn't support location, so this can't be shown.",
    note_asking: "Asking for your location...",
    note_looking_up: "Looking up public sources for this location...",
    note_fetch_error: "Couldn't reach those sources right now — try again in a moment.",
    note_denied: "Location permission was denied, so this can't be shown.",

    label_worldbank: "Country road deaths",
    label_who: "WHO estimate",
    label_speedlimit: "Posted speed limit nearby",
    label_weather: "Weather right now",
    label_feelslike: "Feels like",
    label_humidity: "Humidity",
    label_wind: "Wind",
    label_visibility: "Visibility",
    label_sun: "Sunrise / sunset",
    label_uv: "UV index (today's max)",
    label_precip: "Precipitation today",
    label_aqi: "Air quality (US AQI)",

    value_not_available: "Not available",
    value_no_road: "No tagged road nearby",
    value_current_weather_fallback: "Current",
    wb_rate_format: "{rate}/100k ({year}, World Bank)",
    who_rate_format: "{rate}/100k ({year})",
    aqi_format: "{aqi} ({category})",
    gusts_suffix: ", gusts {gusts}",

    weather_0: "Clear", weather_1: "Mostly clear", weather_2: "Partly cloudy", weather_3: "Overcast",
    weather_45: "Fog", weather_48: "Fog", weather_51: "Light drizzle", weather_53: "Drizzle", weather_55: "Heavy drizzle",
    weather_61: "Light rain", weather_63: "Rain", weather_65: "Heavy rain", weather_71: "Light snow", weather_73: "Snow",
    weather_75: "Heavy snow", weather_80: "Rain showers", weather_81: "Rain showers", weather_82: "Violent rain showers",
    weather_95: "Thunderstorm", weather_96: "Thunderstorm", weather_99: "Thunderstorm",

    aqi_good: "Good",
    aqi_moderate: "Moderate",
    aqi_unhealthy_sensitive: "Unhealthy (sensitive groups)",
    aqi_unhealthy: "Unhealthy",
    aqi_very_unhealthy: "Very unhealthy",
    aqi_hazardous: "Hazardous",

    compass_n: "N", compass_ne: "NE", compass_e: "E", compass_se: "SE",
    compass_s: "S", compass_sw: "SW", compass_w: "W", compass_nw: "NW",

    card4_title: "📊 Want deeper analysis?",
    card4_desc: "This page is a quick, one-camera, on-device demo. The full dashboard handles multiple camera videos combined together, speed vs. weather tables, US county crash-data, and a language picker (English, Hindi, Spanish, Mandarin).",
    open_dashboard_button: "🚀 Open the full dashboard",

    dash_doc_title: "RoadTrace Analytics — dashboard",
    dash_title: "📊 RoadTrace Dashboard",
    dash_subtitle: "A live, always-on snapshot of road conditions near you, plus traffic results you've processed and exported from the Streamlit dashboard.",
    dash_back_link: "← Live camera",
    dash_open_streamlit_button: "🚀 Process a video on the full dashboard",
    dash_section_now: "Right now",
    dash_location_asking: "Finding your location...",
    dash_location_unknown: "Location unavailable",
    dash_location_denied: "Location permission denied — showing time only.",
    dash_location_format: "{place}",
    dash_section_traffic: "Traffic analytics",
    dash_import_button: "📂 Import results (.json)",
    dash_import_hint: "Export a JSON file from the Streamlit dashboard's \"Download results as JSON\" button, then import it here.",
    dash_import_error: "Couldn't read that file — make sure it's a results JSON file exported from the dashboard.",
    dash_import_success: "Showing results for {cameras} camera(s), exported {when}.",
    dash_clear_import_button: "Clear imported results",
    dash_empty_title: "No traffic data imported yet",
    dash_empty_desc: "Everything above (time, weather, road-safety context) works right now with no camera at all. Import a results file to see vehicle counts, speeds, and crash history here too.",
    dash_kpi_vehicles: "Vehicles tracked",
    dash_kpi_avg_speed: "Average speed",
    dash_kpi_cameras: "Cameras",
    dash_kpi_crashes: "County fatal crashes",
    dash_chart_hourly: "Vehicles per hour",
    dash_chart_direction: "Direction split",
    dash_chart_speed: "Average speed per hour",
    dash_crash_title: "Crash history (nearest county)",
    dash_crash_format: "{count} fatal crashes in {year}",
    dash_crash_unavailable: "No county crash data in this export.",
    dash_risk_format: "{percent}% of hours over the {limit} km/h limit (avg {avg} km/h)",
  },

  hi: {
    doc_title: "RoadTrace Analytics — ऑन-डिवाइस",
    subtitle: "अपने कैमरे को सड़क की ओर रखें। यह वाहनों की गिनती करता है और उनकी गति का अनुमान लगाता है — यह सब इसी डिवाइस पर होता है। कुछ भी कहीं अपलोड नहीं होता।",
    language_label: "भाषा",

    status_loading: "लोड हो रहा है...",
    status_model_loading: "वाहन-पहचान दिमाग तैयार किया जा रहा है...",
    status_ready: "तैयार! शुरू करने के लिए अपना कैमरा इस्तेमाल करें या वीडियो अपलोड करें।",
    status_playing_file: "आपका वीडियो चल रहा है। वाहन दिखते ही उन पर बॉक्स बन जाएगा।",
    status_camera_on: "कैमरा चालू है। वाहन दिखते ही उन पर बॉक्स बन जाएगा।",
    status_camera_error: "कैमरा नहीं खुल सका — जांचें कि आपने इस पेज के लिए कैमरा एक्सेस की अनुमति दी है।",
    status_model_error: "मॉडल लोड करने में कुछ गड़बड़ हो गई। पेज को फिर से लोड करके देखें।",

    card1_title: "यातायात देखना शुरू करें",
    card1_desc: "अपना कैमरा इस्तेमाल करें, या पहले से मौजूद कोई वीडियो अपलोड करें।",

    home_tag: "मुफ़्त कैमरा गति विश्लेषण",
    home_hero_title: "हर वाहन, गुज़रते समय मापा गया।",
    home_hero_desc: "RoadTrace किसी भी कैमरे से — फ़ोन, लैपटॉप वेबकैम, या पहले से मौजूद वीडियो से — वाहनों की गिनती करता है और उनकी गति का अनुमान लगाता है। यह सब आपके अपने डिवाइस पर, मुफ़्त में, बिना किसी खाते या पहचान डेटा के होता है।",
    home_cta_camera: "लाइव कैमरा खोलें",
    home_cta_dashboard: "डैशबोर्ड देखें",
    home_demo_label: "उदाहरण परिणाम",
    home_demo_sub: "एक कैलिब्रेटेड कैमरे से",
    home_steps_title: "कैमरा फ़्रेम से स्पष्ट स्नैपशॉट तक, तीन चरणों में",
    home_step1_title: "कैमरा सेट करें",
    home_step1_body: "अपने फ़ोन या लैपटॉप कैमरे का इस्तेमाल करें, या पहले से मौजूद वीडियो अपलोड करें। कुछ भी आपके डिवाइस से बाहर नहीं जाता।",
    home_step2_title: "हर गुज़रते वाहन को मापें",
    home_step2_body: "हर वाहन का पता लगाया जाता है, फ़्रेम-दर-फ़्रेम ट्रैक किया जाता है, और एक त्वरित 2-बिंदु कैलिब्रेशन के बाद उसकी गति दी जाती है।",
    home_step3_title: "पूरी तस्वीर देखें",
    home_step3_body: "गिनती, गति, और दिशा का विभाजन, साथ ही आपके स्थान के लिए मुफ़्त सार्वजनिक सड़क-सुरक्षा, मौसम, और दुर्घटना-इतिहास डेटा।",
    home_footer_note: "कोई खाता नहीं, कोई पहचान डेटा नहीं, कोई शुल्क नहीं — यह एक पोर्टफ़ोलियो/शोध परियोजना है, व्यावसायिक उत्पाद नहीं।",
    camera_button: "📷 मेरा कैमरा इस्तेमाल करें",
    file_button: "🎬 वीडियो अपलोड करें",

    hud_vehicles_title: "अभी के वाहन",
    hud_stats_title: "लाइव आँकड़े",
    hud_avg_speed_label: "औसत गति (अनुमानित)",
    hud_speed_disclaimer: "गति सामान्य वाहन आकार पर आधारित एक स्वचालित अनुमान है, सटीक माप नहीं।",
    tip_speed_accuracy: "सुझाव: सबसे सटीक नतीजों के लिए फ़ोन को स्थिर पकड़ें (या किसी सतह पर रखें) और इसे सड़क के आर-पार रखें, सड़क की लंबाई की दिशा में नहीं।",
    hud_hold_steady: "कैमरा हिल रहा है — स्थिर होने तक गति अनुमान रोक दिए गए हैं।",
    hud_pct_below_limit: "गति सीमा से {pct}% कम",
    hud_pct_above_limit: "गति सीमा से {pct}% अधिक",
    hud_at_speed_limit: "गति सीमा के बराबर",
    hud_speedlimit_label: "निर्धारित गति सीमा",
    hud_speedlimit_unavailable: "उपलब्ध नहीं",
    hud_speedlimit_no_data: "इस सड़क के लिए डेटा नहीं",
    hud_speedlimit_denied: "स्थान अनुमति अस्वीकृत",
    hud_calibration_geometry: "लेन ज्यामिति से कैलिब्रेटेड",
    hud_calibration_heuristic: "वाहन के आकार से अनुमानित",
    hud_flow_label: "प्रवाह",
    hud_flow_format: "{count} वाहन/मिनट",
    hud_confidence_label: "पहचान सटीकता",
    hud_no_vehicles: "अभी कोई वाहन नज़र नहीं आ रहा।",

    card3_title: "🌍 आपके आसपास सड़क सुरक्षा",
    card3_desc: "अपने क्षेत्र के आधिकारिक सड़क-सुरक्षा आंकड़े देखें: आपके देश की सड़क मृत्यु दर, नज़दीकी निर्धारित गति सीमा, और मौजूदा मौसम व वायु गुणवत्ता। आपका ब्राउज़र सीधे इन सार्वजनिक स्रोतों से पूछता है — कुछ भी हमारे ज़रिए नहीं जाता, बिल्कुल इस पेज की बाकी चीज़ों की तरह।",
    context_button: "📍 मेरे स्थान की जानकारी दिखाएं",

    note_no_geo: "आपका ब्राउज़र लोकेशन सपोर्ट नहीं करता, इसलिए यह नहीं दिखाया जा सकता।",
    note_asking: "आपका स्थान पूछा जा रहा है...",
    note_looking_up: "इस स्थान के लिए सार्वजनिक स्रोत खोजे जा रहे हैं...",
    note_fetch_error: "अभी उन स्रोतों तक नहीं पहुंचा जा सका — थोड़ी देर बाद फिर कोशिश करें।",
    note_denied: "लोकेशन की अनुमति नहीं दी गई, इसलिए यह नहीं दिखाया जा सकता।",

    label_worldbank: "देश में सड़क मृत्यु",
    label_who: "WHO अनुमान",
    label_speedlimit: "नज़दीकी निर्धारित गति सीमा",
    label_weather: "अभी का मौसम",
    label_feelslike: "महसूस होने वाला तापमान",
    label_humidity: "आर्द्रता",
    label_wind: "हवा",
    label_visibility: "दृश्यता",
    label_sun: "सूर्योदय / सूर्यास्त",
    label_uv: "UV इंडेक्स (आज का अधिकतम)",
    label_precip: "आज की वर्षा",
    label_aqi: "वायु गुणवत्ता (US AQI)",

    value_not_available: "उपलब्ध नहीं",
    value_no_road: "नज़दीक कोई चिह्नित सड़क नहीं",
    value_current_weather_fallback: "वर्तमान",
    wb_rate_format: "{rate}/100k ({year}, विश्व बैंक)",
    who_rate_format: "{rate}/100k ({year})",
    aqi_format: "{aqi} ({category})",
    gusts_suffix: ", झोंके {gusts}",

    weather_0: "साफ़", weather_1: "ज़्यादातर साफ़", weather_2: "आंशिक बादल", weather_3: "घने बादल",
    weather_45: "कोहरा", weather_48: "कोहरा", weather_51: "हल्की बूंदाबांदी", weather_53: "बूंदाबांदी", weather_55: "तेज़ बूंदाबांदी",
    weather_61: "हल्की बारिश", weather_63: "बारिश", weather_65: "तेज़ बारिश", weather_71: "हल्की बर्फ़बारी", weather_73: "बर्फ़बारी",
    weather_75: "तेज़ बर्फ़बारी", weather_80: "बारिश की बौछारें", weather_81: "बारिश की बौछारें", weather_82: "तेज़ बारिश की बौछारें",
    weather_95: "आंधी-तूफ़ान", weather_96: "आंधी-तूफ़ान", weather_99: "आंधी-तूफ़ान",

    aqi_good: "अच्छी",
    aqi_moderate: "मध्यम",
    aqi_unhealthy_sensitive: "संवेदनशील समूहों के लिए हानिकारक",
    aqi_unhealthy: "हानिकारक",
    aqi_very_unhealthy: "बहुत हानिकारक",
    aqi_hazardous: "खतरनाक",

    compass_n: "N", compass_ne: "NE", compass_e: "E", compass_se: "SE",
    compass_s: "S", compass_sw: "SW", compass_w: "W", compass_nw: "NW",

    card4_title: "📊 और गहराई से जानकारी चाहिए?",
    card4_desc: "यह पेज एक त्वरित, एक-कैमरा, ऑन-डिवाइस डेमो है। पूरा डैशबोर्ड कई कैमरा वीडियो को एक साथ जोड़ना, गति बनाम मौसम तालिकाएं, US काउंटी दुर्घटना-डेटा, और एक भाषा चयनकर्ता (अंग्रेज़ी, हिंदी, स्पेनिश, मंदारिन) संभालता है।",
    open_dashboard_button: "🚀 पूरा डैशबोर्ड खोलें",

    dash_doc_title: "RoadTrace Analytics — डैशबोर्ड",
    dash_title: "📊 RoadTrace डैशबोर्ड",
    dash_subtitle: "आपके आस-पास की सड़क स्थितियों का लाइव स्नैपशॉट, साथ ही Streamlit डैशबोर्ड से निर्यात किए गए ट्रैफ़िक परिणाम।",
    dash_back_link: "← लाइव कैमरा",
    dash_open_streamlit_button: "🚀 पूरे डैशबोर्ड पर वीडियो प्रोसेस करें",
    dash_section_now: "अभी",
    dash_location_asking: "आपका स्थान खोजा जा रहा है...",
    dash_location_unknown: "स्थान उपलब्ध नहीं है",
    dash_location_denied: "स्थान अनुमति अस्वीकृत — केवल समय दिखाया जा रहा है।",
    dash_location_format: "{place}",
    dash_section_traffic: "ट्रैफ़िक एनालिटिक्स",
    dash_import_button: "📂 परिणाम आयात करें (.json)",
    dash_import_hint: "Streamlit डैशबोर्ड के \"Download results as JSON\" बटन से एक JSON फ़ाइल निर्यात करें, फिर उसे यहाँ आयात करें।",
    dash_import_error: "वह फ़ाइल पढ़ी नहीं जा सकी — सुनिश्चित करें कि यह डैशबोर्ड से निर्यात की गई परिणाम JSON फ़ाइल है।",
    dash_import_success: "{cameras} कैमरा(ओं) के परिणाम दिखाए जा रहे हैं, निर्यात समय {when}।",
    dash_clear_import_button: "आयातित परिणाम साफ़ करें",
    dash_empty_title: "अभी तक कोई ट्रैफ़िक डेटा आयात नहीं हुआ",
    dash_empty_desc: "ऊपर दिया गया सब कुछ (समय, मौसम, सड़क-सुरक्षा संदर्भ) बिना किसी कैमरे के अभी भी काम करता है। वाहनों की संख्या, गति और दुर्घटना इतिहास यहाँ देखने के लिए एक परिणाम फ़ाइल आयात करें।",
    dash_kpi_vehicles: "ट्रैक किए गए वाहन",
    dash_kpi_avg_speed: "औसत गति",
    dash_kpi_cameras: "कैमरे",
    dash_kpi_crashes: "काउंटी घातक दुर्घटनाएं",
    dash_chart_hourly: "प्रति घंटा वाहन",
    dash_chart_direction: "दिशा विभाजन",
    dash_chart_speed: "प्रति घंटा औसत गति",
    dash_crash_title: "दुर्घटना इतिहास (निकटतम काउंटी)",
    dash_crash_format: "{year} में {count} घातक दुर्घटनाएं",
    dash_crash_unavailable: "इस निर्यात में कोई काउंटी दुर्घटना डेटा नहीं है।",
    dash_risk_format: "{limit} किमी/घंटा सीमा से ऊपर {percent}% घंटे (औसत {avg} किमी/घंटा)",
  },

  es: {
    doc_title: "RoadTrace Analytics — en el dispositivo",
    subtitle: "Apunta tu cámara hacia una carretera. Cuenta los vehículos y calcula su velocidad — todo en este dispositivo. No se sube nada a ningún lado.",
    language_label: "Idioma",

    status_loading: "Cargando...",
    status_model_loading: "Preparando el cerebro de detección de vehículos...",
    status_ready: "¡Listo! Usa tu cámara o sube un video para empezar.",
    status_playing_file: "Reproduciendo tu video. Los vehículos tendrán un recuadro en cuanto se detecten.",
    status_camera_on: "Cámara activada. Los vehículos tendrán un recuadro en cuanto se detecten.",
    status_camera_error: "No se pudo abrir la cámara — verifica que hayas permitido el acceso a la cámara para esta página.",
    status_model_error: "Algo salió mal al cargar el modelo. Intenta recargar la página.",

    card1_title: "Empieza a observar el tráfico",
    card1_desc: "Usa tu cámara, o sube un video que ya tengas.",

    home_tag: "Análisis gratuito de velocidad por cámara",
    home_hero_title: "Cada vehículo, medido al pasar.",
    home_hero_desc: "RoadTrace cuenta vehículos y estima su velocidad desde cualquier cámara — un teléfono, la webcam de tu laptop, o un video que ya tengas. Todo funciona en tu propio dispositivo, gratis, sin cuenta y sin recopilar datos de identidad.",
    home_cta_camera: "Abrir cámara en vivo",
    home_cta_dashboard: "Ver el panel",
    home_demo_label: "Resultado de ejemplo",
    home_demo_sub: "de una cámara calibrada",
    home_steps_title: "De un fotograma de cámara a una vista clara, en tres pasos",
    home_step1_title: "Apunta una cámara",
    home_step1_body: "Usa la cámara de tu teléfono o laptop, o sube un video que ya tengas. Nada sale de tu dispositivo.",
    home_step2_title: "Mide cada paso",
    home_step2_body: "Cada vehículo se detecta, se sigue entre fotogramas y recibe una velocidad tras una rápida calibración de 2 puntos.",
    home_step3_title: "Mira el panorama completo",
    home_step3_body: "Conteos, velocidades y división por dirección, junto con datos públicos y gratuitos de seguridad vial, clima e historial de accidentes de tu zona.",
    home_footer_note: "Sin cuentas, sin datos de identidad, sin costo — un proyecto de portafolio/investigación, no un producto comercial.",
    camera_button: "📷 Usar mi cámara",
    file_button: "🎬 Subir un video",

    hud_vehicles_title: "Vehículos ahora",
    hud_stats_title: "Estadísticas en vivo",
    hud_avg_speed_label: "Velocidad promedio (estimada)",
    hud_speed_disclaimer: "Las velocidades son una estimación automática basada en el tamaño típico del vehículo, no una medición calibrada.",
    tip_speed_accuracy: "Consejo: para mayor precisión, sostén el teléfono firme (o apóyalo en algo) y apúntalo a través de la calle, no a lo largo de ella.",
    hud_hold_steady: "La cámara se está moviendo — las estimaciones de velocidad están pausadas hasta que se estabilice.",
    hud_pct_below_limit: "{pct}% por debajo del límite de velocidad",
    hud_pct_above_limit: "{pct}% por encima del límite de velocidad",
    hud_at_speed_limit: "Al límite de velocidad",
    hud_speedlimit_label: "Límite de velocidad publicado",
    hud_speedlimit_unavailable: "No disponible",
    hud_speedlimit_no_data: "Sin datos para esta vía",
    hud_speedlimit_denied: "Permiso de ubicación denegado",
    hud_calibration_geometry: "Calibrado a partir de la geometría del carril",
    hud_calibration_heuristic: "Estimado según el tamaño del vehículo",
    hud_flow_label: "Flujo",
    hud_flow_format: "{count} veh/min",
    hud_confidence_label: "Confianza de detección",
    hud_no_vehicles: "No hay vehículos a la vista ahora mismo.",

    card3_title: "🌍 Seguridad vial cerca de ti",
    card3_desc: "Consulta cifras oficiales de seguridad vial para tu zona: la tasa de muertes viales de tu país, el límite de velocidad publicado cerca, y el clima y la calidad del aire actuales. Tu navegador consulta estas fuentes públicas directamente — nada pasa por nosotros, igual que todo lo demás en esta página.",
    context_button: "📍 Mostrar información de mi ubicación",

    note_no_geo: "Tu navegador no admite la ubicación, así que esto no se puede mostrar.",
    note_asking: "Solicitando tu ubicación...",
    note_looking_up: "Buscando fuentes públicas para esta ubicación...",
    note_fetch_error: "No se pudo contactar esas fuentes en este momento — intenta de nuevo en un momento.",
    note_denied: "Se denegó el permiso de ubicación, así que esto no se puede mostrar.",

    label_worldbank: "Muertes viales del país",
    label_who: "Estimación de la OMS",
    label_speedlimit: "Límite de velocidad cercano",
    label_weather: "Clima ahora mismo",
    label_feelslike: "Sensación térmica",
    label_humidity: "Humedad",
    label_wind: "Viento",
    label_visibility: "Visibilidad",
    label_sun: "Amanecer / atardecer",
    label_uv: "Índice UV (máximo de hoy)",
    label_precip: "Precipitación de hoy",
    label_aqi: "Calidad del aire (AQI de EE. UU.)",

    value_not_available: "No disponible",
    value_no_road: "No hay ninguna vía etiquetada cerca",
    value_current_weather_fallback: "Actual",
    wb_rate_format: "{rate}/100k ({year}, Banco Mundial)",
    who_rate_format: "{rate}/100k ({year})",
    aqi_format: "{aqi} ({category})",
    gusts_suffix: ", ráfagas {gusts}",

    weather_0: "Despejado", weather_1: "Mayormente despejado", weather_2: "Parcialmente nublado", weather_3: "Nublado",
    weather_45: "Niebla", weather_48: "Niebla", weather_51: "Llovizna ligera", weather_53: "Llovizna", weather_55: "Llovizna intensa",
    weather_61: "Lluvia ligera", weather_63: "Lluvia", weather_65: "Lluvia intensa", weather_71: "Nieve ligera", weather_73: "Nieve",
    weather_75: "Nieve intensa", weather_80: "Chubascos", weather_81: "Chubascos", weather_82: "Chubascos violentos",
    weather_95: "Tormenta eléctrica", weather_96: "Tormenta eléctrica", weather_99: "Tormenta eléctrica",

    aqi_good: "Buena",
    aqi_moderate: "Moderada",
    aqi_unhealthy_sensitive: "No saludable (grupos sensibles)",
    aqi_unhealthy: "No saludable",
    aqi_very_unhealthy: "Muy no saludable",
    aqi_hazardous: "Peligrosa",

    compass_n: "N", compass_ne: "NE", compass_e: "E", compass_se: "SE",
    compass_s: "S", compass_sw: "SO", compass_w: "O", compass_nw: "NO",

    card4_title: "📊 ¿Quieres un análisis más profundo?",
    card4_desc: "Esta página es una demo rápida, de una sola cámara, en el dispositivo. El panel completo maneja varios videos de cámara combinados, tablas de velocidad frente a clima, datos de accidentes por condado en EE. UU., y un selector de idioma (inglés, hindi, español, mandarín).",
    open_dashboard_button: "🚀 Abrir el panel completo",

    dash_doc_title: "RoadTrace Analytics — panel",
    dash_title: "📊 Panel de RoadTrace",
    dash_subtitle: "Una instantánea en vivo de las condiciones de la vía cerca de ti, además de los resultados de tráfico que procesaste y exportaste desde el panel de Streamlit.",
    dash_back_link: "← Cámara en vivo",
    dash_open_streamlit_button: "🚀 Procesar un video en el panel completo",
    dash_section_now: "Ahora mismo",
    dash_location_asking: "Buscando tu ubicación...",
    dash_location_unknown: "Ubicación no disponible",
    dash_location_denied: "Permiso de ubicación denegado — mostrando solo la hora.",
    dash_location_format: "{place}",
    dash_section_traffic: "Análisis de tráfico",
    dash_import_button: "📂 Importar resultados (.json)",
    dash_import_hint: "Exporta un archivo JSON desde el botón \"Download results as JSON\" del panel de Streamlit, y luego impórtalo aquí.",
    dash_import_error: "No se pudo leer ese archivo — asegúrate de que sea un archivo JSON de resultados exportado desde el panel.",
    dash_import_success: "Mostrando resultados de {cameras} cámara(s), exportado {when}.",
    dash_clear_import_button: "Borrar resultados importados",
    dash_empty_title: "Aún no se han importado datos de tráfico",
    dash_empty_desc: "Todo lo anterior (hora, clima, contexto de seguridad vial) funciona ahora mismo sin ninguna cámara. Importa un archivo de resultados para ver aquí también los conteos de vehículos, velocidades e historial de accidentes.",
    dash_kpi_vehicles: "Vehículos registrados",
    dash_kpi_avg_speed: "Velocidad promedio",
    dash_kpi_cameras: "Cámaras",
    dash_kpi_crashes: "Accidentes fatales del condado",
    dash_chart_hourly: "Vehículos por hora",
    dash_chart_direction: "División por dirección",
    dash_chart_speed: "Velocidad promedio por hora",
    dash_crash_title: "Historial de accidentes (condado más cercano)",
    dash_crash_format: "{count} accidentes fatales en {year}",
    dash_crash_unavailable: "No hay datos de accidentes del condado en esta exportación.",
    dash_risk_format: "{percent}% de las horas por encima del límite de {limit} km/h (promedio {avg} km/h)",
  },

  zh: {
    doc_title: "RoadTrace Analytics — 设备端",
    subtitle: "将摄像头对准道路。它会统计车辆数量并估算车速——全部在本设备上完成。不会向任何地方上传任何内容。",
    language_label: "语言",

    status_loading: "正在加载...",
    status_model_loading: "正在准备车辆识别模型...",
    status_ready: "准备就绪!使用摄像头或上传视频即可开始。",
    status_playing_file: "正在播放您的视频。检测到车辆后会自动显示方框。",
    status_camera_on: "摄像头已开启。检测到车辆后会自动显示方框。",
    status_camera_error: "无法打开摄像头——请检查是否已允许此页面使用摄像头。",
    status_model_error: "加载模型时出了点问题。请尝试重新加载页面。",

    card1_title: "开始观察交通",
    card1_desc: "使用您的摄像头,或上传您已有的视频。",

    home_tag: "免费的摄像头车速分析",
    home_hero_title: "每一辆经过的车,都被测量。",
    home_hero_desc: "RoadTrace 可以通过任意摄像头——手机、笔记本摄像头,或您已有的视频——统计车辆数量并估算车速。一切都在您自己的设备上完成,完全免费,无需账户,也不收集任何身份数据。",
    home_cta_camera: "打开实时摄像头",
    home_cta_dashboard: "查看仪表盘",
    home_demo_label: "示例结果",
    home_demo_sub: "来自一台已校准的摄像头",
    home_steps_title: "从摄像头画面到清晰概览,只需三步",
    home_step1_title: "对准摄像头",
    home_step1_body: "使用您的手机或笔记本摄像头,或上传您已有的视频。任何内容都不会离开您的设备。",
    home_step2_title: "测量每一次经过",
    home_step2_body: "每辆车都会被检测、跨帧跟踪,并在完成快速的两点校准后给出车速。",
    home_step3_title: "查看完整画面",
    home_step3_body: "车辆数、车速和方向分布,配合您所在地区免费的公共道路安全、天气和事故历史数据。",
    home_footer_note: "无需账户,不收集身份数据,完全免费——这是一个作品集/研究项目,而非商业产品。",
    camera_button: "📷 使用我的摄像头",
    file_button: "🎬 上传视频",

    hud_vehicles_title: "当前车辆",
    hud_stats_title: "实时统计",
    hud_avg_speed_label: "平均速度(估计值)",
    hud_speed_disclaimer: "速度是根据典型车辆尺寸自动估算的,并非精确测量。",
    tip_speed_accuracy: "提示:为了获得最佳准确度,请拿稳手机(或将其放在稳定的地方),并让它正对道路横向,而不是沿着道路方向拍摄。",
    hud_hold_steady: "相机正在移动——速度估算已暂停,待其稳定后恢复。",
    hud_pct_below_limit: "比限速低{pct}%",
    hud_pct_above_limit: "比限速高{pct}%",
    hud_at_speed_limit: "等于限速",
    hud_speedlimit_label: "限速标志",
    hud_speedlimit_unavailable: "暂无数据",
    hud_speedlimit_no_data: "此路段无数据",
    hud_speedlimit_denied: "位置权限被拒绝",
    hud_calibration_geometry: "基于车道几何校准",
    hud_calibration_heuristic: "基于车辆尺寸估算",
    hud_flow_label: "车流量",
    hud_flow_format: "{count} 辆/分钟",
    hud_confidence_label: "检测置信度",
    hud_no_vehicles: "当前没有检测到车辆。",

    card3_title: "🌍 您附近的道路安全信息",
    card3_desc: "查看您所在地区的官方道路安全数据:您所在国家的道路死亡率、附近公布的限速,以及当前的天气和空气质量。您的浏览器直接向这些公开数据源查询——不经过我们,和本页面的其他功能一样。",
    context_button: "📍 显示我所在位置的信息",

    note_no_geo: "您的浏览器不支持定位功能,因此无法显示此信息。",
    note_asking: "正在请求您的位置...",
    note_looking_up: "正在查询该位置的公开数据源...",
    note_fetch_error: "目前无法连接到这些数据源——请稍后再试。",
    note_denied: "位置权限被拒绝,因此无法显示此信息。",

    label_worldbank: "该国道路死亡人数",
    label_who: "世卫组织估计值",
    label_speedlimit: "附近公布的限速",
    label_weather: "当前天气",
    label_feelslike: "体感温度",
    label_humidity: "湿度",
    label_wind: "风力",
    label_visibility: "能见度",
    label_sun: "日出 / 日落",
    label_uv: "紫外线指数(今日最高)",
    label_precip: "今日降水量",
    label_aqi: "空气质量(美国 AQI)",

    value_not_available: "暂无数据",
    value_no_road: "附近没有标注限速的道路",
    value_current_weather_fallback: "当前",
    wb_rate_format: "每10万人 {rate} 例({year}年,世界银行)",
    who_rate_format: "每10万人 {rate} 例({year}年)",
    aqi_format: "{aqi}({category})",
    gusts_suffix: ",阵风 {gusts}",

    weather_0: "晴朗", weather_1: "大部晴朗", weather_2: "多云", weather_3: "阴天",
    weather_45: "雾", weather_48: "雾", weather_51: "小毛毛雨", weather_53: "毛毛雨", weather_55: "大毛毛雨",
    weather_61: "小雨", weather_63: "中雨", weather_65: "大雨", weather_71: "小雪", weather_73: "中雪",
    weather_75: "大雪", weather_80: "阵雨", weather_81: "阵雨", weather_82: "强阵雨",
    weather_95: "雷暴", weather_96: "雷暴", weather_99: "雷暴",

    aqi_good: "优",
    aqi_moderate: "中等",
    aqi_unhealthy_sensitive: "对敏感人群不健康",
    aqi_unhealthy: "不健康",
    aqi_very_unhealthy: "非常不健康",
    aqi_hazardous: "危险",

    compass_n: "N", compass_ne: "NE", compass_e: "E", compass_se: "SE",
    compass_s: "S", compass_sw: "SW", compass_w: "W", compass_nw: "NW",

    card4_title: "📊 想要更深入的分析?",
    card4_desc: "此页面是一个快速的单摄像头设备端演示。完整的仪表盘可以合并处理多个摄像头视频、提供车速与天气对比表、美国县级事故数据,并支持语言选择(英语、印地语、西班牙语、中文)。",
    open_dashboard_button: "🚀 打开完整仪表盘",

    dash_doc_title: "RoadTrace Analytics — 仪表盘",
    dash_title: "📊 RoadTrace 仪表盘",
    dash_subtitle: "实时展示您附近的道路状况,并显示您在 Streamlit 仪表盘中处理并导出的交通数据。",
    dash_back_link: "← 返回实时摄像头",
    dash_open_streamlit_button: "🚀 在完整仪表盘中处理视频",
    dash_section_now: "实时状态",
    dash_location_asking: "正在定位您的位置...",
    dash_location_unknown: "位置不可用",
    dash_location_denied: "位置权限被拒绝 — 仅显示时间。",
    dash_location_format: "{place}",
    dash_section_traffic: "交通分析",
    dash_import_button: "📂 导入结果 (.json)",
    dash_import_hint: "从 Streamlit 仪表盘的“Download results as JSON”按钮导出一个 JSON 文件,然后在此处导入。",
    dash_import_error: "无法读取该文件 — 请确认这是从仪表盘导出的结果 JSON 文件。",
    dash_import_success: "正在显示 {cameras} 个摄像头的结果,导出于 {when}。",
    dash_clear_import_button: "清除已导入的结果",
    dash_empty_title: "尚未导入交通数据",
    dash_empty_desc: "以上内容(时间、天气、道路安全背景)无需任何摄像头即可实时显示。导入结果文件后,这里也会显示车辆数量、速度和事故历史。",
    dash_kpi_vehicles: "已追踪车辆",
    dash_kpi_avg_speed: "平均速度",
    dash_kpi_cameras: "摄像头数量",
    dash_kpi_crashes: "县级致命事故",
    dash_chart_hourly: "每小时车辆数",
    dash_chart_direction: "方向分布",
    dash_chart_speed: "每小时平均速度",
    dash_crash_title: "事故历史(最近的县)",
    dash_crash_format: "{year} 年发生 {count} 起致命事故",
    dash_crash_unavailable: "此导出文件中没有县级事故数据。",
    dash_risk_format: "{percent}% 的时间超过 {limit} 公里/小时限速(平均 {avg} 公里/小时)",
  },
};

const STORAGE_KEY = "roadtrace_lang";

let currentLanguage = DEFAULT_LANGUAGE;

export function getLanguage() {
  return currentLanguage;
}

export function detectInitialLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && STRINGS[stored]) return stored;
  } catch {
    // localStorage can throw (private browsing, blocked storage) — fall
    // back to the default silently, same as everywhere else on this page.
  }
  return DEFAULT_LANGUAGE;
}

export function setLanguage(lang) {
  currentLanguage = STRINGS[lang] ? lang : DEFAULT_LANGUAGE;
  try {
    localStorage.setItem(STORAGE_KEY, currentLanguage);
  } catch {
    // Best-effort only; the page still works within this one load.
  }
  return currentLanguage;
}

// Looks up key in language; falls back to English, then to the key itself,
// so a missing translation never breaks the page. {placeholder} tokens in
// the string are replaced from params.
export function t(key, params = {}, lang = currentLanguage) {
  const table = STRINGS[lang] || STRINGS[DEFAULT_LANGUAGE];
  let text = table[key] ?? STRINGS[DEFAULT_LANGUAGE][key] ?? key;
  for (const [name, value] of Object.entries(params)) {
    text = text.replaceAll(`{${name}}`, value);
  }
  return text;
}

export function weatherLabel(code, lang = currentLanguage) {
  return t(`weather_${code}`, {}, lang) !== `weather_${code}`
    ? t(`weather_${code}`, {}, lang)
    : t("value_current_weather_fallback", {}, lang);
}

// Maps context.js's aqiCategory() English string (its own tests pin that
// exact value, so it stays untranslated there) to a localized label here,
// at render time only.
const AQI_CATEGORY_KEYS = {
  "Good": "aqi_good",
  "Moderate": "aqi_moderate",
  "Unhealthy (sensitive groups)": "aqi_unhealthy_sensitive",
  "Unhealthy": "aqi_unhealthy",
  "Very unhealthy": "aqi_very_unhealthy",
  "Hazardous": "aqi_hazardous",
};

export function localizedAqiCategory(englishCategory, lang = currentLanguage) {
  const key = AQI_CATEGORY_KEYS[englishCategory];
  return key ? t(key, {}, lang) : englishCategory;
}

// Maps context.js's compassDirection() English abbreviation to a localized
// one (only Spanish actually differs: SO/O/NO instead of SW/W/NW).
const COMPASS_KEYS = {
  N: "compass_n", NE: "compass_ne", E: "compass_e", SE: "compass_se",
  S: "compass_s", SW: "compass_sw", W: "compass_w", NW: "compass_nw",
};

export function localizedCompass(englishAbbrev, lang = currentLanguage) {
  const key = COMPASS_KEYS[englishAbbrev];
  return key ? t(key, {}, lang) : englishAbbrev;
}

export function allKeysByLanguage() {
  return Object.fromEntries(
    Object.entries(STRINGS).map(([lang, table]) => [lang, Object.keys(table).sort()])
  );
}
