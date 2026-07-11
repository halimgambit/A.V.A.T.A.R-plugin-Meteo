import fetch from "node-fetch";

export async function init () {
    await Avatar.lang.addPluginPak('Meteo');
}

export async function action(data, callback) {

    try {
        const L = await Avatar.lang.getPak('Meteo', data.language);

        const tblActions = {
            getWeather: () => handleWeather(data, data.client, L, callback)
        };

        info("Meteo:", data.action.command, "from", data.client);

        if (tblActions[data.action.command]) {
            await tblActions[data.action.command]();
        } else {
            callback();
        }

    } catch (error) {
        if (data.client) Avatar.Speech.end(data.client);
        error("Météo Error:", error.message);
        callback();
    }
}

const handleWeather = async (data, client, L, callback) => {

    let rawSentence = (data.rawSentence || data.action.sentence || "").toLowerCase();

    rawSentence = rawSentence.replace(/\bmétéo|quel temps fait-il\b/g, '').trim();

    let city = '';
    let period = 0;

    if (rawSentence.includes("après-demain")) period = 2;
    else if (rawSentence.includes("demain")) period = 1;

    if (rawSentence.includes("à")) {
        city = rawSentence.split("à")[1].trim();
    }

    await weather(city, period, client, L, callback);
}

const weather = async (city, period, client, L, callback) => {

    try {
       
        if (!city) {
            const res = await fetch("http://ip-api.com/json/");
            const loc = await res.json();
            city = loc.city;
        }

        const geo = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr`
        );
        const geoData = await geo.json();

        if (!geoData.results || geoData.results.length === 0) {
            throw new Error(L.get("speech.errorCity"));
        }

        const { latitude, longitude } = geoData.results[0];

        const meteoRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=weathercode,temperature_2m_max,windspeed_10m_max&timezone=auto`
        );

        const meteoData = await meteoRes.json();

        let desc, temp, wind;

        if (period === 0) {
            const current = meteoData.current_weather;
            desc = weatherCodeToText(current.weathercode);
            temp = Math.round(current.temperature);
            wind = Math.round(current.windspeed);
        }

        else {
            desc = weatherCodeToText(meteoData.daily.weathercode[period]);
            temp = Math.round(meteoData.daily.temperature_2m_max[period]);
            wind = Math.round(meteoData.daily.windspeed_10m_max[period]);
        }

        let when = L.get("time.today");
        if (period === 1) when = L.get("time.tomorrow");
        if (period === 2) when = L.get("time.afterTomorrow");

        const message = L.get(["speech.weather", when, city, desc, temp, wind]);

        info(message);

        Avatar.speak(message, client, () => callback());

    } catch (err) {
        error(err.message);
        Avatar.speak(L.get("speech.errorAccess"), client, () => callback());
    }
}

function weatherCodeToText(code) {
    const map = {
        0: "ciel dégagé",
        1: "partiellement nuageux",
        2: "nuageux",
        3: "couvert",
        45: "brouillard",
        48: "brouillard givrant",
        51: "bruine légère",
        53: "bruine",
        55: "forte bruine",
        61: "pluie faible",
        63: "pluie",
        65: "forte pluie",
        71: "neige légère",
        73: "neige",
        75: "forte neige",
        95: "orage",
        96: "orage avec grêle"
    };
    return map[code] || "temps variable";
}
