'use strict'

const CmdRunner = require("./cmd_runner");
const constants = require("./constants");

const System_Temperature_threshold = [
    {
        sensor: "CPU",
        threshold: 70,
        hysteresis: 20
    },
    {
        sensor: "PCH",
        threshold: 75,
        hysteresis: 25
    },
    {
        sensor: "System",
        threshold: 60,
        hysteresis: 25

    },
    {
        sensor: "Peripheral",
        threshold: 60,
        hysteresis: 15
    },
    {
        sensor: "Vcpu",
        threshold: 70,
        hysteresis: 25
    },
    {
        sensor: "Vmem",
        threshold: 70,
        hysteresis: 30
    },
    {
        sensor: "-DIMM",
        threshold: 55,
        hysteresis: 20
    }
]

class TempControl {
    constructor() {
        this.cmdRunner = new CmdRunner();
        this.currentState = constants.temp_state.TEMPERATURE_STATE_OK;
    }

}

class DriveTempControl extends TempControl {
    constructor() {
        super();
    }

    findAllDrives() {

        let drive_list = [];
        let output = this.cmdRunner.run("lsblk").toString().split("\n");
    
        output.forEach(line => {
            const drv_match = line.match(/^(sd[a-z]).*/);
            if ((drv_match) && (drv_match.length > 0)) {
                drive_list.push(drv_match[1])
            }
        });
    
        return drive_list;
    }

    processHDDTemperature(hdd, smart_output) {
        const output = smart_output.split("\n");
        let temp = 0;
        let drive_model = "";
        let new_state = this.currentState;
    
        for (let i = 0; i < output.length; ++i) {
            let model_line = smart_output.match(/Device Model:(.*)/);
            if ((model_line) && (model_line.length > 0))
            {
                drive_model = model_line[1].trimStart();
            }
            
            model_line = smart_output.match(/Product:(.*)/);
            if ((model_line) && (model_line.length > 0))
            {
                drive_model = model_line[1].trimStart();
            }
            
            const temp_line = output[i].match(/.*temp.*/i);
            if ((temp_line) && (temp_line.length > 0))
            {
//                console.log(temp_line);
    
                if ((!output[i].match(/trip/i)) && (!output[i].match(/Warning/i))) {
                    const temp_string_array = temp_line[0].split(/\s+/);
                    let temp_string = "";
                    if (temp_string_array.length > 9) {
                        temp_string = temp_string_array[9];
                    }
                    else{
                        temp_string = temp_string_array[3];
                    }
                    console.log(`${output[i]}`);
                    temp = Number(temp_string);
                }
            }
        }

        if (this.currentState === constants.temp_state.TEMPERATURE_STATE_OK) {
            if (temp > 51) {
                new_state = constants.temp_state.TEMPERATURE_STATE_COOLING;
            }
        }
        else if (this.currentState === constants.temp_state.TEMPERATURE_STATE_COOLING) {
            if (temp < 49) {
                new_state = constants.temp_state.TEMPERATURE_STATE_OK;
            }
        }

        console.log(`${hdd}[${drive_model}]: ${temp}, temp state: ${constants.temp_state_string[new_state - 1]}`);
        return new_state;
    }
    
    evaluate() {
        const drive_list = this.findAllDrives();
        let current_state = this.currentState;

        for (let i = 0; i < drive_list.length; ++i) {
            
            let output = this.cmdRunner.run("smartctl", ["--all", `/dev/${drive_list[i]}`]).toString();

            current_state = this.processHDDTemperature(drive_list[i], output);
            if (current_state === constants.temp_state.TEMPERATURE_STATE_COOLING) {
                break;
            }
        }

        this.currentState = current_state;
        return this.currentState;
    }
};

class SystemTempControl extends TempControl {
    constructor(ipmi_path) {
        super();
        this.ipmiPath = ipmi_path;
    }

    findThreshold(sensor) {
        let sensor_threshold = null;
        for (let i = 0; i < System_Temperature_threshold.length; ++i) {
            if (sensor.match(System_Temperature_threshold[i].sensor)) {
                sensor_threshold = System_Temperature_threshold[i];
                break;
            }
        }
        
        if (sensor_threshold) {
            return sensor_threshold;
        }
        else {
            console.error(`Cannot find threshold for: ${sensor}`)
            return { sensor: "Undefined", threshold: 55};
        }
    }

    processTemp(sensor, value) {
        let new_state = this.currentState;
        const sensor_threshold = this.findThreshold(sensor);
        if (this.currentState === constants.temp_state.TEMPERATURE_STATE_OK) {
            if (value > sensor_threshold.threshold) {
                new_state = constants.temp_state.TEMPERATURE_STATE_COOLING;
            }
        }
        else if (this.currentState === constants.temp_state.TEMPERATURE_STATE_COOLING) {
            if (value < (sensor_threshold.threshold - sensor_threshold.hysteresis)) {
                new_state = constants.temp_state.TEMPERATURE_STATE_OK;
            }
        }
        console.log(`${sensor}: ${value}C, threhold[${sensor_threshold.threshold}],  hysteresis[${sensor_threshold.hysteresis}], current state: ${constants.temp_state_string[new_state - 1]}`);
        return new_state;
    }

    evaluate() {
        const output = this.cmdRunner.run(this.ipmiPath, ["-sdr"]).toString();
        let current_state = this.currentState;

        const readings = output.split("\n");
        console.log(output);

        for (let i = 2; i < readings.length; ++i) {
            const columns = readings[i].split('|');
            if (columns.length > 1) {
                const sensor = columns[1]; 
                let value = columns[2].match(/([0-9]+)C/);
                let sensor_name = sensor.match(/\([0-9]+\)(.*) Temp/);
                if ((sensor_name) && (sensor_name.length > 1)) {
                    sensor_name = sensor_name[1].trim();
                    if (value && (value.length > 1)) {
                        value = parseInt(value[1]);
                        current_state = this.processTemp(sensor_name, value);
                        if (current_state === constants.temp_state.TEMPERATURE_STATE_COOLING) {
                            break;
                        }
                    }
                }
            }
        }
        this.currentState = current_state;
        return this.currentState;
    }
};

class SystemTemp {
    constructor(ipmi_path) {
        this.sysTempControl = new SystemTempControl(ipmi_path);
        this.driveTempControl = new DriveTempControl();
    }

    getTempState() {
        let overall_state = constants.temp_state.TEMPERATURE_STATE_COOLING;
        const system_state = this.sysTempControl.evaluate();
        const drive_state = this.driveTempControl.evaluate();
        if ((system_state === constants.temp_state.TEMPERATURE_STATE_OK) && (drive_state === constants.temp_state.TEMPERATURE_STATE_OK)) {
            overall_state = constants.temp_state.TEMPERATURE_STATE_OK;
        }
        console.log(`System Temperature State: ${constants.temp_state_string[system_state - 1]}`)
        console.log(`HDD Temperature State: ${constants.temp_state_string[drive_state - 1]}`)
        return overall_state;
    }

};

module.exports = SystemTemp;