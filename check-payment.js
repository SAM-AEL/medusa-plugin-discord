const utils = require("@medusajs/utils");
function searchEvents(obj, prefix = '') {
    for (const key in obj) {
        if (typeof obj[key] === 'string' && obj[key].toLowerCase().includes('payment')) {
            console.log(prefix + key, ':', obj[key]);
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            searchEvents(obj[key], prefix + key + '.');
        }
    }
}
searchEvents(utils);
