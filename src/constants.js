'use strict'

const TemperatureState = {
    TEMPERATURE_STATE_HIGH : 1,
    TEMPERATURE_STATE_COOLING : 2,
    TEMPERATURE_STATE_OK : 3
}

const TemperatureStateString = [
    "Temperature High",
    "Temperature Cooling",
    "Temperature OK"
]

module.exports = {
    temp_state : TemperatureState,
    temp_state_string : TemperatureStateString
};