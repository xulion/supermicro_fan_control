'use strict'

const { spawnSync, spawn } = require('child_process');

class CmdRunner
{
    constructor(logger) {
        this.logger = logger;
    }

    async sleep(ms) {
        return new Promise((resolve, reject)=> {
            setTimeout(()=>{
                resolve("done");
            }, ms);
        })
    }
    
    run(command, param) {
        if (this.logger) {
            this.logger.log("running [" + command + ' ' + param.join(' ') + "]");
        }
        let output = spawnSync(command, param);
        return output.stdout.toString();
    }
};

module.exports = CmdRunner;