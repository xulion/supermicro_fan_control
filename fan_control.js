'use strict'

const path = require("path");
const SystemTemp = require("./src/SystemTemp")
const constants = require("./src/constants");
const CmdRunner = require("./src/cmd_runner");

let system_temp = null;
let cmd_runner = null;
let ipmi = null;

function locate_ipmi() {
    const ipmi_path = path.join(__dirname, "./ipmi/IPMICFG-Linux.x86_64");
    return ipmi_path;
}

function get_time_string() {
    const current_time = new Date;
    const day_string = current_time.getFullYear() + '-' + 
                    `${current_time.getMonth() + 1}` + '-' + 
                    current_time.getDate();
    const time_str = day_string + ' ' +
                     current_time.getHours() + ':' + 
                     current_time.getMinutes() + ':' +
                     current_time.getSeconds() + ':' +
                     current_time.getMilliseconds();
    return time_str;
}

function run_fan_control() {
    const time_str = get_time_string();
    console.log(`----- ${time_str}: Evaluating system temperature: ----`)
    console.log(``)

    let temp_state = system_temp.getTempState();
    console.log("-----------------------------------------")
    console.log(`-- Overall state: ${constants.temp_state_string[temp_state - 1]} `)
    if (temp_state === constants.temp_state.TEMPERATURE_STATE_COOLING) {
        console.log(`-- Cooling `);
        console.log(cmd_runner.run(ipmi, ["-fan", "2"]).toString());
    }
    else {
        console.log(`-- Low fan speed `);
        cmd_runner.run(ipmi, ["-raw", "0x30", "0x70", "0x66", "0x01", "0x00", "0x05"]);
        cmd_runner.run(ipmi, ["-raw", "0x30", "0x70", "0x66", "0x01", "0x01", "0x05"]);
    }
    console.log("-----------------------------------------")
    console.log("")
}

function main() {
    ipmi = locate_ipmi();
    system_temp = new SystemTemp(ipmi);
    cmd_runner = new CmdRunner();
    run_fan_control();
    setInterval(run_fan_control, 30 * 1000);
}

main();
