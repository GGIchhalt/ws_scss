const childProcess = require('child_process');
const path = require('path');
const EventEmitter = require('events');
const cliPath = path.resolve(__dirname, './cli.php');

const self = module.exports = {};

class Process extends EventEmitter {
    exec(options) {
        return new Promise(resolve => {
            let command = this.assembleCommand(options);
            let {stdIn} = options;
            if (stdIn) {
                command = `echo '${stdIn.replace(/'/g, "\\'")}' | ${command}`;
            }
            childProcess.exec(command, (error, stdout, stderr) => {
                process.stderr.write(stderr.toString());
                if (error) {
                    return resolve(false);
                }
                let stdOut = stdout.toString();
                if (stdIn) {
                    process.stdout.write(stdOut);
                }
                return resolve(stdOut || true);
            });
        });
    }

    watch(options) {
        options.watch = true;
        const command = this.assembleCommand(options);
        const proc = childProcess.exec(command);

        // Emitting 'error' events from EventEmitter without
        // any error listener will throw uncaught exception.
        this.on('error', () => {});

        proc.stderr.on('data', msg => {
            msg = msg.toString();
            process.stderr.write(msg);
            msg = msg.replace(/\x1B\[[^m]*m/g, '').trim();

            let [, signal, detail] = /^([A-Z]+):\s*(.+)/i.exec(msg) || [];
            let {input, output} = options;
            let eventData = {
                signal,
                options: {
                    input: input ? path.resolve(input) : null,
                    output: output ? path.resolve(output) : null,
                },
            };

            if (/^(WARNING|ERROR)$/.test(signal)) {
                let error = new Error(detail);
                Object.assign(error, eventData, {severity: signal.toLowerCase()});
                this.emit('error', error);
            }
            else {
                this.emit('data', {message: detail, ...eventData});
            }
        });
        return this;
    }

    assembleCommand(options) {
        return `${self.phpBin || 'php'} ${cliPath} ${this.stringifyOptions(options)}`;
    }

    stringifyOptions(options) {
        const args = [];
        options = Object.assign({}, options);
        for (let name in options) {
            // Normalize to hypenated case.
            let cssCase = name.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
            if (name !== cssCase) {
                options[cssCase] = options[name];
                delete options[name];
                name = cssCase;
            }
            let value = options[name];
            switch (name) {
                // Booleans.
                case 'watch': // fallthrough
                case 'source-map': // fallthrough
                case 'boilerplate': // fallthrough
                    if (value) {
                        args.push(`--${name}`);
                    }
                    break;
                case 'minify':
                    if (! value) {
                        args.push(`--pretty`);
                    }
                    break;
                // Array/list values.
                case 'vendor-target': // fallthrough
                case 'plugins': // fallthrough
                case 'import-path':
                    if (value) {
                        value = (Array.isArray(value) ? value : [value]).join(',');
                        args.push(`--${name}=${value}`);
                    }
                    break;
                // String values.
                case 'newlines': // fallthrough
                case 'formatter': // fallthrough
                case 'input': // fallthrough
                case 'context': // fallthrough
                case 'output':
                    if (value) {
                        args.push(`--${name}='${value}'`);
                    }
                    break;
            }
        }
        return args.join(' ');
    }
}

self.watch = (file, options={}) => {
    options.input = file;
    return (new Process()).watch(options);
};
self.file = (file, options={}) => {
    options.input = file;
    return (new Process()).exec(options);
};
self.string = (string, options={}) => {
    options.stdIn = string;
    return (new Process()).exec(options);
};
