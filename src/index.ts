// Ref https://github.com/lorenwest/node-config/wiki/Environment-Variables
// Sets up the config directory
process.env.NODE_CONFIG_DIR = `${process.cwd()}/config`

process.env.UV_THREADPOOL_SIZE = '16'

import { validateConfig } from './config'

// First check if config loaded properly. If not then stop the process
let validConf = validateConfig()
if (!validConf.valid) {
    console.error(`Error loading configs. Problems with following props: ${validConf.wrongProps}`)
    process.exit(1)
}

const MUST_HAVE_ENV = ["DOMAIN", "JWT_SECRET", "SUPERADMIN_USERNAME", "SUPERADMIN_PASSWORD", "NODE_ENV", "SMTP_USER", "SMTP_PASSWORD", "PROCESS_NAME"]

let missingEnv = false

MUST_HAVE_ENV.forEach(env => {
    if (!process.env[env]) {
        missingEnv = true
        console.error(`No env variable found. Problems with following: ${env}`)
    }
})
// Check if env present
if (missingEnv) {
    process.exit(1)
}

// Setup process name for easy lookup
process.title = <string>process.env.PROCESS_NAME

import * as os from 'os'
import cluster from 'cluster'
import start from './startServices'

if (process.env.MULTI_CORE == 'true') {
    // Run in multi core setup
    let coreCount = process.env.MULTI_CORE_COUNT ? parseInt(process.env.MULTI_CORE_COUNT) : os.cpus().length

    if (cluster.isMaster) {
        console.info(`Master ${process.pid} started`)

        let workers = new Set()

        let forkWorker = () => {
            let worker = cluster.fork()
            workers.add(worker)
            console.info(`Forked worker ${worker.process.pid}`)
        }

        // Fork workers
        for (let i = 0; i < coreCount; i++) {
            forkWorker()
        }

        // TODO: Add more checks here
        cluster.on('exit', worker => {
            console.info(`Worker ${worker.process.pid} died`)
            workers.delete(worker)
            setTimeout(forkWorker, 1000)
        })
    } else {
        start()
    }
} else {
    start()
}
