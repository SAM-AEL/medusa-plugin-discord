const utils = require("@medusajs/utils");
const keys = Object.keys(utils).filter(k => k.includes("Event") || k.includes("EVENT"));
for (const key of keys) {
    console.log(key, utils[key]);
}
