import fetch from "node-fetch";

export async function init() {
    await Avatar.lang.addPluginPak("Meteo");
}

export async function action(data, callback) {
    try {
        const L = await Avatar.lang.getPak("Meteo", data.language);
        const actions = {
            getWeather: () => handleWeather(data, data.client, L, callback),
            getAir: () => getAir(data.client, L, callback)
        };

        info("Meteo:", data.action.command, "from", data.client);

        if (actions[data.action.command]) await actions[data.action.command]();
        else callback();
    } catch (err) {
        if (data.client) Avatar.Speech.end(data.client);
        error("Meteo Error:", err.message);
        callback();
    }
}

const getLocation = async () => {
    const res = await fetch("http://ip-api.com/json/");
    if (!res.ok) throw new Error("Impossible de récupérer la localisation");
    const loc = await res.json();
    if (!loc.city || loc.lat === undefined || loc.lon === undefined)
        throw new Error("Localisation invalide");
    return { city: loc.city, lat: loc.lat, lon: loc.lon };
};

const handleWeather = async (data, client, L, callback) => {
    let sentence = (data.rawSentence || data.action.sentence || "").toLowerCase();
    sentence = sentence.replace(/\bmétéo\b|\bquel temps fait-il\b/g, "").trim();

    let city = "";
    let period = sentence.includes("après-demain") ? 2 : sentence.includes("demain") ? 1 : 0;

    if (sentence.includes("à")) city = sentence.split("à")[1].trim();

    await weather(city, period, client, L, callback);
};

const weather = async (city, period, client, L, callback) => {
    try {
        let lat, lon;

        if (!city) {
            const loc = await getLocation();
            city = loc.city;
            lat = loc.lat;
            lon = loc.lon;
        } else {
            const res = await fetch(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr`
            );
            if (!res.ok) throw new Error(L.get("speech.errorApi"));

            const geo = await res.json();
            if (!geo.results?.length) throw new Error(L.get("speech.errorFormat"));

            lat = geo.results[0].latitude;
            lon = geo.results[0].longitude;
            city = geo.results[0].name || city;
        }

        const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=weathercode,temperature_2m_max,windspeed_10m_max&timezone=auto`
        );
        if (!res.ok) throw new Error(L.get("speech.errorApi"));

        const meteo = await res.json();
        if (!meteo.current_weather || !meteo.daily)
            throw new Error(L.get("speech.errorFormat"));

        let desc, temp, wind;

        if (period === 0) {
            const current = meteo.current_weather;
            desc = weatherCodeToText(current.weathercode);
            temp = Math.round(current.temperature);
            wind = Math.round(current.windspeed);
        } else {
            desc = weatherCodeToText(meteo.daily.weathercode[period]);
            temp = Math.round(meteo.daily.temperature_2m_max[period]);
            wind = Math.round(meteo.daily.windspeed_10m_max[period]);
        }

        const when = period === 2
        ? L.get("time.afterTomorrow") : period === 1
        ? L.get("time.tomorrow")
        : L.get("time.today");

        const message = L.get(["speech.weather", when, city, desc, temp, wind]);
        info(message);
        Avatar.speak(message, client, callback);

    } catch (err) {
        error("Meteo ERROR:", err.message);
        Avatar.speak(L.get("speech.errorAccess"), client, callback);
    }
};

const getAir = async (client, L, callback) => {
    try {
        const { city, lat, lon } = await getLocation();
        const res = await fetch(
            `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=us_aqi&timezone=auto`
        );

        if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);

        const data = await res.json();
        if (!data.hourly?.time || !data.hourly?.us_aqi)
            throw new Error("Format qualité de l'air invalide");

        const now = Date.now();
        let index = 0;
        let diff = Infinity;

        data.hourly.time.forEach((time, i) => {
            const d = Math.abs(new Date(time).getTime() - now);
            if (d < diff) {
                diff = d;
                index = i;
            }
        });

        const indice = data.hourly.us_aqi[index];
        const air = getAirQuality(indice);
        const message = L.get(["speech.air", city, air, Math.round(indice)]);

        info(message);
        Avatar.speak(message, client, callback);

    } catch (err) {
        error("Air Quality ERROR:", err.message);
        Avatar.speak(L.get("speech.errorAccess"), client, callback);
    }
};

const getAirQuality = indice =>
    indice <= 50 ? "bonne" :
    indice <= 100 ? "modérée" :
    indice <= 150 ? "mauvaise pour les personnes sensibles" :
    indice <= 200 ? "mauvaise" :
    indice <= 300 ? "très mauvaise" : "dangereuse";

const weatherCodeToText = (code) => {
    const map = {
        0: "ciel dégagé", 1: "partiellement nuageux", 2: "nuageux", 3: "couvert",
        45: "brouillard", 48: "brouillard givrant",
        51: "bruine légère", 53: "bruine", 55: "forte bruine",
        61: "pluie faible", 63: "pluie", 65: "forte pluie",
        71: "neige légère", 73: "neige", 75: "forte neige",
        80: "averses faibles", 81: "averses", 82: "fortes averses",
        95: "orage", 96: "orage avec grêle", 99: "orage avec forte grêle"
    };
    return map[code] || "temps variable";
}
