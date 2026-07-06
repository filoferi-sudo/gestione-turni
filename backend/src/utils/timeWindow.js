const DAY_START = '07:30';
const DAY_END = '23:00';

function isValidTimeString(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// I turni devono stare interamente dentro la fascia 07:30-23:00 e avere durata positiva
function isWithinDailyWindow(startTime, endTime) {
  if (!isValidTimeString(startTime) || !isValidTimeString(endTime)) return false;
  return startTime >= DAY_START && endTime <= DAY_END && startTime < endTime;
}

module.exports = { DAY_START, DAY_END, isValidTimeString, isWithinDailyWindow };
